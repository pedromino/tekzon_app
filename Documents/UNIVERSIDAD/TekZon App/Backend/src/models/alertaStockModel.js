/**
 * ==========================================================================
 * MODELO DE ALERTAS DE STOCK (alertaStockModel.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Acceso a datos (Data Access Layer) · Módulo 4
 *
 * PROPÓSITO FUNCIONAL:
 *   Administra la tabla `alerta_stock`, que es el respaldo PERSISTENTE de la
 *   automatización de alertas. Cuando un descuento de inventario (Venta o
 *   Servicio Técnico) deja la existencia de un producto en o por debajo de su
 *   `stock_minimo`, el sistema escribe aquí el aviso:
 *
 *     "Alerta de stock mínimo para el producto X"
 *
 *   ¿Por qué guardarla en una tabla y no sólo mostrarla en pantalla?
 *     · Queda AUDITADO el instante exacto en que se avisó y qué documento lo
 *       provocó (factura u orden).
 *     · El aviso sobrevive a un cierre de sesión o a una recarga del navegador.
 *     · El administrador puede marcarlo como "atendido" al reponer la mercancía.
 *
 * PROPÓSITO TÉCNICO:
 *   `registrarAlertaSiCorresponde` se ejecuta DENTRO de la transacción del
 *   descuento de stock, por lo que la alerta y el descuento son indivisibles:
 *   o se guardan los dos, o no se guarda ninguno.
 * ==========================================================================
 */
import pool from '../config/db.js';
import { ORIGENES_MOVIMIENTO } from './movimientoModel.js';

/**
 * Lista de columnas de la alerta enriquecida con los datos legibles del
 * producto (nombre, imagen y existencia actual). Se reutiliza en las lecturas
 * para que el contrato de la API sea siempre el mismo.
 */
const COLUMNAS_ALERTA = `
  a.id_alerta,
  a.cod_producto,
  p.nombre_producto,
  p.imagen,
  p.existencia AS existencia_actual,
  a.existencia,
  a.stock_minimo,
  a.origen,
  a.documento,
  a.mensaje,
  a.atendida,
  a.fecha_alerta
`;

