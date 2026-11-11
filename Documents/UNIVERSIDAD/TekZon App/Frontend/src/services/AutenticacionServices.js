/**
 * ==========================================================================
 * SERVICIO DE AUTENTICACIÓN (AutenticacionServices.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Consumo de API REST · Módulo 1 (LOGIN)
 *
 * PROPÓSITO FUNCIONAL:
 *   Encapsula las peticiones HTTP del inicio de sesión y sincroniza el estado
 *   global de la aplicación (`services/sesion.js`) con la respuesta del
 *   backend:
 *
 *     · iniciarSesion()  -> POST /autenticacion/login  (guarda token + usuario)
 *     · verificarSesion()-> GET  /autenticacion/perfil (revalida el token)
 *     · cerrarSesion()   -> POST /autenticacion/cerrar-sesion (limpia el estado)
 *
 * PROPÓSITO TÉCNICO:
 *   CERO datos simulados: el rol y los permisos provienen de la tabla `usuario`
 *   y `rol_usuario` de la base `tekzon_bd`. Todo método relanza el error
 *   normalizado ({ mensaje, codigoHttp }) para que la pantalla de Login lo
 *   muestre en su estado de Error.
 * ==========================================================================
 */
import clienteApi from './apiClient';
import {
  iniciarSesionLocal,
  cerrarSesionLocal,
  actualizarUsuarioSesion,
  obtenerToken,
  sesion
} from './sesion';

/**
 * Traduce la ficha de usuario del backend al modelo de vista del frontend.
 * Se conservan ambas nomenclaturas para no obligar a los componentes a conocer
 * los nombres de las columnas de MySQL.
 */
const mapearUsuarioDesdeBD = (usuario) => ({
  id_usuario: usuario.id_usuario,
  // --- Nomenclatura del frontend ---
  nombre: usuario.nombre,
  username: usuario.username,
  rol: usuario.rol,
  esAdministrador: Boolean(usuario.esAdministrador),
  ultimoAcceso: usuario.ultimo_acceso,
  // --- Nomenclatura original de MySQL ---
  nombre_usuario: usuario.nombre,
  tipo_usuario: usuario.rol,
  ultimo_acceso: usuario.ultimo_acceso
});

export default {
  /**
   * INICIA SESIÓN (Módulo 1).
   *
   * @param {Object} credenciales { username, contrasenia }
   * @returns {Promise<Object>} { exito, mensaje, usuario }
   */
  async iniciarSesion(credenciales) {
    try {
      const respuesta = await clienteApi.post('/autenticacion/login', {
        username: credenciales.username ?? credenciales.usuario,
        contrasenia: credenciales.contrasenia ?? credenciales.password
      });

      const { token, usuario, mensaje } = respuesta.data;

      // Se guarda el token en localStorage y se publica la ficha del usuario
      // en el estado global: a partir de aquí toda la interfaz sabe quién entró.
      iniciarSesionLocal(token, mapearUsuarioDesdeBD(usuario));

      return { exito: true, mensaje, usuario: sesion.usuario };
    } catch (error) {
      console.error('Error en iniciarSesion:', error);
      throw error;
    }
  },

  /**
   * REVALIDA LA SESIÓN ALMACENADA.
   *
   * PROPÓSITO FUNCIONAL: se invoca al recargar la aplicación (F5). Si el token
   * guardado sigue siendo válido, el backend devuelve la ficha actualizada del
   * usuario y la interfaz se restaura SIN pedir de nuevo las credenciales.
   *
   * @returns {Promise<boolean>} true si la sesión sigue activa.
   */
  async verificarSesion() {
    // Sin token almacenado no hay nada que verificar.
    if (!obtenerToken()) return false;

    try {
      const respuesta = await clienteApi.get('/autenticacion/perfil');

      actualizarUsuarioSesion(mapearUsuarioDesdeBD(respuesta.data.usuario));

      return true;
    } catch (error) {
      /*
       * Si el token expiró o es inválido (401), se limpia la sesión local. El
       * interceptor de Axios ya se encarga de redirigir al Login.
       */
      if (error.codigoHttp === 401 || error.codigoHttp === 403) {
        cerrarSesionLocal();
        return false;
      }

      // Error de red (servidor caído): se conserva el token para reintentar.
      console.error('Error en verificarSesion:', error);
      return false;
    }
  },

  /**
   * CIERRA LA SESIÓN.
   * Notifica al backend (para el registro del log) y limpia el estado local.
   */
  async cerrarSesion() {
    try {
      // Si el token ya expiró esta llamada fallará con 401; no es un problema
      // porque el cierre local debe ocurrir de todos modos.
      await clienteApi.post('/autenticacion/cerrar-sesion');
    } catch (error) {
      console.warn('El backend no confirmó el cierre de sesión:', error?.mensaje || error?.message);
    } finally {
      cerrarSesionLocal();
    }

    return { exito: true };
  },

  /** COMPRUEBA EL ESTADO DE LA SESIÓN EN EL SERVIDOR (latido). */
  async consultarEstadoSesion() {
    try {
      const respuesta = await clienteApi.get('/autenticacion/verificar');
      return respuesta.data;
    } catch (error) {
      console.error('Error en consultarEstadoSesion:', error);
      throw error;
    }
  }
};
