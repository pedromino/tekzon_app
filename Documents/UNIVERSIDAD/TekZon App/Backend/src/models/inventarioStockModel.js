/**
 * ==========================================================================
 * MODELO DE STOCK / EXISTENCIAS (inventarioStockModel.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Acceso a datos (Data Access Layer) · CRUD 2
 *
 * PROPÓSITO FUNCIONAL:
 *   Provee las consultas de AUDITORÍA DE EXISTENCIAS para el rol Almacenista:
 *   estado actual del stock por producto, valorización del inventario,
 *   productos por debajo del stock mínimo y el arqueo físico.
 *
 * PROPÓSITO TÉCNICO:
 *   Este modelo NO escribe existencias de forma directa: la corrección del
 *   stock se delega en `MovimientoModel.registrarAjuste`, que la ejecuta
 *   dentro de una TRANSACCIÓN SQL con bloqueo pesimista y deja el asiento de
 *   auditoría en `movimiento_inventario`. Así el CRUD 2 nunca puede modificar
 *   una existencia sin dejar rastro en el kádex (requisito de la cátedra).
 *
 *   El soft delete del catálogo (`producto.estado`) se respeta en todas las
 *   consultas: los productos inactivos no se listan para arqueo.
 * ==========================================================================
 */
import pool from '../config/db.js';

/**
 * Lista base de columnas del estado de existencias. Incluye el cálculo del
 * déficit respecto al stock mínimo y la valorización en USD.
 */
const COLUMNAS_STOCK = `
  p.cod_producto,
  p.nombre_producto,
  p.marca,
  p.imagen,
  p.existencia,
  p.stock_minimo,
  p.precio_costo,
  p.precio_venta,
  p.id_categoria,
  c.nombre_categoria,
  p.estado,
  (p.existencia * p.precio_costo) AS valor_costo,
  (p.existencia * p.precio_venta) AS valor_venta
`;

