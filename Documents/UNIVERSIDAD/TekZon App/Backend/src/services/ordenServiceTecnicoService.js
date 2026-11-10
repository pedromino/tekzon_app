/**
 * ==========================================================================
 * SERVICIO DE ORDEN DE SERVICIO TÉCNICO (ordenServiceTecnicoService.js)
 * ==========================================================================
 * CAPA: Lógica de negocio (Business Logic Layer) · Módulo 2 (Servicio Técnico)
 *
 * PROPÓSITO FUNCIONAL:
 *   Orquesta el FLUJO COMPLETO del taller exigido por el requisito:
 *
 *     1. RECEPCIÓN   · registra al cliente y las características del equipo y
 *                      abre la orden con estado por defecto "Pendiente".
 *     2. PANEL       · permite al técnico avanzar el estado respetando la
 *                      máquina de estados y documentar el diagnóstico.
 *     3. REPUESTOS   · al agregar un repuesto descuenta el inventario y deja el
 *                      asiento del kádex marcado como "Servicio Técnico".
 *     4. COBRO       · suma AUTOMÁTICAMENTE mano de obra + repuestos, registra
 *                      el método de pago, emite la factura y cierra la orden.
 *
 * PROPÓSITO TÉCNICO:
 *   Este servicio concentra TODAS las validaciones de negocio y delega la
 *   escritura atómica en `OrdenServiceTecnicoModel`. Nunca escribe SQL.
 *   Cualquier regla incumplida se lanza como `ErrorNegocio` con su código HTTP.
 * ==========================================================================
 */
import { OrdenServiceTecnicoModel } from '../models/ordenServiceTecnicoModel.js';
import { MovimientoModel, ORIGENES_MOVIMIENTO } from '../models/movimientoModel.js';
import { CajaModel } from '../models/cajaModel.js';
import { ErrorNegocio } from '../utils/erroresNegocio.js';
import {
  ESTADOS_ORDEN,
  ETIQUETAS_ESTADO,
  esTransicionPermitida
} from '../utils/estadosOrdenTecnico.js';
import { normalizarCedula } from './clienteService.js';

/** Longitudes máximas según el DDL de `orden_tecnico` y `dispositivo`. */
const LONGITUD_MAXIMA_ACCESORIOS = 255;
const LONGITUD_MAXIMA_PATRON = 120;
const LONGITUD_MAXIMA_SERIE = 100;

/** Métodos de pago admitidos en la caja de TekZon C.A. */
export const METODOS_PAGO = Object.freeze([
  'EFECTIVO',
  'PAGO_MOVIL',
  'PUNTO_DEBITO',
  'TRANSFERENCIA',
  'ZELLE',
  'DIVISAS'
]);

/** Limpia un texto (quita espacios externos). */
const limpiarTexto = (valor) => String(valor ?? '').trim();

/** Convierte a número decimal con dos posiciones; `null` si no es numérico. */
const aDecimal = (valor) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  return Number(numero.toFixed(2));
};

/**
 * VALIDA EL PAGO DE UNA ORDEN O DE UNA VENTA.
 * Se exporta porque el Módulo de Venta Directa aplica exactamente las mismas
 * reglas de cobro, y así ambos módulos comparten una única fuente de verdad.
 *
 * @param {Object} datosPago  { metodo_pago, monto_usd, tasa_cambio, referencia }
 * @param {number} totalEsperado Importe calculado por el sistema.
 * @returns {Object} Datos de pago normalizados y validados.
 */
