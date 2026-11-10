/**
 * ==========================================================================
 * SERVICIO DE REPORTES (ReporteServices.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Consumo de API REST · Motor de Reportes (PDF, Excel y Correo)
 * ==========================================================================
 */
import clienteApi from './apiClient';
import { obtenerToken } from './sesion';

const obtenerUrlBase = () => {
  return import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
};

export default {
  /**
   * VISUALIZACIÓN DIRECTA (PDF en nueva pestaña) O DESCARGA (Excel).
   *
   * @param {Object} params
   * @param {string} params.tipo - 'productos' | 'categorias' | 'movimientos' | 'proveedores' | 'ordenes' | 'dispositivos' | 'caja' | 'ventas' | 'clientes'
   * @param {string} params.formato - 'pdf' | 'excel'
   * @param {Object} [params.filtros] - Filtros específicos
   */
  async descargarReporte({ tipo, formato = 'pdf', filtros = {} }) {
    try {
      const esPdf = String(formato).toLowerCase() !== 'excel';

      if (esPdf) {
        // En PDF: Navegación directa en nueva pestaña al endpoint con cabeceras Content-Type: application/pdf e inline
        const token = obtenerToken();
        const params = new URLSearchParams();
        params.append('tipo', tipo);
        params.append('formato', 'pdf');
        if (token) params.append('token', token);

        Object.keys(filtros || {}).forEach((k) => {
          if (filtros[k] !== '' && filtros[k] !== null && filtros[k] !== undefined) {
            params.append(k, filtros[k]);
          }
        });

        const urlCompleta = `${obtenerUrlBase()}/reportes/ver?${params.toString()}`;
        const ventana = window.open(urlCompleta, '_blank');

        if (!ventana || ventana.closed || typeof ventana.closed === 'undefined') {
          // Respaldo en caso de que el navegador restrinja popups automáticos
          const enlace = document.createElement('a');
          enlace.href = urlCompleta;
          enlace.target = '_blank';
          document.body.appendChild(enlace);
          enlace.click();
          document.body.removeChild(enlace);
        }

        return { exito: true, nombreArchivo: `Reporte_${tipo}.pdf`, accion: 'visualizado' };
      }

      // En Excel: Descarga de archivo mediante Blob
      const respuesta = await clienteApi.post(
        '/reportes/generar',
        {
          tipo,
          formato: 'excel',
          enviarEmail: false,
          filtros
        },
        {
          responseType: 'blob'
        }
      );

      const fechaSlug = new Date().toISOString().slice(0, 10);
      let nombreArchivo = `Reporte_${tipo}_${fechaSlug}.xlsx`;

      const disposicion = respuesta.headers['content-disposition'];
      if (disposicion) {
        const coincidencia = disposicion.match(/filename="?([^";]+)"?/);
        if (coincidencia && coincidencia[1]) {
          nombreArchivo = coincidencia[1];
        }
      }

      const blob = new Blob([respuesta.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const urlBlob = window.URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = urlBlob;
      enlace.download = nombreArchivo;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      setTimeout(() => window.URL.revokeObjectURL(urlBlob), 10000);

      return { exito: true, nombreArchivo, accion: 'descargado' };
    } catch (error) {
      console.error('Error al generar reporte:', error);
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
