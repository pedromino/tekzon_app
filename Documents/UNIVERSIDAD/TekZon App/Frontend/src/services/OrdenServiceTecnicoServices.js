/**
 * ==========================================================================
 * SERVICIO DE ORDEN DE SERVICIO TÉCNICO (OrdenServiceTecnicoServices.js)
 * ==========================================================================
 * CAPA: Consumo de API REST · Módulo 2 (Servicio Técnico)
 *
 * PROPÓSITO FUNCIONAL:
 *   Encapsula TODAS las peticiones HTTP del flujo del taller y traduce las
 *   columnas de MySQL al modelo que usan los componentes de Vue:
 *
 *     · Recepción      -> crearOrdenDesdeRecepcion()
 *     · Panel técnico  -> listarOrdenes(), obtenerOrden(), actualizarEstado()
 *     · Repuestos      -> agregarRepuesto(), quitarRepuesto()
 *     · Cobro          -> cobrarOrden(), obtenerFactura()
 *
 * PROPÓSITO TÉCNICO:
 *   CERO datos simulados: cada método consulta la base `tekzon_bd` a través del
 *   API. Las respuestas que incluyen `desglose` (mano de obra + repuestos) se
 *   conservan tal cual porque son el cálculo que hace el BACKEND; el frontend
 *   nunca recalcula el importe a cobrar, sólo lo muestra.
 * ==========================================================================
 */
import clienteApi from './apiClient';
import { mapearOrden, mapearRepuestoOrden, aDecimal } from './formato';

/**
 * Normaliza la respuesta completa de una orden (ficha + repuestos + desglose).
 */
const mapearFichaOrden = (datos) => ({
  orden: mapearOrden(datos.orden),
  repuestos: (datos.repuestos || []).map(mapearRepuestoOrden),
  desglose: {
    manoObra: aDecimal(datos.desglose?.mano_obra),
    repuestos: aDecimal(datos.desglose?.repuestos),
    total: aDecimal(datos.desglose?.total),
    cantidadRepuestos: Number(datos.desglose?.cantidad_repuestos || 0)
  },
  // Estados a los que el backend autoriza avanzar desde el estado actual.
  estadosPermitidos: datos.estadosPermitidos || [],
  mensaje: datos.mensaje || null
});