export const validarDatosPago = (datosPago, totalEsperado) => {
  // ---- 1. Método de pago obligatorio y dentro del catálogo admitido ----
  const metodo_pago = limpiarTexto(
    datosPago?.metodo_pago ?? datosPago?.metodoPago ?? datosPago?.metodo
  ).toUpperCase().replace(/\s+/g, '_');

  if (!metodo_pago) {
    throw new ErrorNegocio('Debe indicar el método de pago con el que cancela el cliente.', 400);
  }

  if (!METODOS_PAGO.includes(metodo_pago)) {
    throw new ErrorNegocio(
      `El método de pago "${metodo_pago}" no es válido. Use uno de: ${METODOS_PAGO.join(', ')}.`,
      400
    );
  }

  // ---- 2. Monto cobrado ----
  const monto_usd = aDecimal(datosPago?.monto_usd ?? datosPago?.monto);

  if (monto_usd === null) {
    throw new ErrorNegocio('El monto cobrado debe ser un valor numérico.', 400);
  }

  if (monto_usd <= 0) {
    throw new ErrorNegocio('El monto cobrado debe ser mayor que cero.', 400);
  }

  /*
   * REGLA DE SEGURIDAD CONTABLE: el monto cobrado debe coincidir con el total
   * calculado por el sistema (mano de obra + repuestos, o el subtotal de la
   * venta). Se admite una tolerancia de un centavo para absorber el redondeo
   * de los decimales. Así se impide que un cliente manipule el importe.
   */
  const diferencia = Math.abs(monto_usd - Number(totalEsperado));

  if (diferencia > 0.01) {
    throw new ErrorNegocio(
      `El monto cobrado (${monto_usd.toFixed(2)} USD) no coincide con el total calculado por el `
      + `sistema (${Number(totalEsperado).toFixed(2)} USD). Diferencia: ${diferencia.toFixed(2)} USD.`,
      400
    );
  }

  // ---- 3. Tasa de cambio aplicada (USD -> Bs) ----
  // Para efectivo o divisas no tiene sentido exigir tasa BCV porque el dinero entra en efectivo directo.
  // Solo se exige tasa BCV para pago móvil, transferencia, punto de débito, etc.
  const metodosSinTasa = ['EFECTIVO', 'DIVISAS', 'ZELLE'];
  const exigeTasa = !metodosSinTasa.includes(metodo_pago);

  let tasa_cambio = 1.00;
  if (exigeTasa) {
    const tasaRecibida = aDecimal(datosPago?.tasa_cambio ?? datosPago?.tasa);
    if (tasaRecibida === null || tasaRecibida <= 0) {
      throw new ErrorNegocio(
        `El método de pago "${metodo_pago}" exige indicar la tasa de cambio BCV aplicada (Bs por USD).`,
        400
      );
    }
    tasa_cambio = tasaRecibida;
  } else {
    // Si viene informada se conserva, de lo contrario valor 1.00 por defecto
    const tasaOpcional = aDecimal(datosPago?.tasa_cambio ?? datosPago?.tasa);
    tasa_cambio = (tasaOpcional && tasaOpcional > 0) ? tasaOpcional : 1.00;
  }

  // ---- 4. Referencia (obligatoria en pagos electrónicos) ----
  const referencia = limpiarTexto(datosPago?.referencia);

  const metodosQueExigenReferencia = ['PAGO_MOVIL', 'TRANSFERENCIA', 'ZELLE', 'PUNTO_DEBITO'];

  if (metodosQueExigenReferencia.includes(metodo_pago) && !referencia) {
    throw new ErrorNegocio(
      `El método de pago "${metodo_pago}" exige el número de referencia o comprobante de la operación.`,
      400
    );
  }

  return { metodo_pago, monto_usd, tasa_cambio, referencia: referencia || null };
};

