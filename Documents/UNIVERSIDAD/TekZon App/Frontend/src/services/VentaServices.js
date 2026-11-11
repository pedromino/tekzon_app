/**
 * ==========================================================================
 * SERVICIO DE VENTA DIRECTA (VentaServices.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Consumo de API REST · Módulo 3 (Mostrador)
 *
 * PROPÓSITO FUNCIONAL:
 *   Encapsula las peticiones HTTP de la venta rápida de mostrador:
 *
 *     · listarVentas()      -> histórico de facturas.
 *     · registrarVenta()    -> carrito + cliente + pago -> factura + descuento.
 *     · obtenerVenta()      -> factura completa (cabecera, líneas y pago).
 *     · anularVenta()       -> baja lógica + devolución del stock.
 *     · obtenerIndicadores()-> KPI del mostrador.
 *
 * PROPÓSITO TÉCNICO:
 *   El TOTAL de la venta lo calcula SIEMPRE el backend a partir del precio de
 *   venta del catálogo; el frontend sólo envía el carrito y el monto con el que
 *   el cliente cancela. Si el monto no coincide con el total calculado, el
 *   backend responde 400 (control contable). Ver `VentaService` en el backend.
 * ==========================================================================
 */
import clienteApi from './apiClient';
import { mapearVenta, mapearDetalleFactura, aDecimal, aNumero } from './formato';

