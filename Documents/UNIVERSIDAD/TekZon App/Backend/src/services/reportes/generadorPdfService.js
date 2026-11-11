/**
 * ==========================================================================
 * GENERADOR DE REPORTES EN PDF (generadorPdfService.js)
 * TEKZON C.A. - SISTEMA DE GESTIÓN TÉCNICA E INVENTARIO
 * ==========================================================================
 * Genera documentos PDF con diseño visual simétrico, balanceado y limpio:
 *   - Membrete corporativo oficial de TekZon C.A.
 *   - Cuadrícula de KPIs con tarjetas estilizadas y separación vertical
 *     garantizada para evitar desbordes y encimamiento de textos.
 *   - Tabla analítica con cálculo proporcional de anchos de columna sobre
 *     el ancho útil total de la página (layout responsivo para PDF).
 *   - Paginación automática "Página X de Y" en pie legal.
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
   * @param {Object} opciones - Metadatos adicionales (usuarioEmisor)
   * @returns {Promise<Buffer>}
   */
  async generarBufferPdf(reporteData, opciones = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const totalColumnas = reporteData.columnas?.length || 0;
        // Para 5 o más columnas se utiliza orientación horizontal (Landscape)
        const esLandscape = totalColumnas >= 5;

        const doc = new PDFDocument({
          size: 'A4',
          layout: esLandscape ? 'landscape' : 'portrait',
          margins: { top: 32, bottom: 32, left: 32, right: 32 },
          bufferPages: true
        });

        const buffers = [];
        doc.on('data', (trozo) => buffers.push(trozo));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const anchoUtil = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const usuarioEmisor = opciones.usuarioEmisor || 'Administrador del Sistema';
        const ahora = new Date().toLocaleString('es-VE', {
          dateStyle: 'medium',
          timeStyle: 'short'
        });

        // ====================================================================
        // 1. ENCABEZADO INSTITUCIONAL TEKZON C.A.
        // ====================================================================
        doc
          .fontSize(16)
          .font('Helvetica-Bold')
          .fillColor('#0f172a')
          .text('TEKZON C.A.', doc.page.margins.left, doc.page.margins.top);

        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#64748b')
          .text('RIF J-40123456-1 · Carrera 28 entre calles 45 y 46, Barquisimeto, Edo. Lara')
          .text('Sistema de Gestión Técnica e Inventario · IUJO ADS-433');

        doc.moveDown(0.4);

        // Línea divisoria decorativa azul institucional
        doc
          .rect(doc.page.margins.left, doc.y, anchoUtil, 2)
          .fillColor('#2563eb')
          .fill();

        doc.moveDown(0.5);

        // ====================================================================
        // 2. TÍTULO Y METADATOS DEL REPORTE
        // ====================================================================
        doc
          .fontSize(13)
          .font('Helvetica-Bold')
          .fillColor('#0f172a')
          .text(reporteData.titulo, doc.page.margins.left);

        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#475569')
          .text(`Módulo: ${reporteData.modulo} | Clasificación: ${reporteData.tipo} | Emitido: ${ahora} por ${usuarioEmisor}`);

        if (reporteData.descripcion) {
          doc
            .fontSize(7.5)
            .font('Helvetica-Oblique')
            .fillColor('#64748b')
            .text(reporteData.descripcion);
        }

        doc.moveDown(0.6);

        // ====================================================================
        // 3. TARJETAS DE KPIS EJECUTIVOS (LAYOUT SEGURO SIN SUPERPOSICIONES)
        // ====================================================================
        if (Array.isArray(reporteData.kpis) && reporteData.kpis.length > 0) {
          const kpis = reporteData.kpis.slice(0, 6);
          const numKpis = kpis.length;
          const gap = 8;
          const cardWidth = (anchoUtil - (gap * (numKpis - 1))) / numKpis;
          const cardHeight = 46;
          const yKpi = doc.y;

          kpis.forEach((kpi, idx) => {
            const posX = doc.page.margins.left + idx * (cardWidth + gap);

            // Fondo y borde redondeado de la tarjeta
            doc
              .roundedRect(posX, yKpi, cardWidth, cardHeight, 3)
              .fillColor('#f8fafc')
              .fill()
              .lineWidth(0.5)
              .strokeColor('#e2e8f0')
              .stroke();

            // Línea de acento superior según tipo de indicador
            const esAlerta = kpi.tipo === 'alerta' || (typeof kpi.valor === 'number' && kpi.valor > 0 && /alerta|agotado/i.test(kpi.etiqueta));
            doc
              .roundedRect(posX, yKpi, cardWidth, 2.5, 1.5)
              .fillColor(esAlerta ? '#ef4444' : '#2563eb')
              .fill();

            // Etiqueta del KPI (arriba, con margen seguro)
            doc
              .fontSize(6)
              .font('Helvetica-Bold')
              .fillColor('#64748b')
              .text(String(kpi.etiqueta || '').toUpperCase(), posX + 4, yKpi + 6, {
                width: cardWidth - 8,
                align: 'center',
                lineGap: 1
              });

            // Valor del KPI (abajo, sin riesgo de superposición)
            const valorFormateado = formatearValor(kpi.valor, kpi.tipo);
            doc
              .fontSize(9.5)
              .font('Helvetica-Bold')
              .fillColor(esAlerta ? '#b91c1c' : '#0f172a')
              .text(valorFormateado, posX + 4, yKpi + 26, {
                width: cardWidth - 8,
                align: 'center'
              });
          });

          // IMPORTANTE: Se reposiciona el cursor al margen izquierdo y debajo de las tarjetas
          doc.x = doc.page.margins.left;
          doc.y = yKpi + cardHeight + 14;
        }

        // ====================================================================
        // 4. TABLA DE DATOS CON ANCHOS PORCENTUALES Y AJUSTE RESPONSIVO
        // ====================================================================
        // Suma de pesos de las columnas para distribución proporcional
        const sumaPesos = reporteData.columnas.reduce((acc, c) => acc + (c.ancho || 10), 0);
        let anchoAcumulado = 0;

        const headers = reporteData.columnas.map((col, idx) => {
          let colWidth = Math.floor(((col.ancho || 10) / sumaPesos) * anchoUtil);
          if (idx === reporteData.columnas.length - 1) {
            colWidth = anchoUtil - anchoAcumulado; // Ajuste del último pixel
          } else {
            anchoAcumulado += colWidth;
          }

          let align = 'left';
          if (['moneda', 'porcentaje', 'entero'].includes(col.tipo)) align = 'right';
          if (['codigo', 'situacion', 'estado', 'serial', 'id'].includes(col.clave)) align = 'center';

          return {
            label: col.etiqueta,
            property: col.clave,
            width: colWidth,
            align,
            headerAlign: align === 'right' ? 'right' : (align === 'center' ? 'center' : 'left'),
            headerColor: '#0c4a6e', // Color oscuro oficial de la marca desde styles.css (--brand-maroon)
            headerOpacity: 1,
            renderer: null
          };
        });

        const rows = reporteData.filas.map((fila) => {
          const rowData = {};
          reporteData.columnas.forEach((col) => {
            const v = fila[col.clave];
            rowData[col.clave] = formatearValor(v, col.tipo);
          });
          return rowData;
        });

        const table = {
          title: '',
          subtitle: '',
          headers,
          datas: rows
        };

        await doc.table(table, {
          x: doc.page.margins.left,
          width: anchoUtil,
          // Encabezado: Fondo oscuro (#0c4a6e) y letra clara de alto contraste (#ffffff / --surface-card)
          prepareHeader: () => doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff'),
          prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
            doc.font('Helvetica').fontSize(6.8).fillColor('#172b36'); // --text-main de styles.css
          },
          divider: {
            header: { disabled: false, width: 1, opacity: 1 },
            horizontal: { disabled: false, width: 0.5, opacity: 0.25 }
          },
          padding: [4, 4, 3, 4],
          headerColor: '#0c4a6e',
          headerOpacity: 1
        });

        // ====================================================================
        // 5. PIE DE PÁGINA "Página X de Y" (Garantizado en la misma hoja)
        // ====================================================================
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < (range.start + range.count); i++) {
          doc.switchToPage(i);

          // Se neutraliza temporalmente el margen inferior para evitar que PDFKit
          // genere automáticamente una hoja en blanco innecesaria para el pie de página
          const margenInferiorOriginal = doc.page.margins.bottom;
          doc.page.margins.bottom = 0;

          const pieY = doc.page.height - 18;
          doc
            .fontSize(6.8)
            .font('Helvetica')
            .fillColor('#5d7079') // --text-muted de styles.css
            .text(
              `TekZon C.A. · Documento de Control y Toma de Decisiones · Página ${i + 1} de ${range.count}`,
              doc.page.margins.left,
              pieY,
              { align: 'center', width: anchoUtil, lineBreak: false }
            );

          doc.page.margins.bottom = margenInferiorOriginal;
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
};

export default GeneradorPdfService;
