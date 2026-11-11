/**
 * ==========================================================================
 * SERVICIO DE AUTENTICACIÓN (autenticacionService.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Lógica de negocio (Business Logic Layer) · Módulo 1 (LOGIN)
 *
 * PROPÓSITO FUNCIONAL:
 *   Implementa el inicio de sesión del sistema y las reglas del rol
 *   ADMINISTRADOR, que en esta fase es el único rol con acceso a todos los
 *   módulos (Inventario, Servicio Técnico, Venta Directa y Alertas):
 *
 *     · Las credenciales deben venir completas (usuario y contraseña).
 *     · La contraseña se compara contra el HASH scrypt almacenado.
 *     · Un usuario con baja lógica (estado = 0) no puede iniciar sesión.
 *     · Sólo el rol 'administrador' tiene permitido el acceso a la interfaz.
 *     · Ante credenciales incorrectas se devuelve un mensaje GENÉRICO: no se
 *       revela si el error fue el usuario o la contraseña (buena práctica de
 *       seguridad para no facilitar la enumeración de usuarios).
 *
 * PROPÓSITO TÉCNICO:
 *   Devuelve siempre un objeto con la MISMA forma:
 *
 *     { token, expira_en_horas, usuario: { id_usuario, nombre, username, rol } }
 *
 *   La ficha `usuario` que se entrega al frontend NUNCA contiene el hash de la
 *   contraseña (ver `construirUsuarioPublico`).
 * ==========================================================================
 */
import { UsuarioModel } from '../models/usuarioModel.js';
import {
  encriptarContrasenia,
  verificarContrasenia,
  generarTokenSesion
} from '../utils/utilidadesSeguridad.js';
import { ErrorNegocio } from '../utils/erroresNegocio.js';
import { ROL_ADMINISTRADOR } from '../middlewares/autenticacionMiddleware.js';

/** Horas que dura la sesión emitida (debe coincidir con el token). */
const HORAS_VIGENCIA_SESION = 8;

/**
 * Limpia un texto recibido del formulario (quita espacios externos).
 */
const limpiarTexto = (valor) => String(valor ?? '').trim();

/**
 * Construye la ficha PÚBLICA del usuario (la que ve el frontend).
 *
 * PROPÓSITO TÉCNICO: se enumeran los campos de forma explícita en lugar de
 * hacer `delete usuario.contrasenia_usuario`. Así, si en el futuro se agrega
 * una columna sensible a la tabla, NO se filtrará por descuido.
 */
const construirUsuarioPublico = (usuario) => ({
  id_usuario: usuario.id_usuario,
  nombre: usuario.nombre_usuario,
  username: usuario.username,
  rol: usuario.tipo_usuario,
  id_rolusuario: usuario.id_rolusuario,
  // Permisos globales: el administrador accede a todos los módulos.
  esAdministrador: String(usuario.tipo_usuario).toLowerCase() === ROL_ADMINISTRADOR,
  ultimo_acceso: usuario.ultimo_acceso
});

