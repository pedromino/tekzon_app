/**
 * ==========================================================================
 * MODELO DE DISPOSITIVO (dispositivoModel.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Acceso a datos (Data Access Layer) · Módulo 2 (Recepción)
 *
 * PROPÓSITO FUNCIONAL:
 *   Administra la tabla `dispositivo`: los equipos que los clientes traen al
 *   taller. Cada dispositivo pertenece a un cliente (FK `cedula_cli`) y puede
 *   acumular VARIAS órdenes de servicio a lo largo de su vida útil (el mismo
 *   equipo puede reingresar por una falla distinta).
 *
 * PROPÓSITO TÉCNICO:
 *   · `id_dispositivo` es AUTO_INCREMENT (habilitado en la migración 005).
 *   · La restricción UNIQUE original sobre `numero_serie` fue eliminada en la
 *     migración 005 porque impedía registrar dos equipos con el mismo serial
 *     (caso real: el mismo equipo reingresado, o un serial no informado).
 *     A cambio, el servicio valida que el serial no se repita para el MISMO
 *     cliente, que es la regla de negocio realmente significativa.
 * ==========================================================================
 */
import pool from '../config/db.js';

/** Columnas del dispositivo enriquecidas con el nombre del propietario. */
const COLUMNAS_DISPOSITIVO = `
  d.id_dispositivo,
  d.nombre_dis,
  d.marca,
  d.modelo,
  d.numero_serie,
  d.cedula_cli,
  CONCAT(COALESCE(c.nombre_cliente, ''), ' ', COALESCE(c.apellido_cliente, '')) AS nombre_propietario,
  c.telefono_cliente
`;

/**
 * SUBCONSULTAS DEL HISTORIAL DE SERVICIO DEL EQUIPO.
 *
 * PROPÓSITO FUNCIONAL: la página unificada de Recepción y Dispositivos muestra
 * en su tabla la SITUACIÓN DE TALLER de cada equipo: cuántas órdenes acumula y
 * cuál es la más reciente con su estado. Sin este dato, el recepcionista no
 * podría saber si el equipo ya está en el taller o si sigue pendiente de cobro.
 *
 * PROPÓSITO TÉCNICO: se resuelven con SUBCONSULTAS correlacionadas y no con un
 * JOIN contra `orden_tecnico`. Un JOIN multiplicaría las filas del dispositivo
 * (una por cada orden) y la tabla mostraría equipos repetidos. Con la subconsulta
 * cada equipo aparece UNA sola vez, con su orden más reciente.
 */
const COLUMNAS_HISTORIAL_ORDENES = `
  (SELECT COUNT(*) FROM orden_tecnico o
    WHERE o.id_dispositivo = d.id_dispositivo)                        AS total_ordenes,
  (SELECT o.id_ordentec FROM orden_tecnico o
    WHERE o.id_dispositivo = d.id_dispositivo
    ORDER BY o.fecha_ingreso DESC, o.id_ordentec DESC LIMIT 1)        AS ultima_orden,
  (SELECT o.estado FROM orden_tecnico o
    WHERE o.id_dispositivo = d.id_dispositivo
    ORDER BY o.fecha_ingreso DESC, o.id_ordentec DESC LIMIT 1)        AS ultimo_estado_orden,
  (SELECT o.cobrada FROM orden_tecnico o
    WHERE o.id_dispositivo = d.id_dispositivo
    ORDER BY o.fecha_ingreso DESC, o.id_ordentec DESC LIMIT 1)        AS ultima_orden_cobrada
`;

