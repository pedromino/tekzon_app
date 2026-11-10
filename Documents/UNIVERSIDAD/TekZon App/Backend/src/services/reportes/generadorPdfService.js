/**
 * ==========================================================================
 * GENERADOR DE REPORTES EN PDF (generadorPdfService.js)
 * TEKZON C.A. - SISTEMA DE GESTIÓN TÉCNICA E INVENTARIO
 * ==========================================================================
 * Utiliza PDFKit y pdfkit-table para generar documentos con membrete
 * corporativo, tabla formateada, KPIs ejecutivos y pie legal.
 * ==========================================================================
 */
import PDFDocument from 'pdfkit-table';

const formatearValor = (valor, tipo) => {
  if (valor === null || valor === undefined) return '—';
  if (tipo === 'moneda') {
    const num = Number(valor);
    return isNaN(num) ? '—' : `$ ${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (tipo === 'porcentaje') {
    const num = Number(valor);
    return isNaN(num) ? '—' : `${num.toFixed(1)} %`;
  }
  if (tipo === 'entero') {
    const num = Number(valor);
    return isNaN(num) ? '—' : num.toLocaleString('es-VE');
  }
  return String(valor);
};

export const GeneradorPdfService = {
  /**
   * Genera el buffer del reporte PDF a partir de los datos analíticos.
   *
   * @param {Object} reporteData - Objeto devuelto por ReportesDataService
   * @param {Object} opciones - Metadatos adicionales (usuarioEmisor, filtrosTexto)
   * @returns {Promise<Buffer>}
   */
  async generarBufferPdf(reporteData, opciones = {}) {
    return new Promise((resolve, reject) => {
      try {
        const esLandscape = (reporteData.columnas?.length || 0) >= 6;
        const doc = new PDFDocument({
          size: 'A4',
          layout: esLandscape ? 'landscape' : 'portrait',
          margins: { top: 36, bottom: 36, left: 36, right: 36 },
          bufferPages: true
        });

        const buffers = [];
        doc.on('data', (trozo) => buffers.push(trozo));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const usuarioEmisor = opciones.usuarioEmisor || 'Administrador del Sistema';
        const ahora = new Date().toLocaleString('es-VE', {
          dateStyle: 'medium',
          timeStyle: 'short'
        });

        // ====================================================================
        // 1. ENCABEZADO INSTITUCIONAL TEKZON C.A.
        // ====================================================================
        const anchoUtil = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        doc
          .fontSize(16)
          .font('Helvetica-Bold')
          .fillColor('#0f172a')
          .text('TEKZON C.A.', { continued: false });

        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#64748b')
          .text('RIF J-40123456-1 · Carrera 28 entre calles 45 y 46, Barquisimeto, Edo. Lara')
          .text('Sistema de Gestión Técnica e Inventario · IUJO ADS-433');

        doc.moveDown(0.5);

        // Barra decorativa azul
        doc
          .rect(doc.x, doc.y, anchoUtil, 2)
          .fillColor('#2563eb')
          .fill();

        doc.moveDown(0.7);

        // ====================================================================
        // 2. TÍTULO DEL REPORTE Y TIPO
        // ====================================================================
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .fillColor('#0f172a')
          .text(reporteData.titulo);

        doc
          .fontSize(8.5)
          .font('Helvetica')
          .fillColor('#475569')
          .text(`Módulo: ${reporteData.modulo} | Clasificación: ${reporteData.tipo} | Emitido: ${ahora} por ${usuarioEmisor}`);

        if (reporteData.descripcion) {
          doc
            .fontSize(8)
            .font('Helvetica-Oblique')
            .fillColor('#64748b')
            .text(reporteData.descripcion);
        }

        doc.moveDown(0.8);

        // ====================================================================
        // 3. CUADRÍCULA DE KPIS / RESUMEN GERENCIAL
        // ====================================================================
        if (Array.isArray(reporteData.kpis) && reporteData.kpis.length > 0) {
          const kpis = reporteData.kpis;
          const kpiWidth = anchoUtil / Math.min(kpis.length, 6);
          const yInicialKpi = doc.y;

          doc.rect(doc.page.margins.left, yInicialKpi, anchoUtil, 38).fillColor('#f8fafc').fill();
          doc.rect(doc.page.margins.left, yInicialKpi, anchoUtil, 38).lineWidth(0.5).strokeColor('#e2e8f0').stroke();

          kpis.slice(0, 6).forEach((kpi, index) => {
            const posX = doc.page.margins.left + (index * kpiWidth);
            const valFormateado = formatearValor(kpi.valor, kpi.tipo);

            doc
              .fontSize(7)
              .font('Helvetica-Bold')
              .fillColor('#64748b')
              .text(kpi.etiqueta.toUpperCase(), posX + 6, yInicialKpi + 6, {
                width: kpiWidth - 12,
                align: 'center'
              });

            doc
              .fontSize(10)
              .font('Helvetica-Bold')
              .fillColor('#0f172a')
              .text(valFormateado, posX + 6, yInicialKpi + 18, {
                width: kpiWidth - 12,
                align: 'center'
              });
          });

          doc.y = yInicialKpi + 46;
        }

        // ====================================================================
        // 4. TABLA DE DATOS ANALÍTICOS (pdfkit-table)
        // ====================================================================
        const headers = reporteData.columnas.map((col) => ({
          label: col.etiqueta,
          property: col.clave,
          width: undefined, // Ajuste automático proporcional
          renderer: null
        }));

        const rows = reporteData.filas.map((fila) => {
          const filaFormateada = [];
          reporteData.columnas.forEach((col) => {
            const v = fila[col.clave];
            filaFormateada.push(formatearValor(v, col.tipo));
          });
          return filaFormateada;
        });

        const table = {
          title: '',
          subtitle: '',
          headers: reporteData.columnas.map((c) => c.etiqueta),
          rows
        };

        doc.table(table, {
          prepareHeader: () => doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff'),
          prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
            doc.font('Helvetica').fontSize(7).fillColor('#1e293b');
          },
          divider: {
            header: { disabled: false, width: 1, opacity: 1 },
            horizontal: { disabled: false, width: 0.5, opacity: 0.3 }
          },
          padding: [3, 3, 3, 3],
          headerColor: '#0f172a',
          columnSpacing: 4
        });

        // ====================================================================
        // 5. PIE DE PÁGINA Y NUMERACIÓN "Página X de Y"
        // ====================================================================
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < (range.start + range.count); i++) {
          doc.switchToPage(i);

          const pieY = doc.page.height - 24;
          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor('#94a3b8')
            .text(
              `TekZon C.A. · Documento de Control y Toma de Decisiones · Página ${i + 1} de ${range.count}`,
              doc.page.margins.left,
              pieY,
              { align: 'center', width: anchoUtil }
            );
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
};

export default GeneradorPdfService;