export default {
  /* ======================================================================
   * CONSULTAS
   * ====================================================================== */

  /**
   * LISTA LAS ÓRDENES DEL PANEL DEL TÉCNICO.
   * @param {Object} filtros { estado, texto, cedula, soloPendientesDeCobro }
   */
  async listarOrdenes(filtros = {}) {
    try {
      const respuesta = await clienteApi.get('/ordenes-tecnicas', { params: filtros });

      return (respuesta.data?.ordenes ?? []).map(mapearOrden);
    } catch (error) {
      console.error('Error en listarOrdenes:', error);
      throw error;
    }
  },

  /**
   * OBTIENE LA FICHA COMPLETA DE UNA ORDEN.
   * Devuelve `null` ante un 404 para que la página decida el mensaje.
   */
  async obtenerOrden(idOrden) {
    try {
      const respuesta = await clienteApi.get(`/ordenes-tecnicas/${encodeURIComponent(idOrden)}`);

      return mapearFichaOrden(respuesta.data);
    } catch (error) {
      if (error.codigoHttp === 404) return null;
      console.error('Error en obtenerOrden:', error);
      throw error;
    }
  },

  /** INDICADORES DEL TALLER (tarjetas KPI). */
  async obtenerIndicadores() {
    try {
      const respuesta = await clienteApi.get('/ordenes-tecnicas/indicadores');

      const indicadores = respuesta.data?.indicadores || {};

      return {
        porEstado: indicadores.por_estado || {},
        totalOrdenes: Number(indicadores.total_ordenes || 0),
        pendientesCobro: Number(indicadores.pendientes_cobro || 0),
        ordenesCobradas: Number(indicadores.ordenes_cobradas || 0),
        ingresosServicio: aDecimal(indicadores.ingresos_servicio)
      };
    } catch (error) {
      console.error('Error en obtenerIndicadores (taller):', error);
      throw error;
    }
  },

  /* ======================================================================
   * RECEPCIÓN
   * ====================================================================== */

  /**
   * REGISTRA LA RECEPCIÓN Y CREA LA ORDEN EN ESTADO "Pendiente".
   *
   * @param {Object} datosRecepcion Datos del formulario de Recepción:
   *   cédula y datos del cliente + características del dispositivo + falla.
   */
  async crearOrdenDesdeRecepcion(datosRecepcion) {
    try {
      const respuesta = await clienteApi.post('/ordenes-tecnicas/recepcion', {
        // ---- Datos del cliente ----
        cedula_cli: datosRecepcion.cedula,
        nombre_cliente: datosRecepcion.nombre,
        apellido_cliente: datosRecepcion.apellido,
        telefono_cliente: datosRecepcion.telefono,
        direccion_cli: datosRecepcion.direccion,
        // ---- Características del dispositivo ----
        nombre_dis: datosRecepcion.tipoDispositivo,
        marca: datosRecepcion.marca,
        modelo: datosRecepcion.modelo,
        numero_serie: datosRecepcion.serie,
        // ---- Datos de la orden ----
        falla_reportada: datosRecepcion.falla,
        accesorios: datosRecepcion.accesorios,
        patron_desbloqueo: datosRecepcion.patron
      });

      return {
        ...mapearFichaOrden(respuesta.data),
        esClienteNuevo: Boolean(respuesta.data?.esClienteNuevo),
        esDispositivoNuevo: Boolean(respuesta.data?.esDispositivoNuevo)
      };
    } catch (error) {
      console.error('Error en crearOrdenDesdeRecepcion:', error);
      throw error;
    }
  },

  /* ======================================================================
   * PANEL DEL TÉCNICO
   * ====================================================================== */

  /**
   * ACTUALIZA EL ESTADO Y EL DIAGNÓSTICO DE UNA ORDEN.
   * @param {string} idOrden
   * @param {Object} datos { estado, observaciones, costo_mano_obra }
   */
  async actualizarEstado(idOrden, datos) {
    try {
      const respuesta = await clienteApi.patch(
        `/ordenes-tecnicas/${encodeURIComponent(idOrden)}/estado`,
        {
          estado: datos.estado,
          observaciones: datos.observaciones,
          costo_mano_obra: datos.manoObra
        }
      );

      return mapearFichaOrden(respuesta.data);
    } catch (error) {
      console.error('Error en actualizarEstado:', error);
      throw error;
    }
  },

  /* ======================================================================
   * CONSUMO DE INVENTARIO (REPUESTOS)
   * ====================================================================== */

  /**
   * AGREGA UN REPUESTO A LA ORDEN · DESCUENTA EL INVENTARIO.
   *
   * PROPÓSITO FUNCIONAL: es la operación que el requisito describe como
   * "el técnico agrega el repuesto y el sistema resta la existencia, marcando la
   * salida del kádex como Servicio Técnico".
   *
   * @returns {Object} ficha de la orden + `movimiento` con la traza de stock
   *   + `alerta` cuando el descuento dejó el producto en su stock mínimo.
   */
  async agregarRepuesto(idOrden, datosRepuesto) {
    try {
      const respuesta = await clienteApi.post(
        `/ordenes-tecnicas/${encodeURIComponent(idOrden)}/repuestos`,
        {
          cod_producto: datosRepuesto.codigo,
          cantidad: Number(datosRepuesto.cantidad),
          // Si no se indica precio, el backend usa el precio de venta del catálogo.
          precio_unitario: datosRepuesto.precioUnitario ?? undefined
        }
      );

      return {
        ...mapearFichaOrden(respuesta.data),
        movimiento: respuesta.data?.movimiento || null,
        alerta: respuesta.data?.alerta || null
      };
    } catch (error) {
      console.error('Error en agregarRepuesto:', error);
      throw error;
    }
  },

  /**
   * QUITA UN REPUESTO DE LA ORDEN Y DEVUELVE EL STOCK AL INVENTARIO.
   * No procede si la orden ya fue cobrada (el backend lo valida y responde 400).
   */
  async quitarRepuesto(idOrden, codigoProducto, cantidad) {
    try {
      const respuesta = await clienteApi.delete(
        `/ordenes-tecnicas/${encodeURIComponent(idOrden)}/repuestos/${encodeURIComponent(codigoProducto)}`,
        { data: { cantidad } }
      );

      return {
        ...mapearFichaOrden(respuesta.data),
        movimiento: respuesta.data?.movimiento || null
      };
    } catch (error) {
      console.error('Error en quitarRepuesto:', error);
      throw error;
    }
  },

  /* ======================================================================
   * COBRO Y FACTURA
   * ====================================================================== */

  /**
   * COBRA LA ORDEN: el backend suma mano de obra + repuestos, registra el pago,
   * emite la factura y cierra la orden.
   *
   * @param {string} idOrden
   * @param {Object} datosCobro { metodoPago, monto, tasaCambio, referencia, idCaja, observaciones }
   */
  async cobrarOrden(idOrden, datosCobro) {
    try {
      const respuesta = await clienteApi.post(
        `/ordenes-tecnicas/${encodeURIComponent(idOrden)}/cobrar`,
        {
          metodo_pago: datosCobro.metodoPago,
          monto_usd: Number(datosCobro.monto),
          tasa_cambio: Number(datosCobro.tasaCambio),
          referencia: datosCobro.referencia,
          id_caja: datosCobro.idCaja ?? undefined,
          observaciones: datosCobro.observaciones
        }
      );

      return {
        factura: respuesta.data?.factura || null,
        orden: mapearOrden(respuesta.data?.orden || {}),
        repuestos: (respuesta.data?.repuestos || []).map(mapearRepuestoOrden),
        pago: respuesta.data?.pago || null,
        mensaje: respuesta.data?.mensaje || null
      };
    } catch (error) {
      console.error('Error en cobrarOrden:', error);
      throw error;
    }
  },

  /** COMPROBANTE DE UNA ORDEN YA COBRADA (reimpresión de la factura). */
  async obtenerFactura(idOrden) {
    try {
      const respuesta = await clienteApi.get(
        `/ordenes-tecnicas/${encodeURIComponent(idOrden)}/factura`
      );

      return {
        orden: mapearOrden(respuesta.data?.orden || {}),
        repuestos: (respuesta.data?.repuestos || []).map(mapearRepuestoOrden),
        pago: respuesta.data?.pago || null
      };
    } catch (error) {
      console.error('Error en obtenerFactura:', error);
      throw error;
    }
  }
};
