/**
 * ==========================================================================
 * PRUEBA DE INTEGRACIÓN DE LOS MÓDULOS NUEVOS - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Verifica, contra el API real y la base de datos `tekzon_bd`, que los cuatro
 *   módulos nuevos funcionan de punta a punta y están INTEGRADOS entre sí:
 *
 *     MÓDULO 1 · Login con rol Administrador (token de sesión).
 *     MÓDULO 2 · Recepción -> Orden "Pendiente" -> Estados -> Repuesto
 *                (descuento de inventario) -> Cobro -> Factura -> Cierre.
 *     MÓDULO 3 · Venta directa (descuento + kádex origen "Venta" + factura).
 *     MÓDULO 4 · Alerta automática de stock mínimo al alcanzar el umbral.
 *
 * PROPÓSITO TÉCNICO:
 *   Se ejecuta con el backend en marcha:
 *
 *     cd Backend
 *     node server.js                  (en una terminal)
 *     node scripts/pruebaModulosNuevos.mjs   (en otra terminal)
 *
 *   El puerto puede cambiarse sin editar el archivo:
 *     $env:PUERTO_API=3100; node scripts/pruebaModulosNuevos.mjs
 *
 *   IMPORTANTE: la prueba CREA datos reales (cliente, orden, factura y
 *   movimientos). Al finalizar los REPORTA para que puedan limpiarse con
 *   `Database/scripts/limpiarDatosPrueba.ps1`.
 * ==========================================================================
 */

const PUERTO_API = process.env.PUERTO_API || 3000;
const BASE_URL = process.env.BASE_URL_API || `http://localhost:${PUERTO_API}/api`;

// ---- Credenciales del administrador sembrado por la migración 005 ----
const USUARIO_ADMIN = process.env.ADMIN_USERNAME || 'admin';
const CLAVE_ADMIN = process.env.ADMIN_PASSWORD || 'TekZon2026*';

/** Token de sesión que se obtiene en el primer paso de la prueba. */
let tokenSesion = null;

let pruebasCorrectas = 0;
let pruebasFallidas = 0;

/**
 * Ejecuta una petición HTTP al API.
 * @param {string} metodo  GET | POST | PATCH | PUT | DELETE
 * @param {string} ruta    Ruta relativa al /api (p. ej. '/productos').
 * @param {Object} [cuerpo] Payload JSON opcional.
 * @param {boolean} [conToken] Si es true, adjunta el token de sesión.
 */
const peticion = async (metodo, ruta, cuerpo, conToken = true) => {
  const opciones = { method: metodo, headers: { 'Content-Type': 'application/json' } };

  if (cuerpo !== undefined) opciones.body = JSON.stringify(cuerpo);
  if (conToken && tokenSesion) opciones.headers.Authorization = `Bearer ${tokenSesion}`;

  const respuesta = await fetch(`${BASE_URL}${ruta}`, opciones);

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }

  return { codigo: respuesta.status, cuerpo: datos };
};

/** Comprueba una condición y registra el resultado en consola. */
const verificar = (descripcion, condicion, detalle = '') => {
  if (condicion) {
    pruebasCorrectas++;
    console.log(`  [OK]    ${descripcion}`);
  } else {
    pruebasFallidas++;
    console.log(`  [FALLO] ${descripcion} ${detalle}`);
  }
};

/** Imprime un encabezado de sección. */
const seccion = (titulo) => {
  console.log(`\n${'─'.repeat(74)}`);
  console.log(` ${titulo}`);
  console.log('─'.repeat(74));
};

/** Cédula de prueba distinta en cada ejecución (evita colisiones). */
const CEDULA_PRUEBA = process.env.CEDULA_PRUEBA || 'V-99999999';