export const InventarioStockModel = {
  /**
   * Lista las existencias del almacén con filtros y ordenamiento.
   *
   * @param {Object} filtros
   * @param {string} [filtros.texto]     Búsqueda rápida por código, nombre o marca
   * @param {number} [filtros.idCategoria] Filtro por clasificación (CRUD 4)
   * @param {string} [filtros.situacion] 'agotado' | 'bajo' | 'disponible'
   * @param {string} [filtros.orden]     Columna de ordenamiento whitelisteada
   */
  async listarExistencias({ texto, idCategoria, situacion, orden } = {}) {
    const condiciones = ['p.estado = 1'];
    const parametros = [];

    // Búsqueda rápida parametrizada: se usa LIKE con comodines para permitir
    // coincidencias parciales sin abrir la puerta a inyección SQL.
    if (texto) {
      condiciones.push('(p.cod_producto LIKE ? OR p.nombre_producto LIKE ? OR p.marca LIKE ?)');
      const patron = `%${texto}%`;
      parametros.push(patron, patron, patron);
    }

    if (idCategoria) {
      condiciones.push('p.id_categoria = ?');
      parametros.push(idCategoria);
    }

    // Clasificación de la situación del stock, alineada con las insignias
    // visuales del frontend (badge-out / badge-low / badge-ok).
    if (situacion === 'agotado') {
      condiciones.push('p.existencia <= 0');
    } else if (situacion === 'bajo') {
      condiciones.push('p.existencia > 0 AND p.existencia <= p.stock_minimo');
    } else if (situacion === 'disponible') {
      condiciones.push('p.existencia > p.stock_minimo');
    }

    // Whitelist de ordenamiento: evita interpolar texto arbitrario del cliente.
    const ordenesPermitidos = {
      nombre: 'p.nombre_producto ASC',
      existencia_asc: 'p.existencia ASC',
      existencia_desc: 'p.existencia DESC',
      valor_desc: 'valor_costo DESC',
      categoria: 'c.nombre_categoria ASC, p.nombre_producto ASC'
    };
    const clausulaOrden = ordenesPermitidos[orden] || 'p.nombre_producto ASC';

    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_STOCK}
         FROM producto p
         LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
        WHERE ${condiciones.join(' AND ')}
        ORDER BY ${clausulaOrden}`,
      parametros
    );

    return filas;
  },

  /**
   * Recupera el estado de existencia de un producto concreto.
   * Devuelve `undefined` si el código no existe (el servicio responde 404).
   */
  async obtenerExistenciaPorCodigo(cod_producto) {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_STOCK}
         FROM producto p
         LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
        WHERE p.cod_producto = ?`,
      [cod_producto]
    );

    return filas[0];
  },

  /**
   * INDICADORES KPI DEL ALMACÉN (alimentan las tarjetas de InventarioPage).
   *
   * PROPÓSITO TÉCNICO: una única consulta agregada calcula todos los totales,
   * evitando cinco viajes al servidor. Se usan funciones de agregación con
   * COALESCE para que un inventario vacío devuelva ceros y no NULL.
   */
  async obtenerIndicadoresAlmacen() {
    const [filas] = await pool.query(
      `SELECT
         COUNT(*)                                                   AS total_articulos,
         COALESCE(SUM(p.existencia), 0)                             AS total_unidades,
         COALESCE(SUM(p.existencia * p.precio_costo), 0)            AS valor_total_costo,
         COALESCE(SUM(p.existencia * p.precio_venta), 0)            AS valor_total_venta,
         COALESCE(SUM(CASE WHEN p.existencia <= 0 THEN 1 ELSE 0 END), 0)                   AS total_agotados,
         COALESCE(SUM(CASE WHEN p.existencia > 0 AND p.existencia <= p.stock_minimo
                           THEN 1 ELSE 0 END), 0)                                          AS total_stock_bajo,
         COALESCE(SUM(CASE WHEN p.existencia > p.stock_minimo THEN 1 ELSE 0 END), 0)       AS total_disponibles
       FROM producto p
       WHERE p.estado = 1`
    );

    const indicadores = filas[0];

    // Se convierten a número los valores DECIMAL que mysql2 entrega como texto.
    return {
      total_articulos: Number(indicadores.total_articulos),
      total_unidades: Number(indicadores.total_unidades),
      valor_total_costo: Number(indicadores.valor_total_costo),
      valor_total_venta: Number(indicadores.valor_total_venta),
      total_agotados: Number(indicadores.total_agotados),
      total_stock_bajo: Number(indicadores.total_stock_bajo),
      total_disponibles: Number(indicadores.total_disponibles)
    };
  },

  /**
   * Lista de ALERTA: productos activos con existencia menor o igual al
   * stock mínimo. Alimenta el panel de alertas de reposición.
   */
  async listarAlertasStockMinimo() {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_STOCK},
              (p.stock_minimo - p.existencia) AS faltante_reposicion
         FROM producto p
         LEFT JOIN categoria c ON c.id_categoria = p.id_categoria
        WHERE p.estado = 1
          AND p.existencia <= p.stock_minimo
        ORDER BY (p.stock_minimo - p.existencia) DESC, p.nombre_producto ASC`
    );

    return filas;
  },

  /**
   * Consulta el ÚLTIMO ARQUEO registrado para un producto.
   * Se usa para mostrar en el modal de ajuste cuándo fue la última corrección
   * y con qué justificación, dando contexto al almacenista.
   */
  async obtenerUltimoAjuste(cod_producto) {
    const [filas] = await pool.query(
      `SELECT m.id_movimiento,
              m.cantidad,
              m.existencia_previa,
              m.existencia_posterior,
              m.motivo,
              m.fecha_movimiento,
              u.nombre_usuario
         FROM movimiento_inventario m
         LEFT JOIN usuario u ON u.id_usuario = m.id_usuario
        WHERE m.cod_producto = ?
          AND m.tipo_movimiento = 'AJUSTE'
        ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC
        LIMIT 1`,
      [cod_producto]
    );

    // Puede no existir ningún ajuste previo: se devuelve null explícitamente.
    return filas[0] || null;
  }
};
