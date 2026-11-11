/**
 * ==========================================================================
 * MODELO DE VENTA DIRECTA (ventaModel.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Acceso a datos (Data Access Layer) · Módulo 3 (Venta Directa)
 *
 * PROPÓSITO FUNCIONAL:
 *   Administra las TRES tablas del mostrador:
 *
 *     venta            -> la factura (PK num_factura, generada como "FAC-000001").
 *     detalle_factura  -> los productos vendidos con su cantidad y precio.
 *     pago             -> el cobro (método, monto, tasa, caja, referencia).
 *
 * PROPÓSITO TÉCNICO:
 *   `registrarVentaCompleta` es una operación de TRANSACCIÓN ÚNICA que ejecuta,
 *   en este orden exacto:
 *
 *     1. INSERT en `venta`            -> se abre la factura.
 *     2. Por cada producto:
 *          a. `MovimientoModel.descontarStockProducto` -> resta la existencia y
 *             escribe el asiento de SALIDA en el kádex con origen 'VENTA'.
 *          b. INSERT en `detalle_factura`            -> la línea facturada.
 *          c. `AlertaStockModel.registrarAlertaSiCorresponde` -> alerta si el
 *             producto llegó a su stock mínimo.
 *     3. INSERT en `pago`             -> el cobro.
 *     4. COMMIT
 *
 *   Si CUALQUIER producto no tiene stock suficiente, se hace ROLLBACK de todo:
 *   no puede quedar una factura a medias ni stock descontado sin documento.
 * ==========================================================================
 */
import pool from '../config/db.js';
import { MovimientoModel, ORIGENES_MOVIMIENTO } from './movimientoModel.js';
import { AlertaStockModel } from './alertaStockModel.js';

/** Columnas de la venta enriquecidas con el cliente y el usuario que la emitió. */
const COLUMNAS_VENTA = `
  v.num_factura,
  v.cedula_cli,
  v.monto_total,
  v.fecha_venta,
  v.tipo_venta,
  v.estado,
  v.id_usuario,
  v.id_caja,
  c.nombre_cliente,
  c.apellido_cliente,
  c.telefono_cliente,
  u.nombre_usuario AS nombre_cajero,
  u.username       AS username_cajero
`;

