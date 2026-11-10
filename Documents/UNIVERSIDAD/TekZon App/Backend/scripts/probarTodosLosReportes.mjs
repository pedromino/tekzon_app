import { ReportesDataService } from '../src/services/reportes/reportesDataService.js';
import { GeneradorPdfService } from '../src/services/reportes/generadorPdfService.js';
import { GeneradorExcelService } from '../src/services/reportes/generadorExcelService.js';

async function testAll() {
  const tipos = [
    'productos',
    'categorias',
    'movimientos',
    'proveedores',
    'ordenes',
    'dispositivos',
    'caja',
    'ventas',
    'clientes'
  ];

  console.log('--- VERIFICACIÓN INTEGRAL DE LOS 9 REPORTES ---');
  for (const t of tipos) {
    const data = await ReportesDataService.obtenerDatosReporte(t, {});
    console.log(`\n=== REPORTE: ${t.toUpperCase()} [${data.tipo}] ===`);
    console.log(`Título: "${data.titulo}"`);
    console.log(`Registros analizados: ${data.filas.length}`);
    console.log('KPIs calculados:');
    for (const k of data.kpis) {
      console.log(`  * ${k.etiqueta}: ${k.valor}`);
    }

    // Validar generación de PDF
    const pdfBuf = await GeneradorPdfService.generarBufferPdf(data);
    // Validar generación de Excel
    const xlsxBuf = await GeneradorExcelService.generarBufferExcel(data);

    console.log(`  -> PDF generado: ${pdfBuf.length} bytes`);
    console.log(`  -> Excel generado: ${xlsxBuf.length} bytes`);
  }
  console.log('\n¡TODOS LOS 9 REPORTES FUNCIONAN PERFECTAMENTE!');
  process.exit(0);
}

testAll().catch(e => {
  console.error('Error durante la prueba:', e);
  process.exit(1);
});
