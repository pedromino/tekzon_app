/**
 * ==========================================================================
 * SERVICIO DE ALERTAS DE STOCK (AlertaStockServices.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Consumo de API REST · Módulo 4 (Automatización de alertas)
 *
 * PROPÓSITO FUNCIONAL:
 *   Encapsula las peticiones HTTP de las alertas de stock mínimo que el sistema
 *   genera automáticamente al descontar inventario por Venta o por Servicio
 *   Técnico. El frontend las usa en dos lugares:
 *
 *     · La CAMPANA del Topbar -> `obtenerIndicadores()` (contador de pendientes).
 *     · La PANTALLA de alertas -> `listarAlertas()` + `atenderAlerta()`.
 *
 * PROPÓSITO TÉCNICO:
 *   `obtenerIndicadores()` también devuelve los PRODUCTOS EN RIESGO (existencia
 *   en o por debajo del mínimo), lo que permite al panel mostrar el estado real
 *   del almacén aunque las alertas históricas ya se hayan marcado como atendidas.
 * ==========================================================================
 */
import clienteApi from './apiClient';
import { mapearAlerta, aNumero } from './formato';

export default {
  /**
   * LISTA LAS ALERTAS DE STOCK.
   * @param {Object} filtros { soloPendientes }
   */
  async listarAlertas(filtros = {}) {
    try {
      const respuesta = await clienteApi.get('/alertas/stock', {
        params: {
          soloPendientes: filtros.soloPendientes ? 'true' : 'false'
        }
      });

      return (respuesta.data?.alertas ?? []).map(mapearAlerta);
    } catch (error) {
      console.error('Error en listarAlertas:', error);
      throw error;
    }
  },

  /**
   * INDICADORES DE ALERTAS (campana de notificaciones).
   * Devuelve los contadores y el detalle de los productos en riesgo.
   */
  async obtenerIndicadores() {
    try {
      const respuesta = await clienteApi.get('/alertas/stock/indicadores');
      const indicadores = respuesta.data?.indicadores || {};

      return {
        totalAlertas: aNumero(indicadores.total_alertas),
        pendientes: aNumero(indicadores.pendientes),
        agotados: aNumero(indicadores.agotados),
        productosEnRiesgo: aNumero(indicadores.productos_en_riesgo),
        detalleRiesgo: (indicadores.detalle_riesgo ?? []).map((producto) => ({
          codigo: producto.cod_producto,
          nombre: producto.nombre_producto,
          imagen: producto.imagen || 'pantalla.jpg',
          existencia: aNumero(producto.existencia),
          stockMinimo: aNumero(producto.stock_minimo),
          categoria: producto.nombre_categoria || 'Sin categoría'
        }))
      };
    } catch (error) {
      console.error('Error en obtenerIndicadores (alertas):', error);
      throw error;
    }
  },

  /** PRODUCTOS ACTIVOS CON EXISTENCIA EN O POR DEBAJO DEL MÍNIMO. */
  async listarProductosEnRiesgo() {
    try {
      const respuesta = await clienteApi.get('/alertas/stock/productos-riesgo');

      return (respuesta.data?.productos ?? []).map((producto) => ({
        codigo: producto.cod_producto,
        nombre: producto.nombre_producto,
        imagen: producto.imagen || 'pantalla.jpg',
        existencia: aNumero(producto.existencia),
        stockMinimo: aNumero(producto.stock_minimo),
        categoria: producto.nombre_categoria || 'Sin categoría'
      }));
    } catch (error) {
      console.error('Error en listarProductosEnRiesgo:', error);
      throw error;
    }
  },

  /** MARCA UNA ALERTA COMO ATENDIDA (segunda vez -> 400). */
  async atenderAlerta(idAlerta) {
    try {
      const respuesta = await clienteApi.patch(
        `/alertas/stock/${encodeURIComponent(idAlerta)}/atender`
      );

      return respuesta.data;
    } catch (error) {
      console.error('Error en atenderAlerta:', error);
      throw error;
    }
  },

  /**
   * MARCA COMO ATENDIDAS TODAS LAS ALERTAS PENDIENTES DE UN PRODUCTO.
   * Se usa al reponer mercancía: al subir el stock, los avisos dejan de aplicar.
   */
  async atenderAlertasDeProducto(codigoProducto) {
    try {
      const respuesta = await clienteApi.patch(
        `/alertas/stock/producto/${encodeURIComponent(codigoProducto)}/atender`
      );

      return respuesta.data;
    } catch (error) {
      console.error('Error en atenderAlertasDeProducto:', error);
      throw error;
    }
  }
};
