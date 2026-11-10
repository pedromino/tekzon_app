/**
 * ==========================================================================
 * SERVICIO DE REPORTES (ReporteServices.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Consumo de API REST · Motor de Reportes (PDF, Excel y Correo)
 * ==========================================================================
 */
import clienteApi from './apiClient';

export default {
  /**
   * DESCARGA DIRECTA DE REPORTE (PDF o Excel).
   *
   * @param {Object} params
   * @param {string} params.tipo - 'productos' | 'categorias' | 'movimientos' | 'proveedores' | 'ordenes' | 'dispositivos' | 'caja' | 'ventas' | 'clientes'
   * @param {string} params.formato - 'pdf' | 'excel'
   * @param {Object} [params.filtros] - Filtros específicos
   */
  async descargarReporte({ tipo, formato = 'pdf', filtros = {} }) {
    try {
      const respuesta = await clienteApi.post(
        '/reportes/generar',
        {
          tipo,
          formato,
          enviarEmail: false,
          filtros
        },
        {
          responseType: 'blob'
        }
      );

      // Obtener o inferir el nombre del archivo
      const extension = formato === 'excel' ? 'xlsx' : 'pdf';
      const fechaSlug = new Date().toISOString().slice(0, 10);
      let nombreArchivo = `Reporte_${tipo}_${fechaSlug}.${extension}`;

      const disposicion = respuesta.headers['content-disposition'];
      if (disposicion) {
        const coincidencia = disposicion.match(/filename="?([^";]+)"?/);
        if (coincidencia && coincidencia[1]) {
          nombreArchivo = coincidencia[1];
        }
      }

      // Crear URL de descarga y disparar clic automático
      const blob = new Blob([respuesta.data], {
        type: formato === 'excel'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf'
      });

      const urlBlob = window.URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = urlBlob;
      enlace.download = nombreArchivo;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      window.URL.revokeObjectURL(urlBlob);

      return { exito: true, nombreArchivo };
    } catch (error) {
      console.error('Error al descargar reporte:', error);
      throw error;
    }
  },

  /**
   * ENVÍA EL REPORTE POR CORREO ELECTRÓNICO.
   *
   * @param {Object} params
   * @param {string} params.tipo
   * @param {string} params.formato - 'pdf' | 'excel'
   * @param {string} params.correoDestino
   * @param {Object} [params.filtros]
   */
  async enviarReportePorEmail({ tipo, formato = 'pdf', correoDestino, filtros = {} }) {
    try {
      const respuesta = await clienteApi.post('/reportes/generar', {
        tipo,
        formato,
        enviarEmail: true,
        correoDestino,
        filtros
      });

      return respuesta.data;
    } catch (error) {
      console.error('Error al enviar reporte por email:', error);
      throw error;
    }
  },

  /**
   * CONSULTA LOS DATOS ANALÍTICOS DE UN REPORTE EN JSON.
   */
  async obtenerDatosReporte(tipo, filtros = {}) {
    try {
      const respuesta = await clienteApi.get(`/reportes/datos/${tipo}`, { params: filtros });
      return respuesta.data?.reporte;
    } catch (error) {
      console.error('Error al obtener datos analíticos del reporte:', error);
      throw error;
    }
  }
};
