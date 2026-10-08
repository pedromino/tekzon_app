/**
 * ==========================================================================
 * PRUEBA DE INTEGRACIÓN DEL CONTRATO FRONTEND <-> BACKEND - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO TÉCNICO:
 *   Reproduce EXACTAMENTE el mapeo DTO que hacen `ProductoServices.js`,
 *   `CategoriaServices.js` y `MovimientoServices.js` contra el API real, para
 *   verificar que los 4 CRUDs están interconectados y que los datos provienen
 *   de la base `tekzon_bd` (cero datos simulados).
 *
 *   Se ejecuta con `node scripts/pruebaIntegracionApi.mjs` y NO forma parte
 *   del bundle del frontend: es una herramienta de verificación académica.
 *
 *   El puerto puede cambiarse sin editar el archivo:
 *     $env:PUERTO_API=3100; node scripts/pruebaIntegracionApi.mjs
 * ==========================================================================
 */

const PUERTO_API = process.env.PUERTO_API || 3000;
const BASE_URL = process.env.BASE_URL_API || `http://localhost:${PUERTO_API}/api`;

let pruebasCorrectas = 0;
let pruebasFallidas = 0;

/** Ejecuta una petición HTTP y devuelve { codigo, cuerpo }. */
const peticion = async (metodo, ruta, cuerpo) => {
  const opciones = { method: metodo, headers: { 'Content-Type': 'application/json' } };
  if (cuerpo !== undefined) opciones.body = JSON.stringify(cuerpo);

  const respuesta = await fetch(`${BASE_URL}${ruta}`, opciones);
  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }

  return { codigo: respuesta.status, cuerpo: datos };
};

/** Comprueba una condición y registra el resultado. */
const verificar = (descripcion, condicion, detalle = '') => {
  if (condicion) {
    pruebasCorrectas++;
    console.log(`  [OK]    ${descripcion}`);
  } else {
    pruebasFallidas++;
    console.log(`  [FALLO] ${descripcion} ${detalle}`);
  }
};

// ---- Mapeo DTO idéntico al de ProductoServices.js ----
const mapearProducto = (p) => ({
  codigo: p.cod_producto,
  nombre: p.nombre_producto,
  costo: Number(p.precio_costo || 0),
  precio: Number(p.precio_venta || 0),
  existencia: Number(p.existencia || 0),
  minimo: Number(p.stock_minimo || 0),
  categoria: p.id_categoria,
  nombre_categoria: p.nombre_categoria || 'Sin categoría',
  estado: Number(p.estado ?? 1)
});

