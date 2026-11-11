/**
 * ==========================================================================
 * CONTROLADOR DE USUARIOS (usuarioController.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · Módulo de Configuración & Usuarios
 *
 * PROPÓSITO FUNCIONAL:
 *   Expone los endpoints de la API REST para la gestión de usuarios, roles
 *   y aprobaciones, permitiendo al Administrador:
 *     · Listar todos los usuarios y solicitudes pendientes.
 *     · Aprobar usuarios asignando roles.
 *     · Modificar datos de acceso e información de los usuarios.
 *     · Habilitar o deshabilitar cuentas de usuario.
 *     · Actualizar contraseñas de acceso.
 *     · Eliminar usuarios sin historial transaccional.
 *
 * PROPÓSITO TÉCNICO:
 *   · Utiliza `responderConError` para estandarizar códigos de estado HTTP
 *     y respuestas JSON estructuradas con `{ exito: true/false, ... }`.
 *   · Protegido bajo las políticas de autenticación y autorización del Administrador.
 * ==========================================================================
 */
import { UsuarioService } from '../services/usuarioService.js';
import { responderConError } from '../utils/erroresNegocio.js';

export const UsuarioController = {
  /**
   * GET /api/usuarios
   * Lista todos los usuarios registrados en el sistema.
   */
  async getUsuarios(req, res) {
    try {
      const usuarios = await UsuarioService.listarUsuarios();

      return res.status(200).json({
        exito: true,
        total: usuarios.length,
        usuarios
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/usuarios');
    }
  },

  /**
   * GET /api/usuarios/pendientes
   * Lista los usuarios en espera de aprobación por el Administrador.
   */
  async getPendientes(req, res) {
    try {
      const resultado = await UsuarioService.obtenerPendientes();

      return res.status(200).json({
        exito: true,
        ...resultado
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/usuarios/pendientes');
    }
  },

  /**
   * GET /api/usuarios/roles
   * Lista el catálogo de roles disponibles.
   */
  async getRoles(req, res) {
    try {
      const roles = await UsuarioService.listarRoles();

      return res.status(200).json({
        exito: true,
        roles
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/usuarios/roles');
    }
  },

  /**
   * POST /api/usuarios
   * Crea un nuevo usuario directamente desde el panel de administración.
   */
  async postUsuario(req, res) {
    try {
      const usuarioCreado = await UsuarioService.crearUsuario(req.body, req.usuarioAutenticado);

      return res.status(201).json({
        exito: true,
        mensaje: 'Usuario creado exitosamente.',
        usuario: usuarioCreado
      });
    } catch (error) {
      return responderConError(res, error, 'POST /api/usuarios');
    }
  },

  /**
   * PUT /api/usuarios/:id
   * Actualiza el nombre, username o rol de un usuario existente.
   */
  async putUsuario(req, res) {
    try {
      const usuarioActualizado = await UsuarioService.actualizarUsuario(
        req.params.id,
        req.body,
        req.usuarioAutenticado
      );

      return res.status(200).json({
        exito: true,
        mensaje: 'Datos del usuario actualizados exitosamente.',
        usuario: usuarioActualizado
      });
    } catch (error) {
      return responderConError(res, error, `PUT /api/usuarios/${req.params.id}`);
    }
  },

  /**
   * PATCH /api/usuarios/:id/estado
   * Activa o desactiva (habilita / deshabilita) la cuenta de un usuario.
   */
  async patchEstado(req, res) {
    try {
      const resultado = await UsuarioService.cambiarEstado(
        req.params.id,
        req.body?.estado,
        req.usuarioAutenticado
      );

      return res.status(200).json({
        exito: true,
        ...resultado
      });
    } catch (error) {
      return responderConError(res, error, `PATCH /api/usuarios/${req.params.id}/estado`);
    }
  },

  /**
   * PATCH /api/usuarios/:id/aprobar
   * Aprueba la solicitud y asigna el rol indicado.
   */
  async patchAprobar(req, res) {
    try {
      const resultado = await UsuarioService.aprobarUsuario(
        req.params.id,
        req.body,
        req.usuarioAutenticado
      );

      return res.status(200).json({
        exito: true,
        ...resultado
      });
    } catch (error) {
      return responderConError(res, error, `PATCH /api/usuarios/${req.params.id}/aprobar`);
    }
  },

  /**
   * PATCH /api/usuarios/:id/rechazar
   * Rechaza y remueve la solicitud pendiente de un usuario.
   */
  async patchRechazar(req, res) {
    try {
      const resultado = await UsuarioService.rechazarUsuario(
        req.params.id,
        req.usuarioAutenticado
      );

      return res.status(200).json({
        exito: true,
        ...resultado
      });
    } catch (error) {
      return responderConError(res, error, `PATCH /api/usuarios/${req.params.id}/rechazar`);
    }
  },

  /**
   * PATCH /api/usuarios/:id/contrasenia
   * Cambia o restablece la contraseña de un usuario.
   */
  async patchContrasenia(req, res) {
    try {
      const resultado = await UsuarioService.cambiarContrasenia(
        req.params.id,
        req.body
      );

      return res.status(200).json({
        exito: true,
        ...resultado
      });
    } catch (error) {
      return responderConError(res, error, `PATCH /api/usuarios/${req.params.id}/contrasenia`);
    }
  },

  /**
   * DELETE /api/usuarios/:id
   * Elimina un usuario definitivamente si no tiene registros vinculados.
   */
  async deleteUsuario(req, res) {
    try {
      const resultado = await UsuarioService.eliminarUsuario(
        req.params.id,
        req.usuarioAutenticado
      );

      return res.status(200).json({
        exito: true,
        ...resultado
      });
    } catch (error) {
      return responderConError(res, error, `DELETE /api/usuarios/${req.params.id}`);
    }
  }
};

export default UsuarioController;
