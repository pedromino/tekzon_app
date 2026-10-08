/**
 * ==========================================================================
 * SERVICIO DE MOVIMIENTOS (movimientoService.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Lógica de negocio (Business Logic Layer) · CRUD 3 (Kárdex)
 *
 * PROPÓSITO FUNCIONAL:
 *   Aplica las reglas del almacén antes de tocar el kádex:
 *     · El tipo de movimiento debe ser ENTRADA o SALIDA (el AJUSTE se genera
 *       desde el CRUD 2, nunca se captura a mano en el formulario).
 *     · La cantidad debe ser un entero ESTRICTAMENTE MAYOR que cero (no se
 *       admiten movimientos de 0 unidades).
 *     · El motivo/justificación es OBLIGATORIO (exigencia de auditoría).
 *     · El producto debe existir y estar vigente (estado = 1).
 *     · El usuario responsable debe existir (integridad de la FK).
 *     · La salida nunca puede dejar la existencia en negativo; el modelo lo
 *       valida dentro de la transacción y aquí se traduce al HTTP 400.
 *
 * PROPÓSITO TÉCNICO:
 *   Capa intermedia que NO ejecuta SQL: delega en `MovimientoModel` y
 *   transforma los errores de negocio en instancias de ErrorNegocioMovimiento
 *   con el `codigoHttp` correspondiente (400 / 404), de modo que el
 *   controlador sólo tenga que serializar la respuesta.
 * ==========================================================================
 */
import { MovimientoModel, TIPOS_MOVIMIENTO } from '../models/movimientoModel.js';
import { ProductoModel } from '../models/productoModel.js';

/** Longitud máxima del motivo según el DDL (VARCHAR 150). */
const LONGITUD_MAXIMA_MOTIVO = 150;

/** Error de negocio controlado con su código HTTP asociado. */
class ErrorNegocioMovimiento extends Error {
  constructor(mensaje, codigoHttp = 400) {
    super(mensaje);
    this.name = 'ErrorNegocioMovimiento';
    this.codigoHttp = codigoHttp;
  }
}

/** Limpia un texto recibido del formulario. */
const limpiarTexto = (valor) => String(valor ?? '').trim();

/**
 * Valida y normaliza una cantidad de unidades.
 * Debe ser un entero mayor que cero; los decimales se rechazan de forma
 * explícita porque el inventario de TekZon se maneja en unidades completas.
 */
const validarCantidad = (valor) => {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    throw new ErrorNegocioMovimiento('La cantidad debe ser un valor numérico.', 400);
  }

  if (!Number.isInteger(numero)) {
    throw new ErrorNegocioMovimiento('La cantidad debe ser un número entero de unidades.', 400);
  }

  if (numero <= 0) {
    throw new ErrorNegocioMovimiento('La cantidad debe ser mayor que cero.', 400);
  }

  return numero;
};

/** Valida el motivo obligatorio y su longitud máxima. */
const validarMotivo = (valor) => {
  const motivo = limpiarTexto(valor);

  if (!motivo) {
    throw new ErrorNegocioMovimiento('El motivo o justificación del movimiento es obligatorio.', 400);
  }

  if (motivo.length > LONGITUD_MAXIMA_MOTIVO) {
    throw new ErrorNegocioMovimiento(
      `El motivo no puede superar los ${LONGITUD_MAXIMA_MOTIVO} caracteres.`,
      400
    );
  }

  return motivo;
};

/**
 * Resuelve el usuario responsable del movimiento.
 *
 * PROPÓSITO FUNCIONAL: mientras el módulo de autenticación no esté operativo
 * (FASE II), el formulario envía el `id_usuario` del almacenista en sesión.
 * Si no se envía, se asume el usuario 1 (almacenista sembrado por la
 * migración 004) para que la FK `fk_movimiento_usuario` quede satisfecha.
 */
