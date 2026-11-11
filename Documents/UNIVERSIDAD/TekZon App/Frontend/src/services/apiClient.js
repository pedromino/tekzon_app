/**
 * ==========================================================================
 * CLIENTE AXIOS CENTRALIZADO (apiClient.js) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Define la conexión única hacia el API RESTful del backend y centraliza
 *   el manejo de errores para que TODOS los servicios del sistema reciban
 *   mensajes en español listos para el Toast.
 *
 * PROPÓSITO TÉCNICO:
 *   - `baseURL` leído de `VITE_API_URL` (archivo .env) con respaldo en
 *     http://localhost:3000/api, evitando direcciones codificadas en duro.
 *
 *   - INTERCEPTOR DE PETICIÓN: adjunta el TOKEN DE SESIÓN en el encabezado
 *     `Authorization: Bearer <token>` (Módulo 1 · LOGIN) y mantiene el
 *     encabezado heredado `X-Usuario-Responsable` que firma los movimientos del
 *     kádex cuando la petición la hace un usuario ya autenticado.
 *
 *   - INTERCEPTOR DE RESPUESTA: normaliza cualquier fallo a un objeto
 *     { mensaje, codigoHttp, esErrorConexion } y, ante un 401 (sesión expirada
 *     o token inválido), CIERRA LA SESIÓN y redirige al Login. Así el sistema
 *     nunca se queda "colgado" mostrando errores de permisos en cada pantalla.
 * ==========================================================================
 */
import axios from 'axios';
import { obtenerToken, cerrarSesionLocal } from './sesion';

/**
 * Identificador del usuario por defecto (almacenista sembrado por la
 * migración 004). Se conserva para los módulos del inventario de la FASE I,
 * que firman el kádex con este encabezado. Cuando hay sesión iniciada se usa el
 * identificador del usuario autenticado.
 */
export const ID_USUARIO_RESPONSABLE = Number(import.meta.env.VITE_ID_USUARIO || 1);

const clienteApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  },
  timeout: 15000 // Tiempo máximo de espera de 15 segundos
});

/**
 * INTERCEPTOR DE PETICIÓN
 * 1. Adjunta el token de sesión (Bearer) para los módulos protegidos.
 * 2. Mantiene el encabezado de trazabilidad del almacén.
 */
clienteApi.interceptors.request.use(
  (configuracion) => {
    const token = obtenerToken();

    // Sólo se envía el encabezado si realmente hay una sesión iniciada.
    if (token) {
      configuracion.headers.Authorization = `Bearer ${token}`;
    }

    configuracion.headers['X-Usuario-Responsable'] = String(ID_USUARIO_RESPONSABLE);

    return configuracion;
  },
  (error) => Promise.reject(error)
);

/**
 * INTERCEPTOR DE RESPUESTA
 *
 * PROPÓSITO FUNCIONAL: convierte cualquier fallo de red o del servidor en un
 * objeto uniforme { mensaje, codigoHttp, esErrorConexion } para que las
 * páginas de Vue puedan mostrar el estado de Error sin repetir lógica.
 */
clienteApi.interceptors.response.use(
  // Caso exitoso: se devuelve la respuesta tal cual la espera cada servicio.
  (respuesta) => respuesta,

  (error) => {
    // 1. El servidor respondió con un código de error (400 / 401 / 403 / 404 / 409 / 500).
    if (error.response) {
      const { status, data } = error.response;

      /*
       * SESIÓN EXPIRADA O INVÁLIDA (401).
       *
       * PROPÓSITO FUNCIONAL: si el token caducó (8 horas) o fue manipulado,
       * cualquier petición fallará. En lugar de mostrar un error en cada
       * pantalla, se limpia la sesión del navegador y se redirige al Login con
       * un aviso. Se usa `window.location` (y no el router) porque el módulo de
       * Axios no debe depender del enrutador, evitando importaciones circulares.
       *
       * IMPORTANTE: el 401 del propio endpoint de login NO debe redirigir
       * (significa "contraseña incorrecta"), por eso se excluye esa ruta.
       */
      const esRutaLogin = String(error.config?.url || '').includes('/autenticacion/login');

      if (status === 401 && !esRutaLogin) {
        cerrarSesionLocal();

        // Se evita un bucle de recargas si ya estamos en la pantalla de acceso.
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login?sesion=expirada';
        }
      }

      return Promise.reject({
        codigoHttp: status,
        // El backend siempre envía `mensaje`; si no, se usa un texto genérico.
        mensaje: data?.mensaje || `El servidor respondió con el código ${status}.`,
        detalle: data?.detalle || null,
        camposFaltantes: data?.camposFaltantes || [],
        esErrorConexion: false
      });
    }

    // 2. La petición se envió pero no hubo respuesta (servidor caído / CORS).
    if (error.request) {
      return Promise.reject({
        codigoHttp: 0,
        mensaje: 'No se pudo contactar con el servidor de TekZon. Verifique que el backend esté en ejecución.',
        detalle: error.message,
        camposFaltantes: [],
        esErrorConexion: true
      });
    }

    // 3. Fallo al construir la petición.
    return Promise.reject({
      codigoHttp: 0,
      mensaje: 'Ocurrió un error inesperado al preparar la solicitud.',
      detalle: error.message,
      camposFaltantes: [],
      esErrorConexion: true
    });
  }
);

export default clienteApi;
