/**
 * ==========================================================================
 * MODELO DE CLIENTE (clienteModel.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Acceso a datos (Data Access Layer) · Módulo 2 (Recepción)
 *
 * PROPÓSITO FUNCIONAL:
 *   Administra la tabla `cliente`, que es el punto de partida de los DOS flujos
 *   comerciales del sistema:
 *
 *     · Servicio Técnico: el cliente trae un dispositivo -> cliente + dispositivo.
 *     · Venta Directa   : el cliente compra un artículo -> cliente + factura.
 *
 * PROPÓSITO TÉCNICO:
 *   La llave primaria de `cliente` es la CÉDULA (`cedula_cli`, VARCHAR 20), no
 *   un número autoincremental, tal como está definido en el modelo relacional
 *   original. Por ello el modelo ofrece `existeCliente` y `buscarPorCedula`
 *   como operaciones centrales: los servicios los usan para decidir si deben
 *   insertar el cliente o reutilizar el que ya existe (evitando el error 1062
 *   de llave duplicada).
 * ==========================================================================
 */
import pool from '../config/db.js';

/** Columnas de la tabla cliente, en el orden en que las consume el frontend. */
const COLUMNAS_CLIENTE = `
  c.cedula_cli,
  c.nombre_cliente,
  c.apellido_cliente,
  c.telefono_cliente,
  c.direccion_cli
`;

