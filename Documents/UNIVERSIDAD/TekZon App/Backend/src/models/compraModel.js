/**
 * ==========================================================================
 * MODELO DE COMPRA (compraModel.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Acceso a datos (Data Access Layer) · Módulo de Compras a Proveedores
 *
 * PROPÓSITO FUNCIONAL:
 *   Gestiona la persistencia de las compras y facturas de adquisición
 *   en las tablas `compra` y `detalle_compra`.
 * ==========================================================================
 */
import pool from '../config/db.js';

export const CompraModel = {
  /**
   * REGISTRA UNA COMPRA CON SU DETALLE EN LA BASE DE DATOS.
   *
   * @param {Object} datosCompra
   * @param {string} datosCompra.num_factura - Número de factura del proveedor.
   * @param {string} datosCompra.rif_proveedor - RIF del proveedor.
   * @param {number|null} datosCompra.id_usuario - Usuario que registra la compra.
   * @param {number} datosCompra.monto_total - Total facturado.
   * @param {string} [datosCompra.observaciones]
   * @param {Array<Object>} itemsDetalle - Lista de ítems adquiridos ({ cod_producto, cantidad, precio_costo_unitario, subtotal }).
   * @param {Object} [conexionTransaccional] - Conexión de pool abierta para transacciones.
   */
  async registrarCompraConDetalle(
    { num_factura, rif_proveedor, id_usuario = null, monto_total = 0, observaciones = '' },
    itemsDetalle = [],
    conexionTransaccional = null
  ) {
    const ejecutor = conexionTransaccional || pool;

    const sqlCompra = `
      INSERT INTO compra (
        num_factura,
        rif_proveedor,
        id_usuario,
        fecha_compra,
        monto_total,
        observaciones
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `;

    const [resCompra] = await ejecutor.query(sqlCompra, [
      num_factura,
      rif_proveedor,
      id_usuario || null,
      monto_total,
      observaciones || null
    ]);

    const idCompra = resCompra.insertId;

    if (Array.isArray(itemsDetalle) && itemsDetalle.length > 0) {
      const sqlDetalle = `
        INSERT INTO detalle_compra (
          id_compra,
          cod_producto,
          cantidad,
          precio_costo_unitario,
          subtotal
        ) VALUES (?, ?, ?, ?, ?)
      `;

      for (const item of itemsDetalle) {
        const cantidad = Number(item.cantidad || 1);
        const costo = Number(item.precio_costo_unitario || item.costo || 0);
        const subtotal = Number(item.subtotal ?? (cantidad * costo));

        await ejecutor.query(sqlDetalle, [
          idCompra,
          item.cod_producto,
          cantidad,
          costo,
          subtotal
        ]);
      }
    }

    return { id_compra: idCompra, num_factura, rif_proveedor, monto_total };
  },

  /**
   * OBTIENE EL HISTORIAL DE COMPRAS ASOCIADO A UN PRODUCTO.
   *
   * @param {string} codProducto
   */
  async obtenerComprasPorProducto(codProducto) {
    const sql = `
      SELECT
        c.id_compra,
        c.num_factura,
        c.fecha_compra,
        c.rif_proveedor,
        p.nombre_proveedor,
        dc.cantidad,
        dc.precio_costo_unitario,
        dc.subtotal
      FROM detalle_compra dc
      INNER JOIN compra c ON c.id_compra = dc.id_compra
      INNER JOIN proveedor p ON p.rif_proveedor = c.rif_proveedor
      WHERE dc.cod_producto = ?
      ORDER BY c.fecha_compra DESC
    `;

    const [filas] = await pool.query(sql, [codProducto]);
    return filas;
  }
};

export default CompraModel;
