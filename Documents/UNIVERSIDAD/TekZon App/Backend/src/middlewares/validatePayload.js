/**
 * ==========================================================================
 * MIDDLEWARE DE VALIDACIÓN DE PAYLOAD (validatePayload.js) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Rechaza de forma temprana las peticiones que no traen los campos
 *   obligatorios, devolviendo un HTTP 400 con el detalle exacto de lo que
 *   falta. Evita que un payload incompleto llegue hasta MySQL y provoque un
 *   error 500 poco descriptivo para el usuario final.
 *
 * PROPÓSITO TÉCNICO:
 *   Fábrica de middlewares (patrón decorador). Se invoca con la lista de
 *   campos requeridos y opcionalmente los nombres alternos aceptados por el
 *   mapeo DTO del servicio. Ejemplo de uso en un router:
 *
 *     router.post('/',
 *       validarCamposRequeridos([
 *         { campo: 'cod_producto', alternos: ['codigo'] },
 *         { campo: 'nombre_producto', alternos: ['nombre'] }
 *       ]),
 *       ProductoController.postProducto
 *     );
 *
 *   Un campo se considera ausente cuando llega `undefined`, `null` o una
 *   cadena vacía / sólo espacios.
 * ==========================================================================
 */

/**
 * Determina si un valor está vacío (undefined, null, '' , sólo espacios o un
 * arreglo sin elementos).
 *
 * PROPÓSITO TÉCNICO: el caso ARREGLO es importante para el Módulo de Venta
 * Directa: un carrito `[]` es técnicamente "un valor presente", pero no
 * contiene ningún producto que facturar, por lo que debe considerarse ausente y
 * rechazarse con un 400 explicativo antes de llegar al servicio.
 */
const estaVacio = (valor) => {
  if (valor === undefined || valor === null) return true;
  if (Array.isArray(valor)) return valor.length === 0;
  if (typeof valor === 'string') return valor.trim() === '';
  return false;
};

/**
 * Construye el middleware de validación.
 * @param {Array<{campo: string, alternos?: string[], etiqueta?: string}>} camposRequeridos
 * @returns {import('express').RequestHandler}
 */
export const validarCamposRequeridos = (camposRequeridos = []) => {
  return (req, res, siguiente) => {
    const camposFaltantes = [];

    camposRequeridos.forEach(({ campo, alternos = [], etiqueta }) => {
      const nombresPosibles = [campo, ...alternos];

      // El campo se da por presente si CUALQUIERA de sus alias trae valor.
      const tieneValor = nombresPosibles.some((nombre) => !estaVacio(req.body?.[nombre]));

      if (!tieneValor) {
        camposFaltantes.push(etiqueta || campo);
      }
    });

    if (camposFaltantes.length > 0) {
      return res.status(400).json({
        exito: false,
        mensaje: `Faltan campos obligatorios: ${camposFaltantes.join(', ')}.`,
        camposFaltantes,
        codigoHttp: 400
      });
    }

    return siguiente();
  };
};

export default validarCamposRequeridos;
