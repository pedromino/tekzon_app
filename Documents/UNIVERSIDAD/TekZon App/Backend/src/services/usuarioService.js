/**
 * ==========================================================================
 * SERVICIO DE GESTIÓN DE USUARIOS (usuarioService.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Lógica de negocio (Business Logic Layer) · Módulo de Configuración
 *
 * PROPÓSITO FUNCIONAL:
 *   Centraliza las reglas de negocio para la administración de usuarios,
 *   incluyendo:
 *     1. Registro público de usuarios (quedan pendientes de aprobación).
 *     2. Aprobación y asignación de rol por parte del Administrador.
 *     3. Modificación de datos de usuarios (nombre, username, rol).
 *     4. Deshabilitación y habilitación de cuentas (baja lógica).
 *     5. Cambio de contraseñas de acceso de forma segura.
 *     6. Eliminación de usuarios (con validación de integridad referencial).
 *
 * PROPÓSITO TÉCNICO:
 *   · Utiliza las funciones criptográficas de `utilidadesSeguridad.js` (scrypt).
 *   · Lanza instancias de `ErrorNegocio` con códigos HTTP apropiados (400, 404, 409).
 *   · Salvaguarda la cuenta del Administrador para evitar que se deshabilite
 *     o elimine a sí mismo accidentalmente.
 * ==========================================================================
 */
import { UsuarioModel } from '../models/usuarioModel.js';
import { encriptarContrasenia } from '../utils/utilidadesSeguridad.js';
import { ErrorNegocio } from '../utils/erroresNegocio.js';

/** Limpia espacios innecesarios en cadenas de texto */
const limpiarTexto = (valor) => String(valor ?? '').trim();

