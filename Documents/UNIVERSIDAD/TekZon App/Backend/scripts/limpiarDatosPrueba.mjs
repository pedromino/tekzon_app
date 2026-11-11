/**
 * ==========================================================================
 * LIMPIEZA DE DATOS DE PRUEBA (limpiarDatosPrueba.mjs) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Elimina TODOS los registros temporales que crean las baterías de prueba y
 *   deja la base `tekzon_bd` en su estado real de operación:
 *
 *     1. Módulo de Inventario (FASE I) -> registros con prefijo `PRUEBA-%`
 *        (productos, categorías y sus asientos del kádex).
 *     2. Módulos nuevos (FASE II)     -> datos del cliente de prueba
 *        (`V-99999999`): órdenes, facturas, pagos, dispositivos y equipo.
 *     3. Restaura la existencia y el stock mínimo del producto REAL
 *        `REP-PAN-001`, que las pruebas modifican para provocar la alerta.
 *     4. Reinicia los correlativos de facturas y órdenes a cero.
 *
 * PROPÓSITO TÉCNICO:
 *   Se ejecuta con Node.js y el driver `mysql2` que YA incluye el backend, en
 *   lugar de invocar al cliente `mysql.exe`: así el script funciona sin depender
 *   de que MySQL/MariaDB esté instalado en una ruta concreta (el script anterior
 *   asumía `C:\xampp\mysql\bin\mysql.exe`).
 *
 *   El ORDEN de borrado respeta las llaves foráneas: primero las tablas hijas
 *   (detalle, pago, movimiento) y al final las padres (orden, venta, dispositivo,
 *   cliente). De lo contrario MySQL rechazaría el DELETE con un error 1451.
 *
 *   USO:
 *     cd Backend
 *     node scripts/limpiarDatosPrueba.mjs
 *     node scripts/limpiarDatosPrueba.mjs V-12345678     (otra cédula de prueba)
 * ==========================================================================
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

/** Cédula del cliente que crean las pruebas de integración de los módulos nuevos. */
const CEDULA_PRUEBA = process.argv[2] || 'V-99999999';

/**
 * Producto REAL del catálogo que las pruebas usan para provocar la alerta de
 * stock mínimo. Al terminar se restaura a su estado original.
 */
const PRODUCTO_DE_PRUEBA = process.env.COD_PRODUCTO || 'REP-PAN-001';
const EXISTENCIA_ORIGINAL = 30;
const STOCK_MINIMO_ORIGINAL = 1;

/**
 * Ejecuta una sentencia y reporta cuántas filas afectó.
 * @returns {Promise<number>} Filas afectadas.
 */
const ejecutarBorrado = async (conexion, descripcion, sentencia, parametros) => {
  const [resultado] = await conexion.query(sentencia, parametros);
  console.log(`  ${String(resultado.affectedRows).padStart(3, ' ')} fila(s)  ${descripcion}`);
  return resultado.affectedRows;
};

