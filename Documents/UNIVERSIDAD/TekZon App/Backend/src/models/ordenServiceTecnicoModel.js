/**
 * ==========================================================================
 * MODELO DE ORDEN DE SERVICIO TÉCNICO (ordenServiceTecnicoModel.js) - TEKZON
 * ==========================================================================
 * CAPA: Acceso a datos (Data Access Layer) · Módulo 2 (Servicio Técnico y Caja)
 *
 * PROPÓSITO FUNCIONAL:
 *   Administra las CUATRO tablas que intervienen en una reparación:
 *
 *     orden_tecnico  -> la orden propiamente dicha (una por ingreso al taller).
 *                       PK: id_ordentec (VARCHAR) generada como "OS-000001".
 *     dispositivo    -> el equipo recibido (FK id_dispositivo).
 *     detalle_orden  -> los REPUESTOS consumidos, con su cantidad y precio.
 *     pago           -> el cobro final, cuando la orden se cierra.
 *
 *   Ciclo de vida de los estados (ver `estadosOrdenTecnico.js`):
 *     Pendiente -> En Reparacion -> Listo -> Entregado
 *
 * PROPÓSITO TÉCNICO:
 *   Los tres métodos que ESCRIBEN varias tablas (recepción, consumo de repuesto
 *   y cobro) abren una TRANSACCIÓN SQL propia, porque cada uno debe cumplir la
 *   regla de atomicidad:
 *
 *     · RECEPCIÓN   : cliente + dispositivo + orden en un solo COMMIT.
 *     · REPUESTO    : detalle_orden + UPDATE producto + INSERT kádex (SALIDA
 *                     con origen 'SERVICIO_TECNICO') + alerta de stock.
 *     · COBRO       : INSERT pago + UPDATE orden (cobrada/factura/totales).
 * ==========================================================================
 */
import pool from '../config/db.js';
import { MovimientoModel, ORIGENES_MOVIMIENTO } from './movimientoModel.js';
import { AlertaStockModel } from './alertaStockModel.js';

/**
 * Lista de columnas de la orden enriquecida con el cliente y el equipo.
 * Se reutiliza en TODAS las lecturas para que el contrato de la API sea estable.
 */
const COLUMNAS_ORDEN = `
  o.id_ordentec,
  o.id_dispositivo,
  o.id_usuario,
  u.nombre_usuario AS nombre_tecnico,
  u.username       AS username_tecnico,
  o.falla_reportada,
  o.accesorios,
  o.patron_desbloqueo,
  o.observaciones,
  o.estado,
  o.costo_mano_obra,
  o.total_repuestos,
  o.total,
  o.cobrada,
  o.numero_factura,
  o.id_caja,
  o.fecha_ingreso,
  o.fecha_entrega,
  o.fecha_cierre,
  d.nombre_dis,
  d.marca,
  d.modelo,
  d.numero_serie,
  d.cedula_cli,
  c.nombre_cliente,
  c.apellido_cliente,
  c.telefono_cliente,
  c.direccion_cli
`;

/**
 * EFECTO LATERAL CALCULADO: el avance del equipo en el taller, expresado como
 * porcentaje, para la barra de progreso del Panel del Técnico.
 *
 * PROPÓSITO TÉCNICO: se calcula en SQL con un CASE para no traer un campo
 * redundante en la base de datos (que se desincronizaría del estado real).
 */
const COLUMNA_AVANCE = `
  CASE o.estado
    WHEN 'Pendiente'     THEN 10
    WHEN 'En Reparacion' THEN 65
    WHEN 'Listo'         THEN 90
    WHEN 'Entregado'     THEN 100
    ELSE 0
  END AS porcentaje_avance
`;

