/**
 * ==========================================================================
 * CONTROLADOR DE AUTENTICACIÓN (autenticacionController.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · Módulo 1 (LOGIN)
 *
 * PROPÓSITO FUNCIONAL:
 *   Expone los endpoints REST del sistema de inicio de sesión consumidos por
 *   `AutenticacionServices.js` del frontend Vue 3:
 *
 *     | Método | Ruta                               | Acción                  |
 *     |--------|------------------------------------|-------------------------|
 *     | POST   | /api/autenticacion/login           | Iniciar sesión          |
 *     | GET    | /api/autenticacion/perfil          | Usuario de la sesión    |
 *     | GET    | /api/autenticacion/verificar       | ¿Sigue activa la sesión?|
 *     | POST   | /api/autenticacion/cerrar-sesion   | Cerrar sesión           |
 *
 * PROPÓSITO TÉCNICO:
 *   Cada método delega en `AutenticacionService` y traduce el resultado al
 *   contrato JSON del sistema:
 *     · Éxito            -> 200 OK (200/201 según corresponda).
 *     · Datos inválidos  -> 400 Bad Request.
 *     · Sin sesión       -> 401 Unauthorized (lo emite el middleware).
 *     · Sin permiso      -> 403 Forbidden   (lo emite el middleware).
 *   El manejo del error se centraliza en `responderConError`, evitando repetir
 *   el mismo bloque `try/catch` en cada endpoint.
 * ==========================================================================
 */
import { AutenticacionService } from '../services/autenticacionService.js';
import { UsuarioService } from '../services/usuarioService.js';
import { responderConError } from '../utils/erroresNegocio.js';

export const AutenticacionController = {
  /**
   * POST /api/autenticacion/login
   *
   * PROPÓSITO FUNCIONAL: valida las credenciales y entrega el token que el
   * frontend guarda para autenticar el resto de las peticiones.
   *
   * Códigos de respuesta:
   *   200 -> credenciales correctas, devuelve { token, usuario }.
   *   400 -> faltan el usuario o la contraseña.
   *   401 -> credenciales incorrectas.
   *   403 -> usuario inactivo o sin rol Administrador.
   */
  async postLogin(req, res) {
    try {
      const resultado = await AutenticacionService.iniciarSesion(req.body);

      return res.status(200).json({
        exito: true,
        mensaje: `Bienvenido al sistema TekZon, ${resultado.usuario.nombre}.`,
        token: resultado.token,
        expira_en_horas: resultado.expira_en_horas,
        usuario: resultado.usuario
      });
    } catch (error) {
      return responderConError(res, error, 'POST /api/autenticacion/login');
    }
  },

  /**
   * GET /api/autenticacion/perfil
   * Devuelve la ficha del usuario dueño del token (ruta protegida).
   */
  async getPerfil(req, res) {
    try {
      const usuario = await AutenticacionService.obtenerPerfil(req.usuarioAutenticado.id_usuario);

      return res.status(200).json({ exito: true, usuario });
    } catch (error) {
      return responderConError(res, error, 'GET /api/autenticacion/perfil');
    }
  },

  /**
   * GET /api/autenticacion/verificar
   * Indica al frontend si la sesión almacenada sigue siendo válida.
   */
  async getVerificar(req, res) {
    try {
      const resultado = await AutenticacionService.verificarSesion(req.usuarioAutenticado);

      return res.status(200).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'GET /api/autenticacion/verificar');
    }
  },

  /**
   * POST /api/autenticacion/cerrar-sesion
   * Confirma el cierre; el frontend elimina el token de su almacenamiento.
   */
  async postCerrarSesion(req, res) {
    try {
      const resultado = await AutenticacionService.cerrarSesion(req.usuarioAutenticado);

      return res.status(200).json({ exito: true, ...resultado });
    } catch (error) {
      return responderConError(res, error, 'POST /api/autenticacion/cerrar-sesion');
    }
  },

  /**
   * POST /api/autenticacion/registrar
   * Autoregistro público de usuarios nuevos.
   * Quedan en estado pendiente de aprobación para que el Administrador les asigne rol.
   */
  async postRegistrar(req, res) {
    try {
      const resultado = await UsuarioService.registrarSolicitud(req.body);

      return res.status(201).json({
        exito: true,
        ...resultado
      });
    } catch (error) {
      return responderConError(res, error, 'POST /api/autenticacion/registrar');
    }
  }
};

export default AutenticacionController;