const limpiar = async () => {
  console.log('='.repeat(74));
  console.log(' LIMPIEZA DE DATOS DE PRUEBA · TEKZON C.A.');
  console.log('='.repeat(74));

  const conexion = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
  });

  try {
    /* ==================================================================
     * PARTE 1 · DATOS DE LOS MÓDULOS NUEVOS (FASE II)
     * ================================================================== */
    console.log(`\n[1] Módulos nuevos · cliente de prueba ${CEDULA_PRUEBA}`);
    console.log('-'.repeat(74));

    // Se identifican primero los documentos (órdenes y facturas) del cliente.
    const [ordenes] = await conexion.query(
      `SELECT o.id_ordentec
         FROM orden_tecnico o
         INNER JOIN dispositivo d ON d.id_dispositivo = o.id_dispositivo
        WHERE d.cedula_cli = ?`,
      [CEDULA_PRUEBA]
    );

    const [ventas] = await conexion.query(
      'SELECT num_factura FROM venta WHERE cedula_cli = ?',
      [CEDULA_PRUEBA]
    );

    const idsOrdenes = ordenes.map((o) => o.id_ordentec);
    const numerosFactura = ventas.map((v) => v.num_factura);

    console.log(`  Órdenes encontradas : ${idsOrdenes.length}`);
    console.log(`  Facturas encontradas: ${numerosFactura.length}`);

    // ---- 1.1 Órdenes de servicio técnico ----
    if (idsOrdenes.length > 0) {
      const marcadores = idsOrdenes.map(() => '?').join(', ');

      await ejecutarBorrado(conexion, 'detalle_orden (repuestos consumidos)',
        `DELETE FROM detalle_orden WHERE id_ordentec IN (${marcadores})`, idsOrdenes);

      await ejecutarBorrado(conexion, 'pago (cobros de servicio técnico)',
        `DELETE FROM pago WHERE id_ordentec IN (${marcadores})`, idsOrdenes);

      // Los asientos del kádex guardan el número de orden dentro del `motivo`.
      for (const idOrden of idsOrdenes) {
        await ejecutarBorrado(conexion, `movimiento_inventario (${idOrden})`,
          'DELETE FROM movimiento_inventario WHERE motivo LIKE ?', [`%${idOrden}%`]);
      }

      await ejecutarBorrado(conexion, 'orden_tecnico',
        `DELETE FROM orden_tecnico WHERE id_ordentec IN (${marcadores})`, idsOrdenes);
    }

    // ---- 1.2 Facturas de venta directa ----
    if (numerosFactura.length > 0) {
      const marcadores = numerosFactura.map(() => '?').join(', ');

      await ejecutarBorrado(conexion, 'detalle_factura (líneas vendidas)',
        `DELETE FROM detalle_factura WHERE num_factura IN (${marcadores})`, numerosFactura);

      await ejecutarBorrado(conexion, 'pago (cobros de venta directa)',
        `DELETE FROM pago WHERE venta_num_factura IN (${marcadores})`, numerosFactura);

      for (const numFactura of numerosFactura) {
        await ejecutarBorrado(conexion, `movimiento_inventario (${numFactura})`,
          'DELETE FROM movimiento_inventario WHERE motivo LIKE ?', [`%${numFactura}%`]);
      }

      await ejecutarBorrado(conexion, 'venta (facturas)',
        `DELETE FROM venta WHERE num_factura IN (${marcadores})`, numerosFactura);
    }

    // ---- 1.3 Alertas de stock generadas por esas operaciones ----
    const documentos = [...idsOrdenes, ...numerosFactura];

    if (documentos.length > 0) {
      const marcadores = documentos.map(() => '?').join(', ');
      await ejecutarBorrado(conexion, 'alerta_stock',
        `DELETE FROM alerta_stock WHERE documento IN (${marcadores})`, documentos);
    }

    // ---- 1.4 Dispositivos y cliente de prueba ----
    await ejecutarBorrado(conexion, 'dispositivo (equipos de prueba)',
      'DELETE FROM dispositivo WHERE cedula_cli = ?', [CEDULA_PRUEBA]);

    await ejecutarBorrado(conexion, 'cliente (cliente de prueba)',
      'DELETE FROM cliente WHERE cedula_cli = ?', [CEDULA_PRUEBA]);

    // ---- 1.5 Asientos de la preparación de la prueba ----
    await ejecutarBorrado(conexion, 'movimiento_inventario (preparación)',
      'DELETE FROM movimiento_inventario WHERE motivo LIKE ?',
      ['%prueba de integración de los módulos nuevos%']);

    /* ==================================================================
     * PARTE 2 · DATOS DEL MÓDULO DE INVENTARIO (FASE I)
     * ================================================================== */
    console.log('\n[2] Módulo de inventario · registros con prefijo PRUEBA-');
    console.log('-'.repeat(74));

    // El orden importa: primero las tablas hijas que referencian al producto.
    await ejecutarBorrado(conexion, 'detalle_orden (productos PRUEBA-)',
      'DELETE FROM detalle_orden WHERE cod_producto LIKE ?', ['PRUEBA-%']);

    await ejecutarBorrado(conexion, 'detalle_factura (productos PRUEBA-)',
      'DELETE FROM detalle_factura WHERE cod_producto LIKE ?', ['PRUEBA-%']);

    await ejecutarBorrado(conexion, 'alerta_stock (productos PRUEBA-)',
      'DELETE FROM alerta_stock WHERE cod_producto LIKE ?', ['PRUEBA-%']);

    await ejecutarBorrado(conexion, 'movimiento_inventario (kádex PRUEBA-)',
      "DELETE FROM movimiento_inventario WHERE cod_producto LIKE 'PRUEBA-%'", []);

    await ejecutarBorrado(conexion, 'producto (catálogo PRUEBA-)',
      "DELETE FROM producto WHERE cod_producto LIKE 'PRUEBA-%'", []);

    await ejecutarBorrado(conexion, 'categoria (categorías PRUEBA-)',
      "DELETE FROM categoria WHERE nombre_categoria LIKE 'PRUEBA-%'", []);

    /* ==================================================================
     * PARTE 3 · RESTAURACIÓN DEL PRODUCTO REAL Y DE LOS CORRELATIVOS
     * ================================================================== */
    console.log('\n[3] Restauración del producto real y de los correlativos');
    console.log('-'.repeat(74));

    // El producto real se devuelve a su existencia y umbral originales, y se
    // limpian los asientos de kádex y alertas que las pruebas le generaron.
    await conexion.query('DELETE FROM movimiento_inventario WHERE cod_producto = ?', [PRODUCTO_DE_PRUEBA]);
    await conexion.query('DELETE FROM alerta_stock WHERE cod_producto = ?', [PRODUCTO_DE_PRUEBA]);

    const [resultadoRestauracion] = await conexion.query(
      'UPDATE producto SET existencia = ?, stock_minimo = ? WHERE cod_producto = ?',
      [EXISTENCIA_ORIGINAL, STOCK_MINIMO_ORIGINAL, PRODUCTO_DE_PRUEBA]
    );

    console.log(`  ${String(resultadoRestauracion.affectedRows).padStart(3, ' ')} fila(s)  ${PRODUCTO_DE_PRUEBA} -> existencia ${EXISTENCIA_ORIGINAL}, mínimo ${STOCK_MINIMO_ORIGINAL}`);

    await conexion.query(
      "UPDATE secuencia_factura SET valor_actual = 0 WHERE nombre_secuencia IN ('FACTURA', 'ORDEN')"
    );
    console.log('    0 fila(s)  secuencia_factura (correlativos reiniciados a 0)');

    /* ==================================================================
     * PARTE 4 · RESUMEN DEL ESTADO FINAL
     * ================================================================== */
    console.log('\n[4] Estado final de la base de datos');
    console.log('-'.repeat(74));

    const tablas = [
      'cliente', 'dispositivo', 'orden_tecnico', 'detalle_orden',
      'venta', 'detalle_factura', 'pago', 'movimiento_inventario',
      'alerta_stock', 'producto', 'categoria', 'usuario'
    ];

    for (const tabla of tablas) {
      const [filas] = await conexion.query(`SELECT COUNT(*) AS total FROM ${tabla}`);
      console.log(`  ${tabla.padEnd(24)} ${String(filas[0].total).padStart(4, ' ')} fila(s)`);
    }

    console.log('\n' + '-'.repeat(74));
    console.log(' LIMPIEZA COMPLETADA. La base quedó lista para la sustentación.');
    console.log('='.repeat(74));
  } catch (error) {
    console.error('\n[ERROR] La limpieza se interrumpió:', error.sqlMessage || error.message);
    process.exitCode = 1;
  } finally {
    await conexion.end();
  }
};

limpiar();
