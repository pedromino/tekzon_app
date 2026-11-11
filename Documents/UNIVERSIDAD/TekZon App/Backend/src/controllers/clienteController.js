/**
 * ==========================================================================
 * CONTROLADOR DE CLIENTES (clienteController.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · Módulo 2 (Recepción)
 *
 * PROPÓSITO FUNCIONAL:
 *   Expone los endpoints REST de la cartera de clientes consumidos por
 *   `ClienteServices.js` del frontend Vue 3. El cliente es la entidad común a
 *   los DOS flujos comerciales (Servicio Técnico y Venta Directa).
 *
 * PROPÓSITO TÉCNICO:
 *   Todos los endpoints están protegidos por el middleware de sesión, de modo
 *   que sólo el Administrador autenticado puede consultar o modificar datos
 *   personales de los clientes (información sensible).
 *
 *   | Método | Ruta                                  | Acción                  |
 *   |--------|---------------------------------------|-------------------------|
 *   | GET    | /api/clientes                         | Listar / buscar         |
 *   | GET    | /api/clientes/:cedula                 | Ficha del cliente       |
 *   | GET    | /api/clientes/:cedula/historial       | Equipos + facturas      |
 *   | POST   | /api/clientes                         | Alta de cliente         |
 *   | PUT    | /api/clientes/:cedula                 | Editar contacto         |
 *   | DELETE | /api/clientes/:cedula                 | Baja (si no tiene docs) |
 * ==========================================================================
 */
import { ClienteService } from '../services/clienteService.js';
import { responderConError } from '../utils/erroresNegocio.js';

export const ClienteController = {
  /**
   * GET /api/clientes?texto=...
   * Lista los clientes, opcionalmente filtrados por cédula, nombre o apellido.
   */
  async getClientes(req, res) {
    try {
      const clientes = await ClienteService.obtenerClientes(req.query);

      return res.status(200).json({
        exito: true,
        total: clientes.length,
        clientes
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/clientes');
    }
  },

  /** GET /api/clientes/:cedula -> ficha del cliente (404 si no existe). */
  async getClientePorCedula(req, res) {
    try {
      const cliente = await ClienteService.obtenerClientePorCedula(req.params.cedula);

      return res.status(200).json({ exito: true, cliente });
    } catch (error) {
      return responderConError(res, error, 'GET /api/clientes/:cedula');
    }
  },

  /**
   * GET /api/clientes/:cedula/historial
   * Devuelve el cliente junto con sus equipos, facturas y órdenes de servicio.
   */
  async getHistorialCliente(req, res) {
    try {
      const historial = await ClienteService.obtenerHistorial(req.params.cedula);

      return res.status(200).json({ exito: true, ...historial });
    } catch (error) {
      return responderConError(res, error, 'GET /api/clientes/:cedula/historial');
    }
  },

  /** POST /api/clientes -> alta de un cliente nuevo (409 si la cédula existe). */
  async postCliente(req, res) {
    try {
      const clienteCreado = await ClienteService.crearCliente(req.body);

      return res.status(201).json({
        exito: true,
        mensaje: `Cliente "${clienteCreado.nombre_cliente} ${clienteCreado.apellido_cliente}" registrado correctamente.`,
        cliente: clienteCreado
      });
    } catch (error) {
      return responderConError(res, error, 'POST /api/clientes');
    }
  },

  /**
   * PUT /api/clientes/:cedula -> actualiza los datos de contacto.
   * La cédula no cambia porque es llave primaria referenciada por las ventas.
   */
  async putCliente(req, res) {
    try {
      const clienteActualizado = await ClienteService.actualizarCliente(req.params.cedula, req.body);

      return res.status(200).json({
        exito: true,
        mensaje: 'Datos del cliente actualizados correctamente.',
        cliente: clienteActualizado
      });
    } catch (error) {
      return responderConError(res, error, 'PUT /api/clientes/:cedula');
    }
  },

  /**
   * DELETE /api/clientes/:cedula
   * Sólo procede si el cliente no tiene dispositivos ni ventas registradas.
   */
  async deleteCliente(req, res) {
    try {
      const resultado = await ClienteService.eliminarCliente(req.params.cedula);

      return res.status(200).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'DELETE /api/clientes/:cedula');
    }
  }
};

export default ClienteController;
