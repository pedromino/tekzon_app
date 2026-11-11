/**
 * ==========================================================================
 * SERVICIO DE ALERTAS DE STOCK (alertaStockService.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Lógica de negocio (Business Logic Layer) · Módulo 4
 *
 * PROPÓSITO FUNCIONAL:
 *   Expone la automatización de alertas de stock mínimo exigida por el
 *   requisito: "Si las existencias de cualquier producto o repuesto llegan al
 *   valor definido como stock mínimo, debe saltar una alerta en el sistema".
 *
 *   El disparo NO ocurre por un temporizador ni por una consulta periódica,
 *   sino de forma REACTIVA y SÍNCRONA en el mismo instante en que se descuenta
 *   el stock, ya sea por:
 *     · Módulo 3 · Venta Directa          -> origen 'VENTA'
 *     · Módulo 2 · Servicio Técnico       -> origen 'SERVICIO_TECNICO'
 *
 * PROPÓSITO TÉCNICO:
 *   `evaluarYRegistrarAlertasDescuento` es el punto de entrada que consumen
 *   ambos módulos. Recibe la conexión transaccional del descuento, de modo que
 *   la alerta se confirma con el mismo COMMIT que la factura (nunca queda una
 *   venta registrada sin su aviso de stock, ni al contrario).
 * ==========================================================================
 */
import { AlertaStockModel } from '../models/alertaStockModel.js';
import { ErrorNegocio } from '../utils/erroresNegocio.js';

export const AlertaStockService = {
  /**
   * AUTOMATIZACIÓN DE ALERTAS · se ejecuta tras CADA descuento de stock.
   *
   * PROPÓSITO FUNCIONAL: recorre los productos que se acaban de descontar y,
   * para cada uno, dispara la alerta si su existencia quedó en o por debajo del
   * stock mínimo. Devuelve la lista de alertas generadas para que el
   * controlador las incluya en la respuesta HTTP y el frontend pueda mostrar el
   * aviso (Toast + campana) inmediatamente después de facturar.
   *
   * @param {Object} conexion          Conexión con la transacción del descuento.
   * @param {Array<Object>} productosDescontados Lista devuelta por
   *   `MovimientoModel.descontarStockProducto` (incluye `stock_minimo` y la
   *   `existencia_posterior` ya calculada).
   * @param {Object} contexto          Datos del documento que originó el descuento.
   * @param {string} contexto.origen   'VENTA' | 'SERVICIO_TECNICO'.
   * @param {string} contexto.documento Factura u orden (para la trazabilidad).
   * @returns {Promise<Array<Object>>} Alertas disparadas (puede ser vacío).
   */
  async evaluarYRegistrarAlertasDescuento(conexion, productosDescontados = [], { origen, documento }) {
    const alertasGeneradas = [];

    for (const productoDescontado of productosDescontados) {
      // Sólo se evalúan los descuentos que realmente se aplicaron.
      if (!productoDescontado?.encontrado || productoDescontado?.stockInsuficiente) continue;

      const alerta = await AlertaStockModel.registrarAlertaSiCorresponde(conexion, {
        cod_producto: productoDescontado.cod_producto,
        // La existencia POSTERIOR es la que queda tras el descuento.
        existencia: productoDescontado.existencia_posterior,
        stock_minimo: productoDescontado.stock_minimo,
        origen,
        documento
      });

      if (alerta) alertasGeneradas.push(alerta);
    }

    return alertasGeneradas;
  },

  /**
   * LISTA DE ALERTAS (GET /api/alertas/stock).
   * @param {Object} filtros { soloPendientes }
   */
  async obtenerAlertas(filtros = {}) {
    const valorParametro = String(filtros.soloPendientes ?? '').toLowerCase();
    const soloPendientes = valorParametro === 'true' || valorParametro === '1';

    return await AlertaStockModel.listarAlertas({ soloPendientes });
  },

  /** INDICADORES de alertas para la campana de notificaciones del Topbar. */
  async obtenerIndicadores() {
    const resumen = await AlertaStockModel.obtenerResumenAlertas();

    // Productos con existencia en o por debajo del mínimo (aunque su alerta ya
    // se hubiera marcado como atendida y el stock siguiera sin reponerse).
    const productosEnRiesgo = await AlertaStockModel.listarProductosEnRiesgo();

    return {
      ...resumen,
      productos_en_riesgo: productosEnRiesgo.length,
      detalle_riesgo: productosEnRiesgo
    };
  },

  /**
   * MARCA UNA ALERTA COMO ATENDIDA (PATCH /api/alertas/stock/:id/atender).
   * Regla: no se puede atender dos veces la misma alerta -> 404 la segunda vez.
   */
  async atenderAlerta(id_alerta) {
    const idNumerico = Number(id_alerta);

    if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
      throw new ErrorNegocio('El identificador de la alerta no es válido.', 400);
    }

    const alerta = await AlertaStockModel.obtenerPorId(idNumerico);

    if (!alerta) {
      throw new ErrorNegocio(`No existe la alerta con id ${idNumerico}.`, 404);
    }

    const filasAfectadas = await AlertaStockModel.marcarComoAtendida(idNumerico);

    if (filasAfectadas === 0) {
      throw new ErrorNegocio(
        `La alerta del producto "${alerta.nombre_producto}" ya había sido marcada como atendida.`,
        400
      );
    }

    return {
      id_alerta: idNumerico,
      cod_producto: alerta.cod_producto,
      nombre_producto: alerta.nombre_producto,
      atendida: 1,
      mensaje: `Alerta del producto "${alerta.nombre_producto}" marcada como atendida.`
    };
  },

  /**
   * MARCA COMO ATENDIDAS TODAS LAS ALERTAS DE UN PRODUCTO.
   * Se usa cuando el administrador repone mercancía: al volver a subir el stock,
   * los avisos de ese producto dejan de aplicar.
   */
  async atenderAlertasDeProducto(cod_producto) {
    const codigoLimpio = String(cod_producto ?? '').trim();

    if (!codigoLimpio) {
      throw new ErrorNegocio('Debe indicar el código del producto.', 400);
    }

    const filasAfectadas = await AlertaStockModel.marcarComoAtendidasPorProducto(codigoLimpio);

    return {
      cod_producto: codigoLimpio,
      alertas_atendidas: filasAfectadas,
      mensaje: filasAfectadas > 0
        ? `Se marcaron ${filasAfectadas} alerta(s) del producto como atendidas.`
        : 'El producto no tenía alertas pendientes.'
    };
  }
};

export default AlertaStockService;
