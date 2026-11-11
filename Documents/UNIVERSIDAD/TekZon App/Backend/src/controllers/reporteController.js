/**
 * ==========================================================================
 * CONTROLADOR DE REPORTES (reporteController.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Presentación / Adaptador HTTP · Motor de Reportes
 * ==========================================================================
 */
import { ReportesDataService } from '../services/reportes/reportesDataService.js';
import { GeneradorPdfService } from '../services/reportes/generadorPdfService.js';
import { GeneradorExcelService } from '../services/reportes/generadorExcelService.js';
import { EmailReporteService } from '../services/reportes/emailReporteService.js';
import { responderConError } from '../utils/erroresNegocio.js';

const sanitizarNombreArchivo = (texto) => {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_');
};

export const ReporteController = {
  /**
   * GET /api/reportes/ver
   * Visualización directa en el navegador web con visualizador nativo integrado.
   * Responde con 'Content-Type: application/pdf' y 'Content-Disposition: inline'.
   */
  async verReporte(req, res) {
    try {
      const { tipo, formato = 'pdf', token, ...filtros } = req.query;

      if (!tipo) {
        return res.status(400).send('Debe especificar el tipo de reporte a visualizar.');
      }

      const usuarioEmisor = req.usuarioAutenticado?.nombre_usuario || 'Administrador';
      const reporteData = await ReportesDataService.obtenerDatosReporte(tipo, filtros);

      const formatoLimpio = String(formato).toLowerCase() === 'excel' ? 'excel' : 'pdf';
      let bufferArchivo;
      let extension;
      let contentType;

      if (formatoLimpio === 'excel') {
        bufferArchivo = await GeneradorExcelService.generarBufferExcel(reporteData, { usuarioEmisor });
        extension = 'xlsx';
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        bufferArchivo = await GeneradorPdfService.generarBufferPdf(reporteData, { usuarioEmisor });
        extension = 'pdf';
        contentType = 'application/pdf';
      }

      const fechaSlug = new Date().toISOString().slice(0, 10);
      const nombreArchivo = sanitizarNombreArchivo(`Reporte_${reporteData.modulo}_${fechaSlug}.${extension}`);
      const disposicion = formatoLimpio === 'pdf' ? 'inline' : 'attachment';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `${disposicion}; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', bufferArchivo.length);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      return res.status(200).send(bufferArchivo);
    } catch (error) {
      console.error('Error en verReporte:', error);
      return responderConError(res, error, 'GET /api/reportes/ver');
    }
  },

  /**
   * POST /api/reportes/generar
   *
   * Body:
   *   - tipo: 'productos' | 'categorias' | 'movimientos' | 'proveedores' | 'ordenes' | 'dispositivos' | 'caja' | 'ventas' | 'clientes'
   *   - formato: 'pdf' | 'excel' (por defecto 'pdf')
   *   - enviarEmail: boolean
   *   - correoDestino: string (si enviarEmail es true)
   *   - filtros: object (filtros específicos)
   */
  async generarReporte(req, res) {
    try {
      const {
        tipo,
        formato = 'pdf',
        enviarEmail = false,
        correoDestino = '',
        filtros = {}
      } = req.body;

      if (!tipo) {
        return res.status(400).json({ exito: false, mensaje: 'Debe especificar el tipo de reporte a generar.' });
      }

      const usuarioEmisor = req.usuario?.nombre || req.usuario?.username || 'Administrador';

      // 1. Obtener la data analítica enriquecida con KPIs
      const reporteData = await ReportesDataService.obtenerDatosReporte(tipo, filtros);

      // 2. Generar el buffer según el formato solicitado
      const formatoLimpio = String(formato).toLowerCase() === 'excel' ? 'excel' : 'pdf';
      let bufferArchivo;
      let extension;
      let contentType;

      if (formatoLimpio === 'excel') {
        bufferArchivo = await GeneradorExcelService.generarBufferExcel(reporteData, { usuarioEmisor });
        extension = 'xlsx';
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        bufferArchivo = await GeneradorPdfService.generarBufferPdf(reporteData, { usuarioEmisor });
        extension = 'pdf';
        contentType = 'application/pdf';
      }

      const fechaSlug = new Date().toISOString().slice(0, 10);
      const nombreArchivo = sanitizarNombreArchivo(`Reporte_${reporteData.modulo}_${fechaSlug}.${extension}`);

      // 3. Caso: Envío por correo electrónico
      if (enviarEmail || Boolean(req.body.enviar_email)) {
        const emailLimpio = String(correoDestino || '').trim();
        const patronEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailLimpio || !patronEmail.test(emailLimpio)) {
          return res.status(400).json({
            exito: false,
            mensaje: 'Debe ingresar una dirección de correo electrónico válida (ejemplo: usuario@correo.com).'
          });
        }

        const resultadoEmail = await EmailReporteService.enviarReportePorEmail({
          destinatario: emailLimpio,
          reporteData,
          bufferArchivo,
          formato: formatoLimpio,
          nombreArchivo,
          usuarioEmisor
        });

        return res.status(200).json({
          exito: true,
          mensaje: resultadoEmail.mensaje,
          previewUrl: resultadoEmail.previewUrl,
          esReal: resultadoEmail.esReal,
          reporte: {
            titulo: reporteData.titulo,
            modulo: reporteData.modulo,
            formato: formatoLimpio,
            destinatario: emailLimpio
          }
        });
      }

      // 4. Caso: Visualización inline en navegador (PDF) o descarga de archivo (Excel)
      const disposicion = formatoLimpio === 'pdf' ? 'inline' : 'attachment';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `${disposicion}; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', bufferArchivo.length);

      return res.status(200).send(bufferArchivo);
    } catch (error) {
      return responderConError(res, error, 'POST /api/reportes/generar');
    }
  },

  /**
   * GET /api/reportes/datos/:tipo
   * Retorna la data analítica en formato JSON.
   */
  async getDatosReporte(req, res) {
    try {
      const { tipo } = req.params;
      const datos = await ReportesDataService.obtenerDatosReporte(tipo, req.query);

      return res.status(200).json({
        exito: true,
        reporte: datos
      });
    } catch (error) {
      return responderConError(res, error, 'GET /api/reportes/datos/:tipo');
    }
  }
};

export default ReporteController;