export const OrdenServiceTecnicoService = {
  /* ======================================================================
   * 1. CONSULTAS
   * ====================================================================== */

  /**
   * LISTA DE ÓRDENES PARA EL PANEL DEL TÉCNICO.
   * Valida el filtro de estado para no devolver listas vacías por una errata.
   */
  async obtenerOrdenes(filtros = {}) {
    const estado = limpiarTexto(filtros.estado);
    const texto = limpiarTexto(filtros.texto ?? filtros.busqueda);
    const cedulaCruda = limpiarTexto(filtros.cedula ?? filtros.cedula_cli);

    if (estado && !Object.values(ESTADOS_ORDEN).includes(estado)) {
      throw new ErrorNegocio(
        `El estado "${estado}" no es válido. Use uno de: ${Object.values(ESTADOS_ORDEN).join(', ')}.`,
        400
      );
    }

    // La cédula se normaliza para que el filtro coincida con lo almacenado.
    const cedula = cedulaCruda ? normalizarCedula(cedulaCruda) : undefined;

    const valorPendientes = String(filtros.soloPendientesDeCobro ?? '').toLowerCase();

    return await OrdenServiceTecnicoModel.listarOrdenes({
      estado: estado || undefined,
      cedula,
      texto: texto || undefined,
      soloPendientesDeCobro: valorPendientes === 'true' || valorPendientes === '1'
    });
  },

  /**
   * FICHA COMPLETA DE UNA ORDEN: datos del cliente, del equipo, repuestos
   * consumidos y el desglose económico (mano de obra + repuestos = total).
   */
  async obtenerOrdenPorId(id_ordentec) {
    const idLimpio = limpiarTexto(id_ordentec).toUpperCase();

    if (!idLimpio) {
      throw new ErrorNegocio('Debe indicar el número de la orden de servicio.', 400);
    }

    const orden = await OrdenServiceTecnicoModel.obtenerPorId(idLimpio);

    if (!orden) {
      throw new ErrorNegocio(`No existe la orden de servicio técnico "${idLimpio}".`, 404);
    }

    const repuestos = await OrdenServiceTecnicoModel.listarRepuestos(idLimpio);

    // ---- Desglose económico calculado (contrato que consume el frontend) ----
    const costoManoObra = Number(orden.costo_mano_obra || 0);
    const totalRepuestos = Number(orden.total_repuestos || 0);

    return {
      orden,
      repuestos,
      desglose: {
        mano_obra: costoManoObra,
        repuestos: totalRepuestos,
        total: Number((costoManoObra + totalRepuestos).toFixed(2)),
        cantidad_repuestos: repuestos.length
      },
      // Estados a los que el técnico puede avanzar desde el estado actual.
      estadosPermitidos: this.calcularEstadosPermitidos(orden.estado)
    };
  },

  /**
   * Calcula los estados a los que se puede avanzar desde el estado actual.
   * PROPÓSITO FUNCIONAL: el Panel del Técnico usa esta lista para habilitar
   * únicamente los botones de avance válidos, evitando que el usuario intente
   * una transición prohibida y reciba un error.
   */
  calcularEstadosPermitidos(estadoActual) {
    return Object.values(ESTADOS_ORDEN)
      .filter((estadoDestino) => esTransicionPermitida(estadoActual, estadoDestino).permitida)
      .map((estado) => ({
        valor: estado,
        ...ETIQUETAS_ESTADO[estado]
      }));
  },

  /** INDICADORES DEL TALLER (tarjetas KPI del Panel del Técnico y de la Caja). */
  async obtenerIndicadores() {
    return await OrdenServiceTecnicoModel.obtenerIndicadoresTaller();
  },

  /* ======================================================================
   * 2. RECEPCIÓN
   * ====================================================================== */

  /**
   * REGISTRA LA RECEPCIÓN DEL EQUIPO Y ABRE LA ORDEN "Pendiente".
   *
   * PROPÓSITO FUNCIONAL (requisito):
   *   "Recepción: Interfaz para registrar los datos de un cliente que trae su
   *    dispositivo, y registrar las características de dicho dispositivo."
   *   "Orden: Al registrarlo, se crea una Orden de Servicio Técnico asociada,
   *    cuyo estado por defecto debe ser 'Pendiente'."
   *
   * @param {Object} datosEntrada Payload del formulario de Recepción.
   * @param {Object} usuarioAutenticado Usuario de la sesión (técnico/administrador
   *   que abre la orden; firma la FK `fk_orden_tecnico_usuario1`).
   */
  async registrarRecepcion(datosEntrada, usuarioAutenticado) {
    // ---- 1. Datos del cliente ----
    const cedula_cli = normalizarCedula(datosEntrada?.cedula_cli ?? datosEntrada?.cedula);
    const nombre_cliente = limpiarTexto(datosEntrada?.nombre_cliente ?? datosEntrada?.nombre);
    const apellido_cliente = limpiarTexto(datosEntrada?.apellido_cliente ?? datosEntrada?.apellido);
    const telefono_cliente = limpiarTexto(datosEntrada?.telefono_cliente ?? datosEntrada?.telefono);
    const direccion_cli = limpiarTexto(datosEntrada?.direccion_cli ?? datosEntrada?.direccion);

    if (!nombre_cliente) {
      throw new ErrorNegocio('El nombre del cliente es obligatorio para abrir la orden.', 400);
    }

    if (!apellido_cliente) {
      throw new ErrorNegocio('El apellido del cliente es obligatorio para abrir la orden.', 400);
    }

    // ---- 2. Características del dispositivo ----
    const nombre_dis = limpiarTexto(datosEntrada?.nombre_dis ?? datosEntrada?.tipo_dispositivo);
    const marca = limpiarTexto(datosEntrada?.marca);
    const modelo = limpiarTexto(datosEntrada?.modelo);
    const numero_serie = limpiarTexto(
      datosEntrada?.numero_serie ?? datosEntrada?.serial ?? datosEntrada?.imei
    ).toUpperCase();

    if (!nombre_dis) {
      throw new ErrorNegocio(
        'Debe indicar qué tipo de dispositivo trae el cliente (Laptop, Teléfono, etc.).',
        400
      );
    }

    if (!marca) {
      throw new ErrorNegocio('La marca del dispositivo es obligatoria.', 400);
    }

    if (numero_serie.length > LONGITUD_MAXIMA_SERIE) {
      throw new ErrorNegocio(
        `El número de serie no puede superar los ${LONGITUD_MAXIMA_SERIE} caracteres.`,
        400
      );
    }

    // ---- 3. Datos de la orden ----
    const falla_reportada = limpiarTexto(
      datosEntrada?.falla_reportada ?? datosEntrada?.falla
    );

    if (!falla_reportada) {
      throw new ErrorNegocio(
        'Debe describir la falla que reporta el cliente: es la base del diagnóstico técnico.',
        400
      );
    }

    const accesorios = limpiarTexto(datosEntrada?.accesorios);
    const patron_desbloqueo = limpiarTexto(
      datosEntrada?.patron_desbloqueo ?? datosEntrada?.patron ?? datosEntrada?.clave
    );

    if (accesorios.length > LONGITUD_MAXIMA_ACCESORIOS) {
      throw new ErrorNegocio(
        `La lista de accesorios no puede superar los ${LONGITUD_MAXIMA_ACCESORIOS} caracteres.`,
        400
      );
    }

    if (patron_desbloqueo.length > LONGITUD_MAXIMA_PATRON) {
      throw new ErrorNegocio(
        `El patrón o clave de desbloqueo no puede superar los ${LONGITUD_MAXIMA_PATRON} caracteres.`,
        400
      );
    }

    // ---- 4. Firma del usuario que abre la orden (FK obligatoria) ----
    const id_usuario = Number(usuarioAutenticado?.id_usuario);

    if (!Number.isInteger(id_usuario) || id_usuario <= 0) {
      throw new ErrorNegocio('No se pudo identificar al usuario que registra la recepción.', 401);
    }

    // ---- 5. Escritura atómica (cliente + dispositivo + orden) ----
    const resultado = await OrdenServiceTecnicoModel.registrarRecepcion({
      cedula_cli,
      nombre_cliente,
      apellido_cliente,
      telefono_cliente,
      direccion_cli,
      nombre_dis,
      marca,
      modelo,
      numero_serie,
      falla_reportada,
      accesorios,
      patron_desbloqueo,
      id_usuario
    });

    const fichaOrden = await this.obtenerOrdenPorId(resultado.id_ordentec);

    // Mensaje que resume exactamente lo que ocurrió en la base de datos.
    const avisos = [];
    if (resultado.esClienteNuevo) avisos.push('cliente registrado por primera vez');
    if (resultado.esDispositivoNuevo) avisos.push('dispositivo registrado por primera vez');

    return {
      ...fichaOrden,
      esClienteNuevo: resultado.esClienteNuevo,
      esDispositivoNuevo: resultado.esDispositivoNuevo,
      mensaje: `Orden de servicio técnico ${resultado.id_ordentec} creada en estado "Pendiente"`
        + (avisos.length > 0 ? ` (${avisos.join(', ')})` : ' (se reutilizó la ficha existente del cliente y del equipo)')
        + '.'
    };
  },

  /* ======================================================================
   * 3. PANEL DEL TÉCNICO
   * ====================================================================== */

  /**
   * ACTUALIZA EL ESTADO / DIAGNÓSTICO DE UNA ORDEN (Panel del Técnico).
   *
   * PROPÓSITO FUNCIONAL (requisito):
   *   "Panel del Técnico: Una vista donde sale la orden creada con los datos del
   *    cliente y dispositivo. El técnico puede editar el estado para procesarlo
   *    (ej. En Reparación, Listo)."
   *
   * REGLAS APLICADAS:
   *   · No se puede cambiar el estado de una orden ya ENTREGADA.
   *   · Sólo se admiten las transiciones del grafo (no se salta de Pendiente
   *     a Listo sin pasar por la reparación).
   *   · La mano de obra debe ser un número mayor o igual a cero.
   *   · Al pasar a "Listo" se fija automáticamente la fecha de disponibilidad.
   *
   * @param {string} id_ordentec      Orden a actualizar.
   * @param {Object} datosActualizacion { estado, observaciones, costo_mano_obra }
   */
  async actualizarEstadoOrden(id_ordentec, datosActualizacion) {
    // Se recupera la orden (lanza 404 si no existe) y su desglose actual.
    const fichaActual = await this.obtenerOrdenPorId(id_ordentec);
    const ordenActual = fichaActual.orden;

    // ---- 1. Estado destino (si no viene, se conserva el actual) ----
    const estadoNuevo = limpiarTexto(datosActualizacion?.estado) || ordenActual.estado;

    // ---- 2. Validación de la máquina de estados ----
    const validacionTransicion = esTransicionPermitida(ordenActual.estado, estadoNuevo);

    if (!validacionTransicion.permitida) {
      throw new ErrorNegocio(validacionTransicion.motivo, 400);
    }

    /*
     * ---- 3. El estado "Entregado" NO se alcanza desde este endpoint ----
     * La entrega es consecuencia del COBRO: el sistema la aplica en
     * `cobrarOrden`. Si el técnico intentara marcarla como entregada por aquí,
     * se estaría saltando la facturación.
     */
    if (estadoNuevo === ESTADOS_ORDEN.ENTREGADO) {
      throw new ErrorNegocio(
        'Una orden sólo pasa a "Entregado" cuando el cliente cancela el servicio. '
        + 'Use la opción "Cobrar orden" del módulo de Caja.',
        400
      );
    }

    // ---- 4. Observaciones del diagnóstico ----
    const observaciones = datosActualizacion?.observaciones !== undefined
      ? limpiarTexto(datosActualizacion.observaciones)
      : (ordenActual.observaciones || null);

    // ---- 5. Costo de mano de obra ----
    let costo_mano_obra = Number(ordenActual.costo_mano_obra || 0);

    const manoObraRecibida = datosActualizacion?.costo_mano_obra ?? datosActualizacion?.mano_obra;

    if (manoObraRecibida !== undefined && manoObraRecibida !== null && manoObraRecibida !== '') {
      const manoObraNumerica = aDecimal(manoObraRecibida);

      if (manoObraNumerica === null) {
        throw new ErrorNegocio('El costo de mano de obra debe ser un valor numérico.', 400);
      }

      if (manoObraNumerica < 0) {
        throw new ErrorNegocio('El costo de mano de obra no puede ser negativo.', 400);
      }

      costo_mano_obra = manoObraNumerica;
    }

    /*
     * ---- 6. Fecha de disponibilidad del equipo ----
     * Se fija la fecha en que la orden pasa a "Listo" (el equipo queda
     * disponible para el cliente). Si sale de "Listo" (reapertura), se limpia
     * para no dejar una fecha de entrega engañosa.
     */
    let fecha_entrega = ordenActual.fecha_entrega || null;

    if (estadoNuevo === ESTADOS_ORDEN.LISTO) {
      fecha_entrega = new Date().toISOString().slice(0, 10); // formato YYYY-MM-DD
    } else if (ordenActual.estado === ESTADOS_ORDEN.LISTO) {
      fecha_entrega = null;
    }

    // ---- 7. Escritura ----
    const ordenActualizada = await OrdenServiceTecnicoModel.actualizarEstado(ordenActual.id_ordentec, {
      estado: estadoNuevo,
      observaciones,
      costo_mano_obra,
      fecha_entrega
    });

    if (!ordenActualizada) {
      throw new ErrorNegocio(`No existe la orden de servicio técnico "${id_ordentec}".`, 404);
    }

    // Se devuelve la ficha completa (con repuestos y desglose recalculado).
    const fichaActualizada = await this.obtenerOrdenPorId(ordenActual.id_ordentec);

    const mensaje = estadoNuevo === ordenActual.estado
      ? `Orden ${ordenActual.id_ordentec} actualizada correctamente.`
      : `Orden ${ordenActual.id_ordentec}: estado cambiado de "${ordenActual.estado}" a "${estadoNuevo}".`;

    return { ...fichaActualizada, mensaje };
  },

  /* ======================================================================
   * 4. CONSUMO DE INVENTARIO (REPUESTOS)
   * ====================================================================== */

  /**
   * AGREGA UN REPUESTO A LA ORDEN · DESCUENTA INVENTARIO Y REGISTRA EL KÁRDEX.
   *
   * PROPÓSITO FUNCIONAL (requisito):
   *   "Si la orden requiere un repuesto, el técnico lo agrega. Al hacerlo, el
   *    sistema debe restar la cantidad de la existencia del inventario y guardar
   *    un registro en una tabla de movimientos de inventario marcando la salida
   *    como 'Servicio Técnico'."
   *
   * @param {string} id_ordentec  Orden que consume el repuesto.
   * @param {Object} datosRepuesto { cod_producto, cantidad, precio_unitario }
   * @param {Object} usuarioAutenticado Usuario que firma el asiento del kádex.
   */
  async agregarRepuestoOrden(id_ordentec, datosRepuesto, usuarioAutenticado) {
    // ---- 1. Se valida la orden (existencia y estado) ----
    const fichaOrden = await this.obtenerOrdenPorId(id_ordentec);
    const orden = fichaOrden.orden;

    if (Number(orden.cobrada) === 1) {
      throw new ErrorNegocio(
        `La orden ${orden.id_ordentec} ya fue cobrada y facturada (factura ${orden.numero_factura}): `
        + 'no admite nuevos repuestos.',
        400
      );
    }

    if (orden.estado === ESTADOS_ORDEN.ENTREGADO) {
      throw new ErrorNegocio(
        `La orden ${orden.id_ordentec} ya fue entregada: no admite nuevos repuestos.`,
        400
      );
    }

    // ---- 2. Producto y cantidad ----
    const cod_producto = limpiarTexto(
      datosRepuesto?.cod_producto ?? datosRepuesto?.codigo ?? datosRepuesto?.producto
    );

    if (!cod_producto) {
      throw new ErrorNegocio('Debe seleccionar el repuesto del inventario.', 400);
    }

    const cantidad = Number(datosRepuesto?.cantidad ?? 1);

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new ErrorNegocio('La cantidad del repuesto debe ser un número entero mayor que cero.', 400);
    }

    // ---- 3. Precio unitario (opcional: si no viene se toma el de venta) ----
    let precio_unitario;
    const precioRecibido = datosRepuesto?.precio_unitario ?? datosRepuesto?.precio;

    if (precioRecibido !== undefined && precioRecibido !== null && precioRecibido !== '') {
      precio_unitario = aDecimal(precioRecibido);

      if (precio_unitario === null || precio_unitario < 0) {
        throw new ErrorNegocio('El precio unitario del repuesto debe ser un número mayor o igual a cero.', 400);
      }
    }

    // ---- 4. Usuario que firma el movimiento ----
    const id_usuario = Number(usuarioAutenticado?.id_usuario);

    if (!Number.isInteger(id_usuario) || id_usuario <= 0) {
      throw new ErrorNegocio('No se pudo identificar al técnico que consume el repuesto.', 401);
    }

    /*
     * ---- 5. Escritura transaccional ----
     * Aquí ocurre la magia de la integración: el modelo descuenta el stock,
     * inserta el asiento del kádex con origen 'SERVICIO_TECNICO' y evalúa la
     * alerta de stock mínimo, todo en la misma transacción.
     */
    const resultado = await OrdenServiceTecnicoModel.agregarRepuesto({
      id_ordentec: orden.id_ordentec,
      cod_producto,
      cantidad,
      precio_unitario,
      id_usuario,
      origen: ORIGENES_MOVIMIENTO.SERVICIO_TECNICO
    });

    // ---- 6. Traducción de los resultados del modelo a errores HTTP ----
    if (resultado.ordenEncontrada === false) {
      throw new ErrorNegocio(`No existe la orden de servicio técnico "${id_ordentec}".`, 404);
    }

    if (resultado.ordenCobrada) {
      throw new ErrorNegocio(
        `La orden ${orden.id_ordentec} ya fue cobrada: no admite nuevos repuestos.`,
        400
      );
    }

    if (resultado.ordenEntregada) {
      throw new ErrorNegocio(
        `La orden ${orden.id_ordentec} ya fue entregada: no admite nuevos repuestos.`,
        400
      );
    }

    if (resultado.repuestoNoEncontrado) {
      throw new ErrorNegocio(
        `No existe el producto con código "${cod_producto}" en el catálogo de inventario.`,
        404
      );
    }

    if (resultado.repuestoInactivo) {
      throw new ErrorNegocio(
        `El producto "${resultado.nombre_producto}" está inactivo en el catálogo: no se puede consumir.`,
        400
      );
    }

    if (resultado.stockInsuficiente) {
      throw new ErrorNegocio(
        `Stock insuficiente para "${resultado.nombre_producto}". `
        + `Disponible: ${resultado.existenciaDisponible} u., solicitado: ${resultado.cantidadSolicitada} u. `
        + 'Registre una Entrada de mercancía en el módulo de inventario o reduzca la cantidad.',
        400
      );
    }

    // ---- 7. Se devuelve la ficha completa y actualizada de la orden ----
    const fichaActualizada = await this.obtenerOrdenPorId(orden.id_ordentec);

    // Mensaje detallado que refleja el movimiento real del almacén.
    let mensaje = `Repuesto "${resultado.nombre_producto}" agregado a la orden ${orden.id_ordentec}: `
      + `${resultado.cantidad_agregada} u. descontadas del inventario `
      + `(existencia ${resultado.existencia_previa} -> ${resultado.existencia_posterior}). `
      + 'Movimiento registrado en el kádex como SALIDA de origen "Servicio Técnico".';

    // Si el descuento dejó el producto en el mínimo, se informa de la alerta.
    if (resultado.alerta) {
      mensaje += ` ¡${resultado.alerta.mensaje}`;
    }

    return {
      ...fichaActualizada,
      movimiento: {
        cod_producto: resultado.cod_producto,
        nombre_producto: resultado.nombre_producto,
        cantidad: resultado.cantidad_agregada,
        existencia_previa: resultado.existencia_previa,
        existencia_posterior: resultado.existencia_posterior,
        origen: resultado.origen,
        id_movimiento: resultado.id_movimiento
      },
      alerta: resultado.alerta,
      mensaje
    };
  },

  /**
   * QUITA UN REPUESTO DE LA ORDEN Y REPONE EL INVENTARIO.
   * Sólo procede si la orden todavía NO fue cobrada.
   */
  async quitarRepuestoOrden(id_ordentec, cod_producto, datosRetiro, usuarioAutenticado) {
    // ---- 1. Validación de la orden ----
    const fichaOrden = await this.obtenerOrdenPorId(id_ordentec);
    const orden = fichaOrden.orden;

    if (Number(orden.cobrada) === 1) {
      throw new ErrorNegocio(
        `La orden ${orden.id_ordentec} ya fue cobrada con la factura ${orden.numero_factura}: `
        + 'no se pueden retirar repuestos de una orden facturada.',
        400
      );
    }

    const codigoLimpio = limpiarTexto(cod_producto);

    if (!codigoLimpio) {
      throw new ErrorNegocio('Debe indicar el repuesto a retirar de la orden.', 400);
    }

    // ---- 2. Cantidad a retirar (opcional: por defecto se retira todo) ----
    let cantidad;

    const cantidadRecibida = datosRetiro?.cantidad;

    if (cantidadRecibida !== undefined && cantidadRecibida !== null && cantidadRecibida !== '') {
      cantidad = Number(cantidadRecibida);

      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        throw new ErrorNegocio('La cantidad a retirar debe ser un número entero mayor que cero.', 400);
      }
    }

    const id_usuario = Number(usuarioAutenticado?.id_usuario);

    if (!Number.isInteger(id_usuario) || id_usuario <= 0) {
      throw new ErrorNegocio('No se pudo identificar al técnico que retira el repuesto.', 401);
    }

    // ---- 3. Escritura transaccional (devuelve stock + audita la ENTRADA) ----
    const resultado = await OrdenServiceTecnicoModel.quitarRepuesto({
      id_ordentec: orden.id_ordentec,
      cod_producto: codigoLimpio,
      cantidad,
      id_usuario
    });

    // ---- 4. Traducción de resultados a errores HTTP ----
    if (resultado.ordenEncontrada === false) {
      throw new ErrorNegocio(`No existe la orden de servicio técnico "${id_ordentec}".`, 404);
    }

    if (resultado.ordenCobrada) {
      throw new ErrorNegocio(
        `La orden ${orden.id_ordentec} ya fue cobrada: no se pueden retirar repuestos.`,
        400
      );
    }

    if (resultado.repuestoNoEstaEnOrden) {
      throw new ErrorNegocio(
        `El repuesto "${codigoLimpio}" no forma parte de la orden ${orden.id_ordentec}.`,
        404
      );
    }

    if (resultado.repuestoNoEncontrado) {
      throw new ErrorNegocio(
        `No existe el producto con código "${codigoLimpio}" en el catálogo de inventario.`,
        404
      );
    }

    if (resultado.cantidadInvalida) {
      throw new ErrorNegocio(
        `La cantidad a retirar (${resultado.cantidadSolicitada}) debe estar entre 1 y `
        + `${resultado.cantidadEnOrden}, que es lo que tiene la orden.`,
        400
      );
    }

    const fichaActualizada = await this.obtenerOrdenPorId(orden.id_ordentec);

    return {
      ...fichaActualizada,
      movimiento: {
        cod_producto: resultado.cod_producto,
        nombre_producto: resultado.nombre_producto,
        cantidad: resultado.cantidad_devuelta,
        existencia_previa: resultado.existencia_previa,
        existencia_posterior: resultado.existencia_posterior,
        id_movimiento: resultado.id_movimiento
      },
      mensaje: `Repuesto "${resultado.nombre_producto}" retirado de la orden ${orden.id_ordentec}: `
        + `${resultado.cantidad_devuelta} u. devueltas al inventario `
        + `(existencia ${resultado.existencia_previa} -> ${resultado.existencia_posterior}). `
        + 'La devolución quedó auditada como ENTRADA en el kádex.'
    };
  },

  /* ======================================================================
   * 5. COBRO Y CIERRE
   * ====================================================================== */

  /**
   * COBRA LA ORDEN: SUMA MANO DE OBRA + REPUESTOS, REGISTRA EL PAGO, EMITE LA
   * FACTURA Y CIERRA LA ORDEN.
   *
   * PROPÓSITO FUNCIONAL (requisito):
   *   "Al finalizar, el sistema suma automáticamente el costo de la mano de obra
   *    más el costo de los repuestos utilizados. El cliente procede a cancelar,
   *    se registra el método de pago, el monto, se emite la factura y se cierra
   *    la orden del técnico."
   *
   * @param {string} id_ordentec   Orden a cobrar.
   * @param {Object} datosCobro    { metodo_pago, monto_usd, tasa_cambio, referencia, id_caja }
   * @param {Object} usuarioAutenticado Usuario que procesa el cobro.
   */
  async cobrarOrden(id_ordentec, datosCobro, usuarioAutenticado) {
    // ---- 1. Ficha de la orden con su desglose económico ----
    const fichaOrden = await this.obtenerOrdenPorId(id_ordentec);
    const orden = fichaOrden.orden;

    // ---- 2. Reglas previas al cobro ----
    if (Number(orden.cobrada) === 1) {
      throw new ErrorNegocio(
        `La orden ${orden.id_ordentec} ya fue cobrada. Factura emitida: ${orden.numero_factura}.`,
        400
      );
    }

    if (orden.estado === ESTADOS_ORDEN.ENTREGADO) {
      throw new ErrorNegocio(
        `La orden ${orden.id_ordentec} ya fue entregada al cliente.`,
        400
      );
    }

    /*
     * REGLA DE NEGOCIO DEL TALLER: no se cobra un equipo que no está listo.
     * El técnico debe declarar primero la orden como "Listo" (reparación
     * terminada) para que el cajero pueda facturarla.
     */
    if (orden.estado !== ESTADOS_ORDEN.LISTO) {
      throw new ErrorNegocio(
        `La orden ${orden.id_ordentec} está en estado "${orden.estado}". `
        + 'Sólo se puede cobrar una orden cuyo estado sea "Listo". '
        + 'Solicite al técnico que finalice la reparación.',
        400
      );
    }

    // ---- 3. El total lo calcula el sistema, nunca el cliente ----
    const totalCalculado = fichaOrden.desglose.total;

    if (totalCalculado <= 0) {
      throw new ErrorNegocio(
        `La orden ${orden.id_ordentec} tiene un total de 0.00 USD. `
        + 'Registre el costo de mano de obra y/o los repuestos antes de cobrar.',
        400
      );
    }

    // ---- 4. Validación del método de pago, el monto y la tasa ----
    const datosPagoValidados = validarDatosPago(datosCobro, totalCalculado);

    // ---- 5. Caja: se exige una caja ABIERTA para registrar el ingreso ----
    const idCajaRecibida = Number(datosCobro?.id_caja ?? datosCobro?.caja);

    const caja = Number.isInteger(idCajaRecibida) && idCajaRecibida > 0
      ? await CajaModel.obtenerPorId(idCajaRecibida)
      : await CajaModel.obtenerCajaAbierta();

    if (!caja) {
      throw new ErrorNegocio(
        'No hay una caja abierta para registrar el cobro. Abra la caja del día en el módulo de Caja.',
        400
      );
    }

    if (caja.estado !== 'ABIERTA') {
      throw new ErrorNegocio(
        `La caja seleccionada (id ${caja.id_caja}) está cerrada. Seleccione una caja abierta.`,
        400
      );
    }

    const id_usuario = Number(usuarioAutenticado?.id_usuario);

    if (!Number.isInteger(id_usuario) || id_usuario <= 0) {
      throw new ErrorNegocio('No se pudo identificar al usuario que procesa el cobro.', 401);
    }

    // ---- 6. Escritura transaccional: pago + factura + cierre de la orden ----
    const resultadoCobro = await OrdenServiceTecnicoModel.cobrarOrden({
      id_ordentec: orden.id_ordentec,
      metodo_pago: datosPagoValidados.metodo_pago,
      monto_usd: datosPagoValidados.monto_usd,
      tasa_cambio: datosPagoValidados.tasa_cambio,
      referencia: datosPagoValidados.referencia,
      id_caja: caja.id_caja,
      observaciones: limpiarTexto(datosCobro?.observaciones)
    });

    // ---- 7. Traducción de los resultados del modelo ----
    if (resultadoCobro.ordenEncontrada === false) {
      throw new ErrorNegocio(`No existe la orden de servicio técnico "${id_ordentec}".`, 404);
    }

    if (resultadoCobro.ordenYaCobrada) {
      throw new ErrorNegocio(
        `La orden ${orden.id_ordentec} ya fue cobrada por otro usuario. Actualice la pantalla.`,
        409
      );
    }

    // ---- 8. Al cobrar, las alertas de los repuestos consumidos se atienden ----
    try {
      await OrdenServiceTecnicoModel.atenderAlertasDeRepuestos(orden.id_ordentec);
    } catch (error) {
      // No debe impedir el cobro: la factura ya está emitida y confirmada.
      console.warn('[SERVICIO TECNICO] No se pudieron atender las alertas:', error.message);
    }

    // ---- 9. Documento de cobro final (comprobante para el cliente) ----
    const documentoCobro = await OrdenServiceTecnicoModel.obtenerFacturaDeOrden(orden.id_ordentec);

    // Importe en bolívares según la tasa aplicada (dato de la factura).
    const totalBolivares = Number((totalCalculado * datosPagoValidados.tasa_cambio).toFixed(2));

    return {
      ...documentoCobro,
      factura: {
        numero_factura: resultadoCobro.numero_factura,
        id_ordentec: orden.id_ordentec,
        fecha: new Date().toISOString(),
        mano_obra: resultadoCobro.costo_mano_obra,
        repuestos: resultadoCobro.total_repuestos,
        total_usd: resultadoCobro.total,
        tasa_cambio: datosPagoValidados.tasa_cambio,
        total_bolivares: totalBolivares,
        metodo_pago: datosPagoValidados.metodo_pago,
        monto_usd: datosPagoValidados.monto_usd,
        referencia: datosPagoValidados.referencia,
        id_caja: caja.id_caja
      },
      mensaje: `Orden ${orden.id_ordentec} cobrada y cerrada. `
        + `Factura ${resultadoCobro.numero_factura} emitida por ${resultadoCobro.total.toFixed(2)} USD `
        + `(mano de obra ${resultadoCobro.costo_mano_obra.toFixed(2)} + repuestos ${resultadoCobro.total_repuestos.toFixed(2)}) `
        + `pagada en ${datosPagoValidados.metodo_pago}. Equipo marcado como "Entregado".`
    };
  },

  /** COMPROBANTE DE UNA ORDEN YA COBRADA (para reimprimir la factura). */
  async obtenerFacturaOrden(id_ordentec) {
    const idLimpio = limpiarTexto(id_ordentec).toUpperCase();

    if (!idLimpio) {
      throw new ErrorNegocio('Debe indicar el número de la orden de servicio.', 400);
    }

    const documento = await OrdenServiceTecnicoModel.obtenerFacturaDeOrden(idLimpio);

    if (!documento) {
      throw new ErrorNegocio(`No existe la orden de servicio técnico "${idLimpio}".`, 404);
    }

    if (Number(documento.orden.cobrada) !== 1) {
      throw new ErrorNegocio(
        `La orden ${idLimpio} todavía no ha sido cobrada: aún no tiene factura emitida.`,
        400
      );
    }

    return documento;
  }
};

export default OrdenServiceTecnicoService;
