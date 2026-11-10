/**
 * ==========================================================================
 * ESTADO GLOBAL DE SESIÓN (sesion.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Estado compartido de la aplicación (Módulo 1 · LOGIN)
 *
 * PROPÓSITO FUNCIONAL:
 *   Mantiene en un único lugar la información del usuario que tiene la sesión
 *   abierta, para que TODOS los componentes puedan consultarla sin pasarse
 *   propiedades de unos a otros:
 *
 *     · `sesion.usuario`         -> ficha del administrador autenticado.
 *     · `sesion.estaAutenticado` -> atajo booleano para la interfaz.
 *     · `sesion.iniciales`       -> "PC" para el avatar del Topbar.
 *
 * PROPÓSITO TÉCNICO:
 *   - El TOKEN de sesión se guarda en `localStorage` mediante
 *     `guardarToken`/`obtenerToken`/`eliminarToken`, de modo que la sesión
 *     sobreviva a una recarga de la página (F5).
 *   - La ficha del usuario se conserva también en `localStorage` para poder
 *     restaurar la interfaz de inmediato, y luego se REVALIDA contra el backend
 *     con `GET /autenticacion/perfil`. Si el token ya no sirve, se cierra la
 *     sesión automáticamente.
 *   - Se usa `reactive` en lugar de Pinia porque el proyecto no incluye un
 *     gestor de estado: así se evita agregar una dependencia nueva.
 * ==========================================================================
 */
import { reactive, computed } from 'vue';

/** Claves de almacenamiento local (nombradas con el prefijo del sistema). */
const CLAVE_TOKEN = 'tekzon_token_sesion';
const CLAVE_USUARIO = 'tekzon_usuario_sesion';

// ==========================================================================
// PERSISTENCIA DEL TOKEN Y DEL USUARIO
// ==========================================================================

/** Guarda el token de sesión en el navegador. */
export const guardarToken = (token) => {
  if (token) localStorage.setItem(CLAVE_TOKEN, token);
};

/** Recupera el token de sesión almacenado (o `null` si no hay sesión). */
export const obtenerToken = () => localStorage.getItem(CLAVE_TOKEN);

/** Elimina el token de sesión del navegador. */
export const eliminarToken = () => {
  localStorage.removeItem(CLAVE_TOKEN);
};

/** Guarda la ficha del usuario para restaurar la interfaz tras un F5. */
const guardarUsuarioAlmacenado = (usuario) => {
  if (usuario) localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
};

/** Recupera la ficha del usuario almacenada (o `null`). */
const obtenerUsuarioAlmacenado = () => {
  const textoUsuario = localStorage.getItem(CLAVE_USUARIO);

  if (!textoUsuario) return null;

  try {
    return JSON.parse(textoUsuario);
  } catch {
    // El contenido estaba corrupto: se descarta para no romper el arranque.
    localStorage.removeItem(CLAVE_USUARIO);
    return null;
  }
};

// ==========================================================================
// ESTADO REACTIVO DE LA SESIÓN
// ==========================================================================

/**
 * Estado global (singleton del módulo). Al importarlo desde cualquier
 * componente se comparte SIEMPRE la misma instancia.
 */
export const sesion = reactive({
  /** Ficha del usuario autenticado ({ id_usuario, nombre, username, rol }). */
  usuario: obtenerUsuarioAlmacenado(),

  /** Token de sesión vigente. */
  token: obtenerToken(),

  /** true mientras se revalida la sesión contra el backend al arrancar. */
  verificandoSesion: false,

  /** Último error de autenticación (lo muestra la pantalla de Login). */
  ultimoError: null
});

/** ¿Hay una sesión con token almacenado? */
export const estaAutenticado = computed(() => Boolean(sesion.token));

/** ¿El usuario de la sesión tiene el rol Administrador? */
export const esAdministrador = computed(
  () => String(sesion.usuario?.rol || '').toLowerCase() === 'administrador'
);

/** ¿El usuario de la sesión tiene el rol Cajero? */
export const esCajero = computed(() => {
  const rol = String(sesion.usuario?.rol || '').toLowerCase();
  return rol === 'cajero' || rol === 'caja';
});