const resolverUsuarioResponsable = async (idUsuarioRecibido) => {
  const idCandidato = Number.isInteger(Number(idUsuarioRecibido)) && Number(idUsuarioRecibido) > 0
    ? Number(idUsuarioRecibido)
    : 1;

  const existe = await MovimientoModel.existeUsuario(idCandidato);

  if (!existe) {
    throw new ErrorNegocioMovimiento(
      `El usuario responsable (id ${idCandidato}) no existe en el sistema.`,
      400
    );
  }

  return idCandidato;
};

/**
 * Verifica que el producto exista antes de operar con su stock.
 *
 * PROPÓSITO FUNCIONAL: los MOVIMIENTOS y AJUSTES sólo proceden sobre
 * productos vigentes; sin embargo, la CONSULTA del kádex histórico debe
 * seguir disponible para un producto dado de baja lógica, porque el histórico
 * es un registro contable que no puede desaparecer.
 *
 * @param {string} cod_producto       Código del producto.
 * @param {boolean} exigirActivo      true cuando la operación ESCRIBE stock.
 */
const obtenerProducto = async (cod_producto, exigirActivo = true) => {
  const producto = await ProductoModel.obtenerPorCodigo(cod_producto);

  if (!producto) {
    throw new ErrorNegocioMovimiento(
      `No existe el producto con código "${cod_producto}" en el catálogo.`,
      404
    );
  }

  if (exigirActivo && Number(producto.estado) !== 1) {
    throw new ErrorNegocioMovimiento(
      `El producto "${cod_producto}" está inactivo: no admite movimientos de almacén.`,
      400
    );
  }

  return producto;
};

