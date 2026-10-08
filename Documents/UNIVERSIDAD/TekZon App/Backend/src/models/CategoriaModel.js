/**
 * ==========================================================================
 * MODELO DE CATEGORÍA (CategoriaModel.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Acceso a datos (Data Access Layer)
 * CRUD: 4 (Registro y Gestión de Categorías de Productos)
 *
 * PROPÓSITO FUNCIONAL:
 *   Ejecuta las consultas SQL sobre la tabla `categoria`, que clasifica los
 *   repuestos, accesorios y equipos del catálogo maestro. Incluye el conteo
 *   de productos asociados para que el frontend advierta al usuario antes de
 *   desactivar una categoría en uso.
 *
 * PROPÓSITO TÉCNICO:
 *   - La eliminación es LÓGICA: `estado = 0`. Nunca se ejecuta un DELETE
 *     porque `producto.id_categoria` referencia a esta tabla mediante la
 *     llave foránea `fk_producto_categoria`; un borrado físico rompería la
 *     integridad referencial y dejaría productos huérfanos.
 *   - La columna `nombre_categoria` tiene índice UNIQUE, por lo que el modelo
 *     expone `existeNombre` para que el servicio pueda anticipar el HTTP 400
 *     en lugar de propagar el error ER_DUP_ENTRY de MySQL.
 * ==========================================================================
 */
import pool from '../config/db.js';

export const CategoriaModel = {
  /**
   * Lista todas las categorías con el número de productos que las usan.
   * @param {Object} opciones
   * @param {boolean} opciones.soloActivas - Si es true filtra estado = 1.
   *
   * PROPÓSITO TÉCNICO: el LEFT JOIN con subconsulta agregada permite mostrar
   * "N productos" por categoría sin lanzar una consulta por fila (evita el
   * problema N+1) y contabiliza únicamente productos vigentes.
   */
  async listar({ soloActivas = false } = {}) {
    const filtroEstado = soloActivas ? 'WHERE c.estado = 1' : '';

    const [filas] = await pool.query(
      `SELECT c.id_categoria,
              c.nombre_categoria,
              c.estado,
              COALESCE(conteo.total_productos, 0) AS total_productos
         FROM categoria c
         LEFT JOIN (
              SELECT id_categoria, COUNT(*) AS total_productos
                FROM producto
               WHERE estado = 1
               GROUP BY id_categoria
         ) AS conteo ON conteo.id_categoria = c.id_categoria
         ${filtroEstado}
        ORDER BY c.nombre_categoria ASC`
    );

    return filas;
  },

  /**
   * Busca una categoría por su llave primaria.
   * Devuelve `undefined` cuando no existe, habilitando el HTTP 404.
   */
  async obtenerPorId(id_categoria) {
    const [filas] = await pool.query(
      'SELECT id_categoria, nombre_categoria, estado FROM categoria WHERE id_categoria = ?',
      [id_categoria]
    );

    return filas[0];
  },

  /**
   * Detecta duplicados por nombre. Se usa `idExcluir` en la edición para que
   * una categoría no colisione consigo misma.
   */
  async existeNombre(nombre_categoria, idExcluir = null) {
    const [filas] = await pool.query(
      `SELECT id_categoria
         FROM categoria
        WHERE LOWER(nombre_categoria) = LOWER(?)
          AND (? IS NULL OR id_categoria <> ?)
        LIMIT 1`,
      [nombre_categoria, idExcluir, idExcluir]
    );

    return filas.length > 0 ? filas[0].id_categoria : null;
  },

  /**
   * Crea una categoría nueva. El campo `estado` se inicializa en 1 (activa)
   * mediante el valor por defecto del DDL.
   */
  async crear(nombre_categoria) {
    const [resultado] = await pool.query(
      'INSERT INTO categoria (nombre_categoria, estado) VALUES (?, 1)',
      [nombre_categoria]
    );

    return await this.obtenerPorId(resultado.insertId);
  },

  /**
   * Actualiza el nombre de una categoría existente.
   * Se permite renombrar incluso si estaba inactiva.
   */
  async actualizar(id_categoria, nombre_categoria) {
    const [resultado] = await pool.query(
      'UPDATE categoria SET nombre_categoria = ? WHERE id_categoria = ?',
      [nombre_categoria, id_categoria]
    );

    if (resultado.affectedRows === 0) return null;

    return await this.obtenerPorId(id_categoria);
  },

  /**
   * BAJA LÓGICA de la categoría (estado = 0).
   *
   * PROPÓSITO TÉCNICO: la cláusula `estado = 1` evita contar como éxito un
   * intento de desactivar algo ya desactivado, devolviendo affectedRows = 0
   * y permitiendo al servicio responder con un mensaje coherente.
   */
  async desactivar(id_categoria) {
    const [resultado] = await pool.query(
      'UPDATE categoria SET estado = 0 WHERE id_categoria = ? AND estado = 1',
      [id_categoria]
    );

    return resultado.affectedRows;
  },

  /**
   * Reactiva una categoría dada de baja lógica (estado = 1).
   */
  async reactivar(id_categoria) {
    const [resultado] = await pool.query(
      'UPDATE categoria SET estado = 1 WHERE id_categoria = ? AND estado = 0',
      [id_categoria]
    );

    return resultado.affectedRows;
  },

  /**
   * Cuenta cuántos productos ACTIVOS dependen de la categoría.
   * El servicio lo usa para informar el impacto de la baja lógica sin
   * bloquearla (los productos conservan su id_categoria y siguen operativos).
   */
  async contarProductosAsociados(id_categoria) {
    const [filas] = await pool.query(
      'SELECT COUNT(*) AS total FROM producto WHERE id_categoria = ? AND estado = 1',
      [id_categoria]
    );

    return Number(filas[0].total);
  }
};
