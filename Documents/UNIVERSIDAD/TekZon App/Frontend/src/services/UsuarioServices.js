/**
 * ==========================================================================
 * SERVICIO DE GESTIÓN DE USUARIOS (UsuarioServices.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Consumo de API REST · Módulo de Configuración y Seguridad
 *
 * PROPÓSITO FUNCIONAL:
 *   Conecta la interfaz de usuario de Vue 3 con los endpoints del backend para:
 *     1. Consultar usuarios y roles del sistema.
 *     2. Autoregistro público de nuevos usuarios pendientes de rol.
 *     3. Notificaciones y aprobación de usuarios por el Administrador.
 *     4. Modificación de información, contraseñas y estado (habilitar/deshabilitar).
 *     5. Eliminación de usuarios.
 *
 * PROPÓSITO TÉCNICO:
 *   · Utiliza la instancia preconfigurada de Axios (`apiClient.js`) con
 *     el interceptor de cabecera `Authorization: Bearer <token>`.
 *   · Relanza excepciones normalizadas para que las vistas muestren estados
 *     de error claros al usuario.
 * ==========================================================================
 */
import clienteApi from './apiClient';

export default {
  /**
   * Obtiene la lista completa de usuarios del sistema.
   *
   * @returns {Promise<Array>} Lista de usuarios registrados.
   */
  async listarUsuarios() {
    try {
      const respuesta = await clienteApi.get('/usuarios');
      return respuesta.data?.usuarios || [];
    } catch (error) {
      console.error('Error al listar usuarios:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Obtiene el listado y conteo de usuarios pendientes de aprobación.
   *
   * @returns {Promise<Object>} { total, pendientes }
   */
  async obtenerPendientes() {
    try {
      const respuesta = await clienteApi.get('/usuarios/pendientes');
      return {
        total: respuesta.data?.total || 0,
        pendientes: respuesta.data?.pendientes || []
      };
    } catch (error) {
      console.error('Error al obtener usuarios pendientes:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Obtiene el catálogo de roles configurados en la base de datos.
   *
   * @returns {Promise<Array>} Lista de roles (id_rolusuario, tipo_usuario).
   */
  async listarRoles() {
    try {
      const respuesta = await clienteApi.get('/usuarios/roles');
      return respuesta.data?.roles || [];
    } catch (error) {
      console.error('Error al listar roles:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Envía una solicitud de autoregistro de usuario (pública).
   *
   * @param {Object} datos { nombre_usuario, username, contrasenia }
   */
  async registrarSolicitud(datos) {
    try {
      const respuesta = await clienteApi.post('/autenticacion/registrar', datos);
      return respuesta.data;
    } catch (error) {
      console.error('Error en autoregistro de usuario:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Crea directamente un nuevo usuario activo desde el panel de administración.
   *
   * @param {Object} datos { nombre_usuario, username, contrasenia, id_rolusuario }
   */
  async crearUsuario(datos) {
    try {
      const respuesta = await clienteApi.post('/usuarios', datos);
      return respuesta.data;
    } catch (error) {
      console.error('Error al crear usuario:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Actualiza el nombre, username y rol de un usuario existente.
   *
   * @param {number} id_usuario
   * @param {Object} datos { nombre_usuario, username, id_rolusuario }
   */
  async actualizarUsuario(id_usuario, datos) {
    try {
      const respuesta = await clienteApi.put(`/usuarios/${id_usuario}`, datos);
      return respuesta.data;
    } catch (error) {
      console.error(`Error al actualizar usuario ${id_usuario}:`, error);
      throw error.response?.data || error;
    }
  },

  /**
   * Cambia el estado activo/inactivo (habilitar / deshabilitar) de un usuario.
   *
   * @param {number} id_usuario
   * @param {number} estado 1 para activo, 0 para inactivo
   */
  async cambiarEstado(id_usuario, estado) {
    try {
      const respuesta = await clienteApi.patch(`/usuarios/${id_usuario}/estado`, { estado });
      return respuesta.data;
    } catch (error) {
      console.error(`Error al cambiar estado de usuario ${id_usuario}:`, error);
      throw error.response?.data || error;
    }
  },

  /**
   * Aprueba la solicitud de un usuario y le asigna el rol seleccionado.
   *
   * @param {number} id_usuario
   * @param {number} id_rolusuario
   */
  async aprobarUsuario(id_usuario, id_rolusuario) {
    try {
      const respuesta = await clienteApi.patch(`/usuarios/${id_usuario}/aprobar`, {
        id_rolusuario
      });
      return respuesta.data;
    } catch (error) {
      console.error(`Error al aprobar usuario ${id_usuario}:`, error);
      throw error.response?.data || error;
    }
  },

  /**
   * Rechaza y remueve la solicitud de un usuario pendiente.
   *
   * @param {number} id_usuario
   */
  async rechazarUsuario(id_usuario) {
    try {
      const respuesta = await clienteApi.patch(`/usuarios/${id_usuario}/rechazar`);
      return respuesta.data;
    } catch (error) {
      console.error(`Error al rechazar usuario ${id_usuario}:`, error);
      throw error.response?.data || error;
    }
  },

  /**
   * Cambia la contraseña de acceso de un usuario.
   *
   * @param {number} id_usuario
   * @param {Object} datos { contrasenia, confirmarContrasenia }
   */
  async cambiarContrasenia(id_usuario, datos) {
    try {
      const respuesta = await clienteApi.patch(`/usuarios/${id_usuario}/contrasenia`, datos);
      return respuesta.data;
    } catch (error) {
      console.error(`Error al cambiar contraseña de usuario ${id_usuario}:`, error);
      throw error.response?.data || error;
    }
  },

  /**
   * Elimina un usuario definitivamente si no tiene historial asociado.
   *
   * @param {number} id_usuario
   */
  async eliminarUsuario(id_usuario) {
    try {
      const respuesta = await clienteApi.delete(`/usuarios/${id_usuario}`);
      return respuesta.data;
    } catch (error) {
      console.error(`Error al eliminar usuario ${id_usuario}:`, error);
      throw error.response?.data || error;
    }
  }
};
