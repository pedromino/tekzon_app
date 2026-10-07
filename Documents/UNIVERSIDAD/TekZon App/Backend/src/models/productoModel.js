/**
 * ==========================================================================
 * MODELO DE PRODUCTO (PRODUCTOMODEL.JS) - TEKZON C.A.
 * ==========================================================================
 * Gestiona las consultas directas (SQL) a la base de datos relacional para
 * la tabla `producto`, incluyendo las nuevas columnas de la normalización 3FN.
 */
import pool from '../config/db.js';

export const ProductoModel = {
  // Obtener todos los productos del inventario
  async findAll() {
    const [filas] = await pool.query('SELECT * FROM producto');
    return filas;
  },

  // Buscar un producto específico por su código (Llave Primaria)
  async findByCode(cod_producto) {
    const [filas] = await pool.query('SELECT * FROM producto WHERE cod_producto = ?', [cod_producto]);
    return filas[0];
  },

  // Crear un nuevo producto en el inventario con todos sus atributos
  async create(datosProducto) {
    const { 
      cod_producto, 
      nombre_producto, 
      precio_costo, 
      precio_venta, 
      existencia, 
      id_categoria, 
      marca, 
      stock_minimo, 
      descripcion, 
      imagen 
    } = datosProducto;

    await pool.query(
      `INSERT INTO producto 
      (cod_producto, nombre_producto, precio_costo, precio_venta, existencia, id_categoria, marca, stock_minimo, descripcion, imagen) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cod_producto, nombre_producto, precio_costo, precio_venta, existencia, id_categoria, marca, stock_minimo, descripcion, imagen]
    );
    
    return { cod_producto, ...datosProducto };
  },

  // Actualizar la información comercial y operativa de un producto existente
  async update(cod_producto, datosActualizados) {
    const { 
      nombre_producto, 
      precio_costo, 
      precio_venta, 
      existencia,
      id_categoria,
      marca,
      stock_minimo,
      descripcion,
      imagen
    } = datosActualizados;

    await pool.query(
      `UPDATE producto 
       SET nombre_producto = ?, 
           precio_costo = ?, 
           precio_venta = ?, 
           existencia = ?, 
           id_categoria = ?, 
           marca = ?, 
           stock_minimo = ?, 
           descripcion = ?, 
           imagen = ? 
       WHERE cod_producto = ?`,
      [nombre_producto, precio_costo, precio_venta, existencia, id_categoria, marca, stock_minimo, descripcion, imagen, cod_producto]
    );
    
    return { cod_producto, ...datosActualizados };
  },

  // Dar de baja o eliminar físicamente un producto del inventario
  async remove(cod_producto) {
    const [resultado] = await pool.query('DELETE FROM producto WHERE cod_producto = ?', [cod_producto]);
    return resultado.affectedRows;
  }
};