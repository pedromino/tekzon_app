/**
 * ============================================================================
 * SCRIPT GENERADOR DE DOCUMENTACIÓN TÉCNICA EN PDF - TEKZON C.A.
 * ============================================================================
 * Genera un documento PDF formal, estructurado, profesional y pedagógico que
 * explica en detalle cada módulo del sistema TekZon C.A. desde las 3 capas:
 * Frontend (Vue 3), Backend (Node.js/Express) y Base de Datos (MySQL).
 * ============================================================================
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rutas de salida del archivo PDF
const rutaProyecto = path.resolve(__dirname, '..');
const rutaDestinoPrincipal = path.join(rutaProyecto, 'DOCUMENTACION_SISTEMA_TEKZON.pdf');
const rutaArtifacts = 'C:\\Users\\pvcr\\.gemini\\antigravity\\brain\\53bf1b42-ee1e-4a42-8628-a4dbdb89c40a';
const rutaDestinoArtifacts = path.join(rutaArtifacts, 'DOCUMENTACION_SISTEMA_TEKZON.pdf');

// Paleta de colores corporativos (inspirados en el diseño UI de TekZon C.A.)
const COLOR_PRIMARIO = '#0c4a6e';    // Azul marino oscuro ejecutivo
const COLOR_SECUNDARIO = '#0284c7';  // Azul cian moderno
const COLOR_ACENTO = '#7f1d1d';      // Granate / Maroon institucional
const COLOR_TEXTO = '#1e293b';       // Pizarra oscuro para máxima legibilidad
const COLOR_MUTED = '#64748b';       // Gris pizarra suave
const COLOR_FONDO_CARD = '#f8fafc';  // Gris muy claro para cajas
const COLOR_BORDE = '#cbd5e1';       // Borde suave
const COLOR_BLANCO = '#ffffff';      // Blanco puro
const COLOR_VERDE = '#065f46';       // Verde éxito
const COLOR_FONDO_TABLA = '#f1f5f9'; // Fila alterna de tabla

const doc = new PDFDocument({
  size: 'LETTER',
  margins: { top: 50, bottom: 50, left: 45, right: 45 },
  bufferPages: true,
  autoFirstPage: true
});

const writeStream = fs.createWriteStream(rutaDestinoPrincipal);
doc.pipe(writeStream);

// Helper para verificar y saltar de página si el espacio vertical es insuficiente
function asegurarEspacio(necesario) {
  if (doc.y + necesario > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

// ----------------------------------------------------------------------------
// 1. PORTADA CORPORATIVA
// ----------------------------------------------------------------------------
function generarPortada() {
  const anchoPagina = doc.page.width;
  const margen = 45;
  const anchoContenido = anchoPagina - (margen * 2);

  // Barra decorativa superior
  doc.rect(0, 0, anchoPagina, 16).fill(COLOR_PRIMARIO);
  doc.rect(0, 16, anchoPagina, 6).fill(COLOR_ACENTO);

  doc.y = 80;

  // Encabezado institucional superior
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_MUTED)
     .text('REPÚBLICA BOLIVARIANA DE VENEZUELA', { align: 'center' });
  doc.text('INSTITUTO UNIVERSITARIO DE JESÚS OBRERO (IUJO) · EXTENSIÓN BARQUISIMETO', { align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_MUTED)
     .text('CARRERA: INFORMÁTICA · ANÁLISIS Y DISEÑO DE SISTEMAS (ADS-433)', { align: 'center' });

  doc.moveDown(3);

  // Tarjeta central de título con marco corporativo
  const yInicioCard = doc.y;
  doc.roundedRect(margen, yInicioCard, anchoContenido, 250, 10)
     .fillAndStroke('#f8fafc', COLOR_BORDE);

  // Borde lateral de acento
  doc.roundedRect(margen, yInicioCard, 10, 250, 4).fill(COLOR_PRIMARIO);

  doc.y = yInicioCard + 25;
  doc.font('Helvetica-Bold').fontSize(28).fillColor(COLOR_PRIMARIO)
     .text('TEKZON C.A.', margen + 25, doc.y, { width: anchoContenido - 50, align: 'left' });

  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR_ACENTO)
     .text('DOCUMENTO TÉCNICO Y ARQUITECTÓNICO DEL SISTEMA', margen + 25, doc.y, { width: anchoContenido - 50 });

  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_SECUNDARIO)
     .text('Sistema Integral de Gestión Técnica, Inventario, Caja Chica y Facturación', margen + 25, doc.y, { width: anchoContenido - 50 });

  doc.moveDown(0.8);
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXTO)
     .text(
       'Manual descriptivo integral de arquitectura de software, ingeniería de requerimientos, modelo relacional de datos y especificación técnica módulo por módulo (Frontend, Backend y Persistencia en Base de Datos). Diseñado con enfoque pedagógico, claro y de fácil comprensión para usuarios técnicos y gerenciales.',
       margen + 25,
       doc.y,
       { width: anchoContenido - 50, lineGap: 3, align: 'justify' }
     );

  doc.y = yInicioCard + 270;

  // Cuadro con metadata técnica
  const yMeta = doc.y;
  doc.roundedRect(margen, yMeta, anchoContenido, 160, 8)
     .fillAndStroke(COLOR_FONDO_CARD, '#e2e8f0');

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_PRIMARIO)
     .text('FICHA TÉCNICA DEL PROYECTO', margen + 18, yMeta + 16);

  const datosFicha = [
    { label: 'Organización / Empresa:', val: 'TekZon C.A. (RIF J-40123456-1 · Barquisimeto, Edo. Lara)' },
    { label: 'Arquitectura Global:', val: 'Single Page Application (SPA) + REST API Multicapa + RDBMS Relacional' },
    { label: 'Stack de Desarrollo:', val: 'Frontend: Vue 3 + Vite + Bootstrap 5 | Backend: Node.js (ESM) + Express 5' },
    { label: 'Motor de Base de Datos:', val: 'MySQL 8.0 / MariaDB (Motor InnoDB con Integridad Referencial ACID)' },
    { label: 'Módulos Operativos:', val: '14 Módulos Interconectados (Inventario, Taller, Ventas, Caja, BI/Reportes)' },
    { label: 'Fecha de Emisión:', val: 'Noviembre de 2026 · Versión 1.0 Lista para Producción (Rama master)' }
  ];

  let yItem = yMeta + 38;
  datosFicha.forEach(item => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_PRIMARIO).text(item.label, margen + 18, yItem, { width: 160 });
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXTO).text(item.val, margen + 185, yItem, { width: anchoContenido - 205 });
    yItem += 18;
  });

  // Pie de portada
  doc.y = doc.page.height - 70;
  doc.rect(0, doc.page.height - 18, anchoPagina, 18).fill(COLOR_PRIMARIO);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_BLANCO)
     .text('TEKZON C.A. · TODOS LOS DERECHOS RESERVADOS · CONFIDENCIALIDAD TÉCNICA E INSTITUCIONAL', 0, doc.page.height - 14, { align: 'center', width: anchoPagina });
}

// ----------------------------------------------------------------------------
// 2. ENCABEZADOS Y SECCIONES
// ----------------------------------------------------------------------------
function dibujarTituloSeccion(titulo, subtitulo) {
  asegurarEspacio(80);
  doc.moveDown(0.8);

  const ancho = doc.page.width - (doc.page.margins.left + doc.page.margins.right);
  const x = doc.page.margins.left;
  const y = doc.y;

  // Banda de color
  doc.roundedRect(x, y, ancho, 30, 4).fill(COLOR_PRIMARIO);
  doc.rect(x, y, 6, 30).fill(COLOR_ACENTO);

  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_BLANCO)
     .text(titulo.toUpperCase(), x + 16, y + 9, { width: ancho - 25 });

  doc.y = y + 38;

  if (subtitulo) {
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(COLOR_MUTED)
       .text(subtitulo, x, doc.y, { width: ancho, lineGap: 2 });
    doc.moveDown(0.6);
  }
}

function dibujarSubtitulo(subtitulo) {
  asegurarEspacio(45);
  doc.moveDown(0.5);
  const x = doc.page.margins.left;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_PRIMARIO)
     .text(subtitulo, x, doc.y);
  doc.strokeColor(COLOR_SECUNDARIO).lineWidth(1.2)
     .moveTo(x, doc.y + 2).lineTo(x + 220, doc.y + 2).stroke();
  doc.moveDown(0.4);
}

function dibujarParrafo(texto, opciones = {}) {
  const ancho = doc.page.width - (doc.page.margins.left + doc.page.margins.right);
  const x = doc.page.margins.left;
  asegurarEspacio(30);
  doc.font(opciones.bold ? 'Helvetica-Bold' : 'Helvetica')
     .fontSize(opciones.fontSize || 9.5)
     .fillColor(opciones.color || COLOR_TEXTO)
     .text(texto, x, doc.y, {
       width: ancho,
       lineGap: 3,
       align: opciones.align || 'justify',
       ...opciones
     });
  doc.moveDown(0.5);
}

function dibujarCallout(titulo, texto, tipo = 'info') {
  asegurarEspacio(70);
  const ancho = doc.page.width - (doc.page.margins.left + doc.page.margins.right);
  const x = doc.page.margins.left;
  const y = doc.y;

  let colorBorde = COLOR_SECUNDARIO;
  let colorFondo = '#f0f9ff';
  let colorTitulo = COLOR_PRIMARIO;

  if (tipo === 'warning') {
    colorBorde = '#eab308';
    colorFondo = '#fefce8';
    colorTitulo = '#854d0e';
  } else if (tipo === 'success') {
    colorBorde = '#10b981';
    colorFondo = '#ecfdf5';
    colorTitulo = '#065f46';
  } else if (tipo === 'danger') {
    colorBorde = COLOR_ACENTO;
    colorFondo = '#fef2f2';
    colorTitulo = COLOR_ACENTO;
  }

  // Medir altura requerida
  doc.font('Helvetica').fontSize(9);
  const altoTexto = doc.heightOfString(texto, { width: ancho - 30 });
  const altoTotal = altoTexto + 28;

  doc.roundedRect(x, y, ancho, altoTotal, 5).fillAndStroke(colorFondo, '#e2e8f0');
  doc.roundedRect(x, y, 5, altoTotal, 2).fill(colorBorde);

  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(colorTitulo)
     .text(titulo, x + 15, y + 8, { width: ancho - 30 });

  doc.font('Helvetica').fontSize(8.8).fillColor(COLOR_TEXTO)
     .text(texto, x + 15, y + 22, { width: ancho - 30, lineGap: 2.5, align: 'justify' });

  doc.y = y + altoTotal + 8;
}

// ----------------------------------------------------------------------------
// 3. TABLA CON ESTILO EJECUTIVO
// ----------------------------------------------------------------------------
function dibujarTabla(columnas, filas) {
  asegurarEspacio(60);
  const anchoTotal = doc.page.width - (doc.page.margins.left + doc.page.margins.right);
  const x = doc.page.margins.left;
  let y = doc.y;

  // Calcular anchos reales
  const anchosReales = columnas.map(col => (col.anchoPorcentaje / 100) * anchoTotal);

  // Cabecera
  const altoCabecera = 22;
  doc.rect(x, y, anchoTotal, altoCabecera).fill(COLOR_PRIMARIO);

  let xCol = x;
  columnas.forEach((col, idx) => {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_BLANCO)
       .text(col.titulo, xCol + 5, y + 6, {
         width: anchosReales[idx] - 10,
         align: col.align || 'left'
       });
    xCol += anchosReales[idx];
  });

  y += altoCabecera;

  // Filas
  filas.forEach((fila, fIdx) => {
    // Medir altura de la fila según el contenido más largo
    doc.font('Helvetica').fontSize(8);
    let maxAlto = 18;
    fila.forEach((celda, cIdx) => {
      const alto = doc.heightOfString(String(celda), { width: anchosReales[cIdx] - 10 });
      if (alto + 10 > maxAlto) maxAlto = alto + 10;
    });

    if (y + maxAlto > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      // Repetir cabecera en nueva página
      doc.rect(x, y, anchoTotal, altoCabecera).fill(COLOR_PRIMARIO);
      xCol = x;
      columnas.forEach((col, idx) => {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_BLANCO)
           .text(col.titulo, xCol + 5, y + 6, {
             width: anchosReales[idx] - 10,
             align: col.align || 'left'
           });
        xCol += anchosReales[idx];
      });
      y += altoCabecera;
    }

    // Fondo alterno
    const colorFondo = fIdx % 2 === 0 ? COLOR_BLANCO : COLOR_FONDO_TABLA;
    doc.rect(x, y, anchoTotal, maxAlto).fillAndStroke(colorFondo, '#e2e8f0');

    // Texto de celdas
    xCol = x;
    fila.forEach((celda, cIdx) => {
      const colDef = columnas[cIdx];
      doc.font(colDef.bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(8)
         .fillColor(COLOR_TEXTO)
         .text(String(celda), xCol + 5, y + 5, {
           width: anchosReales[cIdx] - 10,
           align: colDef.align || 'left'
         });
      xCol += anchosReales[cIdx];
    });

    y += maxAlto;
  });

  doc.y = y + 10;
}

// ----------------------------------------------------------------------------
// 4. GENERADOR ESTRUCTURADO DE MÓDULOS (FRONT - BACK - BD)
// ----------------------------------------------------------------------------
function generarDocumentacionModulo(mod) {
  asegurarEspacio(160);
  doc.moveDown(0.8);

  const x = doc.page.margins.left;
  const ancho = doc.page.width - (doc.page.margins.left + doc.page.margins.right);
  const yInicio = doc.y;

  // Cabecera del Módulo con insignia
  doc.roundedRect(x, yInicio, ancho, 32, 4).fill(COLOR_PRIMARIO);
  doc.rect(x, yInicio, 6, 32).fill(COLOR_ACENTO);

  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_BLANCO)
     .text(mod.numero + '. ' + mod.nombre.toUpperCase(), x + 16, yInicio + 9, { width: ancho - 140 });

  // Insignia de Clasificación
  const xTag = x + ancho - 120;
  doc.roundedRect(xTag, yInicio + 6, 110, 20, 3).fill(COLOR_SECUNDARIO);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR_BLANCO)
     .text(mod.categoria.toUpperCase(), xTag, yInicio + 11, { width: 110, align: 'center' });

  doc.y = yInicio + 40;

  // 1. Propósito Funcional
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_PRIMARIO)
     .text('A. Propósito Funcional y Caso de Uso en el Negocio:');
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXTO)
     .text(mod.proposito, { width: ancho, lineGap: 2.5, align: 'justify' });
  doc.moveDown(0.6);

  // 2. Capa Frontend
  asegurarEspacio(90);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_SECUNDARIO)
     .text('B. Capa Frontend (Interfaz de Usuario & Vue 3):');
  
  const detallesFront = [
    `• Vistas y Componentes: ${mod.front.vistas}`,
    `• Funcionalidades Principales: ${mod.front.funciones}`,
    `• Validaciones y UX: ${mod.front.ux}`
  ];
  detallesFront.forEach(df => {
    doc.font('Helvetica').fontSize(8.8).fillColor(COLOR_TEXTO)
       .text(df, { width: ancho, lineGap: 2, align: 'justify' });
  });
  doc.moveDown(0.6);

  // 3. Capa Backend
  asegurarEspacio(90);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_ACENTO)
     .text('C. Capa Backend (API REST, Controladores y Lógica de Negocio):');
  
  const detallesBack = [
    `• Archivos de Enrutamiento y Controlador: ${mod.back.archivos}`,
    `• Endpoints REST Principales: ${mod.back.endpoints}`,
    `• Seguridad y Middlewares: ${mod.back.seguridad}`,
    `• Lógica Transaccional: ${mod.back.logica}`
  ];
  detallesBack.forEach(db => {
    doc.font('Helvetica').fontSize(8.8).fillColor(COLOR_TEXTO)
       .text(db, { width: ancho, lineGap: 2, align: 'justify' });
  });
  doc.moveDown(0.6);

  // 4. Capa de Base de Datos
  asegurarEspacio(80);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_VERDE)
     .text('D. Capa de Base de Datos (Persistencia, Tablas y Relaciones):');
  
  const detallesBD = [
    `• Tablas Involucradas: ${mod.bd.tablas}`,
    `• Llaves Foráneas e Integridad: ${mod.bd.claves}`,
    `• Operaciones Clave: ${mod.bd.operaciones}`
  ];
  detallesBD.forEach(dbd => {
    doc.font('Helvetica').fontSize(8.8).fillColor(COLOR_TEXTO)
       .text(dbd, { width: ancho, lineGap: 2, align: 'justify' });
  });

  // Línea divisoria elegante
  doc.moveDown(0.8);
  doc.strokeColor('#e2e8f0').lineWidth(0.8)
     .moveTo(x, doc.y).lineTo(x + ancho, doc.y).stroke();
  doc.moveDown(0.5);
}

// ============================================================================
// CONSTRUCCIÓN DEL CONTENIDO DEL DOCUMENTO
// ============================================================================

console.log('Iniciando generación de Documentación Técnica PDF TekZon C.A....');

// Página 1: Portada
generarPortada();

// Página 2: Introducción y Arquitectura
doc.addPage();
dibujarTituloSeccion('1. INTRODUCCIÓN Y VISIÓN GENERAL DEL SISTEMA', 'Objetivos de negocio y contexto de aplicación');

dibujarParrafo(
  'El Sistema de Gestión Integral de TekZon C.A. es una solución de software empresarial concebida para modernizar, digitalizar y centralizar las operaciones medulares de una empresa prestadora de servicios de soporte técnico especializado, reparación de dispositivos móviles, comercialización de accesorios/repuestos, control exhaustivo de inventario con stock mínimo, gestión de caja chica bimonetaria (USD y Bolívares) y facturación en mostrador.'
);

dibujarParrafo(
  'A diferencia de los sistemas tradicionales aislados, TekZon C.A. se diseñó como un ecosistema cohesivo donde cada transacción impacta de forma inmediata y automática en las demás áreas operativas. Por ejemplo, la venta de una pantalla OLED descuenta automáticamente el stock en almacén, genera un movimiento de auditoría en el kárdex, ingresa el dinero a la sesión de caja del día y recalcula los indicadores gerenciales en tiempo real.'
);

dibujarCallout(
  'PRINCIPIO ARQUITECTÓNICO FUNDAMENTAL: ALTA COHESIÓN Y BAJO ACOPLAMIENTO',
  'El sistema implementa una arquitectura multicapa desacoplada. La interfaz de usuario (Frontend SPA) interactúa con el servidor de aplicaciones (Backend REST API) exclusivamente a través de contratos JSON autenticados mediante JSON Web Tokens (JWT). A su vez, el backend delega la persistencia de datos en un motor MySQL relacional con soporte transaccional ACID (Atomicity, Consistency, Isolation, Durability), impidiendo inconsistencias o registros huérfanos.',
  'info'
);

dibujarTituloSeccion('2. ARQUITECTURA TECNOLÓGICA Y STACK FULLSTACK', 'Desglose detallado de las tres capas del sistema');

dibujarSubtitulo('2.1 Capa Frontend (Cliente / Navegador Web)');
dibujarParrafo(
  '• Framework Principal: Vue.js 3 (utilizando la moderna Composition API con sintaxis <script setup>).\n' +
  '• Bundler y Herramienta de Construcción: Vite 8, proporcionando Hot Module Replacement (HMR) ultrarrápido y empaquetado optimizado para producción.\n' +
  '• Sistema de Diseño y Maquetación: Bootstrap 5.3 con estilos corporativos personalizados (styles.css), paleta de colores institucional (Azul Slate, Granate y Cian) y tipografía responsiva.\n' +
  '• Iconografía: Bootstrap Icons con más de 1.800 glifos vectoriales que enriquecen visualmente la interacción del usuario.\n' +
  '• Enrutamiento y Protección de Navegación: Vue Router con Guards de navegación que verifican la autenticidad del token JWT y el rol del usuario antes de conceder acceso a cada ruta.\n' +
  '• Cliente HTTP: Axios configurado mediante una instancia centralizada (apiClient.js) con interceptores automáticos de cabecera Authorization (Bearer Token) y captura global de errores 401/403.\n' +
  '• Alertas y Notificaciones: SweetAlert2 para confirmaciones de eliminación crítica y notificaciones Toast integradas.'
);

dibujarSubtitulo('2.2 Capa Backend (Servidor de Aplicaciones y API REST)');
dibujarParrafo(
  '• Entorno de Ejecución: Node.js (versión 20+ con soporte nativo para módulos ECMAScript - ESM).\n' +
  '• Framework HTTP: Express 5, facilitando el enrutamiento declarativo, middlewares de seguridad y gestión asíncrona de errores.\n' +
  '• Seguridad y Autenticación: JSON Web Tokens (jsonwebtoken) con cifrado HMAC SHA-256 y hashing criptográfico de contraseñas mediante bcrypt.\n' +
  '• Conectividad a Base de Datos: mysql2/promise, empleando Pools de Conexiones optimizados para atender peticiones concurrentes con máxima velocidad y mínima sobrecarga de memoria.\n' +
  '• Motores de Generación Documental: pdfkit y pdfkit-table para renderizado de informes PDF con membrete vectorial corporativo; exceljs para la exportación de libros de cálculo XLSX ejecutivos con estilos tipográficos nativos y fórmulas.\n' +
  '• Módulo de Distribución por Correo: nodemailer para integración SMTP con capacidad de despacho de informes en vivo a direcciones de gerencia.'
);

dibujarSubtitulo('2.3 Capa de Persistencia (Base de Datos Relacional)');
dibujarParrafo(
  '• Motor RDBMS: MySQL 8.0 / MariaDB bajo el motor de almacenamiento InnoDB.\n' +
  '• Integridad Referencial: Claves foráneas (Foreign Keys) estrictas con políticas de borrado restrictivo (RESTRICT) para evitar pérdidas accidentales de datos contables e inventario.\n' +
  '• Manejo de Concurrencia y Transacciones: Uso riguroso de bloques START TRANSACTION, COMMIT y ROLLBACK en operaciones multimodulares como ventas directas, órdenes técnicas y ajustes de stock.\n' +
  '• Formato de Fechas: Normalización estándar de marcas temporales con fecha y hora (DATETIME) para kárdex y auditoría.'
);

// Matriz de Componentes del Stack
doc.moveDown(0.5);
dibujarTabla(
  [
    { titulo: 'Capa / Nivel', anchoPorcentaje: 22, bold: true },
    { titulo: 'Tecnología / Librería', anchoPorcentaje: 28 },
    { titulo: 'Versión / Ecosistema', anchoPorcentaje: 20 },
    { titulo: 'Responsabilidad Principal', anchoPorcentaje: 30 }
  ],
  [
    ['Frontend SPA', 'Vue 3 + Vite', 'Vue 3.x / Vite 8.x', 'Renderizado reactivo de interfaces y modales'],
    ['Estilos & UI', 'Bootstrap 5 + Custom CSS', 'v5.3.3 / CSS3 Variables', 'Diseño responsivo, grillas y componentes visuales'],
    ['Peticiones HTTP', 'Axios + Interceptors', 'v1.7.x', 'Consumo REST y adjunto de token Bearer'],
    ['Backend API', 'Node.js + Express 5', 'Node v24 / Express v5.2', 'Rutas REST, validaciones y lógica de negocio'],
    ['Seguridad', 'JWT + Bcrypt', 'HMAC SHA-256', 'Protección de rutas e inicio de sesión seguro'],
    ['Reportes PDF', 'PDFKit + pdfkit-table', 'v0.20.2 / v0.2.11', 'Generación de documentos PDF nativos en memoria'],
    ['Reportes Excel', 'ExcelJS', 'v4.4.0', 'Construcción de libros .xlsx con fórmulas y estilos'],
    ['Base de Datos', 'MySQL 8 (InnoDB)', 'mysql2/promise v3.24', 'Almacenamiento relacional transaccional ACID']
  ]
);

// Página 3: Modelo de Datos y Esquema Relacional
doc.addPage();
dibujarTituloSeccion('3. MODELO DE DATOS Y ESTRUCTURA RELACIONAL (MYSQL)', 'Esquema relacional, tablas maestras y flujo de integridad referencial');

dibujarParrafo(
  'El diseño de la base de datos de TekZon C.A. fue normalizado en Tercera Forma Normal (3FN), garantizando que no existan redundancias innecesarias de información ni anomalías de inserción, actualización o borrado. El esquema se compone de 14 tablas maestras y transaccionales organizadas en 4 subsistemas interconectados:'
);

dibujarTabla(
  [
    { titulo: 'Subsistema', anchoPorcentaje: 22, bold: true },
    { titulo: 'Tablas Principales', anchoPorcentaje: 33 },
    { titulo: 'Llaves Foráneas / Conexiones', anchoPorcentaje: 45 }
  ],
  [
    [
      'Seguridad & Acceso',
      'rol, usuario, bitacora_sesion',
      'usuario.id_rol → rol.id_rol\nbitacora_sesion.id_usuario → usuario.id_usuario'
    ],
    [
      'Catálogo & Almacén',
      'categoria, producto, inventario_stock, movimiento_inventario',
      'producto.id_categoria → categoria.id_categoria\ninventario_stock.id_producto → producto.id_producto\nmovimiento_inventario.id_producto → producto.id_producto\nmovimiento_inventario.id_usuario → usuario.id_usuario'
    ],
    [
      'Proveedores & Compras',
      'proveedor, compra, detalle_compra',
      'compra.id_proveedor → proveedor.id_proveedor\ndetalle_compra.id_compra → compra.id_compra\ndetalle_compra.id_producto → producto.id_producto'
    ],
    [
      'Servicio Técnico',
      'cliente, dispositivo, orden_tecnico, orden_repuesto',
      'dispositivo.id_cliente → cliente.id_cliente\norden_tecnico.id_dispositivo → dispositivo.id_dispositivo\norden_tecnico.id_tecnico → usuario.id_usuario\norden_repuesto.id_orden → orden_tecnico.id_orden\norden_repuesto.id_producto → producto.id_producto'
    ],
    [
      'Caja Chica & Ventas',
      'caja_sesion, caja_movimiento, venta, detalle_venta',
      'caja_sesion.id_usuario → usuario.id_usuario\ncaja_movimiento.id_sesion → caja_sesion.id_sesion\nventa.id_cliente → cliente.id_cliente\nventa.id_vendedor → usuario.id_usuario\nventa.id_sesion_caja → caja_sesion.id_sesion\ndetalle_venta.id_venta → venta.id_venta\ndetalle_venta.id_producto → producto.id_producto'
    ]
  ]
);

dibujarCallout(
  'REGLA DE ORO DE INTEGRIDAD: CERO HUÉRFANOS Y CONTROL DE BORRADO LÓGICO',
  'Las tablas transaccionales como movimientos de inventario, ventas y órdenes de taller están blindadas con restricciones ON DELETE RESTRICT. Esto garantiza que un producto con historial de ventas o un cliente con órdenes técnicas activas nunca pueda ser eliminado accidentalmente, preservando la trazabilidad legal, fiscal y contable del negocio.',
  'success'
);

// Página 4+: Documentación Módulo por Módulo
doc.addPage();
dibujarTituloSeccion('4. DOCUMENTACIÓN DETALLADA MÓDULO POR MÓDULO', 'Análisis exhaustivo: Frontend, Backend y Base de Datos');

dibujarParrafo(
  'A continuación se desglosan los 13 módulos funcionales del sistema. Cada módulo se presenta analizando su objetivo de negocio, los componentes visuales del Frontend, la lógica de controladores del Backend y las operaciones de persistencia en la Base de Datos.'
);

// Array con la definición completa de cada módulo
const modulos = [
  {
    numero: '4.1',
    nombre: 'Autenticación, Usuarios y Control de Acceso (RBAC)',
    categoria: 'Seguridad y Gobernanza',
    proposito: 'Garantizar el acceso seguro al sistema mediante validación de credenciales (correo y contraseña cifrada con Bcrypt), asignación de tokens JWT y control granular de permisos según el rol del usuario (Administrador, Técnico o Vendedor).',
    front: {
      vistas: 'LoginPage.vue, ConfiguracionPage.vue, Sidebar.vue, Topbar.vue',
      funciones: 'Formulario de inicio de sesión seguro, alternador de visualización de contraseña, cierre de sesión auditado, visualización de avatar con iniciales y perfil del usuario autenticado en la barra superior.',
      ux: 'Eliminación del autocompletado inseguro en login; validación reactiva de formato de correo y longitud de contraseña; redirección automática según rol.'
    },
    back: {
      archivos: 'autenticacionRoute.js, usuarioRoute.js, autenticacionController.js, usuarioController.js, autenticacionMiddleware.js',
      endpoints: 'POST /api/auth/login, POST /api/auth/logout, GET /api/auth/perfil, GET/POST/PUT /api/usuarios',
      seguridad: 'Middleware autenticarToken que descifra el token Bearer JWT y verifica rolesPermitidos(...). Manejo de firmas seguras y expiración temporal.',
      logica: 'Cálculo de hash Bcrypt con salting; generación de payload JWT que incluye { id_usuario, correo, rol, nombre }; registro en bitácora de accesos.'
    },
    bd: {
      tablas: 'usuario (id_usuario, nombre_completo, correo, password_hash, id_rol, activo), rol (id_rol, nombre_rol), bitacora_sesion',
      claves: 'usuario.id_rol referencia a rol.id_rol; correo con restricción de unicidad UNIQUE.',
      operaciones: 'SELECT para verificación de correo; UPDATE sobre ultimo_acceso; INSERT en bitacora_sesion.'
    }
  },
  {
    numero: '4.2',
    nombre: 'Catálogo de Productos y Repuestos',
    categoria: 'Inventario / Almacén',
    proposito: 'Administrar el catálogo integral de repuestos (pantallas, baterías, pines de carga), herramientas e insumos y accesorios de telefonía celular con control de precios de costo, venta y márgenes comerciales.',
    front: {
      vistas: 'InventarioPage.vue, ProductoModal.vue, EliminarProductoModal.vue, ModalGenerarReporte.vue',
      funciones: 'Creación, consulta, modificación y eliminación (CRUD) de productos; búsqueda instantánea por código SKU, nombre o categoría; botón para generar Reporte Gerencial de Inventario.',
      ux: 'Formulario reactivo con cálculo automático de margen de ganancia; selectores dinámicos de categorías; alertas de confirmación preventiva antes de borrar.'
    },
    back: {
      archivos: 'productoRoute.js, productoController.js, productoModel.js',
      endpoints: 'GET /api/productos, POST /api/productos, PUT /api/productos/:id, DELETE /api/productos/:id, GET /api/productos/buscar',
      seguridad: 'Permisos de modificación y eliminación restringidos al rol Administrador. Lectura accesible para Vendedor y Técnico.',
      logica: 'Validación de código SKU irrepetible; cálculo de stock inicial automático generando un movimiento de entrada inicial en kárdex.'
    },
    bd: {
      tablas: 'producto (id_producto, codigo, nombre, descripcion, precio_costo, precio_venta, id_categoria, fecha_creacion), inventario_stock',
      claves: 'producto.id_categoria referencia a categoria.id_categoria; inventario_stock.id_producto referencia a producto.id_producto.',
      operaciones: 'Transacciones atómicas: al crear un producto se inicializa su registro correspondiente en inventario_stock con stock 0 o inicial.'
    }
  },
  {
    numero: '4.3',
    nombre: 'Categorías de Productos',
    categoria: 'Clasificación Comercial',
    proposito: 'Organizar la estructura taxonómica de los artículos del inventario (Repuestos, Accesorios, Herramientas, Consumibles), facilitando el filtrado en ventas y el análisis gerencial de concentración de capital.',
    front: {
      vistas: 'CategoriasPage.vue, CategoriaModal.vue, ModalGenerarReporte.vue',
      funciones: 'Listado en tarjetas/tabla con conteo dinámico de productos asociados; modal para crear y editar categoría; botón para generar Reporte de Supervisión de Categorías.',
      ux: 'Indicadores visuales de volumen de productos por categoría y capital acumulado; validación de nombres duplicados en vivo.'
    },
    back: {
      archivos: 'CategoriaRoute.js, CategoriaController.js, CategoriaModel.js',
      endpoints: 'GET /api/categorias, POST /api/categorias, PUT /api/categorias/:id, DELETE /api/categorias/:id',
      seguridad: 'Middleware autenticarToken. Creación/edición reservada a roles con privilegios gerenciales.',
      logica: 'Verificación de integridad previa al borrado: si una categoría posee productos asociados, se impide la eliminación y se notifica al usuario.'
    },
    bd: {
      tablas: 'categoria (id_categoria, nombre_categoria, descripcion, activo, fecha_registro)',
      claves: 'Llave primaria id_categoria; relación 1:N con producto (ON DELETE RESTRICT).',
      operaciones: 'Consultas con agregación COUNT(p.id_producto) y SUM(s.stock_actual * p.precio_costo) para estadísticas de supervisión.'
    }
  },
  {
    numero: '4.4',
    nombre: 'Proveedores y Abastecimiento',
    categoria: 'Compras y Proveeduría',
    proposito: 'Gestionar el directorio de distribuidores mayoristas de repuestos y accesorios, registrando información fiscal (RIF/Cédula), contactos, teléfonos, direcciones y el histórico consolidado de compras.',
    front: {
      vistas: 'ProveedoresPage.vue, ModalGenerarReporte.vue',
      funciones: 'Gestión CRUD de empresas proveedoras; búsqueda por RIF o razón social; consulta de compras históricas; botón para generar Reporte Gerencial de Proveedores.',
      ux: 'Formularios con máscaras de entrada para RIF venezolano (J-, G-, V-, E-); estados de actividad con badges de color; modal de confirmación seguro.'
    },
    back: {
      archivos: 'proveedorRoute.js, proveedorController.js, proveedorModel.js',
      endpoints: 'GET /api/proveedores, POST /api/proveedores, PUT /api/proveedores/:id, DELETE /api/proveedores/:id',
      seguridad: 'Acceso autenticado; validación de campos obligatorios en el controlador.',
      logica: 'Control de duplicidad de RIF; cálculo de volumen de compras acumuladas e historial de abastecimiento por proveedor.'
    },
    bd: {
      tablas: 'proveedor (id_proveedor, rif, razon_social, persona_contacto, telefono, email, direccion, activo)',
      claves: 'Llave primaria id_proveedor; relación 1:N con la tabla compra (id_proveedor).',
      operaciones: 'Bloqueo de eliminación física si el proveedor tiene facturas de compra registradas.'
    }
  },
  {
    numero: '4.5',
    nombre: 'Movimientos de Inventario (Entradas, Salidas y Ajustes)',
    categoria: 'Kárdex y Almacén',
    proposito: 'Llevar la trazabilidad física y matemática de cada unidad que ingresa o egresa del almacén por concepto de compras, ventas directas, consumo en órdenes técnicas o mermas/ajustes de auditoría.',
    front: {
      vistas: 'MovimientosPage.vue, MovimientoModal.vue, AjusteStockModal.vue, ModalGenerarReporte.vue',
      funciones: 'Registro manual de entradas (compras/devoluciones) y salidas (mermas/garantías); visor de kárdex con filtros por fecha, tipo y producto; botón para generar Reporte Operacional de Kárdex.',
      ux: 'Badges semánticos (Verde: Entrada, Rojo: Salida, Azul: Ajuste); selector asistido de productos con previsualización del stock disponible.'
    },
    back: {
      archivos: 'MovimientoRoute.js, MovimientoController.js, movimientoModel.js',
      endpoints: 'GET /api/movimientos, POST /api/movimientos/entrada, POST /api/movimientos/salida, POST /api/movimientos/ajuste',
      seguridad: 'Auditoría automática: el ID del usuario autenticado que ejecuta el movimiento se extrae del JWT y se almacena indeleblemente.',
      logica: 'Validación estricta de stock: se bloquea cualquier salida si la cantidad requerida supera la existencia actual en inventario_stock.'
    },
    bd: {
      tablas: 'movimiento_inventario (id_movimiento, id_producto, tipo_movimiento, cantidad, stock_anterior, stock_resultante, motivo, id_usuario, fecha_movimiento), inventario_stock',
      claves: 'movimiento_inventario.id_producto → producto.id_producto; movimiento_inventario.id_usuario → usuario.id_usuario.',
      operaciones: 'Transacción atómica: se inserta la tupla en movimiento_inventario y simultáneamente se actualiza inventario_stock.stock_actual.'
    }
  },
  {
    numero: '4.6',
    nombre: 'Alertas de Stock y Reposición Crítica',
    categoria: 'Supervisión de Almacén',
    proposito: 'Monitorear permanentemente los niveles de inventario frente a los umbrales de stock mínimo de seguridad, alertando sobre artículos agotados o en riesgo inminente de quiebre para su pronta reposición.',
    front: {
      vistas: 'AlertasStockPage.vue, ModalGenerarReporte.vue',
      funciones: 'Bandeja de alerta temprana con filtros por severidad (Crítico / Agotado / Alerta); cálculo de unidades sugeridas a pedir; botón de reporte de supervisión.',
      ux: 'Barra de progreso visual de disponibilidad; tarjetas de resumen ejecutivo (Total en Alerta, Agotados, Inversión Sugerida de Reposición).'
    },
    back: {
      archivos: 'alertaStockRoute.js, alertaStockController.js, alertaStockModel.js',
      endpoints: 'GET /api/alertas-stock, GET /api/alertas-stock/kpis, PUT /api/alertas-stock/umbral/:id_producto',
      seguridad: 'Disponible para Administrador y Técnico de Almacén con token JWT.',
      logica: 'Cálculo dinámico: WHERE stock_actual <= stock_minimo; determinación del déficit de unidades = (stock_minimo * 2) - stock_actual.'
    },
    bd: {
      tablas: 'inventario_stock (id_stock, id_producto, stock_actual, stock_minimo, stock_maximo, fecha_actualizacion), producto',
      claves: 'inventario_stock.id_producto referencia a producto.id_producto.',
      operaciones: 'JOIN optimizado entre inventario_stock y producto con índices sobre stock_actual y stock_minimo.'
    }
  },
  {
    numero: '4.7',
    nombre: 'Dispositivos de Clientes en Taller',
    categoria: 'Soporte Técnico',
    proposito: 'Llevar la ficha técnica individual de cada teléfono inteligente o tablet que ingresa al taller, vinculándolo a su propietario (cliente) y registrando marca, modelo, IMEI/serial, color y condiciones físicas.',
    front: {
      vistas: 'DispositivosPage.vue, RecepcionPage.vue, ModalGenerarReporte.vue',
      funciones: 'Registro de nuevos dispositivos; búsqueda rápida por número de IMEI o modelo; histórico de reparaciones previas; botón para generar Reporte Operacional de Dispositivos.',
      ux: 'Búsqueda predictiva con autocompletado del cliente; validación de formato numérico de 15 dígitos para códigos IMEI internacionales.'
    },
    back: {
      archivos: 'dispositivoRoute.js, dispositivoController.js, dispositivoModel.js',
      endpoints: 'GET /api/dispositivos, POST /api/dispositivos, PUT /api/dispositivos/:id, GET /api/dispositivos/imei/:imei',
      seguridad: 'Protección con token JWT; auditoría de fechas de registro y última modificación.',
      logica: 'Control de duplicados de IMEI; vinculación obligatoria a un cliente previamente existente en la base de datos.'
    },
    bd: {
      tablas: 'dispositivo (id_dispositivo, id_cliente, tipo_dispositivo, marca, modelo, numero_serie_imei, color, observaciones, fecha_registro)',
      claves: 'dispositivo.id_cliente referencia a cliente.id_cliente (ON DELETE RESTRICT).',
      operaciones: 'Consultas con agregación para conocer la frecuencia de averías y reparaciones acumuladas por equipo.'
    }
  },
  {
    numero: '4.8',
    nombre: 'Panel de Servicio Técnico (Órdenes de Reparación)',
    categoria: 'Operaciones del Taller',
    proposito: 'Controlar de principio a fin el ciclo de reparación de los equipos recibidos: diagnóstico inicial, asignación de técnico responsable, cotización de mano de obra y repuestos, ejecución técnica y entrega final.',
    front: {
      vistas: 'OrdenesPage.vue, RecepcionPage.vue, ModalGenerarReporte.vue',
      funciones: 'Flujo Kanban de estados (Pendiente → En Reparación → Listo → Entregado); asignación de repuestos desde almacén; botón para generar Reporte Gerencial de Rendimiento Técnico.',
      ux: 'Badges dinámicos con los 4 colores oficiales del sistema; cálculo en tiempo real de presupuesto (Mano de Obra + Repuestos); visor de detalles.'
    },
    back: {
      archivos: 'ordenServiceTecnicoRoute.js, ordenServiceTecnicoController.js, ordenServiceTecnicoModel.js',
      endpoints: 'GET /api/ordenes-servicio, POST /api/ordenes-servicio, PUT /api/ordenes-servicio/:id/estado, POST /api/ordenes-servicio/:id/repuestos',
      seguridad: 'Técnico puede cambiar diagnósticos y estados; Administrador gestiona tarifas y asignaciones globales.',
      logica: 'Máquina de estados estricta (Pendiente, En Reparación, Listo, Entregado); normalización de indicadores ejecutivos de taller.'
    },
    bd: {
      tablas: 'orden_tecnico (id_orden, id_dispositivo, id_tecnico, falla_reportada, diagnostico, estado, costo_mano_obra, total_orden, fecha_ingreso, fecha_entrega), orden_repuesto',
      claves: 'orden_tecnico.id_dispositivo → dispositivo.id_dispositivo; orden_tecnico.id_tecnico → usuario.id_usuario.',
      operaciones: 'Transacción de cobro y entrega: al marcar "Entregado", se liquida la orden y se envía el ingreso correspondiente a la caja activa.'
    }
  },
  {
    numero: '4.9',
    nombre: 'Cartera de Clientes',
    categoria: 'CRM y Clientes',
    proposito: 'Centralizar el registro de personas naturales y jurídicas atendidas por la empresa, almacenando cédula/RIF, nombres, teléfono, correo electrónico, dirección y consolidando su historial comercial y técnico.',
    front: {
      vistas: 'ClientesPage.vue, ModalGenerarReporte.vue',
      funciones: 'Creación, edición y consulta de clientes; historial consolidado de compras en mostrador y órdenes de servicio; botón para generar Reporte Gerencial de Clientes y Fidelización.',
      ux: 'Buscador instantáneo por cédula o nombre; modal con resumen del valor histórico aportado por el cliente (LTV); badges de clientes frecuentes.'
    },
    back: {
      archivos: 'clienteRoute.js, clienteController.js, clienteModel.js',
      endpoints: 'GET /api/clientes, POST /api/clientes, PUT /api/clientes/:id, DELETE /api/clientes/:id, GET /api/clientes/historial/:id',
      seguridad: 'Token JWT obligatorio. Protección contra borrado de clientes con transacciones financieras activas.',
      logica: 'Cálculo de métricas de fidelización: total de compras, órdenes de reparación entregadas y ticket promedio por cliente.'
    },
    bd: {
      tablas: 'cliente (id_cliente, cedula_rif, nombre_completo, telefono, correo, direccion, fecha_registro, activo)',
      claves: 'Llave primaria id_cliente; relaciones 1:N con dispositivo (id_cliente) y venta (id_cliente).',
      operaciones: 'Consultas con GROUP BY y SUM() para calcular el valor de vida del cliente (Lifetime Value).'
    }
  },
  {
    numero: '4.10',
    nombre: 'Caja Chica y Control de Flujo de Efectivo',
    categoria: 'Finanzas y Tesorería',
    proposito: 'Controlar el flujo de efectivo bimonetario (Dólares USD y Bolívares Bs) en cada turno de trabajo mediante apertura formal con monto base, registro de ingresos por ventas/servicios, egresos operativos y arqueo de cierre.',
    front: {
      vistas: 'CajaPage.vue, ModalGenerarReporte.vue',
      funciones: 'Apertura de sesión de caja; registro manual de gastos menores; visualizador de balance en tiempo real; arqueo y cierre ciego; botón para generar Reporte Gerencial de Caja.',
      ux: 'Dashboard financiero con tarjetas de Total Ingresos, Total Egresos y Saldo Esperado; cálculo asistido de sobrantes o faltantes en el cierre.'
    },
    back: {
      archivos: 'cajaRoute.js, cajaController.js, cajaModel.js',
      endpoints: 'GET /api/caja/sesion-activa, POST /api/caja/apertura, POST /api/caja/movimiento, POST /api/caja/cierre, GET /api/caja/historico',
      seguridad: 'Restricción de una única sesión de caja abierta simultáneamente por punto de venta. Cierre auditado con firma del usuario.',
      logica: 'Validación de saldo suficiente en caja antes de autorizar egresos; conciliación automática de transacciones en efectivo y pagos digitales.'
    },
    bd: {
      tablas: 'caja_sesion (id_sesion, id_usuario, monto_inicial_usd, monto_final_usd, estado, fecha_apertura, fecha_cierre), caja_movimiento',
      claves: 'caja_movimiento.id_sesion → caja_sesion.id_sesion; caja_sesion.id_usuario → usuario.id_usuario.',
      operaciones: 'Transacciones seguras de cierre que congelan los movimientos del turno e impiden modificaciones retroactivas.'
    }
  },
  {
    numero: '4.11',
    nombre: 'Ventas Directas y Facturación en Mostrador',
    categoria: 'Punto de Venta (POS)',
    proposito: 'Facilitar la facturación rápida de accesorios y repuestos en mostrador mediante un carrito de compras interactivo, descuento automático de existencias en almacén e imputación del cobro en la caja chica activa.',
    front: {
      vistas: 'VentasPage.vue, ModalGenerarReporte.vue',
      funciones: 'Catálogo visual de artículos; carrito dinámico con cálculo de subtotal, IVA y total; selección de cliente y método de pago; botón para generar Reporte Gerencial de Ventas.',
      ux: 'Controles para incrementar/disminuir cantidades con límite según el stock real disponible; selector de pago mixto (Efectivo, Pago Móvil, Punto de Venta).'
    },
    back: {
      archivos: 'ventaRoute.js, ventaController.js, ventaModel.js',
      endpoints: 'GET /api/ventas, POST /api/ventas, GET /api/ventas/:id, GET /api/ventas/ticket/:id',
      seguridad: 'Requiere sesión de caja abierta obligatoria para poder procesar pagos en efectivo o electrónicos.',
      logica: 'Transacción ACID completa: 1) Valida stock; 2) Inserta cabecera venta; 3) Inserta detalles en detalle_venta; 4) Rebaja inventario_stock; 5) Registra en movimiento_inventario; 6) Registra ingreso en caja_movimiento.'
    },
    bd: {
      tablas: 'venta (id_venta, numero_factura, id_cliente, id_vendedor, id_sesion_caja, subtotal, iva, total, metodo_pago, fecha_venta), detalle_venta',
      claves: 'detalle_venta.id_venta → venta.id_venta; detalle_venta.id_producto → producto.id_producto.',
      operaciones: 'Bloque START TRANSACTION con ROLLBACK automático ante cualquier fallo de stock o conectividad.'
    }
  },
  {
    numero: '4.12',
    nombre: 'Motor de Reportes Analíticos (PDF, Excel y Email)',
    categoria: 'Business Intelligence y Auditoría',
    proposito: 'Proveer a la gerencia y supervisión de información estratégica procesada mediante 9 reportes analíticos con criterio (márgenes de rentabilidad, KPIs de taller, kárdex y cierres de caja) exportables en PDF, Excel o compartidos por correo.',
    front: {
      vistas: 'ModalGenerarReporte.vue (integrado en los 9 módulos clave del sistema)',
      funciones: 'Selector de rango de fechas, filtros específicos por módulo, opción de formato PDF (inline en nueva pestaña) o Excel (.xlsx), switch de validación de correo con estándar RFC 5322.',
      ux: 'Títulos claros en contraste con paleta institucional; visualización directa del PDF en pestaña del navegador sin forzar descargas invasivas; badges de validación en tiempo real.'
    },
    back: {
      archivos: 'reporteRoute.js, reporteController.js, generadorPdfService.js, generadorExcelService.js, emailReporteService.js',
      endpoints: 'POST /api/reportes/generar, POST /api/reportes/enviar-email',
      seguridad: 'Acceso autenticado con JWT; cabecera Content-Disposition: inline para visualización nativa de documentos en el visor del navegador.',
      logica: 'Consultas analíticas avanzadas con funciones agregadas (SUM, AVG, COUNT, CASE); diseño responsivo de tablas PDF que evita desbordes y encimados de texto.'
    },
    bd: {
      tablas: 'Consulta cruzada de todo el esquema: producto, orden_tecnico, caja_sesion, venta, movimiento_inventario, cliente, proveedor',
      claves: 'JOINs indexados de alto rendimiento para garantizar tiempos de respuesta menores a 500ms.',
      operaciones: 'Consultas de lectura analítica (SELECT optimizados con índices y agrupaciones).'
    }
  },
  {
    numero: '4.13',
    nombre: 'Manual de Usuario Interactivo y Ayuda Contextual',
    categoria: 'Experiencia de Usuario y Soporte',
    proposito: 'Brindar asistencia guiada paso a paso e intuitiva directamente en la interfaz de usuario, permitiendo que cualquier operador consulte el modo de uso del módulo en el que se encuentra posicionado sin salir de su flujo de trabajo.',
    front: {
      vistas: 'ModalManualUsuario.vue, Topbar.vue',
      funciones: 'Botón con ícono de ayuda institucional en la barra de navegación superior (junto a notificaciones); detección automática de la ruta activa y despliegue del manual correspondiente al módulo actual.',
      ux: 'Guías paso a paso numeradas, consejos clave, alertas operativas y buscador interactivo de módulos en una ventana modal limpia y moderna.'
    },
    back: {
      archivos: 'Estructura de catálogo contextual integrado en el bundle del Frontend para disponibilidad inmediata offline/online.',
      endpoints: 'Integración en el cliente sin consumo adicional de ancho de banda en servidor.',
      seguridad: 'Disponible de forma transversal e irrestricta para todos los usuarios autenticados.',
      logica: 'Detección reactiva de la propiedad route.name de Vue Router.'
    },
    bd: {
      tablas: 'Manual contextual en memoria del cliente con enlace referencial a las tablas del sistema.',
      claves: 'No requiere peticiones adicionales de persistencia, asegurando apertura instantánea en 0 milisegundos.',
      operaciones: 'Lectura local en cliente.'
    }
  }
];

// Generar cada módulo secuencialmente
modulos.forEach(mod => {
  generarDocumentacionModulo(mod);
});

// Página: Flujos Transaccionales Clave End-to-End
doc.addPage();
dibujarTituloSeccion('5. FLUJOS TRANSACCIONALES INTEGRADOS (END-TO-END)', 'Demostración de la cohesión e interoperabilidad entre módulos');

dibujarSubtitulo('5.1 Flujo Transaccional 1: Venta en Mostrador con Impacto Multicapa');
dibujarParrafo(
  'El siguiente diagrama conceptual resume cómo una única acción del vendedor en el mostrador desencadena una cascada transaccional coordinada entre Frontend, Backend y Base de Datos:'
);

dibujarTabla(
  [
    { titulo: 'Paso', anchoPorcentaje: 10, bold: true, align: 'center' },
    { titulo: 'Capa / Entorno', anchoPorcentaje: 25, bold: true },
    { titulo: 'Acción Ejecutada', anchoPorcentaje: 65 }
  ],
  [
    ['1', 'Frontend (Vue 3)', 'El vendedor agrega una "Batería iPhone 12" al carrito en VentasPage.vue y presiona "Procesar Venta".'],
    ['2', 'Frontend → Backend', 'Axios envía POST /api/ventas con payload JSON que incluye id_cliente, id_sesion_caja y detalle de productos.'],
    ['3', 'Backend (Controller)', 'ventaController.js inicia una transacción SQL mediante connection.beginTransaction().'],
    ['4', 'Base de Datos (MySQL)', 'Verifica que inventario_stock.stock_actual sea >= cantidad solicitada. Si no alcanza, lanza ROLLBACK.'],
    ['5', 'Base de Datos (MySQL)', 'Inserta registro maestro en venta y registros de partidas en detalle_venta.'],
    ['6', 'Base de Datos (MySQL)', 'Resta las unidades en inventario_stock y genera automáticamente la tupla en movimiento_inventario (Kárdex).'],
    ['7', 'Base de Datos (MySQL)', 'Si el método fue Efectivo, inserta automáticamente el ingreso en caja_movimiento vinculado a la caja activa.'],
    ['8', 'Backend → Frontend', 'Ejecuta COMMIT y devuelve código HTTP 201 Created con el ID de venta y resumen financiero.'],
    ['9', 'Frontend (UI Feedback)', 'Emite notificación SweetAlert2, limpia el carrito y ofrece la visualización inmediata del ticket de venta.']
  ]
);

doc.moveDown(0.8);
dibujarSubtitulo('5.2 Flujo Transaccional 2: Ciclo Integral de Servicio Técnico en Taller');
dibujarParrafo(
  'Describe el trayecto de un equipo móvil desde que el cliente lo entrega en mostrador hasta su salida final reparado:'
);

dibujarTabla(
  [
    { titulo: 'Fase', anchoPorcentaje: 15, bold: true, align: 'center' },
    { titulo: 'Módulos Involucrados', anchoPorcentaje: 30, bold: true },
    { titulo: 'Descripción del Procedimiento', anchoPorcentaje: 55 }
  ],
  [
    ['Recepción', 'Clientes, Dispositivos, Recepción', 'Se identifica o registra al cliente por cédula; se crea la ficha del dispositivo con su serial/IMEI y se genera la orden en estado "Pendiente".'],
    ['Diagnóstico', 'Panel del Técnico, Almacén', 'El técnico examina el equipo, actualiza el estado a "En Reparación", redacta el informe de falla y carga el costo de mano de obra.'],
    ['Repuestos', 'Catálogo, Movimientos, Taller', 'Si requiere una pieza (ej. Pantalla), se asocia a la orden; el sistema descuenta el repuesto del inventario físico y suma su costo al total.'],
    ['Listo', 'Panel del Técnico, Clientes', 'Una vez superadas las pruebas de calidad, el técnico pasa el equipo a "Listo" y se notifica al cliente que su dispositivo puede ser retirado.'],
    ['Entrega & Pago', 'Taller, Caja Chica, Auditoría', 'El cliente retira el equipo; la orden cambia a "Entregado", se emite el comprobante y el monto cobrado ingresa a la sesión de caja del día.']
  ]
);

// Página: Guía de Instalación y Despliegue
doc.addPage();
dibujarTituloSeccion('6. GUÍA DE INSTALACIÓN, CONFIGURACIÓN Y DESPLIEGUE', 'Instrucciones técnicas para puesta en marcha en producción');

dibujarSubtitulo('6.1 Requisitos Previos del Sistema');
dibujarParrafo(
  '• Servidor de Base de Datos: MySQL Server 8.0 o superior (o MariaDB 10.5+).\n' +
  '• Entorno de Ejecución: Node.js versión 20.x o 24.x LTS (con npm 10+).\n' +
  '• Navegador Web Moderno: Google Chrome, Mozilla Firefox, Microsoft Edge o Safari con soporte ECMAScript 2022+.\n' +
  '• Conexión de Red / Localhost: Puertos libres 3000 (Backend API REST) y 5173 / 80 (Frontend Web).'
);

dibujarSubtitulo('6.2 Pasos de Instalación y Puesta en Marcha');
dibujarParrafo(
  '1. Clonación del Repositorio:\n' +
  '   git clone <url-del-repositorio> tekzon-app\n' +
  '   cd "tekzon-app"\n\n' +
  '2. Inicialización de la Base de Datos:\n' +
  '   Crear la base de datos tekzon_bd en MySQL y ejecutar secuencialmente las migraciones y seeds ubicadas en Database/:\n' +
  '   - Database/migrations/001-RolesYUsuarios.sql hasta 008-FechasConHora.sql\n' +
  '   - Database/seeds/005-DatosProduccionReportesSeed.sql (Carga de datos reales de prueba)\n\n' +
  '3. Configuración y Arranque del Backend:\n' +
  '   cd Backend\n' +
  '   npm install\n' +
  '   Configurar el archivo .env con las credenciales de BD (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET)\n' +
  '   npm start   (Inicia en http://localhost:3000)\n\n' +
  '4. Configuración y Arranque del Frontend:\n' +
  '   cd ../Frontend\n' +
  '   npm install\n' +
  '   npm run build  (Genera los estáticos optimizados en Frontend/dist) o npm run dev para entorno de desarrollo.'
);

dibujarSubtitulo('6.3 Matriz de Credenciales de Prueba por Rol');
dibujarTabla(
  [
    { titulo: 'Rol del Sistema', anchoPorcentaje: 25, bold: true },
    { titulo: 'Correo Electrónico', anchoPorcentaje: 35 },
    { titulo: 'Contraseña de Acceso', anchoPorcentaje: 20 },
    { titulo: 'Alcance Operativo', anchoPorcentaje: 20 }
  ],
  [
    ['Administrador', 'admin@tekzon.com', 'admin123', 'Acceso Total (100% Módulos)'],
    ['Técnico de Taller', 'tecnico@tekzon.com', 'tecnico123', 'Taller, Dispositivos y Almacén'],
    ['Vendedor Mostrador', 'vendedor@tekzon.com', 'vendedor123', 'Ventas, Caja Chica y Clientes']
  ]
);

dibujarCallout(
  'ESTADO DE PRODUCCIÓN VERIFICADO',
  'Todo el código fuente se encuentra consolidado en la rama master, con sus dependencias resueltas, base de datos poblada con semillas de datos coherentes y el motor de 9 reportes analíticos validado al 100% para su defensa académica y evaluación de proyecto.',
  'success'
);

// ----------------------------------------------------------------------------
// NUMERACIÓN DE PÁGINAS Y ENCABEZADOS/PIES EN SEGUNDA PASADA
// ----------------------------------------------------------------------------
const totalPaginas = doc.bufferedPageRange().count;
console.log('Total real de páginas generadas en el documento:', totalPaginas);

for (let i = 0; i < totalPaginas; i++) {
  doc.switchToPage(i);

  // La portada (página 0) no lleva encabezado ni pie estándar
  if (i === 0) continue;

  const anchoPagina = doc.page.width;
  const margen = 45;
  const anchoContenido = anchoPagina - (margen * 2);

  // Encabezado superior
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR_MUTED)
     .text('TEKZON C.A. · SISTEMA INTEGRAL DE GESTIÓN TÉCNICA E INVENTARIO', margen, 25, { width: anchoContenido, align: 'left' });
  doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_MUTED)
     .text('MANUAL TÉCNICO ARQUITECTÓNICO', margen, 25, { width: anchoContenido, align: 'right' });

  doc.strokeColor('#cbd5e1').lineWidth(0.5)
     .moveTo(margen, 36).lineTo(anchoPagina - margen, 36).stroke();

  // Pie de página inferior
  const yPie = doc.page.height - 35;
  doc.strokeColor('#cbd5e1').lineWidth(0.5)
     .moveTo(margen, yPie).lineTo(anchoPagina - margen, yPie).stroke();

  doc.font('Helvetica').fontSize(8).fillColor(COLOR_MUTED)
     .text('IUJO Barquisimeto · Análisis y Diseño de Sistemas (ADS-433) · Rama master Lista para Producción', margen, yPie + 8, { width: anchoContenido - 80, align: 'left' });

  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_PRIMARIO)
     .text(`Página ${i + 1} de ${totalPaginas}`, anchoPagina - margen - 70, yPie + 8, { width: 70, align: 'right' });
}

doc.end();

writeStream.on('finish', () => {
  console.log(`Documento PDF generado exitosamente en: ${rutaDestinoPrincipal}`);

  // Copiar también a la carpeta de artefactos
  try {
    fs.copyFileSync(rutaDestinoPrincipal, rutaDestinoArtifacts);
    console.log(`Copia de respaldo generada en artifacts: ${rutaDestinoArtifacts}`);
  } catch (err) {
    console.error('Error copiando a artifacts:', err.message);
  }
});
