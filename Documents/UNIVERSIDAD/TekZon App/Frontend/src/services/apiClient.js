/**
 * ==========================================================================
 * CLIENTE AXIOS CENTRALIZADO (apiClient.js) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Define la conexión única hacia el API RESTful del backend y centraliza
 *   el manejo de errores para que TODOS los servicios del módulo de
 *   inventario (CRUD 1 al 4) reciban mensajes en español listos para el Toast.
 *
 * PROPÓSITO TÉCNICO:
 *   - `baseURL` leído de `VITE_API_URL` (archivo .env) con respaldo en
 *     http://localhost:3000/api, evitando direcciones codificadas en duro.
 *   - Interceptor de respuesta: normaliza el error de Axios a un objeto con
 *     `codigoHttp` y `mensaje`, preservando los códigos 400 / 404 / 500 que
 *     exige la cátedra para los estados de Error de la interfaz.
 *   - Interceptor de petición: incorpora el usuario responsable (almacenista)
 *     en el encabezado, dejando el sistema listo para el módulo de
 *     autenticación de la FASE II.
 * ==========================================================================
 */
import axios from 'axios';

/**
 * Identificador del usuario por defecto (almacenista sembrado por la
 * migración 004). Se usa mientras el login no esté implementado.
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
 * Añade el encabezado con el usuario responsable de las operaciones de
 * almacén, de modo que el backend pueda firmar el kádex si se requiere.
 */
clienteApi.interceptors.request.use(
  (configuracion) => {
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
    // 1. El servidor respondió con un código de error (400 / 404 / 409 / 500).
    if (error.response) {
      const { status, data } = error.response;

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