export default {
  /* ======================================================================
   * CONSULTAS
   * ====================================================================== */

  /** HISTÓRICO DE VENTAS con filtros opcionales. */
  async listarVentas(filtros = {}) {
    try {
      const respuesta = await clienteApi.get('/ventas', { params: filtros });

      return (respuesta.data?.ventas ?? []).map(mapearVenta);
    } catch (error) {
      console.error('Error en listarVentas:', error);
      throw error;
    }
  },

  /**
   * FACTURA COMPLETA: cabecera + líneas de producto + pago registrado.
   * Devuelve `null` ante un 404.
   */
  async obtenerVenta(numeroFactura) {
    try {
      const respuesta = await clienteApi.get(`/ventas/${encodeURIComponent(numeroFactura)}`);

      return {
        venta: mapearVenta(respuesta.data?.venta || {}),
        detalle: (respuesta.data?.detalle || []).map(mapearDetalleFactura),
        pago: respuesta.data?.pago || null,
        resumen: {
          cantidadLineas: aNumero(respuesta.data?.resumen?.cantidad_lineas),
          totalUnidades: aNumero(respuesta.data?.resumen?.total_unidades),
          montoTotal: aDecimal(respuesta.data?.resumen?.monto_total)
        }
      };
    } catch (error) {
      if (error.codigoHttp === 404) return null;
      console.error('Error en obtenerVenta:', error);
      throw error;
    }
  },

  /** INDICADORES DEL MOSTRADOR (tarjetas KPI de la página de ventas). */
  async obtenerIndicadores() {
    try {
      const respuesta = await clienteApi.get('/ventas/indicadores');
      const indicadores = respuesta.data?.indicadores || {};

      return {
        totalFacturas: aNumero(indicadores.total_facturas),
        montoHistorico: aDecimal(indicadores.monto_historico),
        montoHoy: aDecimal(indicadores.monto_hoy),
        facturasHoy: aNumero(indicadores.facturas_hoy),
        montoMes: aDecimal(indicadores.monto_mes),
        ticketPromedio: aDecimal(indicadores.ticket_promedio),
        totalUnidades: aNumero(indicadores.total_unidades)
      };
    } catch (error) {
      console.error('Error en obtenerIndicadores (ventas):', error);
      throw error;
    }
  },

  /** PRODUCTOS MÁS VENDIDOS (informe de rotación del mostrador). */
  async listarMasVendidos(limite = 10) {
    try {
      const respuesta = await clienteApi.get('/ventas/mas-vendidos', { params: { limite } });

      return (respuesta.data?.productos ?? []).map((producto) => ({
        codigo: producto.cod_producto,
        nombre: producto.nombre_producto,
        imagen: producto.imagen || 'pantalla.jpg',
        unidadesVendidas: aNumero(producto.unidades_vendidas),
        montoVendido: aDecimal(producto.monto_vendido)
      }));
    } catch (error) {
      console.error('Error en listarMasVendidos:', error);
      throw error;
    }
  },

  /** CATÁLOGO DE MÉTODOS DE PAGO admitidos por el backend. */
  async listarMetodosPago() {
    try {
      const respuesta = await clienteApi.get('/ventas/metodos-pago');
      return respuesta.data?.metodos_pago ?? [];
    } catch (error) {
      console.error('Error en listarMetodosPago:', error);
      throw error;
    }
  },

  /* ======================================================================
   * REGISTRO DE LA VENTA
   * ====================================================================== */

  /**
   * REGISTRA UNA VENTA DIRECTA COMPLETA.
   *
   * PROPÓSITO FUNCIONAL (requisito del Módulo 3):
   *   "Se registran los datos del cliente y se seleccionan los productos. Al
   *    confirmar, el producto se resta de la existencia del inventario, y se
   *    guarda un registro en la tabla de movimientos marcando la salida como
   *    'Venta'. Se procesa el pago, se registra el modo de pago, el monto total
   *    y se emite la factura."
   *
   * @param {Object} datosVenta
   * @param {string} datosVenta.cedula        Cédula del cliente.
   * @param {Array}  datosVenta.carrito       [{ codigo, cantidad }]
   * @param {string} datosVenta.metodoPago    Forma de pago elegida.
   * @param {number} datosVenta.monto         Monto con el que cancela el cliente.
   * @param {number} datosVenta.tasaCambio    Tasa USD -> Bs aplicada.
   * @param {string} [datosVenta.referencia]  Referencia del pago electrónico.
   */
  async registrarVenta(datosVenta) {
    try {
      const respuesta = await clienteApi.post('/ventas', {
        // ---- Datos del cliente ----
        cedula_cli: datosVenta.cedula,
        nombre_cliente: datosVenta.nombre,
        apellido_cliente: datosVenta.apellido,
        telefono_cliente: datosVenta.telefono,
        direccion_cli: datosVenta.direccion,
        // ---- Carrito: sólo código y cantidad; el precio lo pone el backend ----
        productos: (datosVenta.carrito || []).map((linea) => ({
          cod_producto: linea.codigo,
          cantidad: Number(linea.cantidad)
        })),
        // ---- Cobro ----
        metodo_pago: datosVenta.metodoPago,
        monto_usd: Number(datosVenta.monto),
        tasa_cambio: Number(datosVenta.tasaCambio),
        referencia: datosVenta.referencia,
        id_caja: datosVenta.idCaja ?? undefined
      });

      return {
        factura: respuesta.data?.factura || null,
        venta: mapearVenta(respuesta.data?.venta || {}),
        detalle: (respuesta.data?.detalle || []).map(mapearDetalleFactura),
        // Asientos del kádex que generó la venta (origen "VENTA").
        movimientos: respuesta.data?.movimientos || [],
        // Alertas de stock mínimo disparadas por el descuento.
        alertas: respuesta.data?.alertas || [],
        esClienteNuevo: Boolean(respuesta.data?.esClienteNuevo),
        mensaje: respuesta.data?.mensaje || null
      };
    } catch (error) {
      console.error('Error en registrarVenta:', error);
      throw error;
    }
  },

  /* ======================================================================
   * ANULACIÓN
   * ====================================================================== */

  /**
   * ANULA UNA FACTURA Y DEVUELVE LOS PRODUCTOS AL INVENTARIO.
   * El motivo es obligatorio (exigencia de auditoría).
   */
  async anularVenta(numeroFactura, motivo) {
    try {
      const respuesta = await clienteApi.post(
        `/ventas/${encodeURIComponent(numeroFactura)}/anular`,
        { motivo }
      );

      return {
        numFactura: respuesta.data?.num_factura,
        montoAnulado: aDecimal(respuesta.data?.monto_anulado),
        productosDevueltos: respuesta.data?.productos_devueltos || [],
        mensaje: respuesta.data?.mensaje || null
      };
    } catch (error) {
      console.error('Error en anularVenta:', error);
      throw error;
    }
  }
};
