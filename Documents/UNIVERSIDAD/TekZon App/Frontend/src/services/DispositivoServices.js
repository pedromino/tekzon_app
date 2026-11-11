/**
 * ==========================================================================
 * SERVICIO DE DISPOSITIVOS (DispositivoServices.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Consumo de API REST · Módulo 2 (Recepción)
 *
 * PROPÓSITO FUNCIONAL:
 *   Encapsula las peticiones HTTP de los equipos de los clientes (los datos que
 *   se registran en la Recepción del taller): tipo, marca, modelo y número de
 *   serie, con su propietario.
 *
 * PROPÓSITO TÉCNICO:
 *   · Todas las respuestas se mapean al modelo de vista con `mapearDispositivo`,
 *     de modo que los componentes de Vue nunca manipulan nombres de columnas.
 *   · `transferirPropietario` usa PATCH porque modifica una llave foránea, una
 *     operación con semántica distinta a la edición de características.
 * ==========================================================================
 */
import clienteApi from './apiClient';
import { mapearDispositivo } from './formato';

export default {
  /** LISTA / BUSCA DISPOSITIVOS (por texto o por cédula del propietario). */
  async listarDispositivos(filtros = {}) {
    try {
      const respuesta = await clienteApi.get('/dispositivos', { params: filtros });

      return (respuesta.data?.dispositivos ?? []).map(mapearDispositivo);
    } catch (error) {
      console.error('Error en listarDispositivos:', error);
      throw error;
    }
  },

  /** OBTIENE UN DISPOSITIVO POR SU ID (null si no existe). */
  async obtenerDispositivo(idDispositivo) {
    try {
      const respuesta = await clienteApi.get(`/dispositivos/${encodeURIComponent(idDispositivo)}`);
      return mapearDispositivo(respuesta.data.dispositivo);
    } catch (error) {
      if (error.codigoHttp === 404) return null;
      console.error('Error en obtenerDispositivo:', error);
      throw error;
    }
  },

  /** REGISTRA UN DISPOSITIVO NUEVO ASOCIADO A UN CLIENTE. */
  async crearDispositivo(datosDispositivo) {
    try {
      const respuesta = await clienteApi.post('/dispositivos', {
        cedula_cli: datosDispositivo.cedula,
        nombre_dis: datosDispositivo.tipo,
        marca: datosDispositivo.marca,
        modelo: datosDispositivo.modelo,
        numero_serie: datosDispositivo.serie
      });

      return {
        mensaje: respuesta.data?.mensaje,
        dispositivo: mapearDispositivo(respuesta.data.dispositivo)
      };
    } catch (error) {
      console.error('Error en crearDispositivo:', error);
      throw error;
    }
  },

  /** ACTUALIZA LAS CARACTERÍSTICAS DEL EQUIPO. */
  async actualizarDispositivo(idDispositivo, datosDispositivo) {
    try {
      const respuesta = await clienteApi.put(
        `/dispositivos/${encodeURIComponent(idDispositivo)}`,
        {
          nombre_dis: datosDispositivo.tipo,
          marca: datosDispositivo.marca,
          modelo: datosDispositivo.modelo,
          numero_serie: datosDispositivo.serie
        }
      );

      return {
        mensaje: respuesta.data?.mensaje,
        dispositivo: mapearDispositivo(respuesta.data.dispositivo)
      };
    } catch (error) {
      console.error('Error en actualizarDispositivo:', error);
      throw error;
    }
  },

  /** TRANSFIERE EL EQUIPO A OTRO CLIENTE (cambio de titular). */
  async transferirPropietario(idDispositivo, nuevaCedula) {
    try {
      const respuesta = await clienteApi.patch(
        `/dispositivos/${encodeURIComponent(idDispositivo)}/transferir`,
        { cedula_cli: nuevaCedula }
      );

      return {
        mensaje: respuesta.data?.mensaje,
        dispositivo: mapearDispositivo(respuesta.data.dispositivo)
      };
    } catch (error) {
      console.error('Error en transferirPropietario:', error);
      throw error;
    }
  },

  /**
   * ELIMINA UN DISPOSITIVO.
   * El backend responde 409 Conflict si el equipo tiene órdenes de servicio.
   */
  async eliminarDispositivo(idDispositivo) {
    try {
      const respuesta = await clienteApi.delete(
        `/dispositivos/${encodeURIComponent(idDispositivo)}`
      );

      return respuesta.data;
    } catch (error) {
      console.error('Error en eliminarDispositivo:', error);
      throw error;
    }
  }
};