export const UsuarioService = {
  /**
   * Obtiene el listado completo de todos los usuarios registrados.
   *
   * @returns {Promise<Array>} Lista de fichas públicas de usuarios.
   */
  async listarUsuarios() {
    return await UsuarioModel.listarUsuarios();
  },

  /**
   * Obtiene el resumen de solicitudes pendientes de aprobación para el Administrador.
   *
   * @returns {Promise<Object>} Cantidad y listado de usuarios pendientes.
   */
  async obtenerPendientes() {
    const total = await UsuarioModel.contarPendientes();
    const pendientes = await UsuarioModel.listarPendientes();

    return {
      total,
      pendientes
    };
  },

  /**
   * Registra una nueva solicitud de usuario desde el exterior (autoregistro).
   * La cuenta queda inactiva (estado = 0) y marcada como pendiente de aprobación.
   *
   * @param {Object} datosSolicitud  { nombre_usuario, username, contrasenia }
   * @returns {Promise<Object>} Mensaje y ficha pública del usuario registrado.
   */
  async registrarSolicitud(datosSolicitud) {
    const nombre_usuario = limpiarTexto(datosSolicitud?.nombre_usuario || datosSolicitud?.nombre);
    const username = limpiarTexto(datosSolicitud?.username || datosSolicitud?.usuario).toLowerCase();
    const contrasenia = String(datosSolicitud?.contrasenia || datosSolicitud?.password || '');

    // Validaciones de obligatoriedad
    if (!nombre_usuario) {
      throw new ErrorNegocio('Debe ingresar su nombre completo.', 400);
    }

    if (!username) {
      throw new ErrorNegocio('Debe ingresar un nombre de usuario.', 400);
    }

    if (username.length < 3) {
      throw new ErrorNegocio('El nombre de usuario debe tener al menos 3 caracteres.', 400);
    }

    if (!contrasenia || contrasenia.length < 6) {
      throw new ErrorNegocio('La contraseña debe contener al menos 6 caracteres.', 400);
    }

    // Comprobar si el username ya se encuentra en uso
    const yaExiste = await UsuarioModel.existeUsername(username);
    if (yaExiste) {
      throw new ErrorNegocio(`El nombre de usuario "${username}" ya está registrado. Por favor elija otro.`, 409);
    }

    // Hasheo seguro con scrypt
    const contraseniaHash = encriptarContrasenia(contrasenia);

    // Registro con pendiente_aprobacion = 1, estado = 0 y sin rol asignado
    const nuevoUsuario = await UsuarioModel.crearUsuario({
      nombre_usuario,
      username,
      contrasenia_usuario: contraseniaHash,
      id_rolusuario: null,
      estado: 0,
      pendiente_aprobacion: 1
    });

    return {
      mensaje: 'Registro realizado exitosamente. Su cuenta está en espera de que el Administrador le asigne un rol.',
      usuario: nuevoUsuario
    };
  },

  /**
   * Creación directa de usuario por parte del Administrador (queda activo de inmediato).
   *
   * @param {Object} datosUsuario  { nombre_usuario, username, contrasenia, id_rolusuario }
   * @param {Object} adminAutenticado Administrador que ejecuta la creación.
   * @returns {Promise<Object>} Ficha del usuario creado.
   */
  async crearUsuario(datosUsuario, adminAutenticado) {
    const nombre_usuario = limpiarTexto(datosUsuario?.nombre_usuario || datosUsuario?.nombre);
    const username = limpiarTexto(datosUsuario?.username || datosUsuario?.usuario).toLowerCase();
    const contrasenia = String(datosUsuario?.contrasenia || datosUsuario?.password || '');
    const id_rolusuario = Number(datosUsuario?.id_rolusuario);

    if (!nombre_usuario) {
      throw new ErrorNegocio('El nombre del usuario es obligatorio.', 400);
    }

    if (!username) {
      throw new ErrorNegocio('El nombre de usuario (username) es obligatorio.', 400);
    }

    if (!contrasenia || contrasenia.length < 6) {
      throw new ErrorNegocio('La contraseña debe tener al menos 6 caracteres.', 400);
    }

    if (!id_rolusuario || isNaN(id_rolusuario)) {
      throw new ErrorNegocio('Debe seleccionar un rol válido para el usuario.', 400);
    }

    // Validar existencia del rol
    const roles = await UsuarioModel.listarRoles();
    const rolValido = roles.some((r) => r.id_rolusuario === id_rolusuario);
    if (!rolValido) {
      throw new ErrorNegocio('El rol seleccionado no es válido.', 400);
    }

    // Validar nombre de usuario único
    const existe = await UsuarioModel.existeUsername(username);
    if (existe) {
      throw new ErrorNegocio(`El nombre de usuario "${username}" ya está registrado.`, 409);
    }

    const contraseniaHash = encriptarContrasenia(contrasenia);

    const usuarioCreado = await UsuarioModel.crearUsuario({
      nombre_usuario,
      username,
      contrasenia_usuario: contraseniaHash,
      id_rolusuario,
      estado: 1,
      pendiente_aprobacion: 0
    });

    return usuarioCreado;
  },

  /**
   * Actualiza los datos informativos y rol de un usuario existente.
   *
   * @param {number} id_usuario ID del usuario a modificar.
   * @param {Object} datos  { nombre_usuario, username, id_rolusuario }
   * @param {Object} adminAutenticado Administrador que ejecuta la edición.
   * @returns {Promise<Object>} Ficha actualizada del usuario.
   */
  async actualizarUsuario(id_usuario, datos, adminAutenticado) {
    const idNum = Number(id_usuario);
    const usuarioExistente = await UsuarioModel.obtenerPorId(idNum);

    if (!usuarioExistente) {
      throw new ErrorNegocio('El usuario no existe.', 404);
    }

    const nombre_usuario = limpiarTexto(datos?.nombre_usuario || datos?.nombre || usuarioExistente.nombre_usuario);
    const username = limpiarTexto(datos?.username || datos?.usuario || usuarioExistente.username).toLowerCase();
    const id_rolusuario = datos?.id_rolusuario ? Number(datos.id_rolusuario) : usuarioExistente.id_rolusuario;

    if (!nombre_usuario) {
      throw new ErrorNegocio('El nombre del usuario no puede estar vacío.', 400);
    }

    if (!username) {
      throw new ErrorNegocio('El nombre de acceso (username) no puede estar vacío.', 400);
    }

    // Comprobar colisión de username con otro usuario distinto
    const colision = await UsuarioModel.existeUsername(username, idNum);
    if (colision) {
      throw new ErrorNegocio(`El nombre de usuario "${username}" ya está en uso por otra cuenta.`, 409);
    }

    // Validar rol si fue provisto
    if (id_rolusuario) {
      const roles = await UsuarioModel.listarRoles();
      const rolExiste = roles.some((r) => r.id_rolusuario === id_rolusuario);
      if (!rolExiste) {
        throw new ErrorNegocio('El rol seleccionado no es válido.', 400);
      }
    }

    return await UsuarioModel.actualizarUsuario(idNum, {
      nombre_usuario,
      username,
      id_rolusuario
    });
  },

  /**
   * Cambia el estado (habilitar / deshabilitar) de un usuario.
   *
   * @param {number} id_usuario ID del usuario.
   * @param {number} nuevoEstado 1 para activar, 0 para desactivar.
   * @param {Object} adminAutenticado Usuario administrador que ejecuta la acción.
   */
  async cambiarEstado(id_usuario, nuevoEstado, adminAutenticado) {
    const idNum = Number(id_usuario);
    const usuario = await UsuarioModel.obtenerPorId(idNum);

    if (!usuario) {
      throw new ErrorNegocio('El usuario no existe.', 404);
    }

    // Regla de seguridad: un administrador no puede deshabilitarse a sí mismo
    if (idNum === Number(adminAutenticado?.id_usuario) && Number(nuevoEstado) === 0) {
      throw new ErrorNegocio('No puede deshabilitar su propia cuenta de Administrador mientras está en sesión.', 400);
    }

    const estadoFinal = Number(nuevoEstado) === 1 ? 1 : 0;
    await UsuarioModel.cambiarEstado(idNum, estadoFinal);

    return {
      id_usuario: idNum,
      estado: estadoFinal,
      mensaje: estadoFinal === 1 ? 'Usuario habilitado con éxito.' : 'Usuario deshabilitado con éxito.'
    };
  },

  /**
   * Aprueba una cuenta que estaba pendiente y le asigna su rol.
   *
   * @param {number} id_usuario ID del usuario pendiente.
   * @param {Object} datos  { id_rolusuario }
   * @param {Object} adminAutenticado Administrador que aprueba.
   */
  async aprobarUsuario(id_usuario, datos, adminAutenticado) {
    const idNum = Number(id_usuario);
    const usuario = await UsuarioModel.obtenerPorId(idNum);

    if (!usuario) {
      throw new ErrorNegocio('El usuario no existe.', 404);
    }

    const id_rolusuario = Number(datos?.id_rolusuario);
    if (!id_rolusuario || isNaN(id_rolusuario)) {
      throw new ErrorNegocio('Debe seleccionar el rol que desempeñará el nuevo usuario.', 400);
    }

    const roles = await UsuarioModel.listarRoles();
    const rolExiste = roles.some((r) => r.id_rolusuario === id_rolusuario);
    if (!rolExiste) {
      throw new ErrorNegocio('El rol seleccionado no es válido.', 400);
    }

    await UsuarioModel.aprobarUsuario(idNum, id_rolusuario);

    const usuarioAprobado = await UsuarioModel.obtenerPorId(idNum);
    return {
      mensaje: `Usuario "${usuarioAprobado.nombre_usuario}" aprobado exitosamente con rol "${usuarioAprobado.tipo_usuario}".`,
      usuario: usuarioAprobado
    };
  },

  /**
   * Rechaza una solicitud de usuario pendiente y elimina el registro previo.
   *
   * @param {number} id_usuario ID del usuario.
   */
  async rechazarUsuario(id_usuario) {
    const idNum = Number(id_usuario);
    const usuario = await UsuarioModel.obtenerPorId(idNum);

    if (!usuario) {
      throw new ErrorNegocio('El usuario no existe.', 404);
    }

    if (Number(usuario.pendiente_aprobacion) !== 1) {
      throw new ErrorNegocio('Solo se pueden rechazar usuarios que estén en estado pendiente de aprobación.', 400);
    }

    await UsuarioModel.rechazarUsuario(idNum);

    return {
      mensaje: `La solicitud del usuario "${usuario.nombre_usuario}" ha sido rechazada y removida.`
    };
  },

  /**
   * Restablece o cambia la contraseña de un usuario.
   *
   * @param {number} id_usuario ID del usuario.
   * @param {Object} datos { contrasenia, confirmarContrasenia }
   */
  async cambiarContrasenia(id_usuario, datos) {
    const idNum = Number(id_usuario);
    const usuario = await UsuarioModel.obtenerPorId(idNum);

    if (!usuario) {
      throw new ErrorNegocio('El usuario no existe.', 404);
    }

    const nuevaContrasenia = String(datos?.contrasenia || datos?.nuevaContrasenia || datos?.password || '');
    const confirmarContrasenia = String(datos?.confirmarContrasenia || datos?.confirmar || nuevaContrasenia);

    if (!nuevaContrasenia || nuevaContrasenia.length < 6) {
      throw new ErrorNegocio('La nueva contraseña debe tener al menos 6 caracteres.', 400);
    }

    if (nuevaContrasenia !== confirmarContrasenia) {
      throw new ErrorNegocio('Las contraseñas no coinciden.', 400);
    }

    const hashNuevo = encriptarContrasenia(nuevaContrasenia);
    await UsuarioModel.cambiarContrasenia(idNum, hashNuevo);

    return {
      mensaje: `Contraseña actualizada correctamente para el usuario "${usuario.username}".`
    };
  },

  /**
   * Elimina un usuario si no tiene registros de auditoría ni transacciones.
   *
   * @param {number} id_usuario ID del usuario.
   * @param {Object} adminAutenticado Administrador en sesión.
   */
  async eliminarUsuario(id_usuario, adminAutenticado) {
    const idNum = Number(id_usuario);
    const usuario = await UsuarioModel.obtenerPorId(idNum);

    if (!usuario) {
      throw new ErrorNegocio('El usuario no existe.', 404);
    }

    if (idNum === Number(adminAutenticado?.id_usuario)) {
      throw new ErrorNegocio('No puede eliminar su propia cuenta de Administrador.', 400);
    }

    try {
      await UsuarioModel.eliminarUsuario(idNum);
      return {
        mensaje: `Usuario "${usuario.nombre_usuario}" eliminado exitosamente.`
      };
    } catch (error) {
      // Si falla por restricción de clave foránea
      if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
        throw new ErrorNegocio(
          'No es posible eliminar este usuario porque cuenta con registros asociados en el sistema (movimientos de inventario, órdenes o ventas). Para suspender su acceso, desactívelo en su lugar.',
          409
        );
      }
      throw error;
    }
  },

  /**
   * Retorna el catálogo de roles configurados en la base de datos.
   */
  async listarRoles() {
    return await UsuarioModel.listarRoles();
  }
};

export default UsuarioService;