export const ClienteModel = {
  /**
   * LISTA DE CLIENTES con el conteo de dispositivos y de compras asociadas.
   *
   * PROPÓSITO FUNCIONAL: alimenta la tabla de la pantalla de Clientes y permite
   * buscar por cédula, nombre o apellido con un solo cuadro de texto.
   *
   * PROPÓSITO TÉCNICO: se usan SUBCONSULTAS correlacionadas en lugar de un
   * `LEFT JOIN` con `GROUP BY`, porque combinar dos relaciones "uno a muchos"
   * (dispositivos y facturas) en un mismo JOIN multiplicaría las filas y daría
   * conteos inflados.
   *
   * @param {Object} filtros
   * @param {string} [filtros.texto] Búsqueda libre (cédula, nombre o apellido).
   */
  async listarClientes({ texto } = {}) {
    const condiciones = [];
    const parametros = [];

    if (texto) {
      // La búsqueda es parcial (LIKE) y cubre los tres campos identificativos.
      condiciones.push(`(
        c.cedula_cli       LIKE ?
        OR c.nombre_cliente   LIKE ?
        OR c.apellido_cliente LIKE ?
      )`);

      const patronBusqueda = `%${texto}%`;
      parametros.push(patronBusqueda, patronBusqueda, patronBusqueda);
    }

    const clausulaWhere = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_CLIENTE},
              (SELECT COUNT(*) FROM dispositivo d WHERE d.cedula_cli = c.cedula_cli) AS total_dispositivos,
              (SELECT COUNT(*) FROM venta v       WHERE v.cedula_cli = c.cedula_cli) AS total_compras,
              (SELECT COUNT(*) FROM dispositivo d
                 INNER JOIN orden_tecnico o ON o.id_dispositivo = d.id_dispositivo
                WHERE d.cedula_cli = c.cedula_cli)                                      AS total_ordenes
         FROM cliente c
         ${clausulaWhere}
        ORDER BY c.apellido_cliente ASC, c.nombre_cliente ASC`,
      parametros
    );

    return filas;
  },

  /** Recupera un cliente por su cédula (llave primaria). */
  async obtenerPorCedula(cedula_cli) {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_CLIENTE}
         FROM cliente c
        WHERE c.cedula_cli = ?`,
      [cedula_cli]
    );

    return filas[0];
  },

  /** Comprueba si la cédula ya está registrada (antes de insertar). */
  async existeCliente(cedula_cli) {
    const [filas] = await pool.query(
      'SELECT 1 FROM cliente WHERE cedula_cli = ? LIMIT 1',
      [cedula_cli]
    );

    return filas.length > 0;
  },

  /**
   * REGISTRA UN CLIENTE NUEVO.
   * Todas las columnas son opcionales en el DDL salvo la cédula, pero el
   * servicio exige nombre y apellido por ser datos indispensables para la
   * factura y para identificar al propietario del equipo.
   */
  async crearCliente(datosCliente) {
    const { cedula_cli, nombre_cliente, apellido_cliente, telefono_cliente, direccion_cli } = datosCliente;

    await pool.query(
      `INSERT INTO cliente
         (cedula_cli, nombre_cliente, apellido_cliente, telefono_cliente, direccion_cli)
       VALUES (?, ?, ?, ?, ?)`,
      [cedula_cli, nombre_cliente, apellido_cliente, telefono_cliente, direccion_cli]
    );

    return await this.obtenerPorCedula(cedula_cli);
  },

  /** ACTUALIZA los datos de contacto de un cliente existente. */
  async actualizarCliente(cedula_cli, datosCliente) {
    const { nombre_cliente, apellido_cliente, telefono_cliente, direccion_cli } = datosCliente;

    const [resultado] = await pool.query(
      `UPDATE cliente
          SET nombre_cliente    = ?,
              apellido_cliente  = ?,
              telefono_cliente  = ?,
              direccion_cli     = ?
        WHERE cedula_cli = ?`,
      [nombre_cliente, apellido_cliente, telefono_cliente, direccion_cli, cedula_cli]
    );

    // Cero filas afectadas => la cédula no existe (el servicio responde 404).
    if (resultado.affectedRows === 0) return null;

    return await this.obtenerPorCedula(cedula_cli);
  },

  /**
   * HISTORIAL COMPLETO DE UN CLIENTE: sus equipos y sus facturas.
   * Alimenta el panel de detalle de la pantalla de Clientes.
   */
  async obtenerHistorialCliente(cedula_cli) {
    // ---- 1. Equipos registrados a nombre del cliente ----
    const [dispositivos] = await pool.query(
      `SELECT d.id_dispositivo,
              d.nombre_dis,
              d.marca,
              d.modelo,
              d.numero_serie,
              (SELECT COUNT(*) FROM orden_tecnico o WHERE o.id_dispositivo = d.id_dispositivo) AS total_ordenes
         FROM dispositivo d
        WHERE d.cedula_cli = ?
        ORDER BY d.id_dispositivo DESC`,
      [cedula_cli]
    );

    // ---- 2. Facturas de venta directa ----
    const [facturas] = await pool.query(
      `SELECT v.num_factura,
              v.monto_total,
              v.fecha_venta,
              v.tipo_venta,
              v.estado,
              (SELECT COUNT(*) FROM detalle_factura df WHERE df.num_factura = v.num_factura) AS total_lineas
         FROM venta v
        WHERE v.cedula_cli = ?
        ORDER BY v.fecha_venta DESC`,
      [cedula_cli]
    );

    // ---- 3. Órdenes de servicio técnico (a través de sus dispositivos) ----
    const [ordenes] = await pool.query(
      `SELECT o.id_ordentec,
              o.estado,
              o.falla_reportada,
              o.total,
              o.cobrada,
              o.fecha_ingreso,
              d.nombre_dis,
              d.marca,
              d.modelo
         FROM orden_tecnico o
         INNER JOIN dispositivo d ON d.id_dispositivo = o.id_dispositivo
        WHERE d.cedula_cli = ?
        ORDER BY o.fecha_ingreso DESC`,
      [cedula_cli]
    );

    return { dispositivos, facturas, ordenes };
  },

  /**
   * Elimina físicamente un cliente SIN documentos asociados.
   * El servicio comprueba antes `tieneDocumentosAsociados`; si el cliente
   * tuviera equipos o facturas, las FK lo impedirían (error 1451 del motor).
   */
  async eliminarCliente(cedula_cli) {
    const [resultado] = await pool.query(
      'DELETE FROM cliente WHERE cedula_cli = ?',
      [cedula_cli]
    );

    return resultado.affectedRows;
  },

  /**
   * Verifica si el cliente tiene documentos asociados.
   * Se usa para impedir el borrado físico de un cliente que ya tiene historial
   * (las FK de `dispositivo` y `venta` lo bloquearían con un error del motor).
   */
  async tieneDocumentosAsociados(cedula_cli) {
    const [filas] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM dispositivo WHERE cedula_cli = ?) AS total_dispositivos,
         (SELECT COUNT(*) FROM venta       WHERE cedula_cli = ?) AS total_ventas`,
      [cedula_cli, cedula_cli]
    );

    const conteo = filas[0] || {};

    return {
      total_dispositivos: Number(conteo.total_dispositivos || 0),
      total_ventas: Number(conteo.total_ventas || 0)
    };
  }
};

export default ClienteModel;
