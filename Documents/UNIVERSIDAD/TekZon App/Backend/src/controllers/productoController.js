/**
 * ==========================================================================
 * CONTROLADOR DE PRODUCTOS (PRODUCTOCONTROLLER.JS)
 * ==========================================================================
 * Recibe las peticiones HTTP (req), orquesta la lógica con el servicio 
 * y devuelve la respuesta (res) al frontend.
 */
import { ProductoService } from '../services/productoService.js';

export const ProductoController = {
  async getProductos(req, res) {
    try {
      const productos = await ProductoService.obtenerTodos();
      res.status(200).json(productos);
    } catch (error) {
      console.error("Error en GET /productos:", error);
      res.status(500).json({ message: "Error interno del servidor al listar." });
    }
  },

  async getProductoById(req, res) {
    try {
      const producto = await ProductoService.obtenerPorCodigo(req.params.id);
      if (!producto) return res.status(404).json({ message: "Producto no encontrado." });
      res.status(200).json(producto);
    } catch (error) {
      res.status(500).json({ message: "Error al buscar el producto." });
    }
  },

  async createProducto(req, res) {
    try {
      // req.body trae los 10 campos empacados desde Vue/Axios
      const nuevoProducto = await ProductoService.crear(req.body);
      res.status(201).json(nuevoProducto);
    } catch (error) {
      console.error("Error en POST /productos:", error);
      // Devuelve 400 Bad Request si MySQL rechaza los datos
      res.status(400).json({ message: "Error al registrar el producto. Verifica los datos.", detalle: error.message });
    }
  },

  async updateProducto(req, res) {
    try {
      const actualizado = await ProductoService.actualizar(req.params.id, req.body);
      res.status(200).json(actualizado);
    } catch (error) {
      console.error("Error en PUT /productos:", error);
      res.status(422).json({ message: "Error al actualizar el producto." });
    }
  },

  async deleteProducto(req, res) {
    try {
      await ProductoService.eliminar(req.params.id);
      res.status(200).json({ message: "Producto eliminado correctamente." });
    } catch (error) {
      console.error("Error en DELETE /productos:", error);
      res.status(400).json({ message: "No se pudo eliminar el producto." });
    }
  }
};