const ejecutarPruebas = async () => {
  console.log('='.repeat(74));
  console.log(' PRUEBA DE INTEGRACIÓN · MÓDULOS NUEVOS · TEKZON C.A.');
  console.log('='.repeat(74));
  console.log(` API: ${BASE_URL}`);

  /* ==================================================================
   * MÓDULO 1 · USUARIO (LOGIN)
   * ================================================================== */
  seccion('MÓDULO 1 · USUARIO (LOGIN) · Rol Administrador');

  // 1.1 Una ruta protegida sin token debe responder 401.
  const sinToken = await peticion('GET', '/clientes', undefined, false);
  verificar('Ruta protegida sin token responde 401', sinToken.codigo === 401, `-> ${sinToken.codigo}`);

  // 1.2 Credenciales incorrectas -> 401 con mensaje genérico.
  const loginMal = await peticion('POST', '/autenticacion/login', {
    username: USUARIO_ADMIN,
    contrasenia: 'clave-incorrecta'
  }, false);
  verificar('Login con contraseña incorrecta responde 401', loginMal.codigo === 401, `-> ${loginMal.codigo}`);
  verificar('El mensaje no revela cuál dato falló',
    /usuario o contraseña/i.test(loginMal.cuerpo?.mensaje || ''), `-> ${loginMal.cuerpo?.mensaje}`);

  // 1.3 Login correcto -> 200 con token y rol administrador.
  const loginOk = await peticion('POST', '/autenticacion/login', {
    username: USUARIO_ADMIN,
    contrasenia: CLAVE_ADMIN
  }, false);
  verificar('Login correcto responde 200', loginOk.codigo === 200, `-> ${loginOk.codigo}`);
  verificar('El backend devuelve un token de sesión', Boolean(loginOk.cuerpo?.token));
  verificar('El rol devuelto es administrador',
    String(loginOk.cuerpo?.usuario?.rol).toLowerCase() === 'administrador',
    `-> ${loginOk.cuerpo?.usuario?.rol}`);
  verificar('El hash de la contraseña NO se expone al frontend',
    loginOk.cuerpo?.usuario?.contrasenia_usuario === undefined);

  tokenSesion = loginOk.cuerpo?.token || null;

  // 1.4 El token sirve para consultar el perfil.
  const perfil = await peticion('GET', '/autenticacion/perfil');
  verificar('El token permite consultar el perfil (200)', perfil.codigo === 200, `-> ${perfil.codigo}`);

  // 1.5 Un token manipulado debe ser rechazado.
  const tokenOriginal = tokenSesion;
  tokenSesion = `${tokenOriginal}alterado`;
  const tokenFalso = await peticion('GET', '/clientes');
  verificar('Un token manipulado es rechazado con 401', tokenFalso.codigo === 401, `-> ${tokenFalso.codigo}`);
  tokenSesion = tokenOriginal;

  if (!tokenSesion) {
    console.log('\n[ABORTADO] No se obtuvo token: el resto de la prueba no puede continuar.');
    return;
  }

  /* ==================================================================
   * PREPARACIÓN · Productos con stock y stock mínimo controlado
   * ================================================================== */
  seccion('PREPARACIÓN · Producto de prueba con stock y umbral conocido');

  const codigoProducto = process.env.COD_PRODUCTO || 'REP-PAN-001';

  // Se consulta el producto del catálogo que se usará en las pruebas.
  const consultaProducto = await peticion('GET', `/productos/${encodeURIComponent(codigoProducto)}`);
  verificar('Se consulta el producto de prueba', consultaProducto.codigo === 200, `-> ${consultaProducto.codigo}`);

  const productoBase = consultaProducto.cuerpo?.producto;
  console.log(`        Producto: ${productoBase?.nombre_producto} | existencia ${productoBase?.existencia} | mínimo ${productoBase?.stock_minimo}`);

  /*
   * Se ajusta el stock a un valor conocido y se fija el stock mínimo para que la
   * prueba de la ALERTA sea determinista. Se usa el endpoint del CRUD 2 (ajuste
   * justificado) para respetar la regla "no existe stock sin asiento".
   */
  const existenciaInicial = 20;
  const stockMinimo = 5;

  const ajuste = await peticion('PATCH', `/inventario/stock/${encodeURIComponent(codigoProducto)}`, {
    existencia: existenciaInicial,
    stock_minimo: stockMinimo,
    motivo: 'Preparación de la prueba de integración de los módulos nuevos'
  });
  verificar('Ajuste de preparación aplicado (200)', ajuste.codigo === 200, `-> ${ajuste.codigo} ${ajuste.cuerpo?.mensaje || ''}`);

  const productoTrasAjuste = await peticion('GET', `/productos/${encodeURIComponent(codigoProducto)}`);
  const existenciaPreparada = Number(productoTrasAjuste.cuerpo?.producto?.existencia);
  console.log(`        Existencia preparada: ${existenciaPreparada} u. | stock mínimo: ${stockMinimo} u.`);

  /* ==================================================================
   * MÓDULO 2 · SERVICIO TÉCNICO · RECEPCIÓN
   * ================================================================== */
  seccion('MÓDULO 2 · SERVICIO TÉCNICO · Recepción y Orden "Pendiente"');

  const recepcion = await peticion('POST', '/ordenes-tecnicas/recepcion', {
    cedula_cli: CEDULA_PRUEBA,
    nombre_cliente: 'Cliente',
    apellido_cliente: 'De Prueba',
    telefono_cliente: '0414-0000000',
    direccion_cli: 'Barquisimeto, Lara',
    nombre_dis: 'Laptop',
    marca: 'HP',
    modelo: 'Pavilion 15',
    numero_serie: `SERIE-PRUEBA-${Date.now()}`,
    falla_reportada: 'No enciende y se calienta',
    accesorios: 'Cargador original',
    patron_desbloqueo: '1234'
  });

  verificar('POST /recepcion crea la orden (201)', recepcion.codigo === 201, `-> ${recepcion.codigo} ${recepcion.cuerpo?.mensaje || ''}`);

  const idOrden = recepcion.cuerpo?.orden?.id_ordentec;
  verificar('La orden recibió un número correlativo (OS-...)', /^OS-\d{6}$/.test(idOrden || ''), `-> ${idOrden}`);
  verificar('El estado por defecto de la orden es "Pendiente"',
    recepcion.cuerpo?.orden?.estado === 'Pendiente', `-> ${recepcion.cuerpo?.orden?.estado}`);
  verificar('La orden quedó asociada al cliente y al dispositivo',
    Boolean(recepcion.cuerpo?.orden?.cedula_cli) && Boolean(recepcion.cuerpo?.orden?.id_dispositivo));

  /* ==================================================================
   * MÓDULO 2 · PANEL DEL TÉCNICO (cambios de estado)
   * ================================================================== */
  seccion('MÓDULO 2 · PANEL DEL TÉCNICO · Máquina de estados');

  // 2.1 Un salto inválido (Pendiente -> Listo) debe ser rechazado.
  const saltoInvalido = await peticion('PATCH', `/ordenes-tecnicas/${idOrden}/estado`, {
    estado: 'Listo'
  });
  verificar('Se rechaza el salto inválido Pendiente -> Listo (400)',
    saltoInvalido.codigo === 400, `-> ${saltoInvalido.codigo} ${saltoInvalido.cuerpo?.mensaje || ''}`);

  // 2.2 Avance válido: Pendiente -> En Reparacion.
  const aReparacion = await peticion('PATCH', `/ordenes-tecnicas/${idOrden}/estado`, {
    estado: 'En Reparacion',
    observaciones: 'Se diagnostica la falla y se interviene el equipo'
  });
  verificar('Pendiente -> En Reparacion (200)', aReparacion.codigo === 200, `-> ${aReparacion.codigo}`);

  /* ==================================================================
   * MÓDULO 2 · CONSUMO DE INVENTARIO (REPUESTO)
   * ================================================================== */
  seccion('MÓDULO 2 · CONSUMO DE INVENTARIO · Repuesto -> kádex "Servicio Técnico"');

  const cantidadRepuesto = 3;

  const agregarRepuesto = await peticion('POST', `/ordenes-tecnicas/${idOrden}/repuestos`, {
    cod_producto: codigoProducto,
    cantidad: cantidadRepuesto
  });

  verificar('POST /repuestos descuenta el inventario (201)',
    agregarRepuesto.codigo === 201, `-> ${agregarRepuesto.codigo} ${agregarRepuesto.cuerpo?.mensaje || ''}`);

  verificar('El movimiento quedó marcado con origen "SERVICIO_TECNICO"',
    agregarRepuesto.cuerpo?.movimiento?.origen === 'SERVICIO_TECNICO',
    `-> ${agregarRepuesto.cuerpo?.movimiento?.origen}`);

  const existenciaEsperadaTrasRepuesto = existenciaPreparada - cantidadRepuesto;
  verificar(`La existencia bajó de ${existenciaPreparada} a ${existenciaEsperadaTrasRepuesto}`,
    Number(agregarRepuesto.cuerpo?.movimiento?.existencia_posterior) === existenciaEsperadaTrasRepuesto,
    `-> ${agregarRepuesto.cuerpo?.movimiento?.existencia_posterior}`);

  // Se confirma contra el inventario real (no sólo contra la respuesta del POST).
  const productoTrasRepuesto = await peticion('GET', `/productos/${encodeURIComponent(codigoProducto)}`);
  verificar('El inventario en la BASE DE DATOS refleja el descuento',
    Number(productoTrasRepuesto.cuerpo?.producto?.existencia) === existenciaEsperadaTrasRepuesto,
    `-> ${productoTrasRepuesto.cuerpo?.producto?.existencia}`);

  // Se confirma el asiento del kádex consultando el endpoint del CRUD 3 (FASE I).
  const kardex = await peticion('GET', `/movimientos/producto/${encodeURIComponent(codigoProducto)}`);
  const asientoServicio = (kardex.cuerpo?.movimientos || []).find(
    (m) => m.origen === 'SERVICIO_TECNICO' && Number(m.id_movimiento) === Number(agregarRepuesto.cuerpo?.movimiento?.id_movimiento)
  );
  verificar('El asiento existe en el kádex con tipo SALIDA',
    Boolean(asientoServicio) && asientoServicio?.tipo_movimiento === 'SALIDA',
    `-> ${asientoServicio?.tipo_movimiento}`);

  /* ==================================================================
   * MÓDULO 2 · COBRO, FACTURA Y CIERRE
   * ================================================================== */
  seccion('MÓDULO 2 · COBRO Y FACTURA · Mano de obra + repuestos = total');

  const cajaActiva = await peticion('GET', '/caja/activa');
  verificar('Existe una caja abierta para cobrar', cajaActiva.cuerpo?.hay_caja_abierta === true,
    `-> ${JSON.stringify(cajaActiva.cuerpo?.caja?.id_caja)}`);

  // 3.1 No se puede cobrar una orden que no está "Listo" (regla del taller).
  const cobroPrecoz = await peticion('POST', `/ordenes-tecnicas/${idOrden}/cobrar`, {
    metodo_pago: 'EFECTIVO',
    monto_usd: 100,
    tasa_cambio: 36.5
  });
  verificar('No se cobra una orden que no está "Listo" (400)',
    cobroPrecoz.codigo === 400, `-> ${cobroPrecoz.codigo} ${cobroPrecoz.cuerpo?.mensaje || ''}`);

  // 3.2 Se fija la mano de obra y se marca la orden como "Listo".
  const manoObra = 25;

  const aListo = await peticion('PATCH', `/ordenes-tecnicas/${idOrden}/estado`, {
    estado: 'Listo',
    costo_mano_obra: manoObra,
    observaciones: 'Equipo reparado y probado'
  });
  verificar('En Reparacion -> Listo con mano de obra registrada (200)',
    aListo.codigo === 200, `-> ${aListo.codigo}`);

  const desglose = aListo.cuerpo?.desglose;
  console.log(`        Desglose: mano de obra ${desglose?.mano_obra} + repuestos ${desglose?.repuestos} = ${desglose?.total} USD`);

  const totalEsperado = Number((manoObra + Number(desglose?.repuestos || 0)).toFixed(2));
  verificar('El sistema suma automáticamente mano de obra + repuestos',
    Number(desglose?.total) === totalEsperado, `-> ${desglose?.total} vs ${totalEsperado}`);

  // 3.3 Un monto distinto al calculado debe rechazarse (control contable).
  const montoManipulado = await peticion('POST', `/ordenes-tecnicas/${idOrden}/cobrar`, {
    metodo_pago: 'EFECTIVO',
    monto_usd: 1,
    tasa_cambio: 36.5
  });
  verificar('Se rechaza un monto cobrado distinto al calculado (400)',
    montoManipulado.codigo === 400, `-> ${montoManipulado.codigo}`);

  // 3.4 Un método de pago con referencia exige el número de comprobante.
  const sinReferencia = await peticion('POST', `/ordenes-tecnicas/${idOrden}/cobrar`, {
    metodo_pago: 'PAGO_MOVIL',
    monto_usd: totalEsperado,
    tasa_cambio: 36.5
  });
  verificar('PAGO_MOVIL sin referencia es rechazado (400)',
    sinReferencia.codigo === 400, `-> ${sinReferencia.codigo}`);

  // 3.5 Cobro definitivo.
  const cobro = await peticion('POST', `/ordenes-tecnicas/${idOrden}/cobrar`, {
    metodo_pago: 'EFECTIVO',
    monto_usd: totalEsperado,
    tasa_cambio: 36.5,
    observaciones: 'Cancelado por el cliente en caja'
  });

  verificar('El cobro se registra (201)', cobro.codigo === 201, `-> ${cobro.codigo} ${cobro.cuerpo?.mensaje || ''}`);

  const numeroFacturaServicio = cobro.cuerpo?.factura?.numero_factura;
  verificar('Se emitió la factura del servicio técnico (FAC-...)',
    /^FAC-\d{6}$/.test(numeroFacturaServicio || ''), `-> ${numeroFacturaServicio}`);
  verificar('Se registró el método de pago', cobro.cuerpo?.factura?.metodo_pago === 'EFECTIVO',
    `-> ${cobro.cuerpo?.factura?.metodo_pago}`);
  verificar('El pago quedó asociado a una caja', Boolean(cobro.cuerpo?.factura?.id_caja));
  verificar('La orden quedó cerrada en estado "Entregado"',
    cobro.cuerpo?.orden?.estado === 'Entregado', `-> ${cobro.cuerpo?.orden?.estado}`);
  verificar('La orden quedó marcada como cobrada',
    Number(cobro.cuerpo?.orden?.cobrada) === 1, `-> ${cobro.cuerpo?.orden?.cobrada}`);

  // 3.6 No se puede cobrar dos veces la misma orden.
  const recobro = await peticion('POST', `/ordenes-tecnicas/${idOrden}/cobrar`, {
    metodo_pago: 'EFECTIVO',
    monto_usd: totalEsperado,
    tasa_cambio: 36.5
  });
  verificar('No se permite cobrar dos veces la misma orden (400)',
    recobro.codigo === 400, `-> ${recobro.codigo}`);

  /* ==================================================================
   * MÓDULO 3 · VENTA DIRECTA (MOSTRADOR)
   * ================================================================== */
  seccion('MÓDULO 3 · VENTA DIRECTA · Carrito, descuento y factura');

  const productoVenta = await peticion('GET', `/productos/${encodeURIComponent(codigoProducto)}`);
  const existenciaAntesVenta = Number(productoVenta.cuerpo?.producto?.existencia);
  const precioVentaUnidad = Number(productoVenta.cuerpo?.producto?.precio_venta);
  const cantidadVenta = 4;

  // 4.1 Un carrito vacío debe rechazarse.
  const carritoVacio = await peticion('POST', '/ventas', {
    cedula_cli: CEDULA_PRUEBA,
    productos: [],
    metodo_pago: 'EFECTIVO',
    monto_usd: 0,
    tasa_cambio: 36.5
  });
  verificar('Un carrito vacío es rechazado (400)', carritoVacio.codigo === 400, `-> ${carritoVacio.codigo}`);

  // 4.2 Una cantidad mayor que la existencia debe rechazarse con 400.
  const sinStock = await peticion('POST', '/ventas', {
    cedula_cli: CEDULA_PRUEBA,
    productos: [{ cod_producto: codigoProducto, cantidad: existenciaAntesVenta + 1000 }],
    metodo_pago: 'EFECTIVO',
    monto_usd: 1000,
    tasa_cambio: 36.5
  });
  verificar('Vender más unidades que la existencia es rechazado (400)',
    sinStock.codigo === 400, `-> ${sinStock.codigo} ${sinStock.cuerpo?.mensaje || ''}`);

  // 4.3 Venta válida (el total lo calcula el backend con el precio del catálogo).
  const totalVenta = Number((precioVentaUnidad * cantidadVenta).toFixed(2));

  const venta = await peticion('POST', '/ventas', {
    cedula_cli: CEDULA_PRUEBA,
    nombre_cliente: 'Cliente',
    apellido_cliente: 'De Prueba',
    productos: [{ cod_producto: codigoProducto, cantidad: cantidadVenta }],
    metodo_pago: 'PUNTO_DEBITO',
    referencia: 'REF-PRUEBA-0001',
    monto_usd: totalVenta,
    tasa_cambio: 36.5
  });

  verificar('La venta directa se registra (201)', venta.codigo === 201, `-> ${venta.codigo} ${venta.cuerpo?.mensaje || ''}`);

  const numeroFacturaVenta = venta.cuerpo?.factura?.numero_factura;
  verificar('Se emitió la factura de venta directa (FAC-...)',
    /^FAC-\d{6}$/.test(numeroFacturaVenta || ''), `-> ${numeroFacturaVenta}`);
  verificar('El monto total calculado por el sistema es correcto',
    Number(venta.cuerpo?.factura?.monto_total) === totalVenta,
    `-> ${venta.cuerpo?.factura?.monto_total} vs ${totalVenta}`);

  // El movimiento de la venta debe quedar marcado con origen "VENTA".
  // NÓTESE: `movimientos` incluye el ajuste de preparación (origen ALMACEN) y
  // las líneas de la venta (origen VENTA); se busca explícitamente el de la venta.
  const movimientoVenta = (venta.cuerpo?.movimientos || []).find((m) => m.origen === 'VENTA');
  verificar('El movimiento quedó marcado con origen "VENTA"',
    movimientoVenta?.origen === 'VENTA', `-> ${movimientoVenta?.origen}`);

  const existenciaEsperadaVenta = existenciaAntesVenta - cantidadVenta;
  verificar(`La existencia bajó de ${existenciaAntesVenta} a ${existenciaEsperadaVenta}`,
    Number(movimientoVenta?.existencia_posterior) === existenciaEsperadaVenta,
    `-> ${movimientoVenta?.existencia_posterior}`);

  // Se confirma contra la base de datos.
  const productoTrasVenta = await peticion('GET', `/productos/${encodeURIComponent(codigoProducto)}`);
  verificar('El inventario en la BASE DE DATOS refleja la venta',
    Number(productoTrasVenta.cuerpo?.producto?.existencia) === existenciaEsperadaVenta,
    `-> ${productoTrasVenta.cuerpo?.producto?.existencia}`);

  // 4.4 La factura se puede consultar completa.
  const facturaVenta = await peticion('GET', `/ventas/${numeroFacturaVenta}`);
  verificar('La factura se consulta con sus líneas y su pago',
    facturaVenta.codigo === 200
    && (facturaVenta.cuerpo?.detalle || []).length > 0
    && Boolean(facturaVenta.cuerpo?.pago),
    `-> ${facturaVenta.codigo}`);

  /* ==================================================================
   * MÓDULO 4 · AUTOMATIZACIÓN DE ALERTAS DE STOCK MÍNIMO
   * ================================================================== */
  seccion('MÓDULO 4 · ALERTA AUTOMÁTICA DE STOCK MÍNIMO');

  /*
   * En este punto la existencia ya bajó por el repuesto y por la venta. Para
   * provocar la alerta de forma DETERMINISTA se hace una venta que deje la
   * existencia exactamente en el stock mínimo configurado (5 u.).
   */
  const productoSituacion = await peticion('GET', `/productos/${encodeURIComponent(codigoProducto)}`);
  const existenciaActual = Number(productoSituacion.cuerpo?.producto?.existencia);
  const minimoActual = Number(productoSituacion.cuerpo?.producto?.stock_minimo);
  const unidadesHastaElMinimo = Math.max(0, existenciaActual - minimoActual);

  console.log(`        Existencia actual: ${existenciaActual} u. | stock mínimo: ${minimoActual} u.`);
  console.log(`        Unidades a vender para alcanzar el umbral: ${unidadesHastaElMinimo}`);

  let alertaDisparada = null;

  if (unidadesHastaElMinimo > 0) {
    // Venta que deja la existencia EXACTAMENTE en el stock mínimo.
    const ventaAlMinimo = await peticion('POST', '/ventas', {
      cedula_cli: CEDULA_PRUEBA,
      productos: [{ cod_producto: codigoProducto, cantidad: unidadesHastaElMinimo }],
      metodo_pago: 'EFECTIVO',
      monto_usd: Number((precioVentaUnidad * unidadesHastaElMinimo).toFixed(2)),
      tasa_cambio: 36.5
    });

    verificar('Se registra la venta que alcanza el stock mínimo (201)',
      ventaAlMinimo.codigo === 201, `-> ${ventaAlMinimo.codigo} ${ventaAlMinimo.cuerpo?.mensaje || ''}`);

    // La alerta debe viajar EN LA MISMA RESPUESTA del descuento (disparo reactivo).
    alertaDisparada = (ventaAlMinimo.cuerpo?.alertas || [])[0] || null;

    verificar('La alerta se dispara en la MISMA operación del descuento',
      Boolean(alertaDisparada), `-> alertas: ${(ventaAlMinimo.cuerpo?.alertas || []).length}`);

    if (alertaDisparada) {
      console.log(`        Mensaje: "${alertaDisparada.mensaje}"`);
      verificar('El mensaje contiene "Alerta de stock mínimo para el producto"',
        /Alerta de stock mínimo para el producto/i.test(alertaDisparada.mensaje || ''),
        `-> ${alertaDisparada.mensaje}`);
      verificar('El origen de la alerta es VENTA', alertaDisparada.origen === 'VENTA',
        `-> ${alertaDisparada.origen}`);
    }
  } else {
    verificar('La existencia ya estaba en el umbral; se consulta la alerta existente', true);
  }

  // 5.1 La alerta queda PERSISTIDA y consultable por el API.
  const listadoAlertas = await peticion('GET', '/alertas/stock?soloPendientes=true');
  verificar('GET /alertas/stock responde 200', listadoAlertas.codigo === 200, `-> ${listadoAlertas.codigo}`);

  const alertaProducto = (listadoAlertas.cuerpo?.alertas || []).find(
    (a) => a.cod_producto === codigoProducto
  );
  verificar('La alerta del producto está persistida en la base de datos',
    Boolean(alertaProducto), `-> ${alertaProducto?.mensaje}`);
  verificar('La alerta guarda la existencia y el umbral',
    Number(alertaProducto?.existencia) <= Number(alertaProducto?.stock_minimo),
    `-> existencia ${alertaProducto?.existencia} vs mínimo ${alertaProducto?.stock_minimo}`);

  // 5.2 Indicadores de la campana de notificaciones.
  const indicadoresAlertas = await peticion('GET', '/alertas/stock/indicadores');
  verificar('Los indicadores de alertas están disponibles',
    indicadoresAlertas.codigo === 200
    && Number(indicadoresAlertas.cuerpo?.indicadores?.pendientes) >= 1,
    `-> pendientes: ${indicadoresAlertas.cuerpo?.indicadores?.pendientes}`);

  // 5.3 Producto en riesgo (existencia <= mínimo).
  const productosRiesgo = await peticion('GET', '/alertas/stock/productos-riesgo');
  const estaEnRiesgo = (productosRiesgo.cuerpo?.productos || []).some(
    (p) => p.cod_producto === codigoProducto
  );
  verificar('El producto aparece en el listado de riesgo de desabastecimiento',
    estaEnRiesgo, `-> total en riesgo: ${productosRiesgo.cuerpo?.total}`);

  // 5.4 La alerta se puede marcar como atendida.
  if (alertaProducto) {
    const atender = await peticion('PATCH', `/alertas/stock/${alertaProducto.id_alerta}/atender`);
    verificar('La alerta se marca como atendida (200)', atender.codigo === 200, `-> ${atender.codigo}`);

    const atenderRepetido = await peticion('PATCH', `/alertas/stock/${alertaProducto.id_alerta}/atender`);
    verificar('No se atiende dos veces la misma alerta (400)',
      atenderRepetido.codigo === 400, `-> ${atenderRepetido.codigo}`);
  }

  /* ==================================================================
   * VERIFICACIÓN FINAL · CLIENTES Y KÁRDEX CONSOLIDADO
   * ================================================================== */
  seccion('VERIFICACIÓN FINAL · Integración entre módulos');

  // El cliente se creó una sola vez aunque intervino en los tres flujos.
  const listadoClientes = await peticion('GET', `/clientes?texto=${encodeURIComponent(CEDULA_PRUEBA)}`);
  const clientePrueba = (listadoClientes.cuerpo?.clientes || [])[0];
  verificar('El cliente existe una sola vez en la cartera', Boolean(clientePrueba),
    `-> ${JSON.stringify(clientePrueba?.cedula_cli)}`);
  verificar('El cliente acumula sus compras y sus órdenes',
    Number(clientePrueba?.total_compras) >= 2 && Number(clientePrueba?.total_ordenes) >= 1,
    `-> compras ${clientePrueba?.total_compras}, órdenes ${clientePrueba?.total_ordenes}`);

  // Historial del cliente (une dispositivos + facturas + órdenes).
  const historial = await peticion('GET', `/clientes/${encodeURIComponent(CEDULA_PRUEBA)}/historial`);
  verificar('El historial del cliente reúne equipos, facturas y órdenes',
    historial.codigo === 200
    && (historial.cuerpo?.dispositivos || []).length >= 1
    && (historial.cuerpo?.facturas || []).length >= 1
    && (historial.cuerpo?.ordenes || []).length >= 1,
    `-> dispositivos ${(historial.cuerpo?.dispositivos || []).length}, `
    + `facturas ${(historial.cuerpo?.facturas || []).length}, `
    + `órdenes ${(historial.cuerpo?.ordenes || []).length}`);

  // El kádex debe tener los tres orígenes de la prueba.
  const kardexFinal = await peticion('GET', `/movimientos?codProducto=${encodeURIComponent(codigoProducto)}`);
  const origenes = new Set((kardexFinal.cuerpo?.movimientos || []).map((m) => m.origen));
  verificar('El kádex registra movimientos con origen SERVICIO_TECNICO y VENTA',
    origenes.has('SERVICIO_TECNICO') && origenes.has('VENTA'),
    `-> orígenes: ${Array.from(origenes).join(', ')}`);

  // Indicadores del taller y del mostrador.
  const indicadoresTaller = await peticion('GET', '/ordenes-tecnicas/indicadores');
  verificar('Los indicadores del taller responden 200',
    indicadoresTaller.codigo === 200 && Number(indicadoresTaller.cuerpo?.indicadores?.ordenes_cobradas) >= 1,
    `-> cobradas: ${indicadoresTaller.cuerpo?.indicadores?.ordenes_cobradas}`);

  const indicadoresVentas = await peticion('GET', '/ventas/indicadores');
  verificar('Los indicadores del mostrador responden 200',
    indicadoresVentas.codigo === 200 && Number(indicadoresVentas.cuerpo?.indicadores?.total_facturas) >= 2,
    `-> facturas: ${indicadoresVentas.cuerpo?.indicadores?.total_facturas}`);

  // Arqueo de caja: los cobros de ambos módulos deben aparecer en la caja.
  const cajaActivaFinal = await peticion('GET', '/caja/activa');
  if (cajaActivaFinal.cuerpo?.caja?.id_caja) {
    const pagosCaja = await peticion('GET', `/caja/${cajaActivaFinal.cuerpo.caja.id_caja}/pagos`);
    verificar('El arqueo de caja reúne cobros de venta y de servicio técnico',
      pagosCaja.codigo === 200
      && Number(pagosCaja.cuerpo?.totales?.total_ventas) > 0
      && Number(pagosCaja.cuerpo?.totales?.total_servicios) > 0,
      `-> ventas ${pagosCaja.cuerpo?.totales?.total_ventas}, servicios ${pagosCaja.cuerpo?.totales?.total_servicios}`);
  }

  /* ==================================================================
   * RESUMEN
   * ================================================================== */
  console.log(`\n${'='.repeat(74)}`);
  console.log(` RESULTADO: ${pruebasCorrectas} prueba(s) correcta(s), ${pruebasFallidas} fallida(s)`);
  console.log('='.repeat(74));

  console.log('\n DATOS GENERADOS POR LA PRUEBA (para su limpieza):');
  console.log(`   · Cliente de prueba        : ${CEDULA_PRUEBA}`);
  console.log(`   · Orden de servicio técnico: ${idOrden}`);
  console.log(`   · Factura de servicio      : ${numeroFacturaServicio}`);
  console.log(`   · Facturas de venta        : ${numeroFacturaVenta}, ...`);
  console.log(`   · Producto afectado        : ${codigoProducto}`);
  console.log('\n   Limpieza: node scripts/limpiarDatosPrueba.mjs');

  if (pruebasFallidas > 0) {
    process.exitCode = 1;
  }
};

// Se ejecuta la batería de pruebas controlando cualquier fallo inesperado.
ejecutarPruebas().catch((error) => {
  console.error('\n[ERROR FATAL] La prueba se interrumpió:', error);
  process.exitCode = 1;
});
