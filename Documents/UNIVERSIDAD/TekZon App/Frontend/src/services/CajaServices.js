/**
 * ==========================================================================
 * SERVICIO DE CAJA (CajaServices.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Consumo de API REST · Módulo 2 (Caja)
 *
 * PROPÓSITO FUNCIONAL:
 *   Encapsula las peticiones HTTP del turno de caja, que es el marco contable
 *   donde se registran TODOS los cobros del sistema (ventas directas y servicios
 *   técnicos):
 *
 *     · obtenerCajaActiva()  -> ¿hay un turno abierto? (condición para cobrar)
 *     · abrirCaja()          -> apertura con fondo inicial.
 *     · obtenerPagos()       -> arqueo detallado del turno.
 *     · cerrarCaja()         -> cierre con cálculo de sobrante/faltante.
 *
 * PROPÓSITO TÉCNICO:
 *   `obtenerCajaActiva()` devuelve `null` (en lugar de lanzar) cuando no hay
 *   ninguna caja abierta: es una SITUACIÓN VÁLIDA del negocio, no un error. Las
 *   pantallas de cobro la usan para ofrecer el botón "Abrir caja" en lugar de
 *   dejar al usuario con un formulario que el backend rechazará.
 * ==========================================================================
 */
import clienteApi from './apiClient';
import { aDecimal, aNumero, formatearFecha } from './formato';

/** MAPEA UNA CAJA del backend al modelo de vista. */
const mapearCaja = (caja) => ({
  // --- Nomenclatura del frontend ---
  id: caja.id_caja,
  estado: caja.estado,
  abierta: caja.estado === 'ABIERTA',
  montoApertura: aDecimal(caja.monto_apertura),
  montoCierre: caja.monto_cierre === null ? null : aDecimal(caja.monto_cierre),
  fechaApertura: caja.fecha_apertura,
  fechaCierre: caja.fecha_cierre,
  usuario: caja.nombre_usuario || 'Sin asignar',
  username: caja.username || '',
  observaciones: caja.observaciones || '',
  totalRecaudado: aDecimal(caja.total_recaudado),
  totalPagos: aNumero(caja.total_pagos),
  totalVentas: aDecimal(caja.total_ventas),
  totalServicios: aDecimal(caja.total_servicios),
  // --- Nomenclatura original de MySQL ---
  id_caja: caja.id_caja,
  monto_apertura: aDecimal(caja.monto_apertura),
  monto_cierre: caja.monto_cierre === null ? null : aDecimal(caja.monto_cierre),
  fecha_apertura: caja.fecha_apertura,
  fecha_cierre: caja.fecha_cierre,
  // Presentación de la fecha de apertura para la interfaz.
  fechaAperturaTexto: formatearFecha(caja.fecha_apertura)
});

export default {
  /** LISTA DE TURNOS DE CAJA con su recaudación. */
  async listarCajas() {
    try {
      const respuesta = await clienteApi.get('/caja');

      return (respuesta.data?.cajas ?? []).map(mapearCaja);
    } catch (error) {
      console.error('Error en listarCajas:', error);
      throw error;
    }
  },

  /**
   * CAJA ACTIVA (turno abierto).
   * Devuelve `null` si no hay ningún turno abierto.
   */
  async obtenerCajaActiva() {
    try {
      const respuesta = await clienteApi.get('/caja/activa');

      if (!respuesta.data?.hay_caja_abierta) return null;

      return mapearCaja(respuesta.data.caja);
    } catch (error) {
      console.error('Error en obtenerCajaActiva:', error);
      throw error;
    }
  },

  /** ABRE UN TURNO DE CAJA (409 si ya hay uno abierto). */
  async abrirCaja(datosApertura) {
    try {
      const respuesta = await clienteApi.post('/caja/abrir', {
        monto_apertura: Number(datosApertura.montoApertura || 0),
        observaciones: datosApertura.observaciones
      });

      return {
        caja: mapearCaja(respuesta.data.caja),
        mensaje: respuesta.data?.mensaje
      };
    } catch (error) {
      console.error('Error en abrirCaja:', error);
      throw error;
    }
  },

  /**
   * ARQUEO DETALLADO DE UN TURNO: pagos uno por uno, resumen por método de pago
   * y totales separados por origen (ventas / servicios técnicos).
   */
  async obtenerPagosDeCaja(idCaja) {
    try {
      const respuesta = await clienteApi.get(`/caja/${encodeURIComponent(idCaja)}/pagos`);

      return {
        caja: mapearCaja(respuesta.data.caja),
        pagos: (respuesta.data?.pagos ?? []).map((pago) => ({
          id: pago.id_pago,
          tipoOrigen: pago.tipo_origen,
          metodoPago: pago.metodo_pago,
          monto: aDecimal(pago.monto_usd),
          tasaCambio: aDecimal(pago.tasa_cambio),
          referencia: pago.referencia || '',
          fecha: pago.fecha_pago,
          factura: pago.venta_num_factura || null,
          orden: pago.id_ordentec || null,
          cliente: `${pago.nombre_cliente || ''} ${pago.apellido_cliente || ''}`.trim() || '—'
        })),
        resumenPorMetodo: (respuesta.data?.resumen_por_metodo ?? []).map((fila) => ({
          metodoPago: fila.metodo_pago,
          totalOperaciones: aNumero(fila.total_operaciones),
          totalUsd: aDecimal(fila.total_usd)
        })),
        totales: {
          totalRecaudado: aDecimal(respuesta.data?.totales?.total_recaudado),
          totalVentas: aDecimal(respuesta.data?.totales?.total_ventas),
          totalServicios: aDecimal(respuesta.data?.totales?.total_servicios),
          totalOperaciones: aNumero(respuesta.data?.totales?.total_operaciones)
        }
      };
    } catch (error) {
      console.error('Error en obtenerPagosDeCaja:', error);
      throw error;
    }
  },

  /**
   * CIERRA UN TURNO DE CAJA CON ARQUEO.
   * El backend devuelve la diferencia entre lo contado y lo registrado, con su
   * clasificación (CUADRADA / SOBRANTE / FALTANTE).
   */
  async cerrarCaja(idCaja, datosCierre) {
    try {
      const respuesta = await clienteApi.post(`/caja/${encodeURIComponent(idCaja)}/cerrar`, {
        monto_cierre: Number(datosCierre.montoCierre || 0),
        observaciones: datosCierre.observaciones
      });

      return {
        caja: mapearCaja(respuesta.data.caja),
        totalRecaudado: aDecimal(respuesta.data?.total_recaudado),
        diferencia: aDecimal(respuesta.data?.diferencia),
        tipoDiferencia: respuesta.data?.tipo_diferencia,
        mensaje: respuesta.data?.mensaje
      };
    } catch (error) {
      console.error('Error en cerrarCaja:', error);
      throw error;
    }
  }
};
