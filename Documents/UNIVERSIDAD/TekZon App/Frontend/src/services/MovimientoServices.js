/**
 * ==========================================================================
 * SERVICIO DE MOVIMIENTOS Y STOCK (MovimientoServices.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Consumo de API REST · CRUD 3 (Kárdex) + CRUD 2 (Ajuste de stock)
 *
 * PROPÓSITO FUNCIONAL:
 *   Agrupa las peticiones HTTP del kádex transaccional (historial y registro
 *   de Entradas/Salidas) y las del ajuste de existencias del almacenista
 *   (auditoría de stock y corrección justificada por arqueo).
 *
 * PROPÓSITO TÉCNICO:
 *   - CERO datos simulados: todo proviene de las tablas `movimiento_inventario`
 *     y `producto` de la base `tekzon_bd`.
 *   - Los movimientos se envían SIEMPRE con `id_usuario`, requisito de la
 *     clave foránea `fk_movimiento_usuario`.
 *   - Se expone `ID_USUARIO_RESPONSABLE` para que las páginas incluyan al
 *     almacenista en sesión mientras el login (FASE II) no esté operativo.
 *   - Cada método usa try/catch y propaga el error normalizado (400/404/500).
 * ==========================================================================
 */
import clienteApi, { ID_USUARIO_RESPONSABLE } from './apiClient';

export { ID_USUARIO_RESPONSABLE };

/**
 * Traduce un asiento del kádex al modelo de vista de la tabla transaccional,
 * conservando los nombres de columna de MySQL y añadiendo alias cortos.
 */
const mapearMovimientoDesdeBD = (movimiento) => ({
  id_movimiento: movimiento.id_movimiento,
  cod_producto: movimiento.cod_producto,
  nombre_producto: movimiento.nombre_producto,
  imagen: movimiento.imagen || 'pantalla.jpg',
  existencia_actual: Number(movimiento.existencia_actual || 0),
  stock_minimo: Number(movimiento.stock_minimo || 0),
  id_usuario: movimiento.id_usuario,
  nombre_usuario: movimiento.nombre_usuario || 'Usuario no identificado',
  tipo_movimiento: movimiento.tipo_movimiento,
  cantidad: Number(movimiento.cantidad || 0),
  existencia_previa: Number(movimiento.existencia_previa || 0),
  existencia_posterior: Number(movimiento.existencia_posterior || 0),
  motivo: movimiento.motivo,
  fecha_movimiento: movimiento.fecha_movimiento,
  // Alias cortos para el template.
  codigo: movimiento.cod_producto,
  nombre: movimiento.nombre_producto,
  tipo: movimiento.tipo_movimiento
});

/**
 * Traduce una fila de existencias del CRUD 2 al modelo de vista.
 * `valor_costo` y `valor_venta` llegan calculados desde MySQL.
 */
const mapearExistenciaDesdeBD = (existencia) => ({
  cod_producto: existencia.cod_producto,
  codigo: existencia.cod_producto,
  nombre_producto: existencia.nombre_producto,
  nombre: existencia.nombre_producto,
  marca: existencia.marca || '',
  imagen: existencia.imagen || 'pantalla.jpg',
  existencia: Number(existencia.existencia || 0),
  stock_minimo: Number(existencia.stock_minimo || 0),
  minimo: Number(existencia.stock_minimo || 0),
  precio_costo: Number(existencia.precio_costo || 0),
  precio_venta: Number(existencia.precio_venta || 0),
  id_categoria: existencia.id_categoria,
  nombre_categoria: existencia.nombre_categoria || 'Sin categoría',
  estado: Number(existencia.estado ?? 1),
  valor_costo: Number(existencia.valor_costo || 0),
  valor_venta: Number(existencia.valor_venta || 0),
  faltante_reposicion: Number(existencia.faltante_reposicion || 0)
});

