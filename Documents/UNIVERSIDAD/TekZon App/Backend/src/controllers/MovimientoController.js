/**
 * ==========================================================================
 * CONTROLADOR DE MOVIMIENTOS (movimientoController.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · CRUD 3 (Kárdex transaccional)
 *
 * PROPÓSITO FUNCIONAL:
 *   Expone los endpoints REST del kádex de inventario: historial con filtros,
 *   registro de Entradas/Salidas físicas y consulta de movimientos por
 *   producto.
 *
 * PROPÓSITO TÉCNICO:
 *   · GET  200 OK con la lista y su total.
 *   · POST 201 Created con el asiento generado (existencia previa y posterior
 *     incluidas, para que el Toast del frontend muestre el nuevo stock).
 *   · 400 Bad Request cuando falta el motivo, la cantidad es inválida, el tipo
 *     no procede o el stock es insuficiente.
 *   · 404 Not Found cuando el producto no existe en el catálogo.
 *   · 500 Internal Server Error ante fallos del motor MySQL.
 * ==========================================================================
 */
import { MovimientoService, ErrorNegocioMovimiento } from '../services/movimientoService.js';

/** Traduce cualquier excepción al par (código HTTP, cuerpo JSON) correcto. */
const responderConError = (res, error, operacion) => {
  if (error instanceof ErrorNegocioMovimiento) {
    return res.status(error.codigoHttp).json({
      exito: false,
      mensaje: error.message,
      codigoHttp: error.codigoHttp
    });
  }

  console.error(`Error en ${operacion}:`, error);

  return res.status(500).json({
    exito: false,
    mensaje: 'Error interno del servidor al procesar los movimientos de inventario.',
    detalle: error.sqlMessage || error.message,
    codigoHttp: 500
  });
};

export const MovimientoController = {
  /**
   * GET /api/movimientos
   * GET /api/movimientos?tipo=SALIDA&cod_producto=REP-PAN-001&fechaDesde=...
   *
   * PROPÓSITO FUNCIONAL: alimenta la tabla Kárdex del CRUD 3 con sus filtros
   * por tipo de movimiento, producto y rango de fechas.
   */
  async getMovimientos(req, res) {
    try {
      const historial = await MovimientoService.obtenerHistorial({
        tipo: req.query.tipo,
        codProducto: req.query.cod_producto ?? req.query.codProducto,
        fechaDesde: req.query.fechaDesde,
        fechaHasta: req.query.fechaHasta,
        limite: req.query.limite
      });

      return res.status(200).json({
        exito: true,
        total: historial.length,
        movimientos: historial
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/movimientos');
    }
  },

  /**
   * GET /api/movimientos/resumen
   * Devuelve los KPI agregados del kádex (entradas, salidas y ajustes).
   * Se declara antes de /:id en el router para evitar colisiones de patrón.
   */
  async getResumenMovimientos(req, res) {
    try {
      const resumen = await MovimientoService.obtenerResumen();

      return res.status(200).json({ exito: true, resumen });
    } catch (error) {
      return responderConError(res, error, 'GET /api/movimientos/resumen');
    }
  },

  /** GET /api/movimientos/:id -> asiento puntual del kádex. */
  async getMovimientoPorId(req, res) {
    try {
      const movimiento = await MovimientoService.obtenerMovimientoPorId(req.params.id);

      return res.status(200).json({ exito: true, movimiento });
    } catch (error) {
      return responderConError(res, error, 'GET /api/movimientos/:id');
    }
  },

  /**
   * GET /api/movimientos/producto/:cod_producto
   * Kárdex histórico de un producto concreto.
   */
  async getMovimientosPorProducto(req, res) {
    try {
      const historial = await MovimientoService.obtenerHistorialPorProducto(req.params.cod_producto);

      return res.status(200).json({
        exito: true,
        total: historial.length,
        movimientos: historial
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/movimientos/producto/:cod_producto');
    }
  },

  /**
   * POST /api/movimientos
   * Body esperado:
   * {
   *   "cod_producto": "REP-PAN-001",
   *   "tipo_movimiento": "ENTRADA" | "SALIDA",
   *   "cantidad": 5,
   *   "motivo": "Compra a proveedor",
   *   "id_usuario": 1
   * }
   *
   * PROPÓSITO FUNCIONAL: ejecuta el cálculo atómico de existencia previa y
   * posterior y devuelve el asiento del kádex recién creado.
   */
  async postMovimiento(req, res) {
    try {
      const movimientoRegistrado = await MovimientoService.registrarMovimiento(req.body);

      const accion = movimientoRegistrado.tipo_movimiento === 'ENTRADA' ? 'Entrada' : 'Salida';

      return res.status(201).json({
        exito: true,
        mensaje: `${accion} de ${movimientoRegistrado.cantidad} unidad(es) registrada. Existencia: ${movimientoRegistrado.existencia_previa} -> ${movimientoRegistrado.existencia_posterior}.`,
        movimiento: movimientoRegistrado
      });
    } catch (error) {
      return responderConError(res, error, 'POST /api/movimientos');
    }
  }
};