export const MovimientoService = {
  /**
   * Devuelve el historial del kádex para la tabla transaccional (CRUD 3).
   * Normaliza el filtro `tipo` a mayúsculas y lo valida contra el catálogo
   * de tipos admitidos para no generar consultas sin resultado por error de
   * escritura del usuario.
   */
  async obtenerHistorial(filtros = {}) {
    const tipoNormalizado = limpiarTexto(filtros.tipo).toUpperCase();

    if (tipoNormalizado && !TIPOS_MOVIMIENTO[tipoNormalizado]) {
      throw new ErrorNegocioMovimiento(
        `El tipo de movimiento "${filtros.tipo}" no es válido. Use ENTRADA, SALIDA o AJUSTE.`,
        400
      );
    }

    return await MovimientoModel.listarHistorial({
      tipo: tipoNormalizado || undefined,
      codProducto: limpiarTexto(filtros.codProducto) || undefined,
      fechaDesde: limpiarTexto(filtros.fechaDesde) || undefined,
      fechaHasta: limpiarTexto(filtros.fechaHasta) || undefined,
      limite: Number(filtros.limite) || undefined
    });
  },

  /** Recupera un asiento puntual del kádex o lanza 404. */
  async obtenerMovimientoPorId(id_movimiento) {
    const idNumerico = Number(id_movimiento);

    if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
      throw new ErrorNegocioMovimiento('El identificador del movimiento no es válido.', 400);
    }

    const movimiento = await MovimientoModel.obtenerPorId(idNumerico);

    if (!movimiento) {
      throw new ErrorNegocioMovimiento(`No existe el movimiento con id ${idNumerico}.`, 404);
    }

    return movimiento;
  },

  /**
   * KÁRDEX HISTÓRICO DE UN PRODUCTO.
   *
   * PROPÓSITO FUNCIONAL: alimenta el botón "ver historial" de cada fila del
   * catálogo. Se admite consultar productos dados de baja lógica (estado = 0)
   * porque el histórico del kádex es un registro de auditoría permanente.
   *
   * PROPÓSITO TÉCNICO: se comprueba la EXISTENCIA del producto (para poder
   * responder 404) pero NO su estado, mediante `exigirActivo = false`.
   */
  async obtenerHistorialPorProducto(cod_producto) {
    const codigoLimpio = limpiarTexto(cod_producto);

    if (!codigoLimpio) {
      throw new ErrorNegocioMovimiento('Debe indicar el código del producto.', 400);
    }

    // Se valida que el producto exista, sin exigir que esté activo.
    await obtenerProducto(codigoLimpio, false);

    return await MovimientoModel.listarPorProducto(codigoLimpio);
  },

  /** Indicadores agregados del kádex (KPI de la página de movimientos). */
  async obtenerResumen() {
    return await MovimientoModel.obtenerResumenKardex();
  },

  /**
   * REGISTRA UNA ENTRADA O SALIDA FÍSICA (CRUD 3).
   *
   * PROPÓSITO FUNCIONAL: es el corazón del kárdex. Toda la validación de
   * negocio ocurre antes de abrir la transacción; la validación de stock
   * suficiente ocurre DENTRO de ella (es la única forma de que sea correcta
   * frente a operaciones concurrentes).
   *
   * @param {Object} datosMovimiento Payload de MovimientoModal.vue
   */
  async registrarMovimiento(datosMovimiento) {
    const cod_producto = limpiarTexto(
      datosMovimiento?.cod_producto ?? datosMovimiento?.codigo
    );

    const tipo_movimiento = limpiarTexto(
      datosMovimiento?.tipo_movimiento ?? datosMovimiento?.tipo
    ).toUpperCase();

    if (!cod_producto) {
      throw new ErrorNegocioMovimiento('Debe seleccionar el producto a movilizar.', 400);
    }

    // El AJUSTE no se captura aquí: proviene del CRUD 2 con su propio flujo.
    if (tipo_movimiento !== TIPOS_MOVIMIENTO.ENTRADA && tipo_movimiento !== TIPOS_MOVIMIENTO.SALIDA) {
      throw new ErrorNegocioMovimiento(
        'El tipo de movimiento debe ser ENTRADA o SALIDA. Los ajustes se registran desde el módulo de existencias.',
        400
      );
    }

    const cantidad = validarCantidad(datosMovimiento?.cantidad);
    const motivo = validarMotivo(datosMovimiento?.motivo);
    const id_usuario = await resolverUsuarioResponsable(
      datosMovimiento?.id_usuario ?? datosMovimiento?.usuario
    );

    // Interconexión con el CRUD 1: el producto debe existir y estar vigente
    // (exigirActivo = true) porque la operación modifica el stock.
    const producto = await obtenerProducto(cod_producto, true);

    // Interconexión con el CRUD 2: aviso temprano de stock insuficiente para
    // no abrir una transacción que se va a revertir.
    if (
      tipo_movimiento === TIPOS_MOVIMIENTO.SALIDA &&
      Number(producto.existencia) < cantidad
    ) {
      throw new ErrorNegocioMovimiento(
        `Stock insuficiente para "${producto.nombre_producto}". Disponible: ${producto.existencia}, solicitado: ${cantidad}.`,
        400
      );
    }

    // Ejecución atómica en el modelo (transacción SQL).
    const resultado = await MovimientoModel.registrarMovimiento({
      cod_producto,
      id_usuario,
      tipo_movimiento,
      cantidad,
      motivo
    });

    if (!resultado.encontrado) {
      throw new ErrorNegocioMovimiento(
        `No existe el producto con código "${cod_producto}" en el catálogo.`,
        404
      );
    }

    // Segunda barrera: el modelo pudo detectar el stock insuficiente con el
    // dato bloqueado dentro de la transacción.
    if (resultado.stockInsuficiente) {
      throw new ErrorNegocioMovimiento(
        `Stock insuficiente para "${resultado.nombre_producto}". Disponible: ${resultado.existenciaDisponible}, solicitado: ${resultado.cantidadSolicitada}.`,
        400
      );
    }

    return resultado;
  },

  /**
   * REGISTRA UN AJUSTE DE EXISTENCIA POR ARQUEO (CRUD 2).
   *
   * PROPÓSITO FUNCIONAL: permite al almacenista declarar el conteo físico
   * real y, opcionalmente, corregir el `stock_minimo`. La diferencia contra el
   * sistema queda auditada en el kádex.
   *
   * PROPÓSITO TÉCNICO: aplica la VALIDACIÓN ESTRICTA DE NEGOCIO en el servidor
   * (la misma que hace el modal en el cliente) para que la regla no pueda
   * eludirse llamando al API directamente: el stock mínimo nunca puede superar
   * la existencia resultante del arqueo.
   *
   * @param {string} cod_producto    Producto auditado
   * @param {Object} datosAjuste     { existencia, stock_minimo, motivo, id_usuario }
   */
  async registrarAjuste(cod_producto, datosAjuste) {
    const codigoLimpio = limpiarTexto(cod_producto);

    if (!codigoLimpio) {
      throw new ErrorNegocioMovimiento('Debe indicar el código del producto a ajustar.', 400);
    }

    // La nueva existencia es un conteo físico: entero >= 0 (cero es válido,
    // significa que el estante quedó vacío).
    const nuevaExistencia = Number(
      datosAjuste?.existencia
      ?? datosAjuste?.nueva_existencia
      ?? datosAjuste?.nuevaExistencia
    );

    if (!Number.isFinite(nuevaExistencia)) {
      throw new ErrorNegocioMovimiento('La existencia contada debe ser un valor numérico.', 400);
    }

    if (!Number.isInteger(nuevaExistencia)) {
      throw new ErrorNegocioMovimiento('La existencia contada debe ser un número entero de unidades.', 400);
    }

    if (nuevaExistencia < 0) {
      throw new ErrorNegocioMovimiento('La existencia contada no puede ser un número negativo.', 400);
    }

    const motivo = validarMotivo(datosAjuste?.motivo);

    const id_usuario = await resolverUsuarioResponsable(
      datosAjuste?.id_usuario ?? datosAjuste?.usuario
    );

    // Interconexión con el CRUD 1: producto existente y vigente (el ajuste
    // escribe stock, por lo que no se admite sobre productos inactivos).
    const productoActual = await obtenerProducto(codigoLimpio, true);

    /*
     * VALIDACIÓN ESTRICTA DEL STOCK MÍNIMO (regla de negocio del CRUD 2).
     *
     * El umbral de alerta no puede quedar por encima de la cantidad física que
     * realmente hay en el almacén; de lo contrario la alerta de reposición
     * permanecería encendida de forma permanente y perdería su utilidad.
     * El valor es opcional: si no se envía, se conserva el vigente.
     */
    const stockMinimoRecibido = datosAjuste?.stock_minimo ?? datosAjuste?.stockMinimo;

    let stockMinimoFinal = Number(productoActual.stock_minimo);

    if (stockMinimoRecibido !== undefined && stockMinimoRecibido !== null && stockMinimoRecibido !== '') {
      const stockMinimoNumerico = Number(stockMinimoRecibido);

      if (!Number.isFinite(stockMinimoNumerico)) {
        throw new ErrorNegocioMovimiento('El stock mínimo debe ser un valor numérico.', 400);
      }

      if (!Number.isInteger(stockMinimoNumerico)) {
        throw new ErrorNegocioMovimiento('El stock mínimo debe ser un número entero de unidades.', 400);
      }

      if (stockMinimoNumerico < 0) {
        throw new ErrorNegocioMovimiento('El stock mínimo no puede ser un número negativo.', 400);
      }

      if (stockMinimoNumerico > nuevaExistencia) {
        throw new ErrorNegocioMovimiento(
          `El stock mínimo (${stockMinimoNumerico} u.) no puede ser mayor que la existencia contada (${nuevaExistencia} u.).`,
          400
        );
      }

      stockMinimoFinal = stockMinimoNumerico;
    }

    const resultado = await MovimientoModel.registrarAjuste({
      cod_producto: codigoLimpio,
      id_usuario,
      nuevaExistencia,
      motivo,
      stockMinimo: stockMinimoFinal
    });

    if (!resultado.encontrado) {
      throw new ErrorNegocioMovimiento(
        `No existe el producto con código "${codigoLimpio}" en el catálogo.`,
        404
      );
    }

    return resultado;
  }
};

export { ErrorNegocioMovimiento };