export const AlertaStockModel = {
  /**
   * REGISTRA LA ALERTA DE STOCK MÍNIMO SI LA EXISTENCIA LLEGÓ AL UMBRAL.
   *
   * PROPÓSITO FUNCIONAL: se invoca justo después de descontar stock. Compara la
   * existencia resultante con el `stock_minimo` del producto y, sólo si la
   * condición se cumple (existencia <= mínimo), escribe el aviso.
   *
   * REGLA ANTI-RUIDO: si el producto YA tiene una alerta sin atender, no se crea
   * una segunda fila; se ACTUALIZA la existente con la nueva existencia y el
   * nuevo documento. Así la campana de notificaciones muestra un aviso por
   * producto y no una lista inflada con la misma alerta repetida.
   *
   * @param {Object} conexion    Conexión con la transacción del descuento activa.
   * @param {Object} datosAlerta
   * @param {string} datosAlerta.cod_producto   Producto afectado.
   * @param {number} datosAlerta.existencia     Existencia DESPUÉS del descuento.
   * @param {number} datosAlerta.stock_minimo   Umbral configurado.
   * @param {string} datosAlerta.origen         VENTA | SERVICIO_TECNICO.
   * @param {string} [datosAlerta.documento]    Factura u orden que lo provocó.
   * @returns {Promise<Object|null>} La alerta registrada, o `null` si el stock
   *   todavía está por encima del mínimo (no hay nada que avisar).
   */
  async registrarAlertaSiCorresponde(conexion, {
    cod_producto,
    existencia,
    stock_minimo,
    origen,
    documento = null
  }) {
    const existenciaActual = Number(existencia);
    const minimoConfigurado = Number(stock_minimo);

    /*
     * CONDICIÓN DE DISPARO: la existencia llegó al valor definido como stock
     * mínimo (o quedó por debajo). Nótese que se usa `<=` porque el requisito
     * dice literalmente "llegan al valor definido como stock mínimo".
     */
    if (!(existenciaActual <= minimoConfigurado)) {
      return null;
    }

    // ---- Se recupera el nombre del producto para redactar el mensaje ----
    const [filasProducto] = await conexion.query(
      'SELECT nombre_producto FROM producto WHERE cod_producto = ?',
      [cod_producto]
    );

    const nombreProducto = filasProducto[0]?.nombre_producto || cod_producto;

    /*
     * MENSAJE EXACTO QUE EXIGE EL REQUISITO, adaptado al caso para que el
     * usuario entienda la gravedad:
     *   · existencia 0            -> "producto agotado"
     *   · existencia = mínimo     -> "alcanzó el stock mínimo"
     *   · existencia < mínimo     -> "por debajo del stock mínimo"
     */
    let situacion;
    if (existenciaActual <= 0) {
      situacion = 'se agotó';
    } else if (existenciaActual < minimoConfigurado) {
      situacion = `quedó por debajo del stock mínimo (${minimoConfigurado} u.)`;
    } else {
      situacion = `alcanzó el stock mínimo (${minimoConfigurado} u.)`;
    }

    const mensaje = `Alerta de stock mínimo para el producto "${nombreProducto}": ${situacion}. Existencia actual: ${existenciaActual} u.`;

    // ---- ¿Existe ya una alerta pendiente de este producto? ----
    const [filasAlertaPendiente] = await conexion.query(
      `SELECT id_alerta
         FROM alerta_stock
        WHERE cod_producto = ? AND atendida = 0
        ORDER BY fecha_alerta DESC
        LIMIT 1
        FOR UPDATE`,
      [cod_producto]
    );

    // ---- CASO A: ya había un aviso pendiente -> se refresca ----
    if (filasAlertaPendiente.length > 0) {
      const idAlerta = filasAlertaPendiente[0].id_alerta;

      await conexion.query(
        `UPDATE alerta_stock
            SET existencia   = ?,
                stock_minimo = ?,
                origen       = ?,
                documento    = ?,
                mensaje      = ?,
                fecha_alerta = CURRENT_TIMESTAMP
          WHERE id_alerta = ?`,
        [existenciaActual, minimoConfigurado, origen, documento, mensaje, idAlerta]
      );

      return { id_alerta: idAlerta, cod_producto, nombre_producto: nombreProducto, mensaje, actualizada: true };
    }

    // ---- CASO B: primera vez que el producto toca el mínimo -> se inserta ----
    const [resultadoInsercion] = await conexion.query(
      `INSERT INTO alerta_stock
         (cod_producto, existencia, stock_minimo, origen, documento, mensaje)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cod_producto, existenciaActual, minimoConfigurado, origen, documento, mensaje]
    );

    return {
      id_alerta: resultadoInsercion.insertId,
      cod_producto,
      nombre_producto: nombreProducto,
      existencia: existenciaActual,
      stock_minimo: minimoConfigurado,
      origen,
      documento,
      mensaje,
      actualizada: false
    };
  },

  /**
   * Lista las alertas del sistema (pantalla de Alertas de Stock).
   *
   * @param {Object} filtros
   * @param {boolean} [filtros.soloPendientes] true = sólo las no atendidas.
   */
  async listarAlertas({ soloPendientes = false, limite = 200 } = {}) {
    const filtroAtendida = soloPendientes ? 'WHERE a.atendida = 0' : '';
    const limiteSeguro = Number.isInteger(limite) && limite > 0 ? Math.min(limite, 1000) : 200;

    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_ALERTA}
         FROM alerta_stock a
         INNER JOIN producto p ON p.cod_producto = a.cod_producto
         ${filtroAtendida}
        ORDER BY a.atendida ASC, a.fecha_alerta DESC
        LIMIT ${limiteSeguro}`
    );

    return filas;
  },

  /**
   * INDICADORES DE ALERTAS para la cabecera (campana y página de alertas).
   * Devuelve el total histórico, cuántas siguen pendientes y cuántas de esas
   * corresponden a productos AGOTADOS (existencia 0).
   */
  async obtenerResumenAlertas() {
    const [filas] = await pool.query(
      `SELECT
         COUNT(*)                                          AS total_alertas,
         COALESCE(SUM(CASE WHEN atendida = 0 THEN 1 ELSE 0 END), 0) AS pendientes,
         COALESCE(SUM(CASE WHEN atendida = 0 AND existencia <= 0 THEN 1 ELSE 0 END), 0) AS agotados
       FROM alerta_stock`
    );

    const resumen = filas[0] || {};

    return {
      total_alertas: Number(resumen.total_alertas || 0),
      pendientes: Number(resumen.pendientes || 0),
      agotados: Number(resumen.agotados || 0)
    };
  },

  /**
   * Marca una alerta como ATENDIDA (el administrador ya repuso la mercancía).
   * Devuelve las filas afectadas para poder responder 404 si no existe.
   */
  async marcarComoAtendida(id_alerta) {
    const [resultado] = await pool.query(
      'UPDATE alerta_stock SET atendida = 1 WHERE id_alerta = ? AND atendida = 0',
      [id_alerta]
    );

    return resultado.affectedRows;
  },

  /**
   * Marca como atendidas TODAS las alertas pendientes de un producto.
   * Se usa cuando el administrador registra una entrada de mercancía: al reponer
   * el stock, las alertas de ese producto dejan de tener sentido.
   */
  async marcarComoAtendidasPorProducto(cod_producto) {
    const [resultado] = await pool.query(
      'UPDATE alerta_stock SET atendida = 1 WHERE cod_producto = ? AND atendida = 0',
      [cod_producto]
    );

    return resultado.affectedRows;
  },

  /**
   * Recupera una alerta puntual (para responder 404 de forma explícita).
   */
  async obtenerPorId(id_alerta) {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_ALERTA}
         FROM alerta_stock a
         INNER JOIN producto p ON p.cod_producto = a.cod_producto
        WHERE a.id_alerta = ?`,
      [id_alerta]
    );

    return filas[0];
  },

  /**
   * Consulta auxiliar de diagnóstico: productos cuyo stock ya está en o por
   * debajo del mínimo, SIN depender de que exista una fila de alerta.
   * Se usa para el listado de "riesgo de desabastecimiento" del panel.
   */
  async listarProductosEnRiesgo() {
    const [filas] = await pool.query(
      `SELECT p.cod_producto,
              p.nombre_producto,
              p.imagen,
              p.existencia,
              p.stock_minimo,
              c.nombre_categoria
         FROM producto p
         LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
        WHERE p.estado = 1
          AND p.existencia <= p.stock_minimo
        ORDER BY p.existencia ASC, p.nombre_producto ASC`
    );

    return filas;
  }
};

/** Se re-exporta el origen para que los servicios no importen dos módulos. */
export { ORIGENES_MOVIMIENTO };

export default AlertaStockModel;