export const OrdenServiceTecnicoModel = {
  /* ======================================================================
   * 1. LECTURAS
   * ====================================================================== */

  /**
   * LISTA DE ÓRDENES (Panel del Técnico) con filtros dinámicos.
   * La cláusula WHERE se construye parametrizada para evitar inyección SQL.
   *
   * @param {Object} filtros
   * @param {string} [filtros.estado]   Estado exacto de la orden.
   * @param {string} [filtros.cedula]   Cédula del cliente propietario.
   * @param {string} [filtros.texto]    Búsqueda libre (id, cliente, equipo, serie).
   * @param {boolean}[filtros.soloPendientesDeCobro] Órdenes listas sin cobrar.
   */
  async listarOrdenes({ estado, cedula, texto, soloPendientesDeCobro } = {}) {
    const condiciones = [];
    const parametros = [];

    if (estado) {
      condiciones.push('o.estado = ?');
      parametros.push(estado);
    }

    if (cedula) {
      condiciones.push('d.cedula_cli = ?');
      parametros.push(cedula);
    }

    // Órdenes terminadas técnicamente pero todavía sin cobrar: alimenta el
    // módulo de Caja (lo que el taller tiene pendiente por facturar).
    if (soloPendientesDeCobro) {
      condiciones.push('o.estado = ?');
      condiciones.push('o.cobrada = 0');
      parametros.push('Listo');
    }

    if (texto) {
      condiciones.push(`(
        o.id_ordentec     LIKE ?
        OR c.nombre_cliente   LIKE ?
        OR c.apellido_cliente LIKE ?
        OR d.cedula_cli       LIKE ?
        OR d.nombre_dis       LIKE ?
        OR d.marca            LIKE ?
        OR d.numero_serie     LIKE ?
      )`);

      const patronBusqueda = `%${texto}%`;
      // Se empuja el mismo patrón una vez por cada comodín de la condición.
      for (let indice = 0; indice < 7; indice++) parametros.push(patronBusqueda);
    }

    const clausulaWhere = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_ORDEN}, ${COLUMNA_AVANCE}
         FROM orden_tecnico o
         INNER JOIN dispositivo d ON d.id_dispositivo = o.id_dispositivo
         LEFT  JOIN cliente    c ON c.cedula_cli      = d.cedula_cli
         LEFT  JOIN usuario    u ON u.id_usuario      = o.id_usuario
         ${clausulaWhere}
        ORDER BY
          -- Las órdenes ya entregadas y cobradas bajan al final de la lista.
          (o.estado = 'Entregado') ASC,
          o.fecha_ingreso DESC,
          o.id_ordentec DESC`,
      parametros
    );

    return filas;
  },

  /** Recupera una orden por su número (PK) con todos los datos legibles. */
  async obtenerPorId(id_ordentec) {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_ORDEN}, ${COLUMNA_AVANCE}
         FROM orden_tecnico o
         INNER JOIN dispositivo d ON d.id_dispositivo = o.id_dispositivo
         LEFT  JOIN cliente    c ON c.cedula_cli      = d.cedula_cli
         LEFT  JOIN usuario    u ON u.id_usuario      = o.id_usuario
        WHERE o.id_ordentec = ?`,
      [id_ordentec]
    );

    return filas[0];
  },

  /**
   * LISTA LOS REPUESTOS CONSUMIDOS POR UNA ORDEN.
   * Alimenta la tabla de repuestos del Panel del Técnico y el desglose de la
   * factura de servicio técnico.
   *
   * PROPÓSITO TÉCNICO: además de las líneas del detalle, cada repuesto se
   * enriquece con el ASIENTO DEL KÁRDEX que generó su salida (id_movimiento,
   * origen y fecha). Se obtiene con una SUBCONSULTA en lugar de una consulta por
   * repuesto, para no incurrir en el problema N+1 cuando la orden tiene muchas
   * piezas. Estos datos son los que permiten demostrar en la interfaz que el
   * descuento quedó registrado como "Servicio Técnico".
   */
  async listarRepuestos(id_ordentec) {
    const [filas] = await pool.query(
      `SELECT d.id_ordentec,
              d.cod_producto,
              p.nombre_producto,
              p.imagen,
              p.marca,
              p.existencia AS existencia_actual,
              p.stock_minimo,
              d.cantidad,
              d.precio_unitario,
              d.subtotal,
              d.tipo_item,
              (SELECT m.id_movimiento
                 FROM movimiento_inventario m
                WHERE m.cod_producto = d.cod_producto
                  AND m.tipo_movimiento = 'SALIDA'
                  AND m.motivo LIKE CONCAT('%', d.id_ordentec, '%')
                ORDER BY m.id_movimiento DESC
                LIMIT 1) AS id_movimiento,
              (SELECT m.origen
                 FROM movimiento_inventario m
                WHERE m.cod_producto = d.cod_producto
                  AND m.tipo_movimiento = 'SALIDA'
                  AND m.motivo LIKE CONCAT('%', d.id_ordentec, '%')
                ORDER BY m.id_movimiento DESC
                LIMIT 1) AS origen,
              (SELECT m.fecha_movimiento
                 FROM movimiento_inventario m
                WHERE m.cod_producto = d.cod_producto
                  AND m.tipo_movimiento = 'SALIDA'
                  AND m.motivo LIKE CONCAT('%', d.id_ordentec, '%')
                ORDER BY m.id_movimiento DESC
                LIMIT 1) AS fecha_movimiento
         FROM detalle_orden d
         INNER JOIN producto p ON p.cod_producto = d.cod_producto
        WHERE d.id_ordentec = ?
        ORDER BY p.nombre_producto ASC`,
      [id_ordentec]
    );

    /*
     * El motivo guarda siempre el número de orden ("... orden de servicio
     * técnico OS-000001"), por lo que la subconsulta localiza el asiento exacto
     * incluso si el mismo repuesto se consumió en varias órdenes distintas.
     */
    return filas.map((fila) => ({
      ...fila,
      // Si por alguna razón histórica no se encontró el asiento, se informa el
      // origen esperado en lugar de dejar el campo vacío.
      origen: fila.origen || ORIGENES_MOVIMIENTO.SERVICIO_TECNICO
    }));
  },

  /**
   * SUMA EL COSTO DE LOS REPUESTOS DE UNA ORDEN.
   * @param {Object} [conexion] Si se recibe, la consulta viaja DENTRO de la
   *   transacción en curso (imprescindible en el cobro, para leer una foto
   *   consistente del detalle y no perder un repuesto agregado en paralelo).
   */
  async sumarTotalRepuestos(id_ordentec, conexion = null) {
    const ejecutor = conexion || pool;

    const [filas] = await ejecutor.query(
      `SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS total_repuestos,
              COALESCE(SUM(cantidad), 0)                   AS total_unidades
         FROM detalle_orden
        WHERE id_ordentec = ?`,
      [id_ordentec]
    );

    return {
      total_repuestos: Number(filas[0]?.total_repuestos || 0),
      total_unidades: Number(filas[0]?.total_unidades || 0)
    };
  },

  /** Recupera una línea concreta del detalle (repuesto dentro de una orden). */
  async obtenerRepuesto(id_ordentec, cod_producto) {
    const [filas] = await pool.query(
      `SELECT id_ordentec, cod_producto, cantidad, precio_unitario, subtotal, tipo_item
         FROM detalle_orden
        WHERE id_ordentec = ? AND cod_producto = ?`,
      [id_ordentec, cod_producto]
    );

    return filas[0];
  },

  /**
   * INDICADORES DEL TALLER para las tarjetas KPI del Panel del Técnico.
   * Devuelve el conteo de órdenes por estado, cuántas están pendientes de cobro
   * y los ingresos ya facturados por servicio técnico.
   */
  async obtenerIndicadoresTaller() {
    const [filasEstado] = await pool.query(
      `SELECT estado, COUNT(*) AS total
         FROM orden_tecnico
        GROUP BY estado`
    );

    const [filasCobro] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN cobrada = 0 THEN 1 ELSE 0 END), 0) AS pendientes_cobro,
         COALESCE(SUM(CASE WHEN cobrada = 1 THEN 1 ELSE 0 END), 0) AS ordenes_cobradas,
         COALESCE(SUM(CASE WHEN cobrada = 1 THEN total ELSE 0 END), 0) AS ingresos_servicio
       FROM orden_tecnico`
    );

    // Se normaliza el conteo por estado a un objeto con las cuatro claves
    // siempre presentes, para que el frontend no tenga que validar `undefined`.
    const porEstado = {
      Pendiente: 0,
      'En Reparacion': 0,
      Listo: 0,
      Entregado: 0
    };

    filasEstado.forEach((fila) => {
      porEstado[fila.estado] = Number(fila.total);
    });

    const cobro = filasCobro[0] || {};

    return {
      por_estado: porEstado,
      total_ordenes: Object.values(porEstado).reduce((suma, valor) => suma + valor, 0),
      pendientes_cobro: Number(cobro.pendientes_cobro || 0),
      ordenes_cobradas: Number(cobro.ordenes_cobradas || 0),
      ingresos_servicio: Number(cobro.ingresos_servicio || 0)
    };
  },

  /* ======================================================================
   * 2. RECEPCIÓN · CLIENTE + DISPOSITIVO + ORDEN EN UNA SOLA TRANSACCIÓN
   * ====================================================================== */

  /**
   * REGISTRA LA RECEPCIÓN COMPLETA DEL EQUIPO Y CREA LA ORDEN "Pendiente".
   *
   * PROPÓSITO FUNCIONAL:
   *   Es la operación de entrada del taller. En un solo paso:
   *     1. Da de alta el CLIENTE si su cédula no existe (o reutiliza su ficha).
   *     2. Da de alta el DISPOSITIVO si no estaba registrado para ese cliente
   *        (o reutiliza la ficha, para no perder su historial de reparaciones).
   *     3. Genera el número correlativo de la orden ("OS-000001").
   *     4. Crea la ORDEN con estado por defecto "Pendiente".
   *
   * PROPÓSITO TÉCNICO: todo viaja en UNA transacción, de modo que nunca puede
   * quedar un cliente o un equipo "huérfano" sin su orden de servicio.
   *
   * @param {Object} datosRecepcion Datos ya validados por el servicio.
   * @returns {Promise<Object>} { id_ordentec, esClienteNuevo, esDispositivoNuevo }
   */
  async registrarRecepcion(datosRecepcion) {
    const {
      cedula_cli,
      nombre_cliente,
      apellido_cliente,
      telefono_cliente,
      direccion_cli,
      nombre_dis,
      marca,
      modelo,
      numero_serie,
      falla_reportada,
      accesorios,
      patron_desbloqueo,
      id_usuario
    } = datosRecepcion;

    const conexion = await pool.getConnection();

    try {
      await conexion.beginTransaction();

      /* ---------------------------------------------------------------
       * PASO 1 · CLIENTE
       * --------------------------------------------------------------- */
      // Se bloquea la fila del cliente (si existe) para evitar que dos
      // recepciones simultáneas de la misma cédula lo inserten dos veces.
      const [filasCliente] = await conexion.query(
        'SELECT cedula_cli FROM cliente WHERE cedula_cli = ? FOR UPDATE',
        [cedula_cli]
      );

      let esClienteNuevo = false;

      if (filasCliente.length === 0) {
        await conexion.query(
          `INSERT INTO cliente
             (cedula_cli, nombre_cliente, apellido_cliente, telefono_cliente, direccion_cli)
           VALUES (?, ?, ?, ?, ?)`,
          [cedula_cli, nombre_cliente, apellido_cliente, telefono_cliente, direccion_cli]
        );
        esClienteNuevo = true;
      }

      /* ---------------------------------------------------------------
       * PASO 2 · DISPOSITIVO
       * --------------------------------------------------------------- */
      let idDispositivo;
      let esDispositivoNuevo = false;

      if (numero_serie) {
        // Se busca el equipo por número de serie DENTRO del mismo cliente.
        const [filasDispositivo] = await conexion.query(
          `SELECT id_dispositivo
             FROM dispositivo
            WHERE numero_serie = ? AND cedula_cli = ?
            LIMIT 1
            FOR UPDATE`,
          [numero_serie, cedula_cli]
        );

        if (filasDispositivo.length > 0) {
          // El equipo ya estaba registrado: se reutiliza su ficha para que el
          // historial de reparaciones quede unido en un solo dispositivo.
          idDispositivo = filasDispositivo[0].id_dispositivo;
        }
      }

      if (!idDispositivo) {
        const [resultadoDispositivo] = await conexion.query(
          `INSERT INTO dispositivo
             (nombre_dis, marca, modelo, numero_serie, cedula_cli)
           VALUES (?, ?, ?, ?, ?)`,
          [nombre_dis, marca, modelo, numero_serie, cedula_cli]
        );

        idDispositivo = resultadoDispositivo.insertId;
        esDispositivoNuevo = true;
      }

      /* ---------------------------------------------------------------
       * PASO 3 · NÚMERO CORRELATIVO DE LA ORDEN
       * --------------------------------------------------------------- */
      const id_ordentec = await MovimientoModel.tomarSiguienteCorrelativo(conexion, 'ORDEN');

      /* ---------------------------------------------------------------
       * PASO 4 · ORDEN DE SERVICIO TÉCNICO (estado por defecto "Pendiente")
       * --------------------------------------------------------------- */
      await conexion.query(
        `INSERT INTO orden_tecnico
           (id_ordentec, id_dispositivo, id_usuario, falla_reportada, accesorios,
            patron_desbloqueo, estado, costo, costo_mano_obra, total_repuestos,
            total, cobrada, fecha_ingreso)
         VALUES (?, ?, ?, ?, ?, ?, 'Pendiente', 0.00, 0.00, 0.00, 0.00, 0, CURRENT_TIMESTAMP)`,
        [
          id_ordentec,
          idDispositivo,
          id_usuario,
          falla_reportada,
          accesorios,
          patron_desbloqueo
        ]
      );

      await conexion.commit();

      return { id_ordentec, id_dispositivo: idDispositivo, esClienteNuevo, esDispositivoNuevo };
    } catch (error) {
      // Ante cualquier fallo no puede quedar ni el cliente ni el equipo a medias.
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  },

  /* ======================================================================
   * 3. PANEL DEL TÉCNICO · ACTUALIZACIONES DE LA ORDEN
   * ====================================================================== */

  /**
   * ACTUALIZA EL ESTADO Y LAS OBSERVACIONES DE UNA ORDEN.
   *
   * PROPÓSITO FUNCIONAL: es la operación central del Panel del Técnico: el
   * técnico avanza la reparación (Pendiente -> En Reparacion -> Listo) y
   * documenta lo que encontró.
   *
   * PROPÓSITO TÉCNICO: cuando el estado pasa a 'Listo' se fija `fecha_entrega`
   * (la fecha en que el equipo QUEDÓ disponible para el cliente). Cuando pasa a
   * 'Entregado' se fija `fecha_cierre` sólo si la orden ya estaba cobrada; si no
   * lo estaba, el servicio exige el cobro primero.
   */
  async actualizarEstado(id_ordentec, datosActualizacion) {
    const { estado, observaciones, costo_mano_obra, fecha_entrega } = datosActualizacion;

    const [resultado] = await pool.query(
      `UPDATE orden_tecnico
          SET estado            = ?,
              observaciones     = ?,
              costo_mano_obra   = ?,
              total             = ? + total_repuestos,
              costo             = ? + total_repuestos,
              fecha_entrega     = ?
        WHERE id_ordentec = ?`,
      [
        estado,
        observaciones,
        costo_mano_obra,
        costo_mano_obra,
        costo_mano_obra,
        fecha_entrega,
        id_ordentec
      ]
    );

    if (resultado.affectedRows === 0) return null;

    return await this.obtenerPorId(id_ordentec);
  },

  /**
   * RECALCULA Y PERSISTE LOS TOTALES DE LA ORDEN.
   *
   * PROPÓSITO FUNCIONAL: mantiene sincronizados los tres importes económicos:
   *   total_repuestos = SUMA(detalle_orden)
   *   total           = costo_mano_obra + total_repuestos
   *   costo           = (columna heredada del DDL) mismo valor que `total`
   *
   * PROPÓSITO TÉCNICO: se ejecuta DENTRO de la transacción del repuesto, de modo
   * que el total que se muestra en pantalla siempre coincide con el detalle que
   * realmente existe en la base de datos.
   *
   * @param {Object} conexion Conexión con transacción activa.
   */
  async recalcularTotales(id_ordentec, conexion) {
    const { total_repuestos } = await this.sumarTotalRepuestos(id_ordentec, conexion);

    await conexion.query(
      `UPDATE orden_tecnico
          SET total_repuestos = ?,
              total           = costo_mano_obra + ?,
              costo           = costo_mano_obra + ?
        WHERE id_ordentec = ?`,
      [total_repuestos, total_repuestos, total_repuestos, id_ordentec]
    );

    return { total_repuestos };
  },

  /* ======================================================================
   * 4. CONSUMO DE INVENTARIO · REPUESTOS
   * ====================================================================== */

  /**
   * AGREGA UN REPUESTO A LA ORDEN Y DESCUENTA EL INVENTARIO.
   *
   * PROPÓSITO FUNCIONAL (requisito explícito del sistema):
   *   "Si la orden requiere un repuesto, el técnico lo agrega. Al hacerlo, el
   *    sistema debe restar la cantidad de la existencia del inventario y guardar
   *    un registro en una tabla de movimientos de inventario marcando la salida
   *    como 'Servicio Técnico'."
   *
   * PROPÓSITO TÉCNICO: una sola transacción encadena cuatro escrituras:
   *   1. INSERT/UPDATE en `detalle_orden` (la línea del repuesto).
   *   2. UPDATE `producto.existencia` (descuento real del stock).
   *   3. INSERT en `movimiento_inventario` (SALIDA, origen SERVICIO_TECNICO).
   *   4. INSERT/UPDATE en `alerta_stock` si se alcanzó el stock mínimo.
   *   Y al final recalcula los totales de la orden.
   *
   * Si el repuesto YA estaba en la orden, se ACUMULA la cantidad y se descuenta
   * únicamente la diferencia, para no descontar dos veces lo mismo.
   *
   * @returns {Promise<Object>} Resultado con la traza de stock y las alertas.
   */
  async agregarRepuesto(datosRepuesto) {
    const {
      id_ordentec,
      cod_producto,
      cantidad,
      precio_unitario,
      id_usuario,
      origen = ORIGENES_MOVIMIENTO.SERVICIO_TECNICO
    } = datosRepuesto;

    const conexion = await pool.getConnection();

    try {
      await conexion.beginTransaction();

      // ---- 0. La orden debe existir, no estar cobrada y no estar entregada ----
      const [filasOrden] = await conexion.query(
        'SELECT id_ordentec, estado, cobrada FROM orden_tecnico WHERE id_ordentec = ? FOR UPDATE',
        [id_ordentec]
      );

      if (filasOrden.length === 0) {
        await conexion.rollback();
        return { ordenEncontrada: false };
      }

      const orden = filasOrden[0];

      if (Number(orden.cobrada) === 1) {
        await conexion.rollback();
        return { ordenCobrada: true, id_ordentec };
      }

      if (orden.estado === 'Entregado') {
        await conexion.rollback();
        return { ordenEntregada: true, id_ordentec };
      }

      // ---- 1. ¿El repuesto ya está en la orden? -> se calcula la DIFERENCIA ----
      const [filasDetalle] = await conexion.query(
        `SELECT cantidad, precio_unitario
           FROM detalle_orden
          WHERE id_ordentec = ? AND cod_producto = ?
          FOR UPDATE`,
        [id_ordentec, cod_producto]
      );

      const cantidadPrevia = filasDetalle.length > 0 ? Number(filasDetalle[0].cantidad) : 0;
      const cantidadTotal = cantidadPrevia + Number(cantidad);

      // Sólo se descuenta del almacén la cantidad NUEVA que se está agregando.
      const cantidadADescontar = Number(cantidad);

      // ---- 2. Descuento de inventario + asiento de kádex ----
      const resultadoDescuento = await MovimientoModel.descontarStockProducto(conexion, {
        cod_producto,
        cantidad: cantidadADescontar,
        id_usuario,
        motivo: `Consumo de repuesto en la orden de servicio técnico ${id_ordentec}`,
        origen
      });

      // El producto no existe en el catálogo.
      if (!resultadoDescuento.encontrado) {
        await conexion.rollback();
        return { repuestoNoEncontrado: true, cod_producto };
      }

      // El producto está dado de baja lógica.
      if (resultadoDescuento.inactivo) {
        await conexion.rollback();
        return { repuestoInactivo: true, cod_producto, nombre_producto: resultadoDescuento.nombre_producto };
      }

      // Stock insuficiente: se aborta TODA la operación.
      if (resultadoDescuento.stockInsuficiente) {
        await conexion.rollback();
        return {
          stockInsuficiente: true,
          cod_producto,
          nombre_producto: resultadoDescuento.nombre_producto,
          existenciaDisponible: resultadoDescuento.existenciaDisponible,
          cantidadSolicitada: resultadoDescuento.cantidadSolicitada
        };
      }

      // ---- 3. Se escribe la línea del detalle (repuesto) ----
      // Si el precio no viene informado, se usa el precio de VENTA del catálogo
      // como valor por defecto; así el técnico no tiene que teclearlo siempre.
      let precioFinal = precio_unitario;

      if (precioFinal === undefined || precioFinal === null) {
        const [filasPrecio] = await conexion.query(
          'SELECT precio_venta FROM producto WHERE cod_producto = ?',
          [cod_producto]
        );
        precioFinal = Number(filasPrecio[0]?.precio_venta || 0);
      }

      const subtotal = Number((Number(precioFinal) * cantidadTotal).toFixed(2));

      if (cantidadPrevia > 0) {
        // La línea ya existía: se actualiza la cantidad acumulada.
        await conexion.query(
          `UPDATE detalle_orden
              SET cantidad        = ?,
                  precio_unitario = ?,
                  subtotal        = ?
            WHERE id_ordentec = ? AND cod_producto = ?`,
          [cantidadTotal, precioFinal, subtotal, id_ordentec, cod_producto]
        );
      } else {
        await conexion.query(
          `INSERT INTO detalle_orden
             (id_ordentec, cod_producto, cantidad, precio_unitario, subtotal, tipo_item)
           VALUES (?, ?, ?, ?, ?, 'REPUESTO')`,
          [id_ordentec, cod_producto, cantidadTotal, precioFinal, subtotal]
        );
      }

      // ---- 4. AUTOMATIZACIÓN DE ALERTA DE STOCK MÍNIMO ----
      const alerta = await AlertaStockModel.registrarAlertaSiCorresponde(conexion, {
        cod_producto,
        existencia: resultadoDescuento.existencia_posterior,
        stock_minimo: resultadoDescuento.stock_minimo,
        origen,
        documento: id_ordentec
      });

      // ---- 5. Se recalculan los totales económicos de la orden ----
      await this.recalcularTotales(id_ordentec, conexion);

      await conexion.commit();

      return {
        exito: true,
        cod_producto,
        nombre_producto: resultadoDescuento.nombre_producto,
        cantidad_agregada: cantidadADescontar,
        cantidad_total_en_orden: cantidadTotal,
        precio_unitario: Number(precioFinal),
        subtotal,
        existencia_previa: resultadoDescuento.existencia_previa,
        existencia_posterior: resultadoDescuento.existencia_posterior,
        origen,
        id_movimiento: resultadoDescuento.id_movimiento,
        alerta: alerta || null
      };
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  },

  /**
   * QUITA UN REPUESTO DE LA ORDEN Y DEVUELVE EL STOCK AL INVENTARIO.
   *
   * PROPÓSITO FUNCIONAL: el técnico puede equivocarse al agregar un repuesto;
   * esta operación deshace el consumo. El stock vuelve al estante y queda
   * auditado como ENTRADA en el kádex con el mismo origen 'SERVICIO_TECNICO',
   * de modo que el kárdex explique tanto la salida como su reverso.
   *
   * REGLA: si la orden ya fue COBRADA no se puede quitar el repuesto, porque la
   * factura ya fue emitida con ese importe (esa validación la hace el servicio).
   *
   * @param {string} id_ordentec   Orden de la que se retira el repuesto.
   * @param {string} cod_producto  Repuesto a retirar.
   * @param {number} cantidad      Unidades a retirar (si no se indica, todas).
   */
  async quitarRepuesto({ id_ordentec, cod_producto, cantidad, id_usuario }) {
    const conexion = await pool.getConnection();

    try {
      await conexion.beginTransaction();

      // ---- 1. Estado actual de la orden y de la línea del detalle ----
      const [filasOrden] = await conexion.query(
        'SELECT id_ordentec, estado, cobrada FROM orden_tecnico WHERE id_ordentec = ? FOR UPDATE',
        [id_ordentec]
      );

      if (filasOrden.length === 0) {
        await conexion.rollback();
        return { ordenEncontrada: false };
      }

      if (Number(filasOrden[0].cobrada) === 1) {
        await conexion.rollback();
        return { ordenCobrada: true, id_ordentec };
      }

      const [filasDetalle] = await conexion.query(
        `SELECT cantidad, precio_unitario
           FROM detalle_orden
          WHERE id_ordentec = ? AND cod_producto = ?
          FOR UPDATE`,
        [id_ordentec, cod_producto]
      );

      if (filasDetalle.length === 0) {
        await conexion.rollback();
        return { repuestoNoEstaEnOrden: true, cod_producto };
      }

      const cantidadEnOrden = Number(filasDetalle[0].cantidad);
      const precioUnitario = Number(filasDetalle[0].precio_unitario);

      // Si no se especifica cuántas unidades retirar, se retiran todas.
      const cantidadARetirar = cantidad === undefined || cantidad === null
        ? cantidadEnOrden
        : Number(cantidad);

      if (cantidadARetirar <= 0 || cantidadARetirar > cantidadEnOrden) {
        await conexion.rollback();
        return {
          cantidadInvalida: true,
          cantidadEnOrden,
          cantidadSolicitada: cantidadARetirar
        };
      }

      const cantidadRestante = cantidadEnOrden - cantidadARetirar;

      // ---- 2. Se devuelve el stock al inventario (ENTRADA en el kádex) ----
      const resultadoDevolucion = await MovimientoModel.devolverStockProducto(conexion, {
        cod_producto,
        cantidad: cantidadARetirar,
        id_usuario,
        motivo: `Devolución de repuesto de la orden de servicio técnico ${id_ordentec}`,
        origen: ORIGENES_MOVIMIENTO.SERVICIO_TECNICO
      });

      if (!resultadoDevolucion.encontrado) {
        await conexion.rollback();
        return { repuestoNoEncontrado: true, cod_producto };
      }

      // ---- 3. Se actualiza o se elimina la línea del detalle ----
      if (cantidadRestante === 0) {
        // Se retiró todo el repuesto: la línea desaparece del detalle.
        await conexion.query(
          'DELETE FROM detalle_orden WHERE id_ordentec = ? AND cod_producto = ?',
          [id_ordentec, cod_producto]
        );
      } else {
        await conexion.query(
          `UPDATE detalle_orden
              SET cantidad = ?,
                  subtotal = ?
            WHERE id_ordentec = ? AND cod_producto = ?`,
          [cantidadRestante, Number((precioUnitario * cantidadRestante).toFixed(2)), id_ordentec, cod_producto]
        );
      }

      // ---- 4. Se recalculan los totales de la orden ----
      await this.recalcularTotales(id_ordentec, conexion);

      await conexion.commit();

      return {
        exito: true,
        cod_producto,
        nombre_producto: resultadoDevolucion.nombre_producto,
        cantidad_devuelta: cantidadARetirar,
        cantidad_restante_en_orden: cantidadRestante,
        existencia_previa: resultadoDevolucion.existencia_previa,
        existencia_posterior: resultadoDevolucion.existencia_posterior,
        id_movimiento: resultadoDevolucion.id_movimiento
      };
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  },

  /* ======================================================================
   * 5. COBRO Y CIERRE DE LA ORDEN
   * ====================================================================== */

  /**
   * REGISTRA EL COBRO DE LA ORDEN, EMITE LA FACTURA Y CIERRA LA ORDEN.
   *
   * PROPÓSITO FUNCIONAL (requisito explícito):
   *   "Al finalizar, el sistema suma automáticamente el costo de la mano de obra
   *    más el costo de los repuestos utilizados. El cliente procede a cancelar,
   *    se registra el método de pago, el monto, se emite la factura y se cierra
   *    la orden del técnico."
   *
   * PROPÓSITO TÉCNICO: una transacción ejecuta las cuatro escrituras del cierre:
   *   1. Se TOMA el correlativo de factura (FAC-000001) con bloqueo de fila.
   *   2. INSERT en `pago` (metodo_pago, monto, tasa, caja, origen, referencia).
   *   3. UPDATE `orden_tecnico` -> cobrada = 1, numero_factura, id_caja,
   *      fecha_cierre y estado = 'Entregado'.
   *   4. Se marcan como atendidas las alertas de los repuestos consumidos.
   *
   * @param {Object} datosCobro { id_ordentec, metodo_pago, monto_usd, tasa_cambio,
   *                             referencia, id_caja, id_usuario, observaciones }
   */
  async cobrarOrden(datosCobro) {
    const {
      id_ordentec,
      metodo_pago,
      monto_usd,
      tasa_cambio,
      referencia,
      id_caja,
      observaciones
    } = datosCobro;

    const conexion = await pool.getConnection();

    try {
      await conexion.beginTransaction();

      /* ---- 1. Se bloquea la orden y se leen sus totales REALES ---- */
      const [filasOrden] = await conexion.query(
        `SELECT id_ordentec, estado, cobrada, costo_mano_obra, total_repuestos
           FROM orden_tecnico
          WHERE id_ordentec = ?
          FOR UPDATE`,
        [id_ordentec]
      );

      if (filasOrden.length === 0) {
        await conexion.rollback();
        return { ordenEncontrada: false };
      }

      const orden = filasOrden[0];

      // Una orden no se cobra dos veces.
      if (Number(orden.cobrada) === 1) {
        await conexion.rollback();
        return { ordenYaCobrada: true, id_ordentec };
      }

      /*
       * ---- 2. Se RECALCULA el total DENTRO de la transacción ----
       * El total se recalcula aquí (y no se confía en el que envía el cliente)
       * para que el importe facturado corresponda exactamente a los repuestos
       * que existen en `detalle_orden` más la mano de obra registrada. Así se
       * cumple literalmente "el sistema suma automáticamente mano de obra +
       * repuestos" y se impide que un cliente malicioso altere el precio.
       */
      const { total_repuestos: totalRepuestos } = await this.sumarTotalRepuestos(id_ordentec, conexion);
      const costoManoObra = Number(orden.costo_mano_obra || 0);
      const totalCalculado = Number((costoManoObra + totalRepuestos).toFixed(2));

      // Se persisten los totales recalculados.
      await conexion.query(
        `UPDATE orden_tecnico
            SET total_repuestos = ?,
                total           = ?,
                costo           = ?
          WHERE id_ordentec = ?`,
        [totalRepuestos, totalCalculado, totalCalculado, id_ordentec]
      );

      /* ---- 3. Se toma el correlativo de la factura ---- */
      const numeroFactura = await MovimientoModel.tomarSiguienteCorrelativo(conexion, 'FACTURA');

      /* ---- 4. Se registra el PAGO ---- */
      const [resultadoPago] = await conexion.query(
        `INSERT INTO pago
           (id_caja, tipo_origen, metodo_pago, monto_usd, tasa_cambio,
            referencia, fecha_pago, venta_num_factura, id_ordentec)
         VALUES (?, 'SERVICIO_TECNICO', ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL, ?)`,
        [id_caja, metodo_pago, monto_usd, tasa_cambio, referencia, id_ordentec]
      );

      /* ---- 5. Se cierra la orden: cobrada, facturada y entregada ---- */
      await conexion.query(
        `UPDATE orden_tecnico
            SET cobrada        = 1,
                numero_factura = ?,
                id_caja        = ?,
                estado         = 'Entregado',
                fecha_entrega  = CURRENT_TIMESTAMP,
                fecha_cierre   = CURRENT_TIMESTAMP,
                observaciones  = CONCAT(COALESCE(observaciones, ''), ?)
          WHERE id_ordentec = ?`,
        [
          numeroFactura,
          id_caja,
          observaciones ? `\n[CIERRE] ${observaciones}` : '',
          id_ordentec
        ]
      );

      await conexion.commit();

      return {
        exito: true,
        id_ordentec,
        numero_factura: numeroFactura,
        id_pago: resultadoPago.insertId,
        metodo_pago,
        monto_usd,
        tasa_cambio,
        costo_mano_obra: costoManoObra,
        total_repuestos: totalRepuestos,
        total: totalCalculado,
        id_caja
      };
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  },

  /**
   * RECUPERA EL DOCUMENTO DE COBRO DE UNA ORDEN (factura + pago).
   * Alimenta el comprobante que se imprime/visualiza tras el cobro.
   */
  async obtenerFacturaDeOrden(id_ordentec) {
    const orden = await this.obtenerPorId(id_ordentec);

    if (!orden) return null;

    const repuestos = await this.listarRepuestos(id_ordentec);

    const [filasPago] = await pool.query(
      `SELECT p.id_pago, p.metodo_pago, p.monto_usd, p.tasa_cambio, p.referencia,
              p.fecha_pago, p.tipo_origen, p.id_caja
         FROM pago p
        WHERE p.id_ordentec = ?
        ORDER BY p.id_pago DESC
        LIMIT 1`,
      [id_ordentec]
    );

    return { orden, repuestos, pago: filasPago[0] || null };
  },

  /**
   * MARCA COMO ATENDIDAS LAS ALERTAS DE LOS REPUESTOS DE UNA ORDEN COBRADA.
   *
   * PROPÓSITO FUNCIONAL: al cobrar la orden, el repuesto ya fue instalado en el
   * equipo del cliente y salió definitivamente del almacén; la alerta deja de
   * ser accionable para esa salida (seguirá vigente si el stock continúa bajo).
   */
  async atenderAlertasDeRepuestos(id_ordentec) {
    const [resultado] = await pool.query(
      `UPDATE alerta_stock a
         INNER JOIN detalle_orden d ON d.cod_producto = a.cod_producto
            SET a.atendida = 1
          WHERE d.id_ordentec = ?
            AND a.atendida = 0
            AND a.origen = ?`,
      [id_ordentec, ORIGENES_MOVIMIENTO.SERVICIO_TECNICO]
    );

    return resultado.affectedRows;
  }
};

export default OrdenServiceTecnicoModel;
