/**
 * ==========================================================================
 * CONTROLADOR DE STOCK (inventarioStockController.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · CRUD 2
 *
 * PROPÓSITO FUNCIONAL:
 *   Expone los endpoints REST que usa el rol ALMACENISTA para auditar y
 *   corregir las existencias del almacén.
 *
 * PROPÓSITO TÉCNICO:
 *   · GET  200 OK con existencias, indicadores y alertas.
 *   · PATCH 200 OK con la traza del ajuste (existencia previa, posterior y
 *     diferencia), de modo que el Toast muestre el resultado exacto.
 *   · 400 Bad Request si falta el motivo, la existencia es inválida o el
 *     conteo coincide con el sistema (no habría ajuste que registrar).
 *   · 404 Not Found si el producto no existe.
 *   · 500 Internal Server Error ante fallos del motor MySQL.
 * ==========================================================================
 */
import {
  InventarioStockService,
  ErrorNegocioInventario
} from '../services/inventarioService.js';
import { ErrorNegocioMovimiento } from '../services/movimientoService.js';

/**
 * Traduce cualquier excepción al par (código HTTP, cuerpo JSON) correcto.
 *
 * PROPÓSITO TÉCNICO: este controlador debe reconocer DOS familias de errores
 * de negocio, porque el ajuste de existencias se escribe a través de la ruta
 * transaccional del kádex (CRUD 3):
 *
 *   · `ErrorNegocioInventario` -> validaciones propias del CRUD 2 (motivo
 *     obligatorio, existencia no numérica o negativa, sin cambios que aplicar).
 *   · `ErrorNegocioMovimiento` -> validaciones de la capa de movimientos
 *     (stock mínimo mayor que la existencia, cantidad fuera de rango, etc.).
 *
 * Si no se reconocieran ambas, los rechazos de negocio se reportarían como
 * HTTP 500 en lugar del 400 que corresponde, ocultando la causa real al usuario.
 */
const responderConError = (res, error, operacion) => {
  if (error instanceof ErrorNegocioInventario || error instanceof ErrorNegocioMovimiento) {
    return res.status(error.codigoHttp).json({
      exito: false,
      mensaje: error.message,
      codigoHttp: error.codigoHttp
    });
  }

  console.error(`Error en ${operacion}:`, error);

  return res.status(500).json({
    exito: false,
    mensaje: 'Error interno del servidor al procesar las existencias de almacén.',
    detalle: error.sqlMessage || error.message,
    codigoHttp: 500
  });
};

export const InventarioStockController = {
  /**
   * GET /api/inventario/stock
   * GET /api/inventario/stock?texto=pantalla&situacion=bajo&id_categoria=1
   *
   * PROPÓSITO FUNCIONAL: búsqueda rápida y auditoría del stock actual.
   */
  async getExistencias(req, res) {
    try {
      const listaExistencias = await InventarioStockService.obtenerExistencias({
        texto: req.query.texto ?? req.query.busqueda,
        situacion: req.query.situacion,
        id_categoria: req.query.id_categoria,
        orden: req.query.orden
      });

      return res.status(200).json({
        exito: true,
        total: listaExistencias.length,
        existencias: listaExistencias
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/inventario/stock');
    }
  },

  /**
   * GET /api/inventario/stock/indicadores
   * KPI del almacén: artículos, unidades, valorización, agotados y bajos.
   * Se declara antes de /:cod_producto para evitar colisiones de patrón.
   */
  async getIndicadores(req, res) {
    try {
      const indicadores = await InventarioStockService.obtenerIndicadores();

      return res.status(200).json({ exito: true, indicadores });
    } catch (error) {
      return responderConError(res, error, 'GET /api/inventario/stock/indicadores');
    }
  },

  /** GET /api/inventario/stock/alertas -> productos bajo el stock mínimo. */
  async getAlertas(req, res) {
    try {
      const alertas = await InventarioStockService.obtenerAlertasStockMinimo();

      return res.status(200).json({
        exito: true,
        total: alertas.length,
        alertas
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/inventario/stock/alertas');
    }
  },

  /** GET /api/inventario/stock/:cod_producto -> ficha de existencia. */
  async getExistenciaPorCodigo(req, res) {
    try {
      const existencia = await InventarioStockService.obtenerExistenciaPorCodigo(
        req.params.cod_producto
      );

      return res.status(200).json({ exito: true, existencia });
    } catch (error) {
      return responderConError(res, error, 'GET /api/inventario/stock/:cod_producto');
    }
  },

  /**
   * PATCH /api/inventario/stock/:cod_producto
   * Body esperado:
   * {
   *   "nueva_existencia": 12,
   *   "motivo": "Arqueo físico mensual: conteo en estante B3",
   *   "id_usuario": 1
   * }
   *
   * PROPÓSITO FUNCIONAL: corrección justificada de la existencia. El motivo
   * es obligatorio y el sistema devuelve la diferencia (sobrante/faltante).
   */
  async patchAjustarExistencia(req, res) {
    try {
      const resultadoAjuste = await InventarioStockService.ajustarExistencia(
        req.params.cod_producto,
        req.body
      );

      return res.status(200).json({
        exito: true,
        mensaje: resultadoAjuste.mensaje,
        ajuste: resultadoAjuste
      });
    } catch (error) {
      return responderConError(res, error, 'PATCH /api/inventario/stock/:cod_producto');
    }
  }
};
