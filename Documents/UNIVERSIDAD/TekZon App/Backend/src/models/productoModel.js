import pool from '../config/db.js';

export const ProductoModel = {
  // Obtener todos los productos del inventario
  async findAll() {
    const [rows] = await pool.query('SELECT * FROM producto');
    return rows;
  },

  // Buscar un producto por su código (PK)
  async findByCode(cod_producto) {
    const [rows] = await pool.query('SELECT * FROM producto WHERE cod_producto = ?', [cod_producto]);
    return rows[0];
  },

  // Crear un nuevo producto en el inventario
  async create(productoData) {
    const { cod_producto, nombre_producto, precio_costo, precio_venta, existencia } = productoData;
    await pool.query(
      'INSERT INTO producto (cod_producto, nombre_producto, precio_costo, precio_venta, existencia) VALUES (?, ?, ?, ?, ?)',
      [cod_producto, nombre_producto, precio_costo, precio_venta, existencia]
    );
    return { cod_producto, ...productoData };
  },

  // Actualizar un producto existente
  async update(cod_producto, productoData) {
    const { nombre_producto, precio_costo, precio_venta, existencia } = productoData;
    await pool.query(
      'UPDATE producto SET nombre_producto = ?, precio_costo = ?, precio_venta = ?, existencia = ? WHERE cod_producto = ?',
      [nombre_producto, precio_costo, precio_venta, existencia, cod_producto]
    );
    return { cod_producto, ...productoData };
  },

  // Eliminar un producto del inventario
  async remove(cod_producto) {
    const [result] = await pool.query('DELETE FROM producto WHERE cod_producto = ?', [cod_producto]);
    return result.affectedRows;
  }
};