/**
 * ==========================================================================
 * SERVICIO DE PROVEEDORES (ProveedorServices.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Consumo de API REST · Módulo de Proveedores
 * ==========================================================================
 */
import clienteApi from './apiClient';

/** Mapea una fila de MySQL de la tabla `proveedor` al formato frontend. */
export const mapearProveedor = (p) => {
  if (!p) return null;
  return {
    rif: p.rif_proveedor,
    rif_proveedor: p.rif_proveedor,
    nombre: p.nombre_proveedor,
    nombre_proveedor: p.nombre_proveedor,
    telefono: p.telefono_proveedor || '',
    telefono_proveedor: p.telefono_proveedor || '',
    direccion: p.direccion_proveedor || '',
    direccion_proveedor: p.direccion_proveedor || '',
    estado: Number(p.estado ?? 1),
    totalCompras: Number(p.total_compras || 0)
  };
};

export default {
  /**
   * LISTA PROVEEDORES (con filtros opcionales de texto y soloActivos).
   */
  async listarProveedores(filtros = {}) {
    try {
      const respuesta = await clienteApi.get('/proveedores', { params: filtros });
      return (respuesta.data?.proveedores ?? []).map(mapearProveedor);
    } catch (error) {
      console.error('Error en listarProveedores:', error);
      throw error;
    }
  },

  /**
   * LISTA EXCLUSIVAMENTE LOS PROVEEDORES ACTIVOS (para selectores en modales).
   */
  async listarProveedoresActivos() {
    try {
      const respuesta = await clienteApi.get('/proveedores', { params: { soloActivos: true } });
      return (respuesta.data?.proveedores ?? []).map(mapearProveedor);
    } catch (error) {
      console.error('Error en listarProveedoresActivos:', error);
      throw error;
    }
  },

  /**
   * OBTIENE UN PROVEEDOR POR SU RIF.
   */
  async obtenerPorRif(rif) {
    try {
      const respuesta = await clienteApi.get(`/proveedores/${encodeURIComponent(rif)}`);
      return mapearProveedor(respuesta.data?.proveedor);
    } catch (error) {
      console.error('Error en obtenerPorRif:', error);
      throw error;
    }
  },

  /**
   * REGISTRA UN NUEVO PROVEEDOR.
   */
  async crearProveedor(datos) {
    try {
      const respuesta = await clienteApi.post('/proveedores', {
        rif_proveedor: datos.rif || datos.rif_proveedor,
        nombre_proveedor: datos.nombre || datos.nombre_proveedor,
        telefono_proveedor: datos.telefono || datos.telefono_proveedor,
        direccion_proveedor: datos.direccion || datos.direccion_proveedor,
        estado: datos.estado !== undefined ? datos.estado : 1
      });
      return {
        exito: true,
        mensaje: respuesta.data?.mensaje || 'Proveedor registrado con éxito',
        proveedor: mapearProveedor(respuesta.data?.proveedor)
      };
    } catch (error) {
      console.error('Error en crearProveedor:', error);
      throw error;
    }
  },

  /**
   * ACTUALIZA UN PROVEEDOR EXISTENTE.
   */
  async actualizarProveedor(rif, datos) {
    try {
      const respuesta = await clienteApi.put(`/proveedores/${encodeURIComponent(rif)}`, {
        nombre_proveedor: datos.nombre || datos.nombre_proveedor,
        telefono_proveedor: datos.telefono || datos.telefono_proveedor,
        direccion_proveedor: datos.direccion || datos.direccion_proveedor,
        estado: datos.estado !== undefined ? datos.estado : 1
      });
      return {
        exito: true,
        mensaje: respuesta.data?.mensaje || 'Proveedor actualizado con éxito',
        proveedor: mapearProveedor(respuesta.data?.proveedor)
      };
    } catch (error) {
      console.error('Error en actualizarProveedor:', error);
      throw error;
    }
  },

  /**
   * ALTERNA EL ESTADO DEL PROVEEDOR (HABILITAR / DESHABILITAR).
   */
  async cambiarEstadoProveedor(rif, nuevoEstado) {
    try {
      const respuesta = await clienteApi.patch(`/proveedores/${encodeURIComponent(rif)}/estado`, {
        estado: nuevoEstado
      });
      return {
        exito: true,
        mensaje: respuesta.data?.mensaje || 'Estado actualizado',
        proveedor: mapearProveedor(respuesta.data?.proveedor)
      };
    } catch (error) {
      console.error('Error en cambiarEstadoProveedor:', error);
      throw error;
    }
  }
};
