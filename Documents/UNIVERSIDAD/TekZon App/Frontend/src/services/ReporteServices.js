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

      // Crear Blob con el tipo MIME adecuado
      const esExcel = formato === 'excel';
      const blob = new Blob([respuesta.data], {
        type: esExcel
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf'
      });

      const urlBlob = window.URL.createObjectURL(blob);

      if (esExcel) {
        // En Excel se ejecuta la descarga del libro de cálculo
        const enlace = document.createElement('a');
        enlace.href = urlBlob;
        enlace.download = nombreArchivo;
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);
        setTimeout(() => window.URL.revokeObjectURL(urlBlob), 10000);
        return { exito: true, nombreArchivo, accion: 'descargado' };
      } else {
        // En PDF se abre directamente en una nueva pestaña del navegador (visualizador nativo)
        const ventana = window.open(urlBlob, '_blank');
        if (!ventana || ventana.closed || typeof ventana.closed === 'undefined') {
          // Si el bloqueador de ventanas emergentes interfiere, fallback a enlace
          const enlace = document.createElement('a');
          enlace.href = urlBlob;
          enlace.target = '_blank';
          document.body.appendChild(enlace);
          enlace.click();
          document.body.removeChild(enlace);
        }
        setTimeout(() => window.URL.revokeObjectURL(urlBlob), 60000);
        return { exito: true, nombreArchivo, accion: 'visualizado' };
      }
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