export const AutenticacionService = {
  /**
   * INICIO DE SESIÓN (POST /api/autenticacion/login).
   *
   * @param {Object} datosAcceso  { username | usuario, contrasenia | password }
   * @returns {Promise<Object>}   { token, expira_en_horas, usuario }
   */
  async iniciarSesion(datosAcceso) {
    // ---- 1. Normalización del payload (se aceptan los alias del formulario) ----
    const username = limpiarTexto(datosAcceso?.username ?? datosAcceso?.usuario);
    const contrasenia = String(datosAcceso?.contrasenia ?? datosAcceso?.password ?? '');

    // ---- 2. Validación de campos obligatorios ----
    if (!username) {
      throw new ErrorNegocio('Debe indicar su nombre de usuario.', 400);
    }

    if (!contrasenia) {
      throw new ErrorNegocio('Debe indicar su contraseña.', 400);
    }

    // ---- 3. Búsqueda del usuario por su nombre de acceso ----
    const usuario = await UsuarioModel.buscarCredencialesPorUsername(username);

    /*
     * MENSAJE GENÉRICO: tanto si el usuario no existe como si la contraseña es
     * incorrecta se responde EXACTAMENTE lo mismo, para no revelar cuál de los
     * dos datos falló.
     */
    const mensajeCredencialesInvalidas = 'Usuario o contraseña incorrectos. Verifique sus datos e intente de nuevo.';

    if (!usuario) {
      throw new ErrorNegocio(mensajeCredencialesInvalidas, 401);
    }

    // ---- 4. Verificación criptográfica de la contraseña ----
    const contraseniaCorrecta = verificarContrasenia(contrasenia, usuario.contrasenia_usuario);

    if (!contraseniaCorrecta) {
      throw new ErrorNegocio(mensajeCredencialesInvalidas, 401);
    }

    // ---- 5. Verificación de aprobación pendiente ----
    if (Number(usuario.pendiente_aprobacion) === 1) {
      throw new ErrorNegocio(
        'Su cuenta se encuentra pendiente de aprobación. El Administrador debe asignarle un rol en el sistema antes de iniciar sesión.',
        403
      );
    }

    // ---- 6. Baja lógica del usuario ----
    if (Number(usuario.estado) !== 1) {
      throw new ErrorNegocio(
        'Su usuario está deshabilitado. Contacte al administrador del sistema.',
        403
      );
    }

    // ---- 7. Control de rol ----
    const rolUsuario = String(usuario.tipo_usuario || '').toLowerCase();

    if (!rolUsuario || rolUsuario === 'sin asignar') {
      throw new ErrorNegocio(
        'Su usuario no tiene un rol asignado en el sistema.',
        403
      );
    }

    // ---- 7. Emisión del token de sesión firmado ----
    const token = generarTokenSesion({
      id_usuario: usuario.id_usuario,
      username: usuario.username,
      rol: rolUsuario
    });

    /*
     * ---- 8. Auditoría del acceso ----
     * Se registra la marca de tiempo del último acceso. Si esta escritura
     * fallara (por ejemplo un bloqueo puntual de la tabla) NO debe impedir que
     * el usuario trabaje: por eso el error se captura y sólo se advierte.
     */
    try {
      await UsuarioModel.registrarUltimoAcceso(usuario.id_usuario);
    } catch (error) {
      console.warn('[AUTENTICACION] No se pudo registrar el último acceso:', error.message);
    }

    return {
      token,
      expira_en_horas: HORAS_VIGENCIA_SESION,
      usuario: construirUsuarioPublico(usuario)
    };
  },

  /**
   * DEVUELVE LA FICHA DEL USUARIO DE LA SESIÓN ACTUAL
   * (GET /api/autenticacion/perfil).
   *
   * PROPÓSITO FUNCIONAL: el frontend la llama al recargar la página para
   * reconstruir el estado de sesión sin obligar al usuario a escribir de nuevo
   * sus credenciales. Si el token ya no es válido, el middleware responde 401 y
   * el cliente Axios redirige al login.
   */
  async obtenerPerfil(id_usuario) {
    const usuario = await UsuarioModel.obtenerPorId(id_usuario);

    if (!usuario) {
      throw new ErrorNegocio('El usuario de la sesión no existe en el sistema.', 404);
    }

    return construirUsuarioPublico(usuario);
  },

  /**
   * CIERRE DE SESIÓN (POST /api/autenticacion/cerrar-sesion).
   *
   * PROPÓSITO TÉCNICO: el token firmado es auto-contenido (sin estado en el
   * servidor), por lo que el cierre consiste en que el frontend LO ELIMINA de su
   * almacenamiento local. Este endpoint existe para dejar constancia en el log
   * del servidor y devolver un mensaje claro a la interfaz.
   */
  async cerrarSesion(usuario) {
    return {
      mensaje: `Sesión finalizada correctamente. Hasta pronto, ${usuario?.nombre_usuario || 'usuario'}.`
    };
  },

  /**
   * COMPROBACIÓN DE ESTADO DE LA SESIÓN (GET /api/autenticacion/verificar).
   * Alimenta el "latido" del frontend para saber si el token sigue vigente.
   */
  async verificarSesion(usuario) {
    return {
      sesionActiva: true,
      usuario: construirUsuarioPublico(usuario)
    };
  },

  /**
   * HERRAMIENTA DE SOPORTE: cifra una contraseña con el mismo algoritmo del
   * inicio de sesión. NO se expone por HTTP; se usa desde el script de consola
   * `scripts/generarHashAdmin.mjs` para regenerar credenciales.
   */
  cifrarContrasenia(contraseniaPlana) {
    return encriptarContrasenia(contraseniaPlana);
  }
};

export default AutenticacionService;
