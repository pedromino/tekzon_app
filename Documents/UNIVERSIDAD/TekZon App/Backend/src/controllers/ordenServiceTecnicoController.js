/**
 * ==========================================================================
 * CONTROLADOR DE ORDEN DE SERVICIO TÉCNICO (ordenServiceTecnicoController.js)
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · Módulo 2 (Servicio Técnico y Caja)
 *
 * PROPÓSITO FUNCIONAL:
 *   Expone los endpoints REST del flujo completo del taller, consumidos por
 *   `OrdenServiceTecnicoServices.js` del frontend Vue 3:
 *
 *     Recepción -> Orden "Pendiente" -> Panel del técnico -> Repuestos ->
 *     Cobro / Factura / Cierre.
 *
 * PROPÓSITO TÉCNICO:
 *   · Todas las rutas exigen sesión de Administrador.
 *   · El usuario autenticado (`req.usuarioAutenticado`) se pasa al servicio para
 *     que firme las llaves foráneas del kádex y de la orden con el usuario REAL
 *     en lugar del usuario 1 fijo que usaba la FASE I de inventario.
 *
 *   | Método | Ruta                                        | Acción                |
 *   |--------|---------------------------------------------|-----------------------|
 *   | GET    | /api/ordenes-tecnicas                       | Panel del técnico     |
 *   | GET    | /api/ordenes-tecnicas/indicadores           | KPI del taller        |
 *   | GET    | /api/ordenes-tecnicas/:id                   | Ficha completa        |
 *   | POST   | /api/ordenes-tecnicas/recepcion             | Recepción + orden     |
 *   | PATCH  | /api/ordenes-tecnicas/:id/estado            | Cambiar estado        |
 *   | POST   | /api/ordenes-tecnicas/:id/repuestos         | Consumir repuesto     |
 *   | DELETE | /api/ordenes-tecnicas/:id/repuestos/:codigo | Devolver repuesto     |
 *   | POST   | /api/ordenes-tecnicas/:id/cobrar            | Cobrar, facturar, cerrar |
 *   | GET    | /api/ordenes-tecnicas/:id/factura           | Comprobante           |
 * ==========================================================================
 */
import { OrdenServiceTecnicoService } from '../services/ordenServiceTecnicoService.js';
import { responderConError } from '../utils/erroresNegocio.js';

export const OrdenServiceTecnicoController = {
  /**
   * GET /api/ordenes-tecnicas
   * Lista las órdenes para el Panel del Técnico.
   * Filtros: ?estado=&texto=&cedula=&soloPendientesDeCobro=true
   */
  async getOrdenes(req, res) {
    try {
      const ordenes = await OrdenServiceTecnicoService.obtenerOrdenes(req.query);

      return res.status(200).json({
        exito: true,
        total: ordenes.length,
        ordenes
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/ordenes-tecnicas');
    }
  },

  /**
   * GET /api/ordenes-tecnicas/indicadores
   * KPI del taller (conteo por estado, pendientes de cobro, ingresos).
   */
  async getIndicadores(req, res) {
    try {
      const indicadores = await OrdenServiceTecnicoService.obtenerIndicadores();

      return res.status(200).json({ exito: true, indicadores });
    } catch (error) {
      return responderConError(res, error, 'GET /api/ordenes-tecnicas/indicadores');
    }
  },

  /**
   * GET /api/ordenes-tecnicas/:id
   * Ficha completa: cliente, equipo, repuestos y desglose económico.
   */
  async getOrdenPorId(req, res) {
    try {
      const ficha = await OrdenServiceTecnicoService.obtenerOrdenPorId(req.params.id);

      return res.status(200).json({ exito: true, ...ficha });
    } catch (error) {
      return responderConError(res, error, 'GET /api/ordenes-tecnicas/:id');
    }
  },

  /**
   * POST /api/ordenes-tecnicas/recepcion
   * Registra al cliente + las características del equipo y ABRE la orden con
   * estado por defecto "Pendiente".
   */
  async postRecepcion(req, res) {
    try {
      const resultado = await OrdenServiceTecnicoService.registrarRecepcion(
        req.body,
        req.usuarioAutenticado
      );

      return res.status(201).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'POST /api/ordenes-tecnicas/recepcion');
    }
  },

  /**
   * PATCH /api/ordenes-tecnicas/:id/estado
   * Panel del Técnico: avanza el estado y documenta el diagnóstico.
   */
  async patchEstado(req, res) {
    try {
      const resultado = await OrdenServiceTecnicoService.actualizarEstadoOrden(
        req.params.id,
        req.body
      );

      return res.status(200).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'PATCH /api/ordenes-tecnicas/:id/estado');
    }
  },

  /**
   * POST /api/ordenes-tecnicas/:id/repuestos
   * CONSUME UN REPUESTO: descuenta el inventario, registra el kádex con origen
   * "Servicio Técnico" y dispara la alerta de stock mínimo si corresponde.
   */
  async postRepuesto(req, res) {
    try {
      const resultado = await OrdenServiceTecnicoService.agregarRepuestoOrden(
        req.params.id,
        req.body,
        req.usuarioAutenticado
      );

      return res.status(201).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'POST /api/ordenes-tecnicas/:id/repuestos');
    }
  },

  /**
   * DELETE /api/ordenes-tecnicas/:id/repuestos/:codigoProducto
   * Devuelve el repuesto al inventario (auditado como ENTRADA en el kádex).
   */
  async deleteRepuesto(req, res) {
    try {
      const resultado = await OrdenServiceTecnicoService.quitarRepuestoOrden(
        req.params.id,
        req.params.codigoProducto,
        req.body,
        req.usuarioAutenticado
      );

      return res.status(200).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'DELETE /api/ordenes-tecnicas/:id/repuestos/:codigo');
    }
  },

  /**
   * POST /api/ordenes-tecnicas/:id/cobrar
   * COBRA LA ORDEN: suma mano de obra + repuestos, registra el pago, emite la
   * factura y cierra la orden marcando el equipo como "Entregado".
   */
  async postCobrar(req, res) {
    try {
      const resultado = await OrdenServiceTecnicoService.cobrarOrden(
        req.params.id,
        req.body,
        req.usuarioAutenticado
      );

      return res.status(201).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'POST /api/ordenes-tecnicas/:id/cobrar');
    }
  },

  /**
   * GET /api/ordenes-tecnicas/:id/factura
   * Comprobante de una orden ya cobrada (para reimprimir la factura).
   */
  async getFactura(req, res) {
    try {
      const documento = await OrdenServiceTecnicoService.obtenerFacturaOrden(req.params.id);

      return res.status(200).json({ exito: true, ...documento });
    } catch (error) {
      return responderConError(res, error, 'GET /api/ordenes-tecnicas/:id/factura');
    }
  }
};

export default OrdenServiceTecnicoController;