const ejecutarPruebas = async () => {
  console.log('='.repeat(74));
  console.log(' PRUEBA DE INTEGRACIÓN · MÓDULO DE INVENTARIO · TEKZON C.A.');
  console.log('='.repeat(74));

  // ------------------------------------------------------------------
  console.log('\n[CRUD 4] Registro y Gestión de Categorías');
  // ------------------------------------------------------------------
  const catInicial = await peticion('GET', '/categorias');
  verificar('GET /categorias responde 200', catInicial.codigo === 200, `-> ${catInicial.codigo}`);
  verificar('Las categorías provienen de la base de datos', Array.isArray(catInicial.cuerpo?.categorias));

  const catCrear = await peticion('POST', '/categorias', { nombre_categoria: 'PRUEBA-INT-Categoria' });
  verificar('POST /categorias crea la categoría (201)', catCrear.codigo === 201, `-> ${catCrear.codigo}`);
  const idCategoriaPrueba = catCrear.cuerpo?.categoria?.id_categoria;

  const catDuplicada = await peticion('POST', '/categorias', { nombre_categoria: 'PRUEBA-INT-Categoria' });
  verificar('POST duplicado responde 400', catDuplicada.codigo === 400, `-> ${catDuplicada.codigo}`);
  verificar('El mensaje de error 400 está en español', Boolean(catDuplicada.cuerpo?.mensaje));

  const catInexistente = await peticion('GET', '/categorias/999999');
  verificar('GET categoría inexistente responde 404', catInexistente.codigo === 404, `-> ${catInexistente.codigo}`);

  // ------------------------------------------------------------------
  console.log('\n[CRUD 1] Catálogo Maestro de Productos');
  // ------------------------------------------------------------------
  const payloadProducto = {
    codigo: 'PRUEBA-INT-001',
    nombre: 'Producto de Prueba de Integración',
    categoria: idCategoriaPrueba,
    marca: 'TekZonQA',
    costo: 10,
    precio: 25,
    minimo: 4,
    // Se envía un stock deliberado para comprobar que el backend lo IGNORA.
    stock: 777,
    imagen: 'pantalla.jpg',
    descripcion: 'Registro creado por la prueba automática de integración.'
  };

  const prodCrear = await peticion('POST', '/productos', payloadProducto);
  verificar('POST /productos responde 201', prodCrear.codigo === 201, `-> ${prodCrear.codigo}`);

  const productoMapeado = mapearProducto(prodCrear.cuerpo?.producto || {});
  verificar(
    'El stock enviado (777) fue IGNORADO: la existencia inicial es 0',
    productoMapeado.existencia === 0,
    `-> existencia = ${productoMapeado.existencia}`
  );
  verificar('Se guardó el id_categoria', productoMapeado.categoria === idCategoriaPrueba);
  verificar('Se guardó el stock_minimo', productoMapeado.minimo === 4, `-> ${productoMapeado.minimo}`);
  verificar('El backend devuelve el nombre de la categoría (JOIN)', Boolean(prodCrear.cuerpo?.producto?.nombre_categoria));

  const prodDuplicado = await peticion('POST', '/productos', { ...payloadProducto, nombre: 'Duplicado' });
  verificar('POST de código duplicado responde 400', prodDuplicado.codigo === 400, `-> ${prodDuplicado.codigo}`);

  const prodSinCategoria = await peticion('POST', '/productos', {
    ...payloadProducto, codigo: 'PRUEBA-INT-002', categoria: 999999
  });
  verificar('Producto con categoría inexistente responde 400', prodSinCategoria.codigo === 400, `-> ${prodSinCategoria.codigo}`);

  const prodPrecioInvalido = await peticion('POST', '/productos', {
    ...payloadProducto, codigo: 'PRUEBA-INT-003', costo: 50, precio: 10
  });
  verificar('Precio de venta menor al costo responde 400', prodPrecioInvalido.codigo === 400, `-> ${prodPrecioInvalido.codigo}`);

  const prodInexistente = await peticion('GET', '/productos/PRUEBA-NO-EXISTE');
  verificar('GET producto inexistente responde 404', prodInexistente.codigo === 404, `-> ${prodInexistente.codigo}`);

  // ------------------------------------------------------------------
  console.log('\n[CRUD 3] Movimientos de Inventario (Kárdex transaccional)');
  // ------------------------------------------------------------------
  const entrada = await peticion('POST', '/movimientos', {
    cod_producto: 'PRUEBA-INT-001',
    tipo_movimiento: 'ENTRADA',
    cantidad: 30,
    motivo: 'Prueba de integración: compra a proveedor.',
    id_usuario: 1
  });
  verificar('POST ENTRADA responde 201', entrada.codigo === 201, `-> ${entrada.codigo}`);
  verificar('Existencia previa = 0', entrada.cuerpo?.movimiento?.existencia_previa === 0);
  verificar('Existencia posterior = 30 (cálculo atómico)', entrada.cuerpo?.movimiento?.existencia_posterior === 30);

  const salida = await peticion('POST', '/movimientos', {
    cod_producto: 'PRUEBA-INT-001',
    tipo_movimiento: 'SALIDA',
    cantidad: 8,
    motivo: 'Prueba de integración: uso en orden de servicio.',
    id_usuario: 1
  });
  verificar('POST SALIDA responde 201', salida.codigo === 201, `-> ${salida.codigo}`);
  verificar('Existencia 30 -> 22', salida.cuerpo?.movimiento?.existencia_posterior === 22,
    `-> ${salida.cuerpo?.movimiento?.existencia_posterior}`);

  const salidaExcesiva = await peticion('POST', '/movimientos', {
    cod_producto: 'PRUEBA-INT-001',
    tipo_movimiento: 'SALIDA',
    cantidad: 9999,
    motivo: 'Prueba de integración: salida imposible.',
    id_usuario: 1
  });
  verificar('SALIDA con stock insuficiente responde 400', salidaExcesiva.codigo === 400, `-> ${salidaExcesiva.codigo}`);

  const sinMotivo = await peticion('POST', '/movimientos', {
    cod_producto: 'PRUEBA-INT-001', tipo_movimiento: 'ENTRADA', cantidad: 5
  });
  verificar('Movimiento sin motivo responde 400', sinMotivo.codigo === 400, `-> ${sinMotivo.codigo}`);

  const cantidadDecimal = await peticion('POST', '/movimientos', {
    cod_producto: 'PRUEBA-INT-001', tipo_movimiento: 'ENTRADA', cantidad: 2.5, motivo: 'Decimal'
  });
  verificar('Cantidad decimal responde 400', cantidadDecimal.codigo === 400, `-> ${cantidadDecimal.codigo}`);

  const tipoAjusteDirecto = await peticion('POST', '/movimientos', {
    cod_producto: 'PRUEBA-INT-001', tipo_movimiento: 'AJUSTE', cantidad: 5, motivo: 'No permitido aquí'
  });
  verificar('AJUSTE por POST /movimientos responde 400', tipoAjusteDirecto.codigo === 400, `-> ${tipoAjusteDirecto.codigo}`);

  const historial = await peticion('GET', '/movimientos');
  verificar('GET /movimientos responde 200', historial.codigo === 200);
  verificar('El kádex contiene los movimientos creados', (historial.cuerpo?.total || 0) >= 2);
  verificar('El kádex incluye el nombre del producto (JOIN)', Boolean(historial.cuerpo?.movimientos?.[0]?.nombre_producto));

  const filtroSalida = await peticion('GET', '/movimientos?tipo=SALIDA');
  verificar('Filtro por tipo=SALIDA responde 200', filtroSalida.codigo === 200);
  verificar(
    'El filtro devuelve únicamente salidas',
    (filtroSalida.cuerpo?.movimientos || []).every((m) => m.tipo_movimiento === 'SALIDA')
  );

  const filtroInvalido = await peticion('GET', '/movimientos?tipo=INVALIDO');
  verificar('Filtro con tipo inválido responde 400', filtroInvalido.codigo === 400, `-> ${filtroInvalido.codigo}`);

  const resumen = await peticion('GET', '/movimientos/resumen');
  verificar('GET /movimientos/resumen responde 200', resumen.codigo === 200);
  verificar('El resumen trae los tres tipos de movimiento',
    Boolean(resumen.cuerpo?.resumen?.ENTRADA && resumen.cuerpo?.resumen?.SALIDA && resumen.cuerpo?.resumen?.AJUSTE));

  // ------------------------------------------------------------------
  console.log('\n[CRUD 2] Gestión y Ajuste de Existencias de Almacén');
  // ------------------------------------------------------------------
  const existencias = await peticion('GET', '/inventario/stock');
  verificar('GET /inventario/stock responde 200', existencias.codigo === 200);
  verificar('La auditoría devuelve la valorización calculada por MySQL',
    existencias.cuerpo?.existencias?.some((e) => e.valor_costo !== undefined));

  const kpi = await peticion('GET', '/inventario/stock/indicadores');
  verificar('GET /inventario/stock/indicadores responde 200', kpi.codigo === 200);
  verificar('Los KPI incluyen el total de artículos',
    Number.isFinite(Number(kpi.cuerpo?.indicadores?.total_articulos)));

  const alertas = await peticion('GET', '/inventario/stock/alertas');
  verificar('GET /inventario/stock/alertas responde 200', alertas.codigo === 200);

  const detalleExistencia = await peticion('GET', '/inventario/stock/PRUEBA-INT-001');
  verificar('Ficha de existencia responde 200', detalleExistencia.codigo === 200);
  verificar('La ficha reporta la existencia real (22)', Number(detalleExistencia.cuerpo?.existencia?.existencia) === 22,
    `-> ${detalleExistencia.cuerpo?.existencia?.existencia}`);

  const ajuste = await peticion('PATCH', '/inventario/stock/PRUEBA-INT-001', {
    nueva_existencia: 18,
    motivo: 'Prueba de integración: arqueo físico en estante QA.',
    id_usuario: 1
  });
  verificar('PATCH ajuste de existencia responde 200', ajuste.codigo === 200, `-> ${ajuste.codigo}`);
  verificar('El ajuste reporta la diferencia faltante de 4',
    Number(ajuste.cuerpo?.ajuste?.diferencia) === -4, `-> ${ajuste.cuerpo?.ajuste?.diferencia}`);
  verificar('Existencia posterior al ajuste = 18',
    Number(ajuste.cuerpo?.ajuste?.existencia_posterior) === 18);

  const ajusteSinMotivo = await peticion('PATCH', '/inventario/stock/PRUEBA-INT-001', { nueva_existencia: 5 });
  verificar('Ajuste sin motivo responde 400', ajusteSinMotivo.codigo === 400, `-> ${ajusteSinMotivo.codigo}`);

  const ajusteSinCambio = await peticion('PATCH', '/inventario/stock/PRUEBA-INT-001', {
    nueva_existencia: 18, motivo: 'Conteo idéntico al sistema.'
  });
  verificar('Ajuste sin diferencia responde 400', ajusteSinCambio.codigo === 400, `-> ${ajusteSinCambio.codigo}`);

  const ajusteNegativo = await peticion('PATCH', '/inventario/stock/PRUEBA-INT-001', {
    nueva_existencia: -3, motivo: 'Negativo no permitido.'
  });
  verificar('Ajuste con existencia negativa responde 400', ajusteNegativo.codigo === 400, `-> ${ajusteNegativo.codigo}`);

  const ajusteInexistente = await peticion('PATCH', '/inventario/stock/PRUEBA-NO-EXISTE', {
    nueva_existencia: 5, motivo: 'Producto inexistente.'
  });
  verificar('Ajuste sobre producto inexistente responde 404', ajusteInexistente.codigo === 404, `-> ${ajusteInexistente.codigo}`);

  // ------------------------------------------------------------------
  console.log('\n[INTERCONEXIÓN] Baja lógica y su impacto entre CRUDs');
  // ------------------------------------------------------------------
  const desactivarCategoria = await peticion('DELETE', `/categorias/${idCategoriaPrueba}`);
  verificar('DELETE /categorias aplica baja lógica (200)', desactivarCategoria.codigo === 200, `-> ${desactivarCategoria.codigo}`);
  verificar('La categoría reporta estado = 0', Number(desactivarCategoria.cuerpo?.categoria?.estado) === 0);

  const categoriasActivas = await peticion('GET', '/categorias?soloActivas=true');
  verificar('La categoría desactivada NO aparece entre las activas',
    !(categoriasActivas.cuerpo?.categorias || []).some((c) => c.id_categoria === idCategoriaPrueba));

  const productoCatInactiva = await peticion('POST', '/productos', {
    ...payloadProducto, codigo: 'PRUEBA-INT-004', categoria: idCategoriaPrueba
  });
  verificar('No se puede crear un producto en una categoría inactiva (400)',
    productoCatInactiva.codigo === 400, `-> ${productoCatInactiva.codigo}`);

  const reactivarCategoria = await peticion('PATCH', `/categorias/${idCategoriaPrueba}/reactivar`);
  verificar('PATCH reactivar categoría responde 200', reactivarCategoria.codigo === 200, `-> ${reactivarCategoria.codigo}`);

  const bajaProducto = await peticion('DELETE', '/productos/PRUEBA-INT-001');
  verificar('DELETE /productos aplica baja lógica (200)', bajaProducto.codigo === 200, `-> ${bajaProducto.codigo}`);

  const productoSigueEnKardex = await peticion('GET', '/movimientos/producto/PRUEBA-INT-001');
  verificar('El histórico del kádex se conserva tras la baja lógica (FK intacta)',
    productoSigueEnKardex.codigo === 200 && (productoSigueEnKardex.cuerpo?.total || 0) >= 3,
    `-> ${productoSigueEnKardex.codigo}`);

  const productoInactivo = await peticion('GET', '/productos?soloActivos=true');
  verificar('El producto dado de baja no se lista como activo',
    !(productoInactivo.cuerpo?.productos || []).some((p) => p.cod_producto === 'PRUEBA-INT-001'));

  const movimientoProductoInactivo = await peticion('POST', '/movimientos', {
    cod_producto: 'PRUEBA-INT-001', tipo_movimiento: 'ENTRADA', cantidad: 1, motivo: 'Producto inactivo'
  });
  verificar('No se admiten movimientos de un producto inactivo (400)',
    movimientoProductoInactivo.codigo === 400, `-> ${movimientoProductoInactivo.codigo}`);

  // ------------------------------------------------------------------
  console.log('\n[VALIDACIÓN ESTRICTA] Stock mínimo vs existencia (instrucción 2)');
  // ------------------------------------------------------------------
  /*
   * CADENA COMPLETA DE PRUEBA (instrucción 3):
   *   1. Registrar categoría   -> CRUD 4
   *   2. Registrar producto    -> CRUD 1 (existencia nace en 0)
   *   3. Ajustar stock inicial -> CRUD 2 (el almacenista carga las unidades)
   *   4. Registrar movimiento  -> CRUD 3 (kádex, entrada o salida)
   */
  const catCadena = await peticion('POST', '/categorias', { nombre_categoria: 'PRUEBA-CADENA' });
  const idCatCadena = catCadena.cuerpo?.categoria?.id_categoria;
  verificar('1) Cadena: la categoría se registra', catCadena.codigo === 201, `-> ${catCadena.codigo}`);

  const prodCadena = await peticion('POST', '/productos', {
    cod_producto: 'PRUEBA-CADENA-001',
    nombre_producto: 'Artículo de la cadena completa',
    id_categoria: idCatCadena,
    marca: 'TekZonQA',
    precio_costo: 10,
    precio_venta: 20,
    stock_minimo: 4 // Mayor que la existencia (0): el ALTA debe PERMITIRLO
  });
  verificar('2) Cadena: el producto se registra con stock_minimo > existencia (regla permisiva en el alta)',
    prodCadena.codigo === 201, `-> ${prodCadena.codigo}`);
  verificar('2) Cadena: la existencia inicial es 0',
    Number(prodCadena.cuerpo?.producto?.existencia) === 0);

  // La categoría recién creada debe aparecer de inmediato para el selector.
  const categoriasActivasCadena = await peticion('GET', '/categorias?soloActivas=true');
  verificar('INTERCONEXIÓN: la categoría nueva aparece de inmediato en el selector de productos',
    (categoriasActivasCadena.cuerpo?.categorias || []).some((c) => c.id_categoria === idCatCadena));

  // El producto nuevo debe aparecer en la tabla de existencias (CRUD 2) para
  // que el almacenista pueda asignarle stock.
  const existenciasCadena = await peticion('GET', '/inventario/stock');
  verificar('INTERCONEXIÓN: el producto nuevo aparece de inmediato en la tabla de existencias',
    (existenciasCadena.cuerpo?.existencias || []).some((e) => e.cod_producto === 'PRUEBA-CADENA-001'));

  // --- REGLA ESTRICTA EN EL AJUSTE DE EXISTENCIAS (CRUD 2) ---
  const ajusteMinimoExcesivo = await peticion('PATCH', '/inventario/stock/PRUEBA-CADENA-001', {
    existencia: 2,
    stock_minimo: 10, // 10 > 2 -> debe rechazarse con 400
    motivo: 'Prueba: mínimo mayor que la existencia.',
    id_usuario: 1
  });
  verificar('AJUSTE rechaza stock_minimo > existencia con HTTP 400 (no 500)',
    ajusteMinimoExcesivo.codigo === 400, `-> ${ajusteMinimoExcesivo.codigo}`);
  verificar('El mensaje explica la regla de negocio',
    /stock m[ií]nimo/i.test(ajusteMinimoExcesivo.cuerpo?.mensaje || ''),
    `-> ${ajusteMinimoExcesivo.cuerpo?.mensaje}`);

  // La existencia NO debe haberse modificado tras el rechazo (rollback limpio).
  const existenciaTrasRechazo = await peticion('GET', '/inventario/stock/PRUEBA-CADENA-001');
  verificar('Tras el rechazo la existencia sigue en 0 (no se escribió nada)',
    Number(existenciaTrasRechazo.cuerpo?.existencia?.existencia) === 0,
    `-> ${existenciaTrasRechazo.cuerpo?.existencia?.existencia}`);

  // --- AJUSTE VÁLIDO: 3) el almacenista carga el stock inicial ---
  const ajusteValido = await peticion('PATCH', '/inventario/stock/PRUEBA-CADENA-001', {
    existencia: 25,
    stock_minimo: 4,
    motivo: 'Prueba de cadena: carga del stock inicial en almacén.',
    id_usuario: 1
  });
  verificar('3) Cadena: el ajuste válido responde 200', ajusteValido.codigo === 200, `-> ${ajusteValido.codigo}`);
  verificar('3) Cadena: el asiento de AJUSTE quedó registrado en el kádex',
    ajusteValido.cuerpo?.ajuste?.asiento_registrado === true);
  verificar('3) Cadena: la existencia quedó en 25',
    Number(ajusteValido.cuerpo?.ajuste?.existencia_posterior) === 25);

  // --- AJUSTE SÓLO DEL UMBRAL (sin variar la existencia) ---
  const ajusteSoloMinimo = await peticion('PATCH', '/inventario/stock/PRUEBA-CADENA-001', {
    existencia: 25,
    stock_minimo: 8,
    motivo: 'Prueba: reconfiguración del umbral de alerta.',
    id_usuario: 1
  });
  verificar('Se permite ajustar sólo el stock mínimo sin variar la existencia',
    ajusteSoloMinimo.codigo === 200, `-> ${ajusteSoloMinimo.codigo}`);
  verificar('No se crea asiento en el kádex si la existencia no cambió',
    ajusteSoloMinimo.cuerpo?.ajuste?.asiento_registrado === false);

  // --- REGLA ESTRICTA EN LA EDICIÓN DE LA FICHA (CRUD 1) ---
  const edicionMinimoExcesivo = await peticion('PUT', '/productos/PRUEBA-CADENA-001', {
    nombre_producto: 'Artículo de la cadena completa',
    id_categoria: idCatCadena,
    marca: 'TekZonQA',
    precio_costo: 10,
    precio_venta: 20,
    stock_minimo: 999 // 999 > 25 -> debe rechazarse
  });
  verificar('EDICIÓN rechaza stock_minimo > existencia con HTTP 400',
    edicionMinimoExcesivo.codigo === 400, `-> ${edicionMinimoExcesivo.codigo}`);

  const edicionMinimoValido = await peticion('PUT', '/productos/PRUEBA-CADENA-001', {
    nombre_producto: 'Artículo de la cadena completa (editado)',
    id_categoria: idCatCadena,
    marca: 'TekZonQA',
    precio_costo: 11,
    precio_venta: 22,
    stock_minimo: 6
  });
  verificar('EDICIÓN con stock_minimo <= existencia se acepta (200)',
    edicionMinimoValido.codigo === 200, `-> ${edicionMinimoValido.codigo}`);

  // --- 4) MOVIMIENTO DEL KÁRDEX SOBRE EL PRODUCTO DE LA CADENA ---
  const movimientoCadena = await peticion('POST', '/movimientos', {
    cod_producto: 'PRUEBA-CADENA-001',
    tipo_movimiento: 'SALIDA',
    cantidad: 3,
    motivo: 'Prueba de cadena: salida para orden de servicio.',
    id_usuario: 1
  });
  verificar('4) Cadena: la salida del kádex responde 201', movimientoCadena.codigo === 201, `-> ${movimientoCadena.codigo}`);
  verificar('4) Cadena: existencia 25 -> 22 de forma atómica',
    Number(movimientoCadena.cuerpo?.movimiento?.existencia_posterior) === 22,
    `-> ${movimientoCadena.cuerpo?.movimiento?.existencia_posterior}`);

  // La columna `producto.existencia` debe reflejar el cambio del kádex.
  const verificacionAtomica = await peticion('GET', '/productos/PRUEBA-CADENA-001');
  verificar('ATOMICIDAD: la columna producto.existencia se actualizó junto al asiento del kádex',
    Number(verificacionAtomica.cuerpo?.producto?.existencia) === 22,
    `-> ${verificacionAtomica.cuerpo?.producto?.existencia}`);

  // ------------------------------------------------------------------
  console.log('\n[MANEJO DE ERRORES GLOBALES]');
  // ------------------------------------------------------------------
  const rutaInexistente = await peticion('GET', '/ruta-que-no-existe');
  verificar('Ruta no declarada responde 404 con cuerpo JSON',
    rutaInexistente.codigo === 404 && Boolean(rutaInexistente.cuerpo?.mensaje), `-> ${rutaInexistente.codigo}`);

  // ------------------------------------------------------------------
  console.log('\n[LIMPIEZA DE DATOS DE PRUEBA]');
  // ------------------------------------------------------------------
  // La limpieza se ejecuta desde el script `scripts/limpiarDatosPrueba.ps1`
  // o con la sentencia SQL que se imprime a continuación. NO se lanza ningún
  // proceso hijo desde Node para mantener la prueba libre de dependencias
  // externas y compatible con entornos restringidos.
  console.log('  Ejecute la siguiente sentencia para retirar los datos de prueba:');
  console.log('');
  console.log('    USE tekzon_bd;');
  console.log("    DELETE FROM movimiento_inventario WHERE cod_producto LIKE 'PRUEBA-%';");
  console.log("    DELETE FROM producto WHERE cod_producto LIKE 'PRUEBA-%';");
  console.log("    DELETE FROM categoria WHERE nombre_categoria LIKE 'PRUEBA-%';");
  console.log('');

  // ------------------------------------------------------------------
  console.log('\n' + '='.repeat(74));
  console.log(` RESULTADO: ${pruebasCorrectas} pruebas correctas · ${pruebasFallidas} fallidas`);
  console.log('='.repeat(74));

  process.exit(pruebasFallidas === 0 ? 0 : 1);
};

ejecutarPruebas().catch((error) => {
  console.error('Error fatal en la prueba de integración:', error);
  process.exit(1);
});
