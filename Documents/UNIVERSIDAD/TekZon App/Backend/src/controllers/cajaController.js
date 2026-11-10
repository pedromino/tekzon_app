/**
 * ==========================================================================
 * CONTROLADOR DE CAJA (cajaController.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · Módulo 2 (Caja)
 *
 * PROPÓSITO FUNCIONAL:
 *   Expone los endpoints REST del turno de caja, consumidos por
 *   `CajaServices.js` del frontend Vue 3. Es el marco donde se registran todos
 *   los cobros del sistema (ventas y servicios técnicos).
 *
 * PROPÓSITO TÉCNICO:
 *   · Todas las rutas exigen sesión de Administrador.
 *   · `GET /activa` se declara ANTES de `GET /:id` para que Express no
 *     interprete la palabra "activa" como un identificador numérico.
 *
 *   | Método | Ruta                            | Acción                        |
 *   |--------|---------------------------------|-------------------------------|
 *   | GET    | /api/caja                       | Lista de turnos y recaudación |
 *   | GET    | /api/caja/activa                | Caja abierta actualmente      |
 *   | GET    | /api/caja/:id/pagos             | Arqueo detallado              |
 *   | POST   | /api/caja/abrir                 | Apertura de turno             |
 *   | POST   | /api/caja/:id/cerrar            | Cierre con arqueo             |
 * ==========================================================================
 */
import { CajaService } from '../services/cajaService.js';
import { responderConError } from '../utils/erroresNegocio.js';

export const CajaController = {
  /** GET /api/caja -> lista de turnos con su total recaudado. */
  async getCajas(req, res) {
    try {
      const cajas = await CajaService.obtenerCajas();

      return res.status(200).json({
        exito: true,
        total: cajas.length,
        cajas
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/caja');
    }
  },

  /**
   * GET /api/caja/activa -> la caja abierta, o `null` si no hay turno abierto.
   * El frontend usa este endpoint para saber si puede cobrar.
   */
  async getCajaActiva(req, res) {
    try {
      const caja = await CajaService.obtenerCajaActiva();

      return res.status(200).json({
        exito: true,
        hay_caja_abierta: Boolean(caja),
        caja: caja || null
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/caja/activa');
    }
  },

  /** GET /api/caja/:id/pagos -> arqueo detallado del turno. */
  async getPagosDeCaja(req, res) {
    try {
      const detalle = await CajaService.obtenerPagosDeCaja(req.params.id);

      return res.status(200).json({ exito: true, ...detalle });
    } catch (error) {
      return responderConError(res, error, 'GET /api/caja/:id/pagos');
    }
  },

  /** POST /api/caja/abrir -> apertura de un turno con fondo inicial. */
  async postAbrirCaja(req, res) {
    try {
      const resultado = await CajaService.abrirCaja(req.body, req.usuarioAutenticado);

      return res.status(201).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'POST /api/caja/abrir');
    }
  },

  /** POST /api/caja/:id/cerrar -> cierre del turno con arqueo. */
  async postCerrarCaja(req, res) {
    try {
      const resultado = await CajaService.cerrarCaja(req.params.id, req.body);

      return res.status(200).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'POST /api/caja/:id/cerrar');
    }
  }
};

export default CajaController;
