/**
 * ==========================================================================
 * SERVICIO DE LÓGICA DE NEGOCIO (PRODUCTOSERVICE.JS) - BACKEND
 * ==========================================================================
 * Capa intermedia que adapta (Mapeo DTO) los datos que llegan del frontend
 * a los nombres de columnas exactos que exige MySQL.
 */
import { ProductoModel } from '../models/productoModel.js';

export const ProductoService = {
  async obtenerTodos() {
    return await ProductoModel.findAll();
  },

  async obtenerPorCodigo(codigo) {
    return await ProductoModel.findByCode(codigo);
  },

  async crear(datosFrontend) {
    // TRADUCCIÓN (DTO): Adaptamos las variables de Vue a las columnas de MySQL
    const payloadBD = {
      cod_producto: datosFrontend.codigo || datosFrontend.cod_producto,
      nombre_producto: datosFrontend.nombre || datosFrontend.nombre_producto,
      precio_costo: datosFrontend.costo || datosFrontend.precio_costo,
      precio_venta: datosFrontend.precio || datosFrontend.precio_venta,
      existencia: datosFrontend.stock || datosFrontend.existencia,
      id_categoria: datosFrontend.categoria || datosFrontend.id_categoria,
      marca: datosFrontend.marca,
      stock_minimo: datosFrontend.minimo || datosFrontend.stock_minimo,
      descripcion: datosFrontend.descripcion,
      imagen: datosFrontend.imagen
    };
    
    return await ProductoModel.create(payloadBD);
  },

  async actualizar(codigo, datosFrontend) {
    const payloadBD = {
      cod_producto: datosFrontend.codigo || datosFrontend.cod_producto,
      nombre_producto: datosFrontend.nombre || datosFrontend.nombre_producto,
      precio_costo: datosFrontend.costo || datosFrontend.precio_costo,
      precio_venta: datosFrontend.precio || datosFrontend.precio_venta,
      existencia: datosFrontend.stock || datosFrontend.existencia,
      id_categoria: datosFrontend.categoria || datosFrontend.id_categoria,
      marca: datosFrontend.marca,
      stock_minimo: datosFrontend.minimo || datosFrontend.stock_minimo,
      descripcion: datosFrontend.descripcion,
      imagen: datosFrontend.imagen
    };

    return await ProductoModel.update(codigo, payloadBD);
  },

  async eliminar(codigo) {
    return await ProductoModel.remove(codigo);
  }
};