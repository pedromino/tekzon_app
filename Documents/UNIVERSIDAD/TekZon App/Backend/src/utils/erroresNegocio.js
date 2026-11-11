/**
 * ==========================================================================
 * ERRORES DE NEGOCIO COMPARTIDOS (erroresNegocio.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Utilidad transversal de la capa de servicios.
 *
 * PROPÓSITO FUNCIONAL:
 *   Representa un fallo provocado por los DATOS que envió el usuario (no por un
 *   defecto del servidor) y transporta el código HTTP con el que debe
 *   responderse. Ejemplos:
 *
 *     throw new ErrorNegocio('El cliente no existe.', 404);
 *     throw new ErrorNegocio('Stock insuficiente para el repuesto.', 400);
 *
 * PROPÓSITO TÉCNICO:
 *   Todos los servicios de los módulos nuevos lanzan el MISMO tipo de error, de
 *   modo que cada controlador puede traducirlo a HTTP con una única función
 *   genérica (`responderConError`) en lugar de repetir cinco bloques de
 *   `instanceof` distintos. Se conserva la propiedad `codigoHttp` que ya usaban
 *   los módulos de inventario (FASE I), manteniendo el contrato de la API.
 * ==========================================================================
 */
export class ErrorNegocio extends Error {
  /**
   * @param {string} mensaje    Mensaje en español listo para mostrar al usuario.
   * @param {number} codigoHttp Código HTTP semántico (400, 401, 403, 404, 409).
   * @param {string} [detalle]  Información técnica opcional para depuración.
   */
  constructor(mensaje, codigoHttp = 400, detalle = null) {
    super(mensaje);
    this.name = 'ErrorNegocio';
    this.codigoHttp = codigoHttp;
    this.detalle = detalle;
  }
}

/**
 * Traduce cualquier excepción al par (código HTTP, cuerpo JSON) correcto.
 *
 * PROPÓSITO TÉCNICO: función reutilizable por todos los controladores nuevos.
 *   · Si es un ErrorNegocio  -> se respeta el código HTTP que trae.
 *   · Cualquier otro error   -> se registra en consola y se responde 500.
 *
 * @param {import('express').Response} res       Respuesta de Express.
 * @param {Error} error                          Excepción capturada.
 * @param {string} operacion                     Ruta que falló (para el log).
 * @param {string} mensajeGenerico               Texto de respaldo para el 500.
 */
export const responderConError = (res, error, operacion, mensajeGenerico = 'Error interno del servidor.') => {
  // 1. Error de negocio previsto: se responde con su código HTTP semántico.
  if (error instanceof ErrorNegocio || Number.isInteger(error?.codigoHttp)) {
    return res.status(error.codigoHttp || 400).json({
      exito: false,
      mensaje: error.message,
      detalle: error.detalle || null,
      codigoHttp: error.codigoHttp || 400
    });
  }

  // 2. Error no previsto: se deja constancia en el log del servidor.
  console.error(`Error en ${operacion}:`, error);

  return res.status(500).json({
    exito: false,
    mensaje: mensajeGenerico,
    detalle: error.sqlMessage || error.message,
    codigoHttp: 500
  });
};

export default ErrorNegocio;