/** ¿El usuario de la sesión tiene el rol Técnico? */
export const esTecnico = computed(() => {
  const rol = String(sesion.usuario?.rol || '').toLowerCase();
  return rol === 'tecnico' || rol === 'técnico';
});

/**
 * Valida si un rol tiene permiso para acceder a una ruta específica.
 * - Administrador: acceso total.
 * - Cajero: dashboard (/resumen), caja (/caja), ventas (/ventas), recepción de equipos (/recepcion).
 * - Técnico: panel del técnico (/ordenes), dispositivos (/dispositivos).
 */
export const tieneAccesoRuta = (ruta, rolInput) => {
  const rol = String(rolInput || sesion.usuario?.rol || '').toLowerCase();
  if (!rol) return false;
  if (rol === 'administrador') return true;

  if (rol === 'cajero' || rol === 'caja') {
    return ['/resumen', '/caja', '/ventas', '/recepcion'].includes(ruta);
  }

  if (rol === 'tecnico' || rol === 'técnico') {
    return ['/ordenes', '/dispositivos'].includes(ruta);
  }

  if (rol === 'almacenista') {
    return ['/resumen', '/inventario', '/movimientos', '/categorias', '/alertas', '/proveedores'].includes(ruta);
  }

  return false;
};

/**
 * Devuelve la ruta inicial por defecto según el rol del usuario.
 */
export const rutaInicioSegunRol = (rolInput) => {
  const rol = String(rolInput || sesion.usuario?.rol || '').toLowerCase();
  if (rol === 'tecnico' || rol === 'técnico') return '/ordenes';
  return '/resumen';
};

/**
 * INICIALES DEL USUARIO para el avatar del Topbar.
 * "Paola Cordero" -> "PC". Si no hay nombre, se usa el nombre de acceso.
 */
export const inicialesUsuario = computed(() => {
  const nombreCompleto = String(sesion.usuario?.nombre || sesion.usuario?.username || '').trim();

  if (!nombreCompleto) return 'US';

  return nombreCompleto
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra.charAt(0).toUpperCase())
    .join('');
});

/** Texto legible del rol para mostrar en la interfaz. */
export const etiquetaRol = computed(() => {
  const rol = String(sesion.usuario?.rol || '').toLowerCase();

  if (rol === 'administrador') return 'Administrador';
  if (rol === 'almacenista') return 'Almacenista';
  if (rol === 'tecnico') return 'Técnico';
  if (rol === 'cajero') return 'Cajero';

  return 'Usuario';
});

// ==========================================================================
// OPERACIONES SOBRE LA SESIÓN
// ==========================================================================

/**
 * REGISTRA UNA SESIÓN INICIADA.
 * Se llama desde el servicio de autenticación cuando el login responde 200.
 */
export const iniciarSesionLocal = (token, usuario) => {
  sesion.token = token;
  sesion.usuario = usuario;
  sesion.ultimoError = null;

  guardarToken(token);
  guardarUsuarioAlmacenado(usuario);
};

/**
 * CIERRA LA SESIÓN EN EL NAVEGADOR.
 * PROPÓSITO TÉCNICO: el token firmado es auto-contenido (el servidor no guarda
 * estado de sesión), por lo que el cierre consiste en eliminar el token y la
 * ficha del usuario del almacenamiento local.
 */
export const cerrarSesionLocal = () => {
  sesion.token = null;
  sesion.usuario = null;
  sesion.ultimoError = null;

  eliminarToken();
  localStorage.removeItem(CLAVE_USUARIO);
};

/** Actualiza la ficha del usuario (por ejemplo tras consultar el perfil). */
export const actualizarUsuarioSesion = (usuario) => {
  sesion.usuario = usuario;
  guardarUsuarioAlmacenado(usuario);
};

export default {
  sesion,
  estaAutenticado,
  esAdministrador,
  esCajero,
  esTecnico,
  tieneAccesoRuta,
  rutaInicioSegunRol,
  inicialesUsuario,
  etiquetaRol,
  iniciarSesionLocal,
  cerrarSesionLocal,
  actualizarUsuarioSesion,
  guardarToken,
  obtenerToken,
  eliminarToken
};