export default {
  // ======================================================================
  // CRUD 3 · MOVIMIENTOS DE INVENTARIO (KÁRDEX TRANSACCIONAL)
  // ======================================================================

  /**
   * HISTORIAL DEL KÁRDEX con filtros opcionales.
   * @param {Object} filtros { tipo, cod_producto, fechaDesde, fechaHasta, limite }
   */
  async listarMovimientos(filtros = {}) {
    try {
      const respuesta = await clienteApi.get('/movimientos', {
        params: {
          tipo: filtros.tipo || undefined,
          cod_producto: filtros.cod_producto || undefined,
          fechaDesde: filtros.fechaDesde || undefined,
          fechaHasta: filtros.fechaHasta || undefined,
          limite: filtros.limite || undefined
        }
      });

      const listaMovimientos = respuesta.data?.movimientos ?? [];

      return listaMovimientos.map(mapearMovimientoDesdeBD);
    } catch (error) {
      console.error('Error en listarMovimientos:', error);
      throw error;
    }
  },

  /** KPI agregados del kádex (entradas, salidas y ajustes). */
  async obtenerResumenMovimientos() {
    try {
      const respuesta = await clienteApi.get('/movimientos/resumen');
      return respuesta.data.resumen;
    } catch (error) {
      console.error('Error en obtenerResumenMovimientos:', error);
      throw error;
    }
  },

  /** Kárdex histórico de un producto concreto. */
  async listarMovimientosPorProducto(codProducto) {
    try {
      const respuesta = await clienteApi.get(
        `/movimientos/producto/${encodeURIComponent(codProducto)}`
      );

      const listaMovimientos = respuesta.data?.movimientos ?? [];

      return listaMovimientos.map(mapearMovimientoDesdeBD);
    } catch (error) {
      console.error('Error en listarMovimientosPorProducto:', error);
      throw error;
    }
  },

  /**
   * REGISTRAR ENTRADA O SALIDA FÍSICA (CRUD 3).
   *
   * PROPÓSITO TÉCNICO: el backend calcula de forma atómica la existencia
   * previa y posterior dentro de una transacción SQL, por lo que el frontend
   * sólo envía la cantidad y el motivo; nunca el stock resultante.
   *
   * @param {Object} datosMovimiento { cod_producto, tipo_movimiento, cantidad, motivo }
   */
  async registrarMovimiento(datosMovimiento) {
    try {
      const payload = {
        cod_producto: datosMovimiento.cod_producto ?? datosMovimiento.codigo,
        tipo_movimiento: (datosMovimiento.tipo_movimiento ?? datosMovimiento.tipo ?? '').toUpperCase(),
        cantidad: Number(datosMovimiento.cantidad),
        motivo: (datosMovimiento.motivo ?? '').trim(),
        id_usuario: Number(datosMovimiento.id_usuario ?? ID_USUARIO_RESPONSABLE)
      };

      const respuesta = await clienteApi.post('/movimientos', payload);

      return {
        mensaje: respuesta.data.mensaje,
        movimiento: respuesta.data.movimiento
      };
    } catch (error) {
      console.error('Error en registrarMovimiento:', error);
      throw error;
    }
  },

  // ======================================================================
  // CRUD 2 · GESTIÓN Y AJUSTE DE EXISTENCIAS (ROL ALMACENISTA)
  // ======================================================================

  /** AUDITORÍA DE EXISTENCIAS con búsqueda rápida y filtros. */
  async listarExistencias(filtros = {}) {
    try {
      const respuesta = await clienteApi.get('/inventario/stock', {
        params: {
          texto: filtros.texto || undefined,
          situacion: filtros.situacion || undefined,
          id_categoria: filtros.id_categoria || undefined,
          orden: filtros.orden || undefined
        }
      });

      const listaExistencias = respuesta.data?.existencias ?? [];

      return listaExistencias.map(mapearExistenciaDesdeBD);
    } catch (error) {
      console.error('Error en listarExistencias:', error);
      throw error;
    }
  },

  /** INDICADORES KPI del almacén (tarjetas de la página de inventario). */
  async obtenerIndicadoresStock() {
    try {
      const respuesta = await clienteApi.get('/inventario/stock/indicadores');
      return respuesta.data.indicadores;
    } catch (error) {
      console.error('Error en obtenerIndicadoresStock:', error);
      throw error;
    }
  },

  /** ALERTAS: productos en o por debajo del stock mínimo. */
  async listarAlertasStockMinimo() {
    try {
      const respuesta = await clienteApi.get('/inventario/stock/alertas');

      const listaAlertas = respuesta.data?.alertas ?? [];

      return listaAlertas.map(mapearExistenciaDesdeBD);
    } catch (error) {
      console.error('Error en listarAlertasStockMinimo:', error);
      throw error;
    }
  },

  /** FICHA DE EXISTENCIA de un producto (incluye su último ajuste). */
  async obtenerExistenciaPorCodigo(codProducto) {
    try {
      const respuesta = await clienteApi.get(
        `/inventario/stock/${encodeURIComponent(codProducto)}`
      );

      const existencia = respuesta.data.existencia;

      return {
        ...mapearExistenciaDesdeBD(existencia),
        ultimo_ajuste: existencia.ultimo_ajuste
      };
    } catch (error) {
      if (error.codigoHttp === 404) return null;
      console.error('Error en obtenerExistenciaPorCodigo:', error);
      throw error;
    }
  },

  /**
   * AJUSTE JUSTIFICADO DE EXISTENCIA (CRUD 2).
   *
   * PROPÓSITO FUNCIONAL: el almacenista declara el conteo físico real
   * (`existencia`) y, opcionalmente, corrige el umbral de alerta
   * (`stock_minimo`). El motivo es obligatorio porque el backend registra un
   * asiento de tipo AJUSTE en el kádex con esa justificación.
   *
   * PROPÓSITO TÉCNICO: los nombres de los campos coinciden con las columnas de
   * la tabla `producto` (existencia, stock_minimo), tal como exige la convención
   * de mapeo directo con la base de datos. El backend vuelve a validar de forma
   * estricta que `stock_minimo` no supere `existencia`.
   */
  async ajustarExistencia(codProducto, datosAjuste) {
    try {
      const payload = {
        existencia: Number(datosAjuste.existencia ?? datosAjuste.nueva_existencia),
        stock_minimo: Number(datosAjuste.stock_minimo ?? datosAjuste.stockMinimo),
        motivo: (datosAjuste.motivo ?? '').trim(),
        id_usuario: Number(datosAjuste.id_usuario ?? ID_USUARIO_RESPONSABLE)
      };

      const respuesta = await clienteApi.patch(
        `/inventario/stock/${encodeURIComponent(codProducto)}`,
        payload
      );

      return {
        mensaje: respuesta.data.mensaje,
        ajuste: respuesta.data.ajuste
      };
    } catch (error) {
      console.error('Error en ajustarExistencia:', error);
      throw error;
    }
  }
};
