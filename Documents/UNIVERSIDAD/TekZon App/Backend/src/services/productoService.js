import { ProductoModel } from '../models/productoModel.js';

export const ProductoService = {
  async listarProductos() {
    return await ProductoModel.findAll();
  },

  async obtenerProductoPorId(id) {
    const producto = await ProductoModel.findByCode(id);
    if (!producto) {
      throw new Error('El producto no fue encontrado en el inventario.');
    }
    return producto;
  },

  async crearProducto(data) {
    // Validar si ya existe
    const existe = await ProductoModel.findByCode(data.cod_producto);
    if (existe) {
      throw new Error('Ya existe un producto registrado con ese código.');
    }
    return await ProductoModel.create(data);
  },

  async actualizarProducto(id, data) {
    await this.obtenerProductoPorId(id); // Lanza error si no existe
    return await ProductoModel.update(id, data);
  },

  async eliminarProducto(id) {
    await this.obtenerProductoPorId(id); // Lanza error si no existe
    return await ProductoModel.remove(id);
  }
};