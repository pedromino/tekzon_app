/**
 * ==========================================================================
 * MODELO DE MOVIMIENTO (movimientoModel.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Acceso a datos (Data Access Layer) · CRUD 3
 *
 * PROPÓSITO FUNCIONAL:
 *   Administra la tabla `movimiento_inventario`, que actúa como KÁRDEX
 *   transaccional del almacén. Cada fila representa una Entrada, una Salida o
 *   un Ajuste físico de existencias, con la fotografía del stock antes y
 *   después de la operación (existencia_previa / existencia_posterior).
 *
 * PROPÓSITO TÉCNICO:
 *   El registro de un movimiento es una operación ATÓMICA que afecta a dos
 *   tablas: se actualiza `producto.existencia` y se inserta el asiento en
 *   `movimiento_inventario`. Ambas acciones viajan dentro de una misma
 *   TRANSACCIÓN SQL gestionada con una conexión dedicada del pool:
 *
 *     1. BEGIN TRANSACTION
 *     2. SELECT ... FOR UPDATE  -> bloqueo pesimista de la fila del producto,
 *        imprescindible para que el cálculo "existencia previa + cantidad"
 *        sea correcto aunque dos almacenistas registren salidas simultáneas.
 *     3. Validación de stock suficiente cuando el tipo es SALIDA.
 *     4. UPDATE producto SET existencia = ?
 *     5. INSERT INTO movimiento_inventario (...)
 *     6. COMMIT  (o ROLLBACK ante cualquier excepción)
 *     7. conexion.release() en el bloque finally (devuelve al pool SIEMPRE)
 * ==========================================================================
 */
import pool from '../config/db.js';

/** Tipos de movimiento admitidos por el kádex. */
export const TIPOS_MOVIMIENTO = Object.freeze({
  ENTRADA: 'ENTRADA',
  SALIDA: 'SALIDA',
  AJUSTE: 'AJUSTE'
});

/**
 * ORÍGENES del movimiento: indican QUÉ PROCESO provocó la transacción.
 *
 * PROPÓSITO FUNCIONAL: el requisito del sistema exige marcar las salidas de
 * inventario como "Venta" o como "Servicio Técnico", según el módulo que las
 * generó. Se usa una columna dedicada e indexada (`movimiento_inventario.origen`)
 * en lugar de sobrecargar el texto libre del `motivo`.
 *
 *   ALMACEN          -> Entrada/Salida manual del CRUD 3 (FASE I).
 *   VENTA            -> Descuento automático del Módulo de Venta Directa.
 *   SERVICIO_TECNICO -> Descuento automático del repuesto de una orden.
 *   AJUSTE           -> Arqueo físico del CRUD 2 (FASE I).
 */
export const ORIGENES_MOVIMIENTO = Object.freeze({
  ALMACEN: 'ALMACEN',
  VENTA: 'VENTA',
  SERVICIO_TECNICO: 'SERVICIO_TECNICO',
  AJUSTE: 'AJUSTE'
});

/**
 * Lista de columnas del kádex enriquecida con los datos legibles del producto
 * y del usuario responsable. Se reutiliza en todas las lecturas.
 */
const COLUMNAS_KARDEX = `
  m.id_movimiento,
  m.cod_producto,
  p.nombre_producto,
  p.imagen,
  p.existencia AS existencia_actual,
  p.stock_minimo,
  m.id_usuario,
  u.nombre_usuario,
  u.username AS username_usuario,
  m.tipo_movimiento,
  m.cantidad,
  m.existencia_previa,
  m.existencia_posterior,
  m.motivo,
  m.origen,
  m.fecha_movimiento
`;

