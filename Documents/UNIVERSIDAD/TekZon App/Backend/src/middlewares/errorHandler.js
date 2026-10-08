/**
 * ==========================================================================
 * MANEJADOR CENTRALIZADO DE ERRORES (errorHandler.js) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Garantiza que TODA respuesta del API salga en formato JSON con un código
 *   HTTP semántico, incluso cuando la petición apunta a un endpoint que no
 *   existe o cuando una excepción no prevista escapa de un controlador.
 *
 * PROPÓSITO TÉCNICO:
 *   Express identifica un middleware de error por su firma de CUATRO
 *   argumentos (error, req, res, siguiente). Los dos manejadores aquí
 *   exportados se registran en `server.js` DESPUÉS de todas las rutas:
 *
 *     1. `manejadorRutaNoEncontrada` -> responde 404 Not Found en JSON.
 *     2. `manejadorErroresGlobal`    -> responde 500 Internal Server Error,
 *        traduciendo errores conocidos del driver MySQL a códigos 400/409
 *        cuando corresponden a datos del cliente y no a fallos del servidor.
 * ==========================================================================
 */

/**
 * Códigos de error del driver mysql2 y su traducción al protocolo HTTP.
 * ER_DUP_ENTRY  : violación de índice UNIQUE -> 409 Conflict.
 * ER_NO_REFERENCED_ROW_2 : FK inexistente -> 400 Bad Request.
 * ER_ROW_IS_REFERENCED_2 : FK en uso (borrado físico bloqueado) -> 409 Conflict.
 * ER_BAD_NULL_ERROR / ER_DATA_TOO_LONG : datos inválidos -> 400 Bad Request.
 */
const CODIGOS_MYSQL_A_HTTP = {
  ER_DUP_ENTRY: { codigoHttp: 409, mensaje: 'El registro ya existe: se violó una restricción de unicidad.' },
  ER_NO_REFERENCED_ROW_2: { codigoHttp: 400, mensaje: 'La referencia indicada no existe en la base de datos.' },
  ER_ROW_IS_REFERENCED_2: { codigoHttp: 409, mensaje: 'El registro está referenciado por otros datos y no puede eliminarse físicamente.' },
  ER_BAD_NULL_ERROR: { codigoHttp: 400, mensaje: 'Falta un campo obligatorio en la petición.' },
  ER_DATA_TOO_LONG: { codigoHttp: 400, mensaje: 'Uno de los valores enviados excede la longitud permitida.' },
  ER_TRUNCATED_WRONG_VALUE: { codigoHttp: 400, mensaje: 'Uno de los valores enviados tiene un formato inválido.' }
};

/**
 * Middleware 404: se ejecuta cuando ninguna ruta declarada coincide con la
 * URL solicitada.
 */
export const manejadorRutaNoEncontrada = (req, res) => {
  res.status(404).json({
    exito: false,
    mensaje: `El endpoint ${req.method} ${req.originalUrl} no existe en el API de TekZon C.A.`,
    codigoHttp: 404
  });
};

/**
 * Middleware 500: captura cualquier excepción no controlada por los
 * controladores y la serializa como JSON.
 */
export const manejadorErroresGlobal = (error, req, res, siguiente) => {
  // Si la respuesta ya empezó a enviarse, se delega en Express para no
  // romper el flujo HTTP (doble envío de cabeceras).
  if (res.headersSent) {
    return siguiente(error);
  }

  const traduccion = CODIGOS_MYSQL_A_HTTP[error.code];

  if (traduccion) {
    return res.status(traduccion.codigoHttp).json({
      exito: false,
      mensaje: traduccion.mensaje,
      detalle: error.sqlMessage || error.message,
      codigoHttp: traduccion.codigoHttp
    });
  }

  // Error de JSON malformado enviado por el cliente (express.json).
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      exito: false,
      mensaje: 'El cuerpo de la petición no es un JSON válido.',
      codigoHttp: 400
    });
  }

  console.error('Excepción no controlada:', error);

  return res.status(500).json({
    exito: false,
    mensaje: 'Error interno del servidor. Contacte al administrador del sistema.',
    detalle: error.sqlMessage || error.message,
    codigoHttp: 500
  });
};
