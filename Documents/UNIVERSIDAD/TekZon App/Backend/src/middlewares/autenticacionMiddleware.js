/**
 * ==========================================================================
 * MIDDLEWARE DE SESIÓN (autenticacionMiddleware.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Middleware de seguridad (se ejecuta ANTES del controlador).
 *
 * PROPÓSITO FUNCIONAL:
 *   Protege los endpoints de los módulos de Servicio Técnico, Venta Directa,
 *   Clientes y Alertas, de modo que sólo un usuario con sesión válida pueda
 *   consultarlos o modificarlos. Además exige el rol ADMINISTRADOR, que es el
 *   único rol implementado en esta fase y el que posee permisos globales.
 *
 * PROPÓSITO TÉCNICO:
 *   · `exigirSesion`     -> valida el token `Authorization: Bearer <token>`
 *     y coloca los datos del usuario en `req.usuarioAutenticado` para que los
 *     controladores puedan firmar el kádex con el usuario real (en lugar del
 *     usuario 1 fijo que usaba la FASE I).
 *   · `exigirAdministrador` -> además comprueba que el rol sea 'administrador'.
 *
 *   Ambos responden SIEMPRE en JSON con `exito: false`, respetando el contrato
 *   de errores que ya consume el interceptor de Axios del frontend:
 *     401 -> no hay sesión o el token expiró (el frontend redirige al login).
 *     403 -> hay sesión pero el rol no tiene permiso.
 * ==========================================================================
 */
import { verificarTokenSesion, extraerTokenDePeticion } from '../utils/utilidadesSeguridad.js';
import { UsuarioModel } from '../models/usuarioModel.js';

/** Roles del sistema */
export const ROLES = Object.freeze({
  ADMINISTRADOR: 'administrador',
  TECNICO: 'tecnico',
  CAJERO: 'cajero',
  ALMACENISTA: 'almacenista'
});

/** Rol con permisos globales sobre todos los módulos del sistema. */
export const ROL_ADMINISTRADOR = 'administrador';

/**
 * MIDDLEWARE 1 · Exige una sesión válida.
 *
 * PROPÓSITO TÉCNICO: además de validar la FIRMA del token, se consulta la base
 * de datos para comprobar que el usuario SIGUE ACTIVO. Esto es importante
 * porque un token puede ser criptográficamente válido pero pertenecer a un
 * usuario que el administrador dio de baja lógica mientras la sesión seguía
 * abierta.
 */
export const exigirSesion = async (req, res, siguiente) => {
  try {
    const token = extraerTokenDePeticion(req);
    const contenidoToken = verificarTokenSesion(token);

    // ---- Token ausente, manipulado o expirado ----
    if (!contenidoToken) {
      return res.status(401).json({
        exito: false,
        mensaje: 'Su sesión no es válida o ha expirado. Inicie sesión nuevamente.',
        codigoHttp: 401
      });
    }

    // ---- Se confirma contra la base de datos que el usuario sigue vigente ----
    const usuario = await UsuarioModel.obtenerPorId(contenidoToken.sub);

    if (!usuario) {
      return res.status(401).json({
        exito: false,
        mensaje: 'El usuario de la sesión ya no existe en el sistema.',
        codigoHttp: 401
      });
    }

    if (Number(usuario.estado) !== 1) {
      return res.status(403).json({
        exito: false,
        mensaje: 'Su usuario está inactivo. Contacte al administrador del sistema.',
        codigoHttp: 403
      });
    }

    /*
     * Se publica el usuario autenticado en la petición. Los controladores y
     * modelos lo usan para firmar el kádex (`movimiento_inventario.id_usuario`)
     * y las ventas/órdenes con el usuario REAL que ejecutó la operación.
     */
    req.usuarioAutenticado = usuario;

    return siguiente();
  } catch (error) {
    console.error('Error en exigirSesion:', error);

    return res.status(500).json({
      exito: false,
      mensaje: 'Error interno al validar la sesión del usuario.',
      codigoHttp: 500
    });
  }
};

/**
 * MIDDLEWARE 2 · Exige el rol ADMINISTRADOR (permisos globales).
 * Se declara DESPUÉS de `exigirSesion`, que es quien rellena `req.usuarioAutenticado`.
 */
export const exigirAdministrador = (req, res, siguiente) => {
  const rolUsuario = String(req.usuarioAutenticado?.tipo_usuario || '').toLowerCase();

  if (rolUsuario !== ROL_ADMINISTRADOR) {
    return res.status(403).json({
      exito: false,
      mensaje: 'Acceso denegado: esta operación requiere el rol Administrador.',
      codigoHttp: 403
    });
  }

  return siguiente();
};

/**
 * MIDDLEWARE FLEXIBLE · Exige uno de los roles autorizados.
 * El rol Administrador siempre tiene acceso garantizado a cualquier endpoint.
 *
 * @param {...string} rolesPermitidos Lista de nombres de rol autorizados
 */
export const exigirRol = (...rolesPermitidos) => {
  const rolesNormalizados = rolesPermitidos.map((r) => String(r).toLowerCase());

  return (req, res, siguiente) => {
    const rolUsuario = String(req.usuarioAutenticado?.tipo_usuario || '').toLowerCase();

    // El Administrador siempre tiene acceso, o si el rol coincide con la lista
    if (rolUsuario === ROL_ADMINISTRADOR || rolesNormalizados.includes(rolUsuario)) {
      return siguiente();
    }

    return res.status(403).json({
      exito: false,
      mensaje: `Acceso denegado: su rol "${rolUsuario}" no tiene permisos para esta operación.`,
      codigoHttp: 403
    });
  };
};

/**
 * COMBINACIÓN PRÁCTICA: sesión válida + lista de roles autorizados.
 *
 *   router.use(...permitirRoles('administrador', 'cajero'));
 */
export const permitirRoles = (...roles) => [exigirSesion, exigirRol(...roles)];

/**
 * COMBINACIÓN PRÁCTICA: sesión válida + rol administrador.
 * Se exporta como arreglo para poder inyectarlo directamente en una ruta:
 *
 *     router.get('/', ...exigirAdministradorAutenticado, MiControlador.get);
 */
export const exigirAdministradorAutenticado = [exigirSesion, exigirAdministrador];