export const VentaModel = {
  /* ======================================================================
   * 1. LECTURAS
   * ====================================================================== */

  /**
   * LISTA DE VENTAS con filtros dinámicos (pantalla de Venta Directa e
   * histórico de facturación).
   *
   * @param {Object} filtros
   * @param {string} [filtros.texto]      Búsqueda libre (factura, cliente, cédula).
   * @param {string} [filtros.cedula]     Ventas de un cliente concreto.
   * @param {string} [filtros.fechaDesde] Rango inicial (YYYY-MM-DD).
   * @param {string} [filtros.fechaHasta] Rango final (YYYY-MM-DD).
   */
  async listarVentas({ texto, cedula, fechaDesde, fechaHasta } = {}) {
    const condiciones = [];
    const parametros = [];

    if (cedula) {
      condiciones.push('v.cedula_cli = ?');
      parametros.push(cedula);
    }

    if (fechaDesde) {
      condiciones.push('v.fecha_venta >= ?');
      parametros.push(`${fechaDesde} 00:00:00`);
    }

    if (fechaHasta) {
      condiciones.push('v.fecha_venta <= ?');
      parametros.push(`${fechaHasta} 23:59:59`);
    }

    if (texto) {
      condiciones.push(`(
        v.num_factura         LIKE ?
        OR c.nombre_cliente   LIKE ?
        OR c.apellido_cliente LIKE ?
        OR v.cedula_cli       LIKE ?
      )`);

      const patronBusqueda = `%${texto}%`;
      parametros.push(patronBusqueda, patronBusqueda, patronBusqueda, patronBusqueda);
    }

    const clausulaWhere = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_VENTA},
              (SELECT COUNT(*) FROM detalle_factura df WHERE df.num_factura = v.num_factura) AS total_lineas,
              (SELECT COALESCE(SUM(df.cantidad), 0)
                 FROM detalle_factura df WHERE df.num_factura = v.num_factura)                AS total_unidades,
              (SELECT p.metodo_pago FROM pago p
                WHERE p.venta_num_factura = v.num_factura LIMIT 1)                            AS metodo_pago
         FROM venta v
         LEFT JOIN cliente c ON c.cedula_cli = v.cedula_cli
         LEFT JOIN usuario u ON u.id_usuario = v.id_usuario
         ${clausulaWhere}
        ORDER BY v.fecha_venta DESC, v.num_factura DESC`,
      parametros
    );

    return filas;
  },

  /** Recupera la cabecera de una venta por su número de factura. */
  async obtenerPorFactura(num_factura) {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_VENTA}
         FROM venta v
         LEFT JOIN cliente c ON c.cedula_cli = v.cedula_cli
         LEFT JOIN usuario u ON u.id_usuario = v.id_usuario
        WHERE v.num_factura = ?`,
      [num_factura]
    );

    return filas[0];
  },

  /** LISTA LAS LÍNEAS (productos) DE UNA FACTURA. */
  async listarDetalle(num_factura) {
    const [filas] = await pool.query(
      `SELECT df.num_factura,
              df.cod_producto,
              p.nombre_producto,
              p.imagen,
              p.marca,
              p.existencia AS existencia_actual,
              df.cantidad,
              df.Precio_unitario AS precio_unitario,
              (df.cantidad * df.Precio_unitario) AS subtotal,
              -- Asiento del kádex que descontó este producto para esta factura.
              -- Permite demostrar en la interfaz que la salida quedó registrada
              -- con origen "Venta" (subconsulta para evitar el problema N+1).
              (SELECT m.origen
                 FROM movimiento_inventario m
                WHERE m.cod_producto = df.cod_producto
                  AND m.tipo_movimiento = 'SALIDA'
                  AND m.motivo LIKE CONCAT('%', df.num_factura, '%')
                ORDER BY m.id_movimiento DESC
                LIMIT 1) AS origen,
              (SELECT m.id_movimiento
                 FROM movimiento_inventario m
                WHERE m.cod_producto = df.cod_producto
                  AND m.tipo_movimiento = 'SALIDA'
                  AND m.motivo LIKE CONCAT('%', df.num_factura, '%')
                ORDER BY m.id_movimiento DESC
                LIMIT 1) AS id_movimiento
         FROM detalle_factura df
         INNER JOIN producto p ON p.cod_producto = df.cod_producto
        WHERE df.num_factura = ?
        ORDER BY p.nombre_producto ASC`,
      [num_factura]
    );

    // El motivo de la venta guarda siempre el número de factura ("... factura
    // FAC-000001"), por lo que la subconsulta localiza el asiento exacto.
    return filas.map((fila) => ({
      ...fila,
      origen: fila.origen || ORIGENES_MOVIMIENTO.VENTA
    }));
  },

  /** Recupera el pago asociado a una factura de venta directa. */
  async obtenerPagoDeFactura(num_factura) {
    const [filas] = await pool.query(
      `SELECT id_pago, metodo_pago, monto_usd, tasa_cambio, referencia,
              fecha_pago, tipo_origen, id_caja
         FROM pago
        WHERE venta_num_factura = ?
        ORDER BY id_pago DESC
        LIMIT 1`,
      [num_factura]
    );

    return filas[0];
  },

  /**
   * FICHA COMPLETA DE UNA VENTA (cabecera + líneas + pago).
   * Es el documento que se muestra/imprime como factura.
   */
  async obtenerVentaCompleta(num_factura) {
    const venta = await this.obtenerPorFactura(num_factura);

    if (!venta) return null;

    const detalle = await this.listarDetalle(num_factura);
    const pago = await this.obtenerPagoDeFactura(num_factura);

    // Desglose numérico consolidado para el pie de la factura.
    const totalUnidades = detalle.reduce((suma, linea) => suma + Number(linea.cantidad), 0);

    return {
      venta,
      detalle,
      pago: pago || null,
      resumen: {
        cantidad_lineas: detalle.length,
        total_unidades: totalUnidades,
        monto_total: Number(venta.monto_total || 0)
      }
    };
  },

  /**
   * INDICADORES DEL MOSTRADOR: ventas de hoy, del mes, unidades y ticket medio.
   * Alimenta las tarjetas KPI de la pantalla de Venta Directa.
   */
  async obtenerIndicadoresVentas() {
    const [filas] = await pool.query(
      `SELECT
         COUNT(*)                                                            AS total_facturas,
         COALESCE(SUM(monto_total), 0)                                       AS monto_historico,
         COALESCE(SUM(CASE WHEN DATE(fecha_venta) = CURRENT_DATE
                           THEN monto_total ELSE 0 END), 0)                   AS monto_hoy,
         COALESCE(SUM(CASE WHEN DATE(fecha_venta) = CURRENT_DATE
                           THEN 1 ELSE 0 END), 0)                             AS facturas_hoy,
         COALESCE(SUM(CASE WHEN YEAR(fecha_venta) = YEAR(CURRENT_DATE)
                            AND MONTH(fecha_venta) = MONTH(CURRENT_DATE)
                           THEN monto_total ELSE 0 END), 0)                   AS monto_mes,
         COALESCE(AVG(monto_total), 0)                                       AS ticket_promedio
       FROM venta
       WHERE estado = 1`
    );

    const [filasUnidades] = await pool.query(
      `SELECT COALESCE(SUM(df.cantidad), 0) AS total_unidades
         FROM detalle_factura df
         INNER JOIN venta v ON v.num_factura = df.num_factura
        WHERE v.estado = 1`
    );

    const resumen = filas[0] || {};

    return {
      total_facturas: Number(resumen.total_facturas || 0),
      monto_historico: Number(resumen.monto_historico || 0),
      monto_hoy: Number(resumen.monto_hoy || 0),
      facturas_hoy: Number(resumen.facturas_hoy || 0),
      monto_mes: Number(resumen.monto_mes || 0),
      ticket_promedio: Number(Number(resumen.ticket_promedio || 0).toFixed(2)),
      total_unidades: Number(filasUnidades[0]?.total_unidades || 0)
    };
  },

  /**
   * PRODUCTOS MÁS VENDIDOS (informe del mostrador).
   * @param {number} limite Cuántos productos devolver (por defecto 10).
   */
  async listarProductosMasVendidos(limite = 10) {
    const limiteSeguro = Number.isInteger(limite) && limite > 0 ? Math.min(limite, 100) : 10;

    const [filas] = await pool.query(
      `SELECT p.cod_producto,
              p.nombre_producto,
              p.imagen,
              COALESCE(SUM(df.cantidad), 0)                  AS unidades_vendidas,
              COALESCE(SUM(df.cantidad * df.Precio_unitario), 0) AS monto_vendido
         FROM detalle_factura df
         INNER JOIN producto p ON p.cod_producto = df.cod_producto
         INNER JOIN venta    v ON v.num_factura  = df.num_factura
        WHERE v.estado = 1
        GROUP BY p.cod_producto, p.nombre_producto, p.imagen
        ORDER BY unidades_vendidas DESC
        LIMIT ${limiteSeguro}`
    );

    return filas;
  },

  /* ======================================================================
   * 2. REGISTRO DE LA VENTA (TRANSACCIÓN ÚNICA)
   * ====================================================================== */

  /**
   * REGISTRA UNA VENTA DIRECTA COMPLETA.
   *
   * PROPÓSITO FUNCIONAL (requisito):
   *   "Interfaz para ventas rápidas a clientes que solo vienen a comprar
   *    artículos electrónicos. Se registran los datos del cliente y se
   *    seleccionan los productos. Al confirmar, el producto se resta de la
   *    existencia del inventario, y se guarda un registro en la tabla de
   *    movimientos marcando la salida como 'Venta'. Se procesa el pago, se
   *    registra el modo de pago, el monto total y se emite la factura."
   *
   * @param {Object} datosVenta
   * @param {string} datosVenta.cedula_cli                Cliente que compra.
   * @param {Array}  datosVenta.productos                 Líneas del carrito.
   * @param {string} datosVenta.metodo_pago               Forma de pago.
   * @param {number} datosVenta.tasa_cambio               Tasa USD -> Bs.
   * @param {string} [datosVenta.referencia]              Referencia del pago.
   * @param {number} datosVenta.id_usuario                Cajero que factura.
   * @param {number} datosVenta.id_caja                   Turno de caja.
   * @returns {Promise<Object>} Resultado con la factura, pagos y alertas.
   */
  async registrarVentaCompleta(datosVenta) {
    const {
      cedula_cli,
      productos,
      metodo_pago,
      tasa_cambio,
      referencia,
      id_usuario,
      id_caja
    } = datosVenta;

    const conexion = await pool.getConnection();

    try {
      await conexion.beginTransaction();

      /* ---------------------------------------------------------------
       * PASO 1 · TOTAL DE LA VENTA
       * ---------------------------------------------------------------
       * El total se calcula leyendo el PRECIO DE VENTA REAL del catálogo y
       * multiplicándolo por la cantidad pedida. NO se confía en el precio que
       * envíe el navegador, para impedir que se manipule el importe desde el
       * cliente. Se bloquea (`FOR UPDATE`) cada producto para que su precio y
       * su existencia no cambien mientras se factura.
       */
      const lineasFactura = [];
      const productosDescontados = [];
      let montoTotal = 0;

      for (const lineaPedida of productos) {
        const [filasProducto] = await conexion.query(
          `SELECT cod_producto, nombre_producto, precio_venta, existencia, stock_minimo, estado
             FROM producto
            WHERE cod_producto = ?
            FOR UPDATE`,
          [lineaPedida.cod_producto]
        );

        // Producto inexistente en el catálogo.
        if (filasProducto.length === 0) {
          await conexion.rollback();
          return { productoNoEncontrado: true, cod_producto: lineaPedida.cod_producto };
        }

        const producto = filasProducto[0];

        // Producto dado de baja lógica: no se puede vender.
        if (Number(producto.estado) !== 1) {
          await conexion.rollback();
          return {
            productoInactivo: true,
            cod_producto: producto.cod_producto,
            nombre_producto: producto.nombre_producto
          };
        }

        const cantidad = Number(lineaPedida.cantidad);

        // Stock insuficiente: se aborta la venta COMPLETA (rollback total).
        if (Number(producto.existencia) < cantidad) {
          await conexion.rollback();
          return {
            stockInsuficiente: true,
            cod_producto: producto.cod_producto,
            nombre_producto: producto.nombre_producto,
            existenciaDisponible: Number(producto.existencia),
            cantidadSolicitada: cantidad
          };
        }

        const precioUnitario = Number(producto.precio_venta);
        const subtotal = Number((precioUnitario * cantidad).toFixed(2));

        montoTotal = Number((montoTotal + subtotal).toFixed(2));

        lineasFactura.push({
          cod_producto: producto.cod_producto,
          nombre_producto: producto.nombre_producto,
          cantidad,
          precio_unitario: precioUnitario,
          subtotal
        });
      }

      /* ---------------------------------------------------------------
       * PASO 2 · NÚMERO DE FACTURA
       * --------------------------------------------------------------- */
      const numFactura = await MovimientoModel.tomarSiguienteCorrelativo(conexion, 'FACTURA');

      /* ---------------------------------------------------------------
       * PASO 3 · CABECERA DE LA VENTA
       * --------------------------------------------------------------- */
      await conexion.query(
        `INSERT INTO venta
           (num_factura, cedula_cli, monto_total, fecha_venta, id_usuario, tipo_venta, estado, id_caja)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, 'DIRECTA', 1, ?)`,
        [numFactura, cedula_cli, montoTotal, id_usuario, id_caja]
      );

      /* ---------------------------------------------------------------
       * PASO 4 · POR CADA PRODUCTO: DESCUENTO + KÁRDEX + DETALLE + ALERTA
       * --------------------------------------------------------------- */
      const alertasGeneradas = [];

      for (const linea of lineasFactura) {
        // 4.a) Descuento del inventario y asiento de SALIDA con origen 'VENTA'.
        const resultadoDescuento = await MovimientoModel.descontarStockProducto(conexion, {
          cod_producto: linea.cod_producto,
          cantidad: linea.cantidad,
          id_usuario,
          motivo: `Venta directa de mostrador segun factura ${numFactura}`,
          origen: ORIGENES_MOVIMIENTO.VENTA
        });

        // Barrera de seguridad: si el stock cambió entre la lectura y el
        // descuento, se revierte TODA la factura.
        if (resultadoDescuento.stockInsuficiente || !resultadoDescuento.encontrado) {
          await conexion.rollback();
          return {
            stockInsuficiente: true,
            cod_producto: linea.cod_producto,
            nombre_producto: linea.nombre_producto,
            existenciaDisponible: resultadoDescuento.existenciaDisponible,
            cantidadSolicitada: linea.cantidad
          };
        }

        // 4.b) Línea del detalle de factura.
        //      NÓTESE: la columna del DDL se llama `Precio_unitario` (con P
        //      mayúscula), tal como quedó definida en el modelo relacional.
        await conexion.query(
          `INSERT INTO detalle_factura
             (num_factura, cod_producto, cantidad, Precio_unitario)
           VALUES (?, ?, ?, ?)`,
          [numFactura, linea.cod_producto, linea.cantidad, linea.precio_unitario]
        );

        // 4.c) AUTOMATIZACIÓN DE LA ALERTA DE STOCK MÍNIMO.
        const alerta = await AlertaStockModel.registrarAlertaSiCorresponde(conexion, {
          cod_producto: linea.cod_producto,
          existencia: resultadoDescuento.existencia_posterior,
          stock_minimo: resultadoDescuento.stock_minimo,
          origen: ORIGENES_MOVIMIENTO.VENTA,
          documento: numFactura
        });

        if (alerta) alertasGeneradas.push(alerta);

        productosDescontados.push({
          cod_producto: linea.cod_producto,
          nombre_producto: linea.nombre_producto,
          cantidad: linea.cantidad,
          existencia_previa: resultadoDescuento.existencia_previa,
          existencia_posterior: resultadoDescuento.existencia_posterior,
          // Trazabilidad del asiento del kádex generado por esta venta.
          tipo_movimiento: 'SALIDA',
          origen: resultadoDescuento.origen,
          id_movimiento: resultadoDescuento.id_movimiento,
          alerta: alerta || null
        });
      }

      /* ---------------------------------------------------------------
       * PASO 5 · PAGO (CIERRE DE CAJA)
       * --------------------------------------------------------------- */
      const [resultadoPago] = await conexion.query(
        `INSERT INTO pago
           (id_caja, tipo_origen, metodo_pago, monto_usd, tasa_cambio,
            referencia, fecha_pago, venta_num_factura, id_ordentec)
         VALUES (?, 'VENTA', ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, NULL)`,
        [id_caja, metodo_pago, montoTotal, tasa_cambio, referencia, numFactura]
      );

      await conexion.commit();

      return {
        exito: true,
        num_factura: numFactura,
        id_pago: resultadoPago.insertId,
        cedula_cli,
        monto_total: montoTotal,
        metodo_pago,
        tasa_cambio,
        referencia,
        id_caja,
        lineas: lineasFactura,
        productos_descontados: productosDescontados,
        alertas: alertasGeneradas
      };
    } catch (error) {
      // Cualquier fallo revierte la factura, el detalle, el kádex y el pago.
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  },

  /**
   * ANULA UNA VENTA (baja lógica) Y DEVUELVE EL INVENTARIO.
   *
   * PROPÓSITO FUNCIONAL: si el cliente devuelve la mercancía o se emitió una
   * factura por error, el administrador anula la venta. La factura NO se borra
   * (es un documento contable): se marca `estado = 0` y los productos regresan
   * al almacén con su asiento de ENTRADA en el kádex.
   *
   * PROPÓSITO TÉCNICO: transacción única que revierte el stock producto por
   * producto y luego marca la cabecera como anulada.
   */
  async anularVenta(num_factura, id_usuario, motivo) {
    const conexion = await pool.getConnection();

    try {
      await conexion.beginTransaction();

      // ---- 1. La venta debe existir y estar vigente ----
      const [filasVenta] = await conexion.query(
        'SELECT num_factura, estado, monto_total FROM venta WHERE num_factura = ? FOR UPDATE',
        [num_factura]
      );

      if (filasVenta.length === 0) {
        await conexion.rollback();
        return { ventaNoEncontrada: true };
      }

      if (Number(filasVenta[0].estado) !== 1) {
        await conexion.rollback();
        return { ventaYaAnulada: true };
      }

      // ---- 2. Se leen las líneas de la factura ----
      const [filasDetalle] = await conexion.query(
        'SELECT cod_producto, cantidad FROM detalle_factura WHERE num_factura = ?',
        [num_factura]
      );

      // ---- 3. Se devuelve cada producto al inventario ----
      const productosDevueltos = [];

      for (const linea of filasDetalle) {
        const resultadoDevolucion = await MovimientoModel.devolverStockProducto(conexion, {
          cod_producto: linea.cod_producto,
          cantidad: Number(linea.cantidad),
          id_usuario,
          motivo: `Anulacion de la factura ${num_factura}. ${motivo}`,
          origen: ORIGENES_MOVIMIENTO.VENTA
        });

        if (resultadoDevolucion.encontrado) {
          productosDevueltos.push({
            cod_producto: linea.cod_producto,
            nombre_producto: resultadoDevolucion.nombre_producto,
            cantidad: Number(linea.cantidad),
            existencia_posterior: resultadoDevolucion.existencia_posterior
          });
        }
      }

      // ---- 4. Se marca la venta como anulada (baja lógica) ----
      await conexion.query(
        'UPDATE venta SET estado = 0 WHERE num_factura = ?',
        [num_factura]
      );

      // ---- 5. Se marca también el pago como anulado por trazabilidad ----
      await conexion.query(
        `UPDATE pago
            SET referencia = CONCAT(COALESCE(referencia, ''), ' [ANULADO]')
          WHERE venta_num_factura = ?`,
        [num_factura]
      );

      await conexion.commit();

      return {
        exito: true,
        num_factura,
        monto_anulado: Number(filasVenta[0].monto_total),
        productos_devueltos: productosDevueltos
      };
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  }
};

export default VentaModel;
