/**
 * ==========================================================================
 * MODELO DE PROVEEDOR (proveedorModel.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Acceso a datos (Data Access Layer) · Módulo de Proveedores y Compras
 *
 * PROPÓSITO FUNCIONAL:
 *   Gestiona la persistencia de los proveedores comerciales de la empresa
 *   en la tabla `proveedor` de la base de datos `tekzon_bd`.
 *
 * PROPÓSITO TÉCNICO:
 *   La clave primaria es el RIF (`rif_proveedor`, VARCHAR 20).
 *   Soporta listado con filtros (texto libre, solo activos), consulta por RIF,
 *   inserción, actualización y alternancia de estado (activo/inactivo).
 * ==========================================================================
 */
import pool from '../config/db.js';

export const ProveedorModel = {
  /**
   * LISTADO DE PROVEEDORES con filtros opcionales.
   *
   * @param {Object} [filtros]
   * @param {string} [filtros.texto] Búsqueda por RIF o Nombre.
   * @param {boolean} [filtros.soloActivos] Filtra solo proveedores con estado = 1.
   */
  async listarProveedores({ texto, soloActivos = false } = {}) {
    const condiciones = [];
    const parametros = [];

    if (soloActivos) {
      condiciones.push('p.estado = 1');
    }

    if (texto && String(texto).trim()) {
      const criterio = `%${String(texto).trim()}%`;
      condiciones.push('(p.rif_proveedor LIKE ? OR p.nombre_proveedor LIKE ? OR p.telefono_proveedor LIKE ?)');
      parametros.push(criterio, criterio, criterio);
    }

    const whereSql = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const sql = `
      SELECT
        p.rif_proveedor,
        p.nombre_proveedor,
        p.telefono_proveedor,
        p.direccion_proveedor,
        p.estado,
        (SELECT COUNT(*) FROM compra c WHERE c.rif_proveedor = p.rif_proveedor) AS total_compras
      FROM proveedor p
      ${whereSql}
      ORDER BY p.nombre_proveedor ASC
    `;

    const [filas] = await pool.query(sql, parametros);
    return filas;
  },

  /**
   * OBTIENE UN PROVEEDOR POR SU RIF.
   *
   * @param {string} rif
   * @returns {Promise<Object|null>}
   */
  async obtenerPorRif(rif) {
    const sql = `
      SELECT
        p.rif_proveedor,
        p.nombre_proveedor,
        p.telefono_proveedor,
        p.direccion_proveedor,
        p.estado,
        (SELECT COUNT(*) FROM compra c WHERE c.rif_proveedor = p.rif_proveedor) AS total_compras
      FROM proveedor p
      WHERE p.rif_proveedor = ?
      LIMIT 1
    `;

    const [filas] = await pool.query(sql, [rif]);
    return filas[0] || null;
  },

  /**
   * VERIFICA SI EXISTE UN RIF EN LA BASE DE DATOS.
   *
   * @param {string} rif
   * @returns {Promise<boolean>}
   */
  async existeRif(rif) {
    const sql = 'SELECT 1 FROM proveedor WHERE rif_proveedor = ? LIMIT 1';
    const [filas] = await pool.query(sql, [rif]);
    return filas.length > 0;
  },

  /**
   * INSERTA UN NUEVO PROVEEDOR.
   *
   * @param {Object} datos
   * @param {string} datos.rif_proveedor
   * @param {string} datos.nombre_proveedor
   * @param {string} [datos.telefono_proveedor]
   * @param {string} [datos.direccion_proveedor]
   * @param {number} [datos.estado]
   */
  async crearProveedor({ rif_proveedor, nombre_proveedor, telefono_proveedor = '', direccion_proveedor = '', estado = 1 }) {
    const sql = `
      INSERT INTO proveedor (
        rif_proveedor,
        nombre_proveedor,
        telefono_proveedor,
        direccion_proveedor,
        estado
      ) VALUES (?, ?, ?, ?, ?)
    `;

    await pool.query(sql, [
      rif_proveedor,
      nombre_proveedor,
      telefono_proveedor || null,
      direccion_proveedor || null,
      estado
    ]);

    return await this.obtenerPorRif(rif_proveedor);
  },

  /**
   * ACTUALIZA LOS DATOS DE UN PROVEEDOR.
   *
   * @param {string} rif
   * @param {Object} datos
   */
  async actualizarProveedor(rif, { nombre_proveedor, telefono_proveedor, direccion_proveedor, estado }) {
    const sql = `
      UPDATE proveedor
      SET
        nombre_proveedor = ?,
        telefono_proveedor = ?,
        direccion_proveedor = ?,
        estado = ?
      WHERE rif_proveedor = ?
    `;

    await pool.query(sql, [
      nombre_proveedor,
      telefono_proveedor || null,
      direccion_proveedor || null,
      estado,
      rif
    ]);

    return await this.obtenerPorRif(rif);
  },

  /**
   * CAMBIA EL ESTADO DE UN PROVEEDOR (Habilitar / Deshabilitar).
   *
   * @param {string} rif
   * @param {number} nuevoEstado (1 o 0)
   */
  async cambiarEstado(rif, nuevoEstado) {
    const sql = 'UPDATE proveedor SET estado = ? WHERE rif_proveedor = ?';
    await pool.query(sql, [nuevoEstado, rif]);
    return await this.obtenerPorRif(rif);
  }
};

export default ProveedorModel;
