/**
 * ==========================================================================
 * CONTROLADOR DE PRODUCTOS (productoController.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · CRUD 1
 *
 * PROPÓSITO FUNCIONAL:
 *   Expone los endpoints REST del Catálogo Maestro de Productos (CRUD 1).
 *   Recibe la petición HTTP, delega en `ProductoService` y responde con el
 *   código de estado correcto.
 *
 * PROPÓSITO TÉCNICO:
 *   Implementa los 3 estados de interfaz exigidos, reflejados en el protocolo:
 *     · Éxito            -> 200 OK / 201 Created.
 *     · Datos inválidos  -> 400 Bad Request.
 *     · No encontrado    -> 404 Not Found.
 *     · Fallo del motor  -> 500 Internal Server Error.
 *   El cuerpo de error siempre incluye `exito: false`, `mensaje` en español
 *   y `codigoHttp`, de modo que el Toast del frontend puede mostrar el
 *   mensaje y el código sin lógica adicional.
 * ==========================================================================
 */
import { ProductoService, ErrorNegocioProducto } from '../services/productoService.js';

/**
 * Traduce cualquier excepción al par (código HTTP, cuerpo JSON) correcto.
 * Se usa en los cinco endpoints para no duplicar el bloque de manejo.
 */
const responderConError = (res, error, operacion) => {
  if (error instanceof ErrorNegocioProducto) {
    return res.status(error.codigoHttp).json({
      exito: false,
      mensaje: error.message,
      codigoHttp: error.codigoHttp
    });
  }

  console.error(`Error en ${operacion}:`, error);

  return res.status(500).json({
    exito: false,
    mensaje: 'Error interno del servidor al procesar los productos.',
    detalle: error.sqlMessage || error.message,
    codigoHttp: 500
  });
};

export const ProductoController = {
  /**
   * GET /api/productos
   * GET /api/productos?incluirInactivos=true
   *
   * PROPÓSITO FUNCIONAL: alimenta la tabla/cards del CRUD 1 y los selectores
   * de producto de los CRUDs 2 y 3 (Kárdex y ajuste de stock).
   */
  async getProductos(req, res) {
    try {
      const valorParametro = String(req.query.incluirInactivos ?? '').toLowerCase();
      const incluirInactivos = valorParametro === 'true' || valorParametro === '1';

      // Si el usuario pide el histórico completo, se listan también los
      // productos con estado = 0.
      const listaProductos = await ProductoService.obtenerProductos(!incluirInactivos);

      return res.status(200).json({
        exito: true,
        total: listaProductos.length,
        productos: listaProductos
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/productos');
    }
  },

  /** GET /api/productos/:id -> detalle de un producto (404 si no existe). */
  async getProductoPorCodigo(req, res) {
    try {
      const producto = await ProductoService.obtenerProductoPorCodigo(req.params.id);

      return res.status(200).json({ exito: true, producto });
    } catch (error) {
      return responderConError(res, error, 'GET /api/productos/:id');
    }
  },

  /**
   * POST /api/productos
   *
   * PROPÓSITO FUNCIONAL (corrección docente): registra SÓLO la ficha técnica.
   * El stock queda en 0 sin importar lo que envíe el cliente; ver
   * `ProductoService.crearProducto`.
   */
  async postProducto(req, res) {
    try {
      const productoCreado = await ProductoService.crearProducto(req.body);

      return res.status(201).json({
        exito: true,
        mensaje: `Producto "${productoCreado.nombre_producto}" registrado con existencia inicial 0.`,
        producto: productoCreado
      });
    } catch (error) {
      return responderConError(res, error, 'POST /api/productos');
    }
  },

  /**
   * PUT /api/productos/:id
   * Actualiza la ficha técnica sin alterar la existencia física.
   */
  async putProducto(req, res) {
    try {
      const productoActualizado = await ProductoService.actualizarProducto(req.params.id, req.body);

      return res.status(200).json({
        exito: true,
        mensaje: 'Producto actualizado correctamente.',
        producto: productoActualizado
      });
    } catch (error) {
      return responderConError(res, error, 'PUT /api/productos/:id');
    }
  },

  /**
   * DELETE /api/productos/:id
   * Baja lógica del catálogo (estado = 0) para no romper las claves foráneas
   * de `movimiento_inventario`.
   */
  async deleteProducto(req, res) {
    try {
      const resultado = await ProductoService.desactivarProducto(req.params.id);

      return res.status(200).json({
        exito: true,
        mensaje: resultado.mensaje,
        producto: resultado
      });
    } catch (error) {
      return responderConError(res, error, 'DELETE /api/productos/:id');
    }
  },

  /** PATCH /api/productos/:id/reactivar -> restaura estado = 1. */
  async patchReactivarProducto(req, res) {
    try {
      const resultado = await ProductoService.reactivarProducto(req.params.id);

      return res.status(200).json({
        exito: true,
        mensaje: resultado.mensaje,
        producto: resultado
      });
    } catch (error) {
      return responderConError(res, error, 'PATCH /api/productos/:id/reactivar');
    }
  }
};
