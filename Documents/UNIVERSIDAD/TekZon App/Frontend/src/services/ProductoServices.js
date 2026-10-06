/**
 * ==========================================================================
 * SERVICIO DE PRODUCTOS E INVENTARIO (PRODUCTOSERVICES.JS) - TEKZON C.A.
 * ==========================================================================
 * Orquesta los métodos asíncronos para interactuar con la base de datos
 * relacional a través de los endpoints de la API RESTful.
 */
import apiClient from './apiClient';

export default {
  /**
   * GET /api/productos
   * Obtiene la lista completa de repuestos, accesorios y equipos activos.
   */
  async listarProductos() {
    const respuesta = await apiClient.get('/productos');
    return respuesta.data;
  },

  /**
   * GET /api/productos/:codigo
   * Consulta el detalle de un artículo específico por su código.
   */
  async obtenerProductoPorId(codigo) {
    const respuesta = await apiClient.get(`/productos/${codigo}`);
    return respuesta.data;
  },

  /**
   * POST /api/productos
   * Inserta un nuevo registro de repuesto o accesorio con validación de payload.
   */
  async crearProducto(datosProducto) {
    const respuesta = await apiClient.post('/productos', datosProducto);
    return respuesta.data;
  },

  /**
   * PUT /api/productos/:codigo
   * Actualiza la información comercial y de stock de un producto existente.
   */
  async actualizarProducto(codigo, datosActualizados) {
    const respuesta = await apiClient.put(`/productos/${codigo}`, datosActualizados);
    return respuesta.data;
  },

  /**
   * DELETE /api/productos/:codigo
   * Da de baja o elimina físicamente el registro del inventario.
   */
  async eliminarProducto(codigo) {
    const respuesta = await apiClient.delete(`/productos/${codigo}`);
    return respuesta.data;
  }
};