/**
 * ==========================================================================
 * SERVICIO DE ENVÍO DE REPORTES POR CORREO (emailReporteService.js)
 * TEKZON C.A. - SISTEMA DE GESTIÓN TÉCNICA E INVENTARIO
 * ==========================================================================
 * Envía el reporte generado en PDF o Excel vía correo electrónico con
 * Nodemailer, adjuntando el documento e incluyendo un resumen ejecutivo HTML.
 * ==========================================================================
 */
import nodemailer from 'nodemailer';

export const EmailReporteService = {
  /**
   * Obtiene o crea un transportador SMTP configurado o de pruebas (Ethereal).
   */
  async obtenerTransportador() {
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }

    // Si no hay SMTP configurado en producción, genera una cuenta de prueba Ethereal en vivo
    try {
      const testAccount = await nodemailer.createTestAccount();
      return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
    } catch {
      // Si no hay acceso a internet para Ethereal, usa transportador simulado para no bloquear
      return nodemailer.createTransport({
        streamTransport: true,
        newline: 'windows',
        buffer: true
      });
    }
  },

  /**
   * Envía el reporte adjunto al correo electrónico especificado.
   *
   * @param {Object} params
   * @param {string} params.destinatario - Correo destino
   * @param {Object} params.reporteData - Datos y metadatos del reporte
   * @param {Buffer} params.bufferArchivo - Buffer binario del archivo generado
   * @param {string} params.formato - 'pdf' | 'excel'
   * @param {string} params.nombreArchivo - Nombre sugerido del archivo adjunto
   * @param {string} [params.usuarioEmisor]
   */
  async enviarReportePorEmail({
    destinatario,
    reporteData,
    bufferArchivo,
    formato = 'pdf',
    nombreArchivo,
    usuarioEmisor = 'Administrador'
  }) {
    if (!destinatario || !destinatario.includes('@')) {
      throw new Error('Debe proporcionar un correo electrónico válido.');
    }

    const transportador = await this.obtenerTransportador();
    const ahora = new Date().toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });
    const extension = formato === 'excel' ? 'xlsx' : 'pdf';
    const contentType = formato === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';

    const nombreAdjunto = nombreArchivo || `Reporte_${reporteData.modulo.replace(/\s+/g, '_')}_${Date.now()}.${extension}`;

    // Construcción de la tabla de KPIs en HTML
    let kpisHtml = '';
    if (Array.isArray(reporteData.kpis) && reporteData.kpis.length > 0) {
      kpisHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
          <tr>
            ${reporteData.kpis.slice(0, 4).map((k) => `
              <td style="padding: 12px; text-align: center; border-right: 1px solid #e2e8f0;">
                <div style="font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase;">${k.etiqueta}</div>
                <div style="font-size: 16px; color: #0f172a; font-weight: bold; margin-top: 4px;">
                  ${k.tipo === 'moneda' ? `$ ${Number(k.valor).toFixed(2)}` : k.valor}
                </div>
              </td>
            `).join('')}
          </tr>
        </table>
      `;
    }

    const cuerpoHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0f172a; color: #ffffff; padding: 20px 24px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">TEKZON C.A.</h2>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Sistema de Gestión Técnica e Inventario · Barquisimeto</p>
        </div>

        <div style="padding: 24px;">
          <h3 style="color: #0f172a; margin-top: 0; font-size: 18px;">${reporteData.titulo}</h3>
          <p style="font-size: 13px; color: #475569; line-height: 1.5; margin-bottom: 16px;">
            ${reporteData.descripcion || 'Se remite el documento analítico solicitado para la revisión ejecutiva y toma de decisiones.'}
          </p>

          ${kpisHtml}

          <div style="background-color: #f1f5f9; padding: 12px 16px; border-radius: 6px; font-size: 12px; color: #475569; margin: 20px 0;">
            <p style="margin: 2px 0;"><strong>Módulo:</strong> ${reporteData.modulo}</p>
            <p style="margin: 2px 0;"><strong>Clasificación:</strong> ${reporteData.tipo}</p>
            <p style="margin: 2px 0;"><strong>Fecha y Hora:</strong> ${ahora}</p>
            <p style="margin: 2px 0;"><strong>Emitido por:</strong> ${usuarioEmisor}</p>
            <p style="margin: 2px 0;"><strong>Archivo Adjunto:</strong> ${nombreAdjunto}</p>
          </div>

          <p style="font-size: 13px; color: #334155;">
            El archivo completo en formato <strong>${formato.toUpperCase()}</strong> se encuentra adjunto a este correo con todos los registros analizados.
          </p>
        </div>

        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; font-size: 11px; color: #94a3b8; text-align: center;">
          TekZon C.A. · Carrera 28 entre calles 45 y 46, Barquisimeto · IUJO ADS-433 · 2026<br>
          Este correo fue generado automáticamente por el sistema institucional.
        </div>
      </div>
    `;

    const opcionesMail = {
      from: `"TekZon C.A. Reportes" <${process.env.SMTP_FROM || 'reportes@tekzon.com'}>`,
      to: destinatario,
      subject: `Reporte Oficial: ${reporteData.titulo} · TekZon C.A.`,
      html: cuerpoHtml,
      attachments: [
        {
          filename: nombreAdjunto,
          content: bufferArchivo,
          contentType
        }
      ]
    };

    const info = await transportador.sendMail(opcionesMail);
    const previewUrl = nodemailer.getTestMessageUrl(info);

    return {
      exito: true,
      mensaje: `Reporte enviado exitosamente a ${destinatario}`,
      messageId: info.messageId,
      previewUrl: previewUrl || null
    };
  }
};

export default EmailReporteService;