export const DispositivoModel = {
  /**
   * LISTA DE DISPOSITIVOS con búsqueda libre y filtro por propietario.
   * @param {Object} filtros { texto, cedula_cli }
   */
  async listarDispositivos({ texto, cedula_cli } = {}) {
    const condiciones = [];
    const parametros = [];

    if (cedula_cli) {
      condiciones.push('d.cedula_cli = ?');
      parametros.push(cedula_cli);
    }

    if (texto) {
      // Búsqueda por nombre del equipo, marca, modelo o número de serie.
      condiciones.push(`(
        d.nombre_dis   LIKE ?
        OR d.marca     LIKE ?
        OR d.modelo    LIKE ?
        OR d.numero_serie LIKE ?
      )`);

      const patronBusqueda = `%${texto}%`;
      parametros.push(patronBusqueda, patronBusqueda, patronBusqueda, patronBusqueda);
    }

    const clausulaWhere = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_DISPOSITIVO},
              ${COLUMNAS_HISTORIAL_ORDENES}
         FROM dispositivo d
         LEFT JOIN cliente c ON c.cedula_cli = d.cedula_cli
         ${clausulaWhere}
        ORDER BY d.id_dispositivo DESC`,
      parametros
    );

    return filas;
  },

  /**
   * Recupera un dispositivo por su llave primaria.
   * Incluye el historial de órdenes para que la ficha del equipo tenga contexto.
   */
  async obtenerPorId(id_dispositivo) {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_DISPOSITIVO},
              ${COLUMNAS_HISTORIAL_ORDENES}
         FROM dispositivo d
         LEFT JOIN cliente c ON c.cedula_cli = d.cedula_cli
        WHERE d.id_dispositivo = ?`,
      [id_dispositivo]
    );

    return filas[0];
  },

  /**
   * BUSCA UN EQUIPO POR SU NÚMERO DE SERIE DENTRO DE UN CLIENTE.
   *
   * PROPÓSITO FUNCIONAL: en la recepción, si el cliente ya trajo antes ese mismo
   * equipo, el sistema REUTILIZA la ficha del dispositivo en lugar de duplicarla,
   * de modo que el historial de reparaciones quede unido en un solo equipo.
   */
  async buscarPorSerieYCliente(numero_serie, cedula_cli) {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_DISPOSITIVO}
         FROM dispositivo d
         LEFT JOIN cliente c ON c.cedula_cli = d.cedula_cli
        WHERE d.numero_serie = ? AND d.cedula_cli = ?
        LIMIT 1`,
      [numero_serie, cedula_cli]
    );

    return filas[0];
  },

  /** REGISTRA UN DISPOSITIVO NUEVO y devuelve la fila insertada. */
  async crearDispositivo(datosDispositivo) {
    const { nombre_dis, marca, modelo, numero_serie, cedula_cli } = datosDispositivo;

    const [resultado] = await pool.query(
      `INSERT INTO dispositivo
         (nombre_dis, marca, modelo, numero_serie, cedula_cli)
       VALUES (?, ?, ?, ?, ?)`,
      [nombre_dis, marca, modelo, numero_serie, cedula_cli]
    );

    // `insertId` es el id autoincremental generado por MySQL.
    return await this.obtenerPorId(resultado.insertId);
  },

  /** ACTUALIZA las características del equipo. */
  async actualizarDispositivo(id_dispositivo, datosDispositivo) {
    const { nombre_dis, marca, modelo, numero_serie } = datosDispositivo;

    const [resultado] = await pool.query(
      `UPDATE dispositivo
          SET nombre_dis   = ?,
              marca        = ?,
              modelo       = ?,
              numero_serie = ?
        WHERE id_dispositivo = ?`,
      [nombre_dis, marca, modelo, numero_serie, id_dispositivo]
    );

    if (resultado.affectedRows === 0) return null;

    return await this.obtenerPorId(id_dispositivo);
  },

  /**
   * CAMBIA EL PROPIETARIO DE UN DISPOSITIVO (transferencia de equipo).
   * Se separa del UPDATE general porque modifica una llave foránea.
   */
  async transferirPropietario(id_dispositivo, cedula_cli) {
    const [resultado] = await pool.query(
      'UPDATE dispositivo SET cedula_cli = ? WHERE id_dispositivo = ?',
      [cedula_cli, id_dispositivo]
    );

    if (resultado.affectedRows === 0) return null;

    return await this.obtenerPorId(id_dispositivo);
  },

  /**
   * Cuenta las órdenes de servicio de un dispositivo.
   * Se usa antes de un borrado para informar al usuario del impacto.
   */
  async contarOrdenes(id_dispositivo) {
    const [filas] = await pool.query(
      'SELECT COUNT(*) AS total_ordenes FROM orden_tecnico WHERE id_dispositivo = ?',
      [id_dispositivo]
    );

    return Number(filas[0]?.total_ordenes || 0);
  },

  /**
   * Elimina físicamente un dispositivo SIN órdenes asociadas.
   * Si tuviera órdenes, la FK `fk_orden_dispositivo` lo impediría, por lo que el
   * servicio comprueba primero `contarOrdenes` y responde 409 Conflict.
   */
  async eliminarDispositivo(id_dispositivo) {
    const [resultado] = await pool.query(
      'DELETE FROM dispositivo WHERE id_dispositivo = ?',
      [id_dispositivo]
    );

    return resultado.affectedRows;
  }
};

export default DispositivoModel;
