/**
 * ==========================================================================
 * MODELO DE CAJA (cajaModel.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Acceso a datos (Data Access Layer) · Módulo 2 (Caja)
 *
 * PROPÓSITO FUNCIONAL:
 *   Administra la tabla `caja`, el turno de trabajo donde se registran los
 *   cobros. Toda venta directa y todo cobro de servicio técnico apuntan a una
 *   caja abierta mediante la llave foránea `pago.id_caja`, de modo que al final
 *   del día el administrador pueda hacer el arqueo (cierre de caja) y comparar
 *   lo que dice el sistema con el dinero real en el cajón.
 *
 * PROPÓSITO TÉCNICO:
 *   · `id_caja` es AUTO_INCREMENT (habilitado en la migración 005).
 *   · `estado` sólo admite 'ABIERTA' o 'CERRADA'.
 *   · `obtenerCajaAbierta` es la consulta clave: el flujo de cobro la usa para
 *     saber en qué turno registrar el dinero cuando el usuario no indica una
 *     caja explícitamente.
 * ==========================================================================
 */
import pool from '../config/db.js';

/** Estados válidos de una caja. */
export const ESTADOS_CAJA = Object.freeze({
  ABIERTA: 'ABIERTA',
  CERRADA: 'CERRADA'
});

/** Columnas de la caja enriquecidas con el usuario responsable del turno. */
const COLUMNAS_CAJA = `
  c.id_caja,
  c.monto_apertura,
  c.monto_cierre,
  c.estado,
  c.fecha_apertura,
  c.fecha_cierre,
  c.id_usuario,
  c.observaciones,
  u.nombre_usuario,
  u.username
`;

/**
 * Subconsultas SQL que calculan en tiempo real los totales de cada caja:
 * - total_ventas: suma de facturas filtradas por la sesión actual y con estado "Vigente".
 * - total_servicios: suma de pagos de órdenes de servicio técnico en esa caja.
 * - total_recaudado: total ventas vigentes + total servicios.
 * - total_pagos: cantidad de transacciones del turno.
 */
const SUBCONSULTAS_TOTALES_CAJA = `
  (SELECT COALESCE(SUM(v.monto_total), 0)
     FROM venta v
    WHERE (v.id_caja = c.id_caja OR (v.id_caja IS NULL AND v.num_factura IN (SELECT p2.venta_num_factura FROM pago p2 WHERE p2.id_caja = c.id_caja)))
      AND (v.estado = 1 OR v.estado = '1' OR v.estado = 'Vigente')) AS total_ventas,
  (SELECT COALESCE(SUM(p.monto_usd), 0)
     FROM pago p
    WHERE p.id_caja = c.id_caja
      AND p.tipo_origen = 'SERVICIO_TECNICO') AS total_servicios,
  (
    (SELECT COALESCE(SUM(v.monto_total), 0)
       FROM venta v
      WHERE (v.id_caja = c.id_caja OR (v.id_caja IS NULL AND v.num_factura IN (SELECT p2.venta_num_factura FROM pago p2 WHERE p2.id_caja = c.id_caja)))
        AND (v.estado = 1 OR v.estado = '1' OR v.estado = 'Vigente'))
    +
    (SELECT COALESCE(SUM(p.monto_usd), 0)
       FROM pago p
      WHERE p.id_caja = c.id_caja
        AND p.tipo_origen = 'SERVICIO_TECNICO')
  ) AS total_recaudado,
  (
    (SELECT COUNT(DISTINCT v.num_factura)
       FROM venta v
      WHERE (v.id_caja = c.id_caja OR (v.id_caja IS NULL AND v.num_factura IN (SELECT p2.venta_num_factura FROM pago p2 WHERE p2.id_caja = c.id_caja)))
        AND (v.estado = 1 OR v.estado = '1' OR v.estado = 'Vigente'))
    +
    (SELECT COUNT(*)
       FROM pago p
      WHERE p.id_caja = c.id_caja
        AND p.tipo_origen = 'SERVICIO_TECNICO')
  ) AS total_pagos
`;