export const MovimientoModel = {
  /**
   * Consulta el historial del kádex con filtros dinámicos (CRUD 3).
   *
   * PROPÓSITO TÉCNICO: se construye la cláusula WHERE de forma parametrizada
   * (array `parametros`) para evitar inyección SQL. Los filtros son opcionales
   * y se combinan entre sí.
   *
   * @param {Object} filtros
   * @param {string} [filtros.tipo]        ENTRADA | SALIDA | AJUSTE
   * @param {string} [filtros.codProducto] Código exacto del producto
   * @param {string} [filtros.fechaDesde]  Rango inicial (YYYY-MM-DD)
   * @param {string} [filtros.fechaHasta]  Rango final (YYYY-MM-DD)
   * @param {number} [filtros.limite]      Máximo de filas a devolver
   */
  async listarHistorial({ tipo, codProducto, fechaDesde, fechaHasta, limite } = {}) {
    const condiciones = [];
    const parametros = [];

    if (tipo) {
      condiciones.push('m.tipo_movimiento = ?');
      parametros.push(tipo);
    }

    if (codProducto) {
      condiciones.push('m.cod_producto = ?');
      parametros.push(codProducto);
    }

    if (fechaDesde) {
      condiciones.push('m.fecha_movimiento >= ?');
      parametros.push(`${fechaDesde} 00:00:00`);
    }

    if (fechaHasta) {
      condiciones.push('m.fecha_movimiento <= ?');
      parametros.push(`${fechaHasta} 23:59:59`);
    }

    const clausulaWhere = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    // El límite se interpola como entero ya validado (MySQL no admite
    // marcadores de posición en la cláusula LIMIT con mysql2/prepared).
    const limiteSeguro = Number.isInteger(limite) && limite > 0 ? Math.min(limite, 1000) : 500;

    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_KARDEX}
         FROM movimiento_inventario m
         INNER JOIN producto p ON p.cod_producto = m.cod_producto
         LEFT  JOIN usuario  u ON u.id_usuario  = m.id_usuario
         ${clausulaWhere}
        ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC
        LIMIT ${limiteSeguro}`,
      parametros
    );

    return filas;
  },

  /**
   * Recupera un asiento del kádex por su llave primaria.
   * Devuelve `undefined` si no existe (el servicio lo traduce en 404).
   */
  async obtenerPorId(id_movimiento) {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_KARDEX}
         FROM movimiento_inventario m
         INNER JOIN producto p ON p.cod_producto = m.cod_producto
         LEFT  JOIN usuario  u ON u.id_usuario  = m.id_usuario
        WHERE m.id_movimiento = ?`,
      [id_movimiento]
    );

    return filas[0];
  },

  /**
   * Consulta los asientos de kádex de un producto concreto.
   * Alimenta el botón "ver historial" de cada fila del catálogo.
   */
  async listarPorProducto(cod_producto, limite = 100) {
    const limiteSeguro = Number.isInteger(limite) && limite > 0 ? Math.min(limite, 500) : 100;

    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_KARDEX}
         FROM movimiento_inventario m
         INNER JOIN producto p ON p.cod_producto = m.cod_producto
         LEFT  JOIN usuario  u ON u.id_usuario  = m.id_usuario
        WHERE m.cod_producto = ?
        ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC
        LIMIT ${limiteSeguro}`,
      [cod_producto]
    );

    return filas;
  },

  /**
   * Calcula los indicadores del kádex (KPI de la página de movimientos).
   * Devuelve el conteo de asientos y el total de unidades por tipo.
   */
  async obtenerResumenKardex() {
    const [filas] = await pool.query(
      `SELECT tipo_movimiento,
              COUNT(*)      AS total_asientos,
              COALESCE(SUM(cantidad), 0) AS total_unidades
         FROM movimiento_inventario
        GROUP BY tipo_movimiento`
    );

    // Se normaliza la respuesta a un objeto con los tres tipos siempre
    // presentes, para que el frontend no tenga que validar `undefined`.
    const resumen = {
      ENTRADA: { total_asientos: 0, total_unidades: 0 },
      SALIDA: { total_asientos: 0, total_unidades: 0 },
      AJUSTE: { total_asientos: 0, total_unidades: 0 }
    };

    filas.forEach((fila) => {
      resumen[fila.tipo_movimiento] = {
        total_asientos: Number(fila.total_asientos),
        total_unidades: Number(fila.total_unidades)
      };
    });

    return resumen;
  },

  /**
   * REGISTRA UN MOVIMIENTO DE INVENTARIO CON CÁLCULO ATÓMICO (CRUD 3).
   *
   * PROPÓSITO FUNCIONAL:
   *   Ejecuta una Entrada o Salida física de mercancía. Para las Salidas se
   *   valida que exista stock suficiente; de lo contrario toda la operación
   *   se revierte y se devuelve `stockInsuficiente: true` para que el
   *   servicio responda con un HTTP 400 explicativo.
   *
   * PROPÓSITO TÉCNICO:
   *   El cálculo de `existencia_previa` y `existencia_posterior` se realiza
   *   DENTRO de la transacción y con la fila bloqueada (FOR UPDATE), por lo
   *   que el asiento del kádex es matemáticamente consistente incluso bajo
   *   concurrencia.
   *
   * @param {Object} datosMovimiento
   * @param {string} datosMovimiento.cod_producto   Producto afectado
   * @param {number} datosMovimiento.id_usuario     Almacenista responsable
   * @param {string} datosMovimiento.tipo_movimiento ENTRADA | SALIDA
   * @param {number} datosMovimiento.cantidad       Unidades (entero positivo)
   * @param {string} datosMovimiento.motivo         Justificación obligatoria
   * @param {string} [datosMovimiento.origen]       Proceso que lo generó
   *   (ALMACEN por defecto en la captura manual del CRUD 3).
   */
  async registrarMovimiento({ cod_producto, id_usuario, tipo_movimiento, cantidad, motivo, origen }) {
    // Conexión dedicada: la transacción debe ejecutarse íntegra en el mismo
    // hilo de conexión del pool.
    const conexion = await pool.getConnection();

    try {
      await conexion.beginTransaction();

      // Bloqueo pesimista de la fila del producto.
      const [filasProducto] = await conexion.query(
        `SELECT cod_producto, nombre_producto, existencia, estado
           FROM producto
          WHERE cod_producto = ?
          FOR UPDATE`,
        [cod_producto]
      );

      if (filasProducto.length === 0) {
        await conexion.rollback();
        return { encontrado: false };
      }

      const producto = filasProducto[0];
      const existenciaPrevia = Number(producto.existencia);

      // Cálculo del stock resultante según el sentido del movimiento.
      const existenciaPosterior = tipo_movimiento === TIPOS_MOVIMIENTO.ENTRADA
        ? existenciaPrevia + cantidad
        : existenciaPrevia - cantidad;

      // Regla de negocio crítica: no se puede sacar del almacén lo que no hay.
      if (existenciaPosterior < 0) {
        await conexion.rollback();
        return {
          encontrado: true,
          stockInsuficiente: true,
          existenciaDisponible: existenciaPrevia,
          cantidadSolicitada: cantidad,
          nombre_producto: producto.nombre_producto
        };
      }

      // 1) Se actualiza la existencia física real del producto.
      await conexion.query(
        'UPDATE producto SET existencia = ? WHERE cod_producto = ?',
        [existenciaPosterior, cod_producto]
      );

      // 2) Se inserta el asiento del kádex con la traza previa/posterior.
      const [resultadoMovimiento] = await conexion.query(
        `INSERT INTO movimiento_inventario
           (cod_producto, id_usuario, tipo_movimiento, cantidad,
            existencia_previa, existencia_posterior, motivo, origen, fecha_movimiento)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          cod_producto,
          id_usuario,
          tipo_movimiento,
          cantidad,
          existenciaPrevia,
          existenciaPosterior,
          motivo,
          origen || ORIGENES_MOVIMIENTO.ALMACEN
        ]
      );

      await conexion.commit();

      return {
        encontrado: true,
        stockInsuficiente: false,
        id_movimiento: resultadoMovimiento.insertId,
        cod_producto,
        nombre_producto: producto.nombre_producto,
        tipo_movimiento,
        cantidad,
        existencia_previa: existenciaPrevia,
        existencia_posterior: existenciaPosterior,
        motivo,
        origen: origen || ORIGENES_MOVIMIENTO.ALMACEN
      };
    } catch (error) {
      // Rollback total: ni el stock ni el asiento pueden quedar a medias.
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  },

  /**
   * REGISTRA UN AJUSTE DE EXISTENCIA POR ARQUEO FÍSICO (CRUD 2).
   *
   * PROPÓSITO FUNCIONAL:
   *   El almacenista declara la existencia REAL contada en el estante
   *   (`nuevaExistencia`). El sistema calcula la diferencia contra el stock
   *   del sistema y la deja auditada en el kádex como tipo_movimiento
   *   'AJUSTE', con la diferencia en valor absoluto.
   *
   *   Opcionalmente, en la misma operación, se actualiza el `stockMinimo`
   *   (umbral de alerta de reposición) del producto. Se hace DENTRO de la
   *   misma transacción para que la existencia y su umbral nunca queden
   *   desincronizados en la base de datos.
   *
   * PROPÓSITO TÉCNICO:
   *   Reutiliza exactamente el mismo patrón transaccional del kádex
   *   (FOR UPDATE + UPDATE + INSERT + COMMIT/ROLLBACK) para que el ajuste
   *   quede trazado con el mismo nivel de garantía que una entrada o salida.
   *
   * @param {string}  cod_producto    Código del producto auditado.
   * @param {number}  id_usuario      Almacenista responsable del arqueo.
   * @param {number}  nuevaExistencia Conteo físico real de unidades.
   * @param {string}  motivo          Justificación obligatoria del ajuste.
   * @param {number} [stockMinimo]    Nuevo umbral de alerta (opcional).
   */
  async registrarAjuste({ cod_producto, id_usuario, nuevaExistencia, motivo, stockMinimo }) {
    const conexion = await pool.getConnection();

    try {
      await conexion.beginTransaction();

      const [filasProducto] = await conexion.query(
        `SELECT cod_producto, nombre_producto, existencia, stock_minimo
           FROM producto
          WHERE cod_producto = ?
          FOR UPDATE`,
        [cod_producto]
      );

      if (filasProducto.length === 0) {
        await conexion.rollback();
        return { encontrado: false };
      }

      const producto = filasProducto[0];
      const existenciaPrevia = Number(producto.existencia);
      const stockMinimoPrevio = Number(producto.stock_minimo);
      const diferencia = nuevaExistencia - existenciaPrevia;

      // El stock mínimo sólo cambia si el cliente envió un valor numérico
      // válido; en caso contrario se conserva el que ya tenía el producto.
      const stockMinimoFinal = Number.isFinite(Number(stockMinimo))
        ? Number(stockMinimo)
        : stockMinimoPrevio;

      /*
       * 1) Se fija la existencia real contada en el arqueo y, si procede, el
       *    nuevo umbral de alerta. Ambos campos viven en la tabla `producto`
       *    y se actualizan en una sola sentencia para mantenerlos coherentes.
       */
      await conexion.query(
        'UPDATE producto SET existencia = ?, stock_minimo = ? WHERE cod_producto = ?',
        [nuevaExistencia, stockMinimoFinal, cod_producto]
      );

      /*
       * 2) Se audita el ajuste con la magnitud de la diferencia.
       *
       *    IMPORTANTE: sólo se inserta el asiento del kádex si la existencia
       *    CAMBIÓ. Si el almacenista únicamente corrigió el stock mínimo, no
       *    existe una variación de cantidad física que registrar y crear un
       *    asiento con cantidad 0 ensuciaría el histórico del almacén.
       */
      let idMovimiento = null;
      let asientoRegistrado = false;

      if (diferencia !== 0) {
        const [resultadoMovimiento] = await conexion.query(
          `INSERT INTO movimiento_inventario
             (cod_producto, id_usuario, tipo_movimiento, cantidad,
              existencia_previa, existencia_posterior, motivo, origen, fecha_movimiento)
           VALUES (?, ?, 'AJUSTE', ?, ?, ?, ?, 'AJUSTE', CURRENT_TIMESTAMP)`,
          [
            cod_producto,
            id_usuario,
            Math.abs(diferencia),
            existenciaPrevia,
            nuevaExistencia,
            motivo
          ]
        );

        idMovimiento = resultadoMovimiento.insertId;
        asientoRegistrado = true;
      }

      await conexion.commit();

      return {
        encontrado: true,
        id_movimiento: idMovimiento,
        asiento_registrado: asientoRegistrado,
        cod_producto,
        nombre_producto: producto.nombre_producto,
        tipo_movimiento: TIPOS_MOVIMIENTO.AJUSTE,
        cantidad: Math.abs(diferencia),
        existencia_previa: existenciaPrevia,
        existencia_posterior: nuevaExistencia,
        diferencia,
        stock_minimo_previo: stockMinimoPrevio,
        stock_minimo: stockMinimoFinal,
        motivo
      };
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  },

  /**
   * Verifica que un usuario exista antes de firmar un movimiento.
   * La tabla `movimiento_inventario` tiene FK hacia `usuario`, por lo que
   * esta comprobación evita un error 1452 de integridad referencial.
   */
  async existeUsuario(id_usuario) {
    const [filas] = await pool.query(
      'SELECT 1 FROM usuario WHERE id_usuario = ? LIMIT 1',
      [id_usuario]
    );

    return filas.length > 0;
  },

  /* ========================================================================
   * BLOQUE TRANSACCIONAL COMPARTIDO POR LOS MÓDULOS DE VENTA Y SERVICIO
   * ========================================================================
   * Los dos métodos que siguen son la CLAVE de la integración entre los
   * módulos nuevos y el inventario. Se diseñaron para ejecutarse DENTRO de una
   * transacción ya abierta por el módulo llamador (Venta Directa o Servicio
   * Técnico), de modo que el descuento de stock, el asiento del kádex y la
   * factura viajen en un ÚNICO COMMIT.
   *
   * ¿POR QUÉ ES TAN IMPORTANTE?
   *   Si el stock se descontara con una transacción propia y luego fallara la
   *   inserción de la factura, el almacén quedaría descuadrado sin documento
   *   que lo justifique. Al compartir la transacción, la regla "no existe stock
   *   sin asiento ni asiento sin documento" se cumple siempre.
   * ======================================================================== */

  /**
   * DESCUENTA STOCK DE UN PRODUCTO DENTRO DE UNA TRANSACCIÓN EN CURSO.
   *
   * PROPÓSITO FUNCIONAL:
   *   Resta unidades de la existencia física y deja el asiento de SALIDA en el
   *   kádex, marcando el ORIGEN que corresponda:
   *     · 'VENTA'            -> lo invoca el Módulo de Venta Directa.
   *     · 'SERVICIO_TECNICO' -> lo invoca el consumo de repuestos del técnico.
   *
   * PROPÓSITO TÉCNICO:
   *   1. `SELECT ... FOR UPDATE` bloquea la fila del producto: si dos cajeros
   *      venden el último artículo al mismo tiempo, la segunda transacción
   *      espera, relee la existencia ya descontada y detecta el faltante.
   *   2. No abre ni cierra transacción: usa la `conexion` recibida.
   *   3. Nunca lanza excepción por stock insuficiente: DEVUELVE el resultado
   *      para que el servicio llamador decida el mensaje y haga el ROLLBACK.
   *
   * @param {Object} conexion       Conexión con BEGIN TRANSACTION activo.
   * @param {Object} datosDescuento
   * @param {string} datosDescuento.cod_producto    Producto a descontar.
   * @param {number} datosDescuento.cantidad        Unidades (entero > 0).
   * @param {number} datosDescuento.id_usuario      Usuario que firma el asiento.
   * @param {string} datosDescuento.motivo          Concepto del asiento.
   * @param {string} datosDescuento.origen          VENTA | SERVICIO_TECNICO.
   * @param {boolean} [datosDescuento.exigirActivo] Si es true, rechaza
   *   productos dados de baja lógica.
   * @returns {Promise<Object>} Resultado del descuento con la traza de stock.
   */
  async descontarStockProducto(conexion, {
    cod_producto,
    cantidad,
    id_usuario,
    motivo,
    origen,
    exigirActivo = true
  }) {
    // ---- 1. Bloqueo pesimista de la fila del producto ----
    const [filasProducto] = await conexion.query(
      `SELECT cod_producto, nombre_producto, existencia, stock_minimo, estado
         FROM producto
        WHERE cod_producto = ?
        FOR UPDATE`,
      [cod_producto]
    );

    // El producto no existe en el catálogo.
    if (filasProducto.length === 0) {
      return { encontrado: false, stockInsuficiente: false };
    }

    const producto = filasProducto[0];

    // El producto fue dado de baja lógica y no admite movimientos de almacén.
    if (exigirActivo && Number(producto.estado) !== 1) {
      return {
        encontrado: true,
        inactivo: true,
        cod_producto,
        nombre_producto: producto.nombre_producto
      };
    }

    const existenciaPrevia = Number(producto.existencia);
    const existenciaPosterior = existenciaPrevia - Number(cantidad);

    // ---- 2. Regla de oro: no se puede entregar lo que no hay ----
    if (existenciaPosterior < 0) {
      return {
        encontrado: true,
        stockInsuficiente: true,
        cod_producto,
        nombre_producto: producto.nombre_producto,
        existenciaDisponible: existenciaPrevia,
        cantidadSolicitada: Number(cantidad)
      };
    }

    // ---- 3. Se actualiza la existencia física real ----
    await conexion.query(
      'UPDATE producto SET existencia = ? WHERE cod_producto = ?',
      [existenciaPosterior, cod_producto]
    );

    // ---- 4. Se inserta el asiento de SALIDA en el kádex ----
    const [resultadoAsiento] = await conexion.query(
      `INSERT INTO movimiento_inventario
         (cod_producto, id_usuario, tipo_movimiento, cantidad,
          existencia_previa, existencia_posterior, motivo, origen, fecha_movimiento)
       VALUES (?, ?, 'SALIDA', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        cod_producto,
        id_usuario,
        Number(cantidad),
        existenciaPrevia,
        existenciaPosterior,
        motivo,
        origen
      ]
    );

    return {
      encontrado: true,
      stockInsuficiente: false,
      inactivo: false,
      id_movimiento: resultadoAsiento.insertId,
      cod_producto,
      nombre_producto: producto.nombre_producto,
      cantidad: Number(cantidad),
      existencia_previa: existenciaPrevia,
      existencia_posterior: existenciaPosterior,
      // Se devuelve el mínimo para que el servicio evalúe la ALERTA sin
      // necesidad de una segunda consulta a la tabla `producto`.
      stock_minimo: Number(producto.stock_minimo),
      origen
    };
  },

  /**
   * DEVUELVE AL INVENTARIO UN REPUESTO PREVIAMENTE DESCONTADO.
   *
   * PROPÓSITO FUNCIONAL: se usa cuando el técnico elimina un repuesto de la
   * orden antes de cobrarla: el repuesto vuelve al estante y queda auditado con
   * una ENTRADA de origen 'SERVICIO_TECNICO' (así el kádex explica tanto la
   * salida como su reverso). Si la orden ya fue COBRADA no se permite devolver,
   * porque la factura ya fue emitida (esa regla la aplica el servicio).
   *
   * @param {Object} conexion Conexión con transacción activa.
   */
  async devolverStockProducto(conexion, {
    cod_producto,
    cantidad,
    id_usuario,
    motivo,
    origen = ORIGENES_MOVIMIENTO.SERVICIO_TECNICO
  }) {
    const [filasProducto] = await conexion.query(
      `SELECT cod_producto, nombre_producto, existencia, stock_minimo
         FROM producto
        WHERE cod_producto = ?
        FOR UPDATE`,
      [cod_producto]
    );

    if (filasProducto.length === 0) {
      return { encontrado: false };
    }

    const producto = filasProducto[0];
    const existenciaPrevia = Number(producto.existencia);
    const existenciaPosterior = existenciaPrevia + Number(cantidad);

    // 1) Se repone la existencia física.
    await conexion.query(
      'UPDATE producto SET existencia = ? WHERE cod_producto = ?',
      [existenciaPosterior, cod_producto]
    );

    // 2) Se audita la devolución como ENTRADA en el kádex.
    const [resultadoAsiento] = await conexion.query(
      `INSERT INTO movimiento_inventario
         (cod_producto, id_usuario, tipo_movimiento, cantidad,
          existencia_previa, existencia_posterior, motivo, origen, fecha_movimiento)
       VALUES (?, ?, 'ENTRADA', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        cod_producto,
        id_usuario,
        Number(cantidad),
        existenciaPrevia,
        existenciaPosterior,
        motivo,
        origen
      ]
    );

    return {
      encontrado: true,
      id_movimiento: resultadoAsiento.insertId,
      cod_producto,
      nombre_producto: producto.nombre_producto,
      cantidad: Number(cantidad),
      existencia_previa: existenciaPrevia,
      existencia_posterior: existenciaPosterior
    };
  },

  /**
   * TOMA EL SIGUIENTE CORRELATIVO DE UNA SECUENCIA (facturas / órdenes).
   *
   * PROPÓSITO FUNCIONAL: genera números legibles y consecutivos del tipo
   *   FAC-000001  (factura de venta directa o de servicio técnico)
   *   OS-000001   (orden de servicio técnico)
   *
   * PROPÓSITO TÉCNICO:
   *   El correlativo vive en la tabla `secuencia_factura` y se incrementa con
   *   `UPDATE ... SET valor_actual = valor_actual + 1` DENTRO de la transacción
   *   del documento. El `UPDATE` bloquea la fila, por lo que dos cajeros que
   *   facturen simultáneamente obtienen números DISTINTOS y consecutivos: no
   *   puede repetirse el número de factura (que es llave primaria de `venta`).
   *
   * @param {Object} conexion         Conexión con transacción activa.
   * @param {string} nombreSecuencia  'FACTURA' | 'ORDEN'
   * @returns {Promise<string>}       Número formateado con 6 dígitos.
   */
  async tomarSiguienteCorrelativo(conexion, nombreSecuencia) {
    // 1) Lectura previa con bloqueo pesimista
    const [filas] = await conexion.query(
      'SELECT prefijo, valor_actual FROM secuencia_factura WHERE nombre_secuencia = ? FOR UPDATE',
      [nombreSecuencia]
    );

    if (filas.length === 0) {
      throw new Error(`No existe la secuencia "${nombreSecuencia}" en la base de datos.`);
    }

    let { prefijo, valor_actual: valorActual } = filas[0];

    // Salvaguarda: garantiza que el nuevo correlativo sea estrictamente mayor
    // a cualquier registro ya persistido en la base de datos para evitar colisiones.
    if (nombreSecuencia === 'ORDEN') {
      const [maxFila] = await conexion.query(
        "SELECT MAX(CAST(SUBSTRING(id_ordentec, 4) AS UNSIGNED)) AS max_val FROM orden_tecnico WHERE id_ordentec LIKE 'OS-%'"
      );
      const maxVal = Number(maxFila[0]?.max_val || 0);
      if (maxVal > valorActual) {
        valorActual = maxVal;
      }
    } else if (nombreSecuencia === 'FACTURA') {
      const [maxFila] = await conexion.query(
        "SELECT MAX(CAST(SUBSTRING(num_factura, 5) AS UNSIGNED)) AS max_val FROM venta WHERE num_factura LIKE 'FAC-%'"
      );
      const maxVal = Number(maxFila[0]?.max_val || 0);
      if (maxVal > valorActual) {
        valorActual = maxVal;
      }
    }

    // 2) Incremento atómico del contador
    valorActual += 1;

    await conexion.query(
      'UPDATE secuencia_factura SET valor_actual = ? WHERE nombre_secuencia = ?',
      [valorActual, nombreSecuencia]
    );

    // 3) Formato final: prefijo + 6 dígitos rellenados con ceros.
    return `${prefijo}${String(valorActual).padStart(6, '0')}`;
  }
};
