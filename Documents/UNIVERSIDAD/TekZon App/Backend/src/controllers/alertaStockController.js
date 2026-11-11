/**
 * ==========================================================================
 * CONTROLADOR DE ALERTAS DE STOCK (alertaStockController.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · Módulo 4
 *
 * PROPÓSITO FUNCIONAL:
 *   Expone las alertas de stock mínimo que el sistema genera automáticamente al
 *   descontar inventario por Venta o por Servicio Técnico. El frontend las usa
 *   en dos lugares:
 *     · La campana de notificaciones del Topbar (contador de pendientes).
 *     · La pantalla "Alertas de Stock" (listado y marcado como atendida).
 *
 * PROPÓSITO TÉCNICO:
 *   · Todas las rutas exigen sesión de Administrador.
 *   · `GET /stock/indicadores` y `GET /stock/productos-riesgo` se declaran
 *     ANTES de `PATCH /stock/:id/atender`.
 *
 *   | Método | Ruta                                      | Acción                    |
 *   |--------|-------------------------------------------|---------------------------|
 *   | GET    | /api/alertas/stock                        | Listado de alertas        |
 *   | GET    | /api/alertas/stock/indicadores            | Contadores (campana)      |
 *   | GET    | /api/alertas/stock/productos-riesgo       | Productos bajo el mínimo  |
 *   | PATCH  | /api/alertas/stock/:id/atender            | Marcar como atendida      |
 *   | PATCH  | /api/alertas/stock/producto/:codigo/atender | Atender todas de un producto |
 * ==========================================================================
 */
import { AlertaStockService } from '../services/alertaStockService.js';
import { responderConError } from '../utils/erroresNegocio.js';

export const AlertaStockController = {
  /**
   * GET /api/alertas/stock?soloPendientes=true
   * Listado histórico de alertas, con filtro opcional de pendientes.
   */
  async getAlertas(req, res) {
    try {
      const alertas = await AlertaStockService.obtenerAlertas(req.query);

      return res.status(200).json({
        exito: true,
        total: alertas.length,
        alertas
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/alertas/stock');
    }
  },

  /**
   * GET /api/alertas/stock/indicadores
   * Contadores para la campana del Topbar: total, pendientes y agotados.
   */
  async getIndicadores(req, res) {
    try {
      const indicadores = await AlertaStockService.obtenerIndicadores();

      return res.status(200).json({ exito: true, indicadores });
    } catch (error) {
      return responderConError(res, error, 'GET /api/alertas/stock/indicadores');
    }
  },

  /**
   * GET /api/alertas/stock/productos-riesgo
   * Productos activos cuya existencia está en o por debajo del stock mínimo.
   */
  async getProductosRiesgo(req, res) {
    try {
      const indicadores = await AlertaStockService.obtenerIndicadores();

      return res.status(200).json({
        exito: true,
        total: indicadores.productos_en_riesgo,
        productos: indicadores.detalle_riesgo
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/alertas/stock/productos-riesgo');
    }
  },

  /** PATCH /api/alertas/stock/:id/atender -> marca una alerta como atendida. */
  async patchAtenderAlerta(req, res) {
    try {
      const resultado = await AlertaStockService.atenderAlerta(req.params.id);

      return res.status(200).json({ exito: true, alerta: resultado, mensaje: resultado.mensaje });
    } catch (error) {
      return responderConError(res, error, 'PATCH /api/alertas/stock/:id/atender');
    }
  },

  /**
   * PATCH /api/alertas/stock/producto/:codigo/atender
   * Marca como atendidas TODAS las alertas pendientes de un producto (se usa al
   * reponer mercancía: al subir el stock, los avisos dejan de aplicar).
   */
  async patchAtenderAlertasDeProducto(req, res) {
    try {
      const resultado = await AlertaStockService.atenderAlertasDeProducto(req.params.codigo);

      return res.status(200).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'PATCH /api/alertas/stock/producto/:codigo/atender');
    }
  }
};

export default AlertaStockController;