export const CajaModel = {
  /**
   * LISTA DE CAJAS con el total recaudado en cada turno.
   *
   * PROPÓSITO FUNCIONAL: alimenta la pantalla de Caja con el resumen de cada
   * turno, sumando las ventas vigentes por ID de sesión y los cobros de servicio técnico.
   */
  async listarCajas() {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_CAJA},
              ${SUBCONSULTAS_TOTALES_CAJA}
         FROM caja c
         LEFT JOIN usuario u ON u.id_usuario = c.id_usuario
        ORDER BY c.estado ASC, c.id_caja DESC`
    );

    return filas;
  },

  /** Recupera una caja por su llave primaria con todos sus totales calculados. */
  async obtenerPorId(id_caja) {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_CAJA},
              ${SUBCONSULTAS_TOTALES_CAJA}
         FROM caja c
         LEFT JOIN usuario u ON u.id_usuario = c.id_usuario
        WHERE c.id_caja = ?`,
      [id_caja]
    );

    return filas[0];
  },

  /**
   * RECUPERA LA CAJA ABIERTA MÁS RECIENTE CON SUS TOTALES EN VIVO.
   * Es la caja activa consumida por la pantalla de cierre de caja.
   */
  async obtenerCajaAbierta() {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_CAJA},
              ${SUBCONSULTAS_TOTALES_CAJA}
         FROM caja c
         LEFT JOIN usuario u ON u.id_usuario = c.id_usuario
        WHERE c.estado = 'ABIERTA'
        ORDER BY c.id_caja DESC
        LIMIT 1`
    );

    return filas[0];
  },

  /**
   * ABRE UN NUEVO TURNO DE CAJA.
   *
   * PROPÓSITO FUNCIONAL: el administrador declara el fondo inicial con el que
   * comienza el día. El turno queda en estado 'ABIERTA' y desde ese momento
   * todos los cobros se acumulan en él.
   */
  async abrirCaja({ monto_apertura, id_usuario, observaciones }) {
    const [resultado] = await pool.query(
      `INSERT INTO caja
         (monto_apertura, monto_cierre, estado, fecha_apertura, id_usuario, observaciones)
       VALUES (?, NULL, 'ABIERTA', CURRENT_TIMESTAMP, ?, ?)`,
      [monto_apertura, id_usuario, observaciones]
    );

    return await this.obtenerPorId(resultado.insertId);
  },

  /**
   * CIERRA UN TURNO DE CAJA (arqueo).
   *
   * PROPÓSITO FUNCIONAL: se declara el monto contado físicamente y el sistema
   * calcula la DIFERENCIA contra el total de ventas vigentes filtradas por
   * la sesión actual (más servicios técnicos).
   */
  async cerrarCaja(id_caja, { monto_cierre, observaciones }) {
    // Primero se calcula lo que el sistema espera tener en esa caja (ventas vigentes + servicios)
    const [filasVentas] = await pool.query(
      `SELECT COALESCE(SUM(v.monto_total), 0) AS total_ventas
         FROM venta v
        WHERE (v.id_caja = ? OR (v.id_caja IS NULL AND v.num_factura IN (SELECT p.venta_num_factura FROM pago p WHERE p.id_caja = ?)))
          AND (v.estado = 1 OR v.estado = '1' OR v.estado = 'Vigente')`,
      [id_caja, id_caja]
    );

    const [filasServicios] = await pool.query(
      `SELECT COALESCE(SUM(p.monto_usd), 0) AS total_servicios
         FROM pago p
        WHERE p.id_caja = ? AND p.tipo_origen = 'SERVICIO_TECNICO'`,
      [id_caja]
    );

    const totalVentas = Number(filasVentas[0]?.total_ventas || 0);
    const totalServicios = Number(filasServicios[0]?.total_servicios || 0);
    const totalRecaudado = Number((totalVentas + totalServicios).toFixed(2));
    const diferencia = Number((Number(monto_cierre) - totalRecaudado).toFixed(2));

    const [resultado] = await pool.query(
      `UPDATE caja
          SET monto_cierre  = ?,
              estado        = 'CERRADA',
              fecha_cierre  = CURRENT_TIMESTAMP,
              observaciones = ?
        WHERE id_caja = ? AND estado = 'ABIERTA'`,
      [monto_cierre, observaciones, id_caja]
    );

    // Cero filas afectadas significa que la caja no existía o ya estaba cerrada.
    if (resultado.affectedRows === 0) return null;

    return {
      caja: await this.obtenerPorId(id_caja),
      total_recaudado: totalRecaudado,
      total_ventas: totalVentas,
      total_servicios: totalServicios,
      diferencia,
      tipo_diferencia: diferencia === 0 ? 'CUADRADA' : (diferencia > 0 ? 'SOBRANTE' : 'FALTANTE')
    };
  },

  /**
   * DETALLE DE LOS PAGOS DE UNA CAJA (arqueo detallado).
   * Devuelve cada cobro con su origen, método de pago y documento asociado,
   * respetando el estado vigente de las ventas del turno.
   */
  async listarPagosDeCaja(id_caja) {
    const [filas] = await pool.query(
      `SELECT COALESCE(p.id_pago, 0) AS id_pago,
              'VENTA' AS tipo_origen,
              COALESCE(p.metodo_pago, 'EFECTIVO') AS metodo_pago,
              v.monto_total AS monto_usd,
              COALESCE(p.tasa_cambio, 1.00) AS tasa_cambio,
              COALESCE(p.referencia, '') AS referencia,
              COALESCE(p.fecha_pago, v.fecha_venta) AS fecha_pago,
              v.num_factura AS venta_num_factura,
              NULL AS id_ordentec,
              c.nombre_cliente,
              c.apellido_cliente
         FROM venta v
         LEFT JOIN pago p           ON p.venta_num_factura = v.num_factura
         LEFT JOIN cliente c        ON c.cedula_cli = v.cedula_cli
        WHERE (v.id_caja = ? OR (v.id_caja IS NULL AND p.id_caja = ?))
          AND (v.estado = 1 OR v.estado = '1' OR v.estado = 'Vigente')
        UNION ALL
        SELECT p.id_pago,
              p.tipo_origen,
              p.metodo_pago,
              p.monto_usd,
              p.tasa_cambio,
              p.referencia,
              p.fecha_pago,
              NULL AS venta_num_factura,
              p.id_ordentec,
              c.nombre_cliente,
              c.apellido_cliente
         FROM pago p
         LEFT JOIN orden_tecnico o  ON o.id_ordentec  = p.id_ordentec
         LEFT JOIN dispositivo d    ON d.id_dispositivo = o.id_dispositivo
         LEFT JOIN cliente c        ON c.cedula_cli = d.cedula_cli
        WHERE p.id_caja = ? AND p.tipo_origen = 'SERVICIO_TECNICO'
        ORDER BY fecha_pago DESC`,
      [id_caja, id_caja, id_caja]
    );

    return filas;
  },

  /**
   * RESUMEN DE COBROS POR MÉTODO DE PAGO.
   * Agrupa las ventas vigentes por ID de sesión y servicios técnicos por método de pago.
   */
  async resumirPagosPorMetodo(id_caja) {
    const [filas] = await pool.query(
      `SELECT metodo_pago,
              COUNT(*)                    AS total_operaciones,
              COALESCE(SUM(monto), 0)     AS total_usd
         FROM (
           SELECT 
             COALESCE(p.metodo_pago, 'EFECTIVO') AS metodo_pago,
             v.monto_total AS monto
           FROM venta v
           LEFT JOIN pago p ON p.venta_num_factura = v.num_factura
           WHERE (v.id_caja = ? OR (v.id_caja IS NULL AND p.id_caja = ?))
             AND (v.estado = 1 OR v.estado = '1' OR v.estado = 'Vigente')
           UNION ALL
           SELECT 
             p.metodo_pago,
             p.monto_usd AS monto
           FROM pago p
           WHERE p.id_caja = ? AND p.tipo_origen = 'SERVICIO_TECNICO'
         ) AS operaciones
        GROUP BY metodo_pago
        ORDER BY total_usd DESC`,
      [id_caja, id_caja, id_caja]
    );

    return filas;
  }
};

export default CajaModel;
