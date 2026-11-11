/**
 * ==========================================================================
 * GENERADOR DE REPORTES EN EXCEL (generadorExcelService.js)
 * TEKZON C.A. - SISTEMA DE GESTIÓN TÉCNICA E INVENTARIO
 * ==========================================================================
 * Utiliza ExcelJS para generar libros de cálculo (.xlsx) estilizados, con
 * formatos contables, KPIs destacados y anchos automáticos.
 * ==========================================================================
 */
import ExcelJS from 'exceljs';

export const GeneradorExcelService = {
  /**
   * Genera el buffer del libro de Excel a partir de los datos analíticos.
   *
   * @param {Object} reporteData - Objeto devuelto por ReportesDataService
   * @param {Object} opciones - Metadatos adicionales (usuarioEmisor)
   * @returns {Promise<Buffer>}
   */
  async generarBufferExcel(reporteData, opciones = {}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TekZon C.A. - Sistema de Gestión';
    workbook.created = new Date();

    const sheetName = String(reporteData.modulo || 'Reporte').slice(0, 30);
    const worksheet = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }]
    });

    const totalCols = Math.max(reporteData.columnas.length, 6);
    const usuarioEmisor = opciones.usuarioEmisor || 'Administrador del Sistema';
    const ahora = new Date().toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });

    // 1. TÍTULO PRINCIPAL (Fila 1)
    worksheet.mergeCells(1, 1, 1, totalCols);
    const celdaTitulo = worksheet.getCell(1, 1);
    celdaTitulo.value = `TEKZON C.A. · ${reporteData.titulo.toUpperCase()}`;
    celdaTitulo.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    celdaTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    celdaTitulo.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 34;

    // 2. SUBTÍTULO Y METADATOS (Fila 2)
    worksheet.mergeCells(2, 1, 2, totalCols);
    const celdaSub = worksheet.getCell(2, 1);
    celdaSub.value = `Módulo: ${reporteData.modulo}  |  Tipo: ${reporteData.tipo}  |  Emisión: ${ahora}  |  Usuario: ${usuarioEmisor}`;
    celdaSub.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF475569' } };
    celdaSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    celdaSub.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(2).height = 20;

    // Fila 3 en blanco
    worksheet.getRow(3).height = 10;

    // 3. FRANGE DE KPIS (Fila 4 y 5 si existen)
    let filaInicioTabla = 5;
    if (Array.isArray(reporteData.kpis) && reporteData.kpis.length > 0) {
      const kpis = reporteData.kpis;
      worksheet.getRow(4).height = 18;
      worksheet.getRow(5).height = 24;

      kpis.slice(0, totalCols).forEach((kpi, idx) => {
        const colIdx = idx + 1;
        const celdaLbl = worksheet.getCell(4, colIdx);
        celdaLbl.value = kpi.etiqueta.toUpperCase();
        celdaLbl.font = { name: 'Arial', size: 7.5, bold: true, color: { argb: 'FF64748B' } };
        celdaLbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        celdaLbl.alignment = { horizontal: 'center', vertical: 'middle' };

        const celdaVal = worksheet.getCell(5, colIdx);
        celdaVal.value = kpi.valor;
        celdaVal.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
        celdaVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        celdaVal.alignment = { horizontal: 'center', vertical: 'middle' };

        if (kpi.tipo === 'moneda') {
          celdaVal.numFmt = '"$"#,##0.00';
        } else if (kpi.tipo === 'entero') {
          celdaVal.numFmt = '#,##0';
        }
      });

      worksheet.getRow(6).height = 10;
      filaInicioTabla = 7;
    }

    // 4. ENCABEZADOS DE LA TABLA
    const filaHead = worksheet.getRow(filaInicioTabla);
    filaHead.height = 26;
    reporteData.columnas.forEach((col, idx) => {
      const celda = filaHead.getCell(idx + 1);
      celda.value = col.etiqueta;
      celda.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      celda.alignment = {
        vertical: 'middle',
        horizontal: col.tipo === 'moneda' || col.tipo === 'porcentaje' || col.tipo === 'entero' ? 'right' : 'left'
      };
      celda.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } }
      };
    });

    // 5. FILAS DE DATOS
    let filaActualNum = filaInicioTabla + 1;
    reporteData.filas.forEach((fila, rowIndex) => {
      const row = worksheet.getRow(filaActualNum);
      row.height = 20;
      const esPar = rowIndex % 2 === 1;

      reporteData.columnas.forEach((col, colIdx) => {
        const celda = row.getCell(colIdx + 1);
        let valor = fila[col.clave];

        if (col.tipo === 'moneda' || col.tipo === 'porcentaje' || col.tipo === 'entero') {
          const num = Number(valor);
          celda.value = isNaN(num) ? 0 : num;
          if (col.tipo === 'moneda') celda.numFmt = '"$"#,##0.00';
          else if (col.tipo === 'porcentaje') celda.numFmt = '0.0"%"';
          else if (col.tipo === 'entero') celda.numFmt = '#,##0';
        } else {
          celda.value = valor !== null && valor !== undefined ? String(valor) : '—';
        }

        celda.font = { name: 'Arial', size: 8.5, color: { argb: 'FF1E293B' } };
        if (esPar) {
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
        celda.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
          right: { style: 'thin', color: { argb: 'FFF1F5F9' } }
        };
        celda.alignment = {
          vertical: 'middle',
          horizontal: col.tipo === 'moneda' || col.tipo === 'porcentaje' || col.tipo === 'entero' ? 'right' : 'left'
        };
      });

      filaActualNum++;
    });

    // 6. AJUSTE DINÁMICO DE ANCHOS DE COLUMNAS
    reporteData.columnas.forEach((col, colIdx) => {
      const anchoSugerido = col.ancho ? Math.max(col.ancho, col.etiqueta.length + 4) : 16;
      worksheet.getColumn(colIdx + 1).width = Math.min(Math.max(anchoSugerido, 12), 40);
    });

    return await workbook.xlsx.writeBuffer();
  }
};

export default GeneradorExcelService;
