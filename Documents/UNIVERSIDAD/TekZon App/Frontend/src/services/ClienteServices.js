/**
 * ==========================================================================
 * SERVICIO DE CLIENTES (ClienteServices.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Consumo de API REST · Módulo 2 (Recepción y Mostrador)
 *
 * PROPÓSITO FUNCIONAL:
 *   Encapsula las peticiones HTTP de la cartera de clientes, entidad común a los
 *   DOS flujos comerciales del sistema: Servicio Técnico y Venta Directa.
 *
 * PROPÓSITO TÉCNICO:
 *   · `buscarCliente()` devuelve `null` en lugar de lanzar ante un 404, porque su
 *     uso principal es la RECEPCIÓN: el formulario pregunta "¿existe este
 *     cliente?" y, según la respuesta, autocompleta sus datos o deja los campos
 *     vacíos para darlo de alta. Un 404 en ese contexto NO es un error.
 *   · `obtenerHistorial()` reúne en una sola llamada los equipos, las facturas y
 *     las órdenes del cliente (el backend los une con sus llaves foráneas).
 * ==========================================================================
 */
import clienteApi from './apiClient';
import { mapearCliente, mapearDispositivo, mapearVenta, mapearOrden, aNumero } from './formato';

export default {
  /**
   * LISTA / BUSCA CLIENTES.
   * @param {Object} filtros { texto } Búsqueda por cédula, nombre o apellido.
   */
  async listarClientes(filtros = {}) {
    try {
      const respuesta = await clienteApi.get('/clientes', { params: filtros });

      return (respuesta.data?.clientes ?? []).map(mapearCliente);
    } catch (error) {
      console.error('Error en listarClientes:', error);
      throw error;
    }
  },

  /**
   * BUSCA UN CLIENTE POR SU CÉDULA.
   * Devuelve `null` cuando el cliente no existe (404), para que el formulario de
   * recepción o de venta decida si debe darlo de alta.
   */
  async buscarCliente(cedula) {
    try {
      const respuesta = await clienteApi.get(`/clientes/${encodeURIComponent(cedula)}`);
      return mapearCliente(respuesta.data.cliente);
    } catch (error) {
      if (error.codigoHttp === 404) return null;
      console.error('Error en buscarCliente:', error);
      throw error;
    }
  },

  /** REGISTRA UN CLIENTE NUEVO (409 si la cédula ya existe). */
  async crearCliente(datosCliente) {
    try {
      const respuesta = await clienteApi.post('/clientes', {
        cedula_cli: datosCliente.cedula,
        nombre_cliente: datosCliente.nombre,
        apellido_cliente: datosCliente.apellido,
        telefono_cliente: datosCliente.telefono,
        direccion_cli: datosCliente.direccion
      });

      return {
        mensaje: respuesta.data?.mensaje,
        cliente: mapearCliente(respuesta.data.cliente)
      };
    } catch (error) {
      console.error('Error en crearCliente:', error);
      throw error;
    }
  },

  /** ACTUALIZA LOS DATOS DE CONTACTO (la cédula no se modifica). */
  async actualizarCliente(cedula, datosCliente) {
    try {
      const respuesta = await clienteApi.put(`/clientes/${encodeURIComponent(cedula)}`, {
        nombre_cliente: datosCliente.nombre,
        apellido_cliente: datosCliente.apellido,
        telefono_cliente: datosCliente.telefono,
        direccion_cli: datosCliente.direccion
      });

      return {
        mensaje: respuesta.data?.mensaje,
        cliente: mapearCliente(respuesta.data.cliente)
      };
    } catch (error) {
      console.error('Error en actualizarCliente:', error);
      throw error;
    }
  },

  /**
   * ELIMINA UN CLIENTE.
   * El backend responde 409 Conflict si el cliente ya tiene equipos o facturas.
   */
  async eliminarCliente(cedula) {
    try {
      const respuesta = await clienteApi.delete(`/clientes/${encodeURIComponent(cedula)}`);
      return respuesta.data;
    } catch (error) {
      console.error('Error en eliminarCliente:', error);
      throw error;
    }
  },

  /**
   * HISTORIAL COMPLETO DEL CLIENTE.
   * Devuelve el cliente junto con sus equipos, sus facturas y sus órdenes.
   */
  async obtenerHistorial(cedula) {
    try {
      const respuesta = await clienteApi.get(
        `/clientes/${encodeURIComponent(cedula)}/historial`
      );

      return {
        cliente: mapearCliente(respuesta.data.cliente),
        dispositivos: (respuesta.data?.dispositivos ?? []).map((dispositivo) => ({
          ...mapearDispositivo(dispositivo),
          totalOrdenes: aNumero(dispositivo.total_ordenes)
        })),
        facturas: (respuesta.data?.facturas ?? []).map(mapearVenta),
        ordenes: (respuesta.data?.ordenes ?? []).map(mapearOrden)
      };
    } catch (error) {
      console.error('Error en obtenerHistorial:', error);
      throw error;
    }
  }
};
