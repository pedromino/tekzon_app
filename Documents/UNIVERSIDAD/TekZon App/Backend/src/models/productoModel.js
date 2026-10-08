/**
 * ==========================================================================
 * MODELO DE PRODUCTO (productoModel.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Acceso a datos (Data Access Layer)
 * CRUD: 1 (Catálogo Maestro de Productos) + 2 (ajuste de existencias)
 *
 * PROPÓSITO FUNCIONAL:
 *   Ejecuta las consultas SQL directas sobre la tabla `producto`, agrupando
 *   el catálogo maestro con su categoría (`JOIN categoria`) para que el
 *   frontend reciba el nombre legible de la clasificación y no sólo el ID.
 *
 * PROPÓSITO TÉCNICO:
 *   - Toda consulta de lectura entrega SIEMPRE las columnas reales de MySQL:
 *     cod_producto, nombre_producto, precio_costo, precio_venta, existencia,
 *     stock_minimo, id_categoria, marca, descripcion, imagen, estado.
 *   - El alta de producto (crearProducto) NO recibe `existencia`: la columna
 *     queda con su valor por defecto 0 definido en el DDL. El stock físico
 *     se modifica únicamente desde el kádex (CRUD 3) o el ajuste (CRUD 2).
 *   - La baja de producto es LÓGICA (estado = 0) para no romper las claves
 *     foráneas de `movimiento_inventario`, `detalle_factura` y `detalle_orden`.
 * ==========================================================================
 */
import pool from '../config/db.js';

/**
 * Lista base de columnas del producto con el nombre de su categoría.
 * Se reutiliza en todas las lecturas para garantizar que la respuesta de la
 * API tenga exactamente la misma forma (contrato estable para el frontend).
 */
const COLUMNAS_PRODUCTO = `
  p.cod_producto,
  p.nombre_producto,
  p.precio_costo,
  p.precio_venta,
  p.existencia,
  p.stock_minimo,
  p.id_categoria,
  c.nombre_categoria,
  p.marca,
  p.descripcion,
  p.imagen,
  p.estado
`;

export const ProductoModel = {
  /**
   * Recupera el catálogo maestro completo.
   * @param {Object} opciones
   * @param {boolean} opciones.soloActivos - Si es true filtra estado = 1.
   *   Se usa un LEFT JOIN para no perder productos cuya categoría haya sido
   *   dada de baja lógicamente.
   */
  async obtenerCatalogo({ soloActivos = false } = {}) {
    const filtroEstado = soloActivos ? 'WHERE p.estado = 1' : '';

    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_PRODUCTO}
         FROM producto p
         LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
         ${filtroEstado}
        ORDER BY p.nombre_producto ASC`
    );

    return filas;
  },

  /**
   * Busca un producto específico por su llave primaria (cod_producto).
   * Devuelve `undefined` cuando el código no existe, permitiendo que el
   * controlador responda con un HTTP 404 explícito.
   */
  async obtenerPorCodigo(cod_producto) {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_PRODUCTO}
         FROM producto p
         LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
        WHERE p.cod_producto = ?`,
      [cod_producto]
    );

    return filas[0];
  },

  /**
   * Verifica si un código de producto ya está registrado.
   * Se usa antes del INSERT para devolver un HTTP 400 con mensaje claro en
   * lugar de dejar que MySQL lance un error de llave duplicada (ER_DUP_ENTRY).
   */
  async existeCodigo(cod_producto) {
    const [filas] = await pool.query(
      'SELECT 1 FROM producto WHERE cod_producto = ? LIMIT 1',
      [cod_producto]
    );

    return filas.length > 0;
  },

  /**
   * Registra la FICHA TÉCNICA de un producto nuevo (CRUD 1).
   *
   * IMPORTANTE: la sentencia INSERT no incluye `existencia` ni `estado`.
   * Ambas columnas toman los valores por defecto del DDL (existencia = 0,
   * estado = 1), cumpliendo la corrección docente de que el stock NUNCA se
   * captura al dar de alta un artículo.
   */
  async crearProducto(datosProducto) {
    const {
      cod_producto,
      nombre_producto,
      precio_costo,
      precio_venta,
      id_categoria,
      marca,
      descripcion,
      imagen,
      stock_minimo
    } = datosProducto;

    await pool.query(
      `INSERT INTO producto
         (cod_producto, nombre_producto, precio_costo, precio_venta,
          id_categoria, marca, descripcion, imagen, stock_minimo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cod_producto,
        nombre_producto,
        precio_costo,
        precio_venta,
        id_categoria,
        marca,
        descripcion,
        imagen,
        stock_minimo
      ]
    );

    // Se relee el registro ya insertado para devolver a Vue la fila real de
    // la base de datos (incluyendo existencia = 0 y el nombre de categoría).
    return await this.obtenerPorCodigo(cod_producto);
  },

  /**
   * Actualiza la ficha técnica de un producto existente (CRUD 1).
   *
   * IMPORTANTE: la sentencia UPDATE no toca la columna `existencia`.
   * El stock físico es competencia exclusiva del CRUD 2 (ajuste justificado)
   * y del CRUD 3 (entradas/salidas del kádex), garantizando la trazabilidad.
   */
  async actualizarProducto(cod_producto, datosActualizados) {
    const {
      nombre_producto,
      precio_costo,
      precio_venta,
      id_categoria,
      marca,
      descripcion,
      imagen,
      stock_minimo
    } = datosActualizados;

    const [resultado] = await pool.query(
      `UPDATE producto
          SET nombre_producto = ?,
              precio_costo    = ?,
              precio_venta    = ?,
              id_categoria    = ?,
              marca           = ?,
              descripcion     = ?,
              imagen          = ?,
              stock_minimo    = ?
        WHERE cod_producto = ?`,
      [
        nombre_producto,
        precio_costo,
        precio_venta,
        id_categoria,
        marca,
        descripcion,
        imagen,
        stock_minimo,
        cod_producto
      ]
    );

    // Si no se afectó ninguna fila el código no existe -> el servicio lo
    // traduce en un HTTP 404.
    if (resultado.affectedRows === 0) return null;

    return await this.obtenerPorCodigo(cod_producto);
  },

  /**
   * BAJA LÓGICA del producto (estado = 0).
   *
   * Se evita el DELETE físico porque `movimiento_inventario` referencia a
   * `producto` con ON DELETE RESTRICT: un borrado real destruiría el
   * histórico del kádex y violaría la integridad referencial.
   */
  async desactivarProducto(cod_producto) {
    const [resultado] = await pool.query(
      'UPDATE producto SET estado = 0 WHERE cod_producto = ? AND estado = 1',
      [cod_producto]
    );

    return resultado.affectedRows;
  },

  /**
   * Reactiva un producto previamente dado de baja lógica (estado = 1).
   */
  async reactivarProducto(cod_producto) {
    const [resultado] = await pool.query(
      'UPDATE producto SET estado = 1 WHERE cod_producto = ? AND estado = 0',
      [cod_producto]
    );

    return resultado.affectedRows;
  }
};
