import { ProductoService } from '../services/productoService.js';

export const ProductoController = {
  async getProductos(req, res) {
    try {
      const productos = await ProductoService.listarProductos();
      res.status(200).json(productos);
    } catch (error) {
      res.status(500).json({ mensaje: error.message });
    }
  },

  async getProductoById(req, res) {
    try {
      const producto = await ProductoService.obtenerProductoPorId(req.params.id);
      res.status(200).json(producto);
    } catch (error) {
      res.status(404).json({ mensaje: error.message });
    }
  },

  async createProducto(req, res) {
    try {
      const nuevoProducto = await ProductoService.crearProducto(req.body);
      res.status(201).json(nuevoProducto);
    } catch (error) {
      res.status(400).json({ mensaje: error.message });
    }
  },

  async updateProducto(req, res) {
    try {
      const productoActualizado = await ProductoService.actualizarProducto(req.params.id, req.body);
      res.status(200).json(productoActualizado);
    } catch (error) {
      res.status(400).json({ mensaje: error.message });
    }
  },

  async deleteProducto(req, res) {
    try {
      await ProductoService.eliminarProducto(req.params.id);
      res.status(200).json({ mensaje: 'Producto eliminado correctamente' });
    } catch (error) {
      res.status(404).json({ mensaje: error.message });
    }
  }
};