/**
 * ==========================================================================
 * CONTROLADOR DE CATEGORÍAS (categoriaController.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · CRUD 4
 *
 * PROPÓSITO FUNCIONAL:
 *   Expone los endpoints REST del CRUD 4 (Registro y Gestión de Categorías).
 *   Recibe la petición Express (req), delega la lógica en el servicio y
 *   construye la respuesta JSON (res) con el código HTTP adecuado.
 *
 * PROPÓSITO TÉCNICO:
 *   Toda ruta implementa los 3 estados exigidos por la cátedra:
 *     - Éxito  : 200 OK / 201 Created con el recurso serializado.
 *     - Error de cliente : 400 Bad Request (datos inválidos o duplicados)
 *                          404 Not Found (categoría inexistente).
 *     - Error de servidor: 500 Internal Server Error (fallo de MySQL).
 *   Los fallos se registran en consola con la operación exacta para
 *   facilitar la depuración durante la defensa del proyecto.
 * ==========================================================================
 */
import { CategoriaService, ErrorNegocioCategoria } from '../services/categoriaService.js';

/**
 * Traduce cualquier excepción al par (código HTTP, cuerpo JSON) correcto.
 * Se extrae a una función auxiliar para no duplicar el mismo bloque
 * try/catch en los cinco endpoints.
 */
const responderConError = (res, error, operacion) => {
  // Error de negocio controlado: se respeta el código HTTP que trae.
  if (error instanceof ErrorNegocioCategoria) {
    return res.status(error.codigoHttp).json({
      exito: false,
      mensaje: error.message,
      codigoHttp: error.codigoHttp
    });
  }

  // Error de infraestructura (MySQL caído, tabla inexistente, etc.).
  console.error(`Error en ${operacion}:`, error);

  return res.status(500).json({
    exito: false,
    mensaje: 'Error interno del servidor al procesar las categorías.',
    detalle: error.sqlMessage || error.message,
    codigoHttp: 500
  });
};

export const CategoriaController = {
  /**
   * GET /api/categorias
   * GET /api/categorias?soloActivas=true
   *
   * PROPÓSITO FUNCIONAL: alimenta la tabla del CRUD 4 (todas las categorías,
   * activas e inactivas) y el selector de categorías del ProductoModal
   * (solo las activas).
   */
  async getCategorias(req, res) {
    try {
      // El parámetro llega como texto en la query string; se normaliza a
      // booleano aceptando 'true' o '1'.
      const valorParametro = String(req.query.soloActivas ?? '').toLowerCase();
      const soloActivas = valorParametro === 'true' || valorParametro === '1';

      const listaCategorias = await CategoriaService.obtenerCategorias(soloActivas);

      return res.status(200).json({
        exito: true,
        total: listaCategorias.length,
        categorias: listaCategorias
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/categorias');
    }
  },

  /** GET /api/categorias/:id -> detalle de una categoría (404 si no existe). */
  async getCategoriaPorId(req, res) {
    try {
      const categoria = await CategoriaService.obtenerCategoriaPorId(req.params.id);

      return res.status(200).json({ exito: true, categoria });
    } catch (error) {
      return responderConError(res, error, 'GET /api/categorias/:id');
    }
  },

  /**
   * POST /api/categorias
   * Body esperado: { nombre_categoria: string }
   *
   * Devuelve 201 Created con la categoría recién insertada (con su id real
   * generado por AUTO_INCREMENT).
   */
  async postCategoria(req, res) {
    try {
      const categoriaCreada = await CategoriaService.crearCategoria(req.body);

      return res.status(201).json({
        exito: true,
        mensaje: `Categoría "${categoriaCreada.nombre_categoria}" registrada correctamente.`,
        categoria: categoriaCreada
      });
    } catch (error) {
      return responderConError(res, error, 'POST /api/categorias');
    }
  },

  /** PUT /api/categorias/:id -> renombra la categoría indicada. */
  async putCategoria(req, res) {
    try {
      const categoriaActualizada = await CategoriaService.actualizarCategoria(req.params.id, req.body);

      return res.status(200).json({
        exito: true,
        mensaje: 'Categoría actualizada correctamente.',
        categoria: categoriaActualizada
      });
    } catch (error) {
      return responderConError(res, error, 'PUT /api/categorias/:id');
    }
  },

  /**
   * DELETE /api/categorias/:id
   *
   * PROPÓSITO FUNCIONAL: ejecuta la BAJA LÓGICA (estado = 0) exigida por la
   * corrección docente. El registro permanece en la tabla para no romper la
   * llave foránea `fk_producto_categoria`.
   */
  async deleteCategoria(req, res) {
    try {
      const resultado = await CategoriaService.desactivarCategoria(req.params.id);

      return res.status(200).json({
        exito: true,
        mensaje: resultado.mensaje,
        categoria: resultado
      });
    } catch (error) {
      return responderConError(res, error, 'DELETE /api/categorias/:id');
    }
  },

  /** PATCH /api/categorias/:id/reactivar -> restaura estado = 1 (switch UI). */
  async patchReactivarCategoria(req, res) {
    try {
      const resultado = await CategoriaService.reactivarCategoria(req.params.id);

      return res.status(200).json({
        exito: true,
        mensaje: resultado.mensaje,
        categoria: resultado
      });
    } catch (error) {
      return responderConError(res, error, 'PATCH /api/categorias/:id/reactivar');
    }
  }
};
