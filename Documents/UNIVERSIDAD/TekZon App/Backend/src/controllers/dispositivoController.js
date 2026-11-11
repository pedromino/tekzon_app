/**
 * ==========================================================================
 * CONTROLADOR DE DISPOSITIVOS (dispositivoController.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · Módulo 2 (Recepción)
 *
 * PROPÓSITO FUNCIONAL:
 *   Expone los endpoints REST de los equipos de los clientes, consumidos por
 *   `DispositivoServices.js` del frontend. Estos datos alimentan tanto la
 *   pantalla de Dispositivos como el formulario de Recepción del taller.
 *
 * PROPÓSITO TÉCNICO:
 *   · Endpoints protegidos por sesión de Administrador.
 *   · `PATCH /:id/transferir` se declara como ruta propia porque cambia la
 *     llave foránea del propietario, una operación con semántica distinta a la
 *     edición normal de características.
 *
 *   | Método | Ruta                                    | Acción                |
 *   |--------|-----------------------------------------|-----------------------|
 *   | GET    | /api/dispositivos                       | Listar / buscar       |
 *   | GET    | /api/dispositivos/:id                   | Ficha del equipo      |
 *   | POST   | /api/dispositivos                       | Alta de equipo        |
 *   | PUT    | /api/dispositivos/:id                   | Editar características|
 *   | PATCH  | /api/dispositivos/:id/transferir        | Cambiar propietario   |
 *   | DELETE | /api/dispositivos/:id                   | Baja (si no tiene OS) |
 * ==========================================================================
 */
import { DispositivoService } from '../services/dispositivoService.js';
import { responderConError } from '../utils/erroresNegocio.js';

export const DispositivoController = {
  /**
   * GET /api/dispositivos?texto=...&cedula=...
   * Lista los equipos, filtrables por propietario o por texto libre
   * (tipo, marca, modelo o número de serie).
   */
  async getDispositivos(req, res) {
    try {
      const dispositivos = await DispositivoService.obtenerDispositivos(req.query);

      return res.status(200).json({
        exito: true,
        total: dispositivos.length,
        dispositivos
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/dispositivos');
    }
  },

  /** GET /api/dispositivos/:id -> ficha del equipo (404 si no existe). */
  async getDispositivoPorId(req, res) {
    try {
      const dispositivo = await DispositivoService.obtenerDispositivoPorId(req.params.id);

      return res.status(200).json({ exito: true, dispositivo });
    } catch (error) {
      return responderConError(res, error, 'GET /api/dispositivos/:id');
    }
  },

  /** POST /api/dispositivos -> alta de un equipo asociado a un cliente. */
  async postDispositivo(req, res) {
    try {
      const dispositivoCreado = await DispositivoService.crearDispositivo(req.body);

      return res.status(201).json({
        exito: true,
        mensaje: `Dispositivo "${dispositivoCreado.nombre_dis} ${dispositivoCreado.marca}" registrado correctamente.`,
        dispositivo: dispositivoCreado
      });
    } catch (error) {
      return responderConError(res, error, 'POST /api/dispositivos');
    }
  },

  /** PUT /api/dispositivos/:id -> edita las características del equipo. */
  async putDispositivo(req, res) {
    try {
      const dispositivoActualizado = await DispositivoService.actualizarDispositivo(
        req.params.id,
        req.body
      );

      return res.status(200).json({
        exito: true,
        mensaje: 'Características del dispositivo actualizadas correctamente.',
        dispositivo: dispositivoActualizado
      });
    } catch (error) {
      return responderConError(res, error, 'PUT /api/dispositivos/:id');
    }
  },

  /**
   * PATCH /api/dispositivos/:id/transferir
   * Cambia el propietario del equipo (body: { cedula_cli }).
   */
  async patchTransferirDispositivo(req, res) {
    try {
      const cedulaNueva = req.body?.cedula_cli ?? req.body?.cedula;

      const resultado = await DispositivoService.transferirPropietario(req.params.id, cedulaNueva);

      return res.status(200).json({
        exito: true,
        mensaje: resultado.mensaje,
        dispositivo: resultado.dispositivo
      });
    } catch (error) {
      return responderConError(res, error, 'PATCH /api/dispositivos/:id/transferir');
    }
  },

  /**
   * DELETE /api/dispositivos/:id
   * Sólo procede si el equipo no tiene órdenes de servicio técnico.
   */
  async deleteDispositivo(req, res) {
    try {
      const resultado = await DispositivoService.eliminarDispositivo(req.params.id);

      return res.status(200).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'DELETE /api/dispositivos/:id');
    }
  }
};

export default DispositivoController;
