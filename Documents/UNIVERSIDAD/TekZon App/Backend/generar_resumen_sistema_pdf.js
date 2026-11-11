/**
 * ============================================================================
 * SCRIPT: GENERADOR DE RESUMEN EXPLICATIVO DEL SISTEMA TEKZON C.A. (PDF)
 * ============================================================================
 * Diseñado con lenguaje sencillo, claro, visual y amigable (sin tecnicismos pesados).
 * Explica módulo por módulo qué hace el usuario en pantalla (Frontend), qué
 * procesa el sistema por detrás (Backend) y qué se guarda (Base de Datos).
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
const rutaDestinoPrincipal = path.join(rutaProyecto, 'RESUMEN_SISTEMA_TEKZON.pdf');
const rutaArtifacts = 'C:\\Users\\pvcr\\.gemini\\antigravity\\brain\\53bf1b42-ee1e-4a42-8628-a4dbdb89c40a';
const rutaDestinoArtifacts = path.join(rutaArtifacts, 'RESUMEN_SISTEMA_TEKZON.pdf');

// Paleta visual atractiva y clara
const COLOR_AZUL_PRINCIPAL = '#0c4a6e'; // Azul corporativo
const COLOR_AZUL_SUAVE = '#0284c7';     // Azul cielo
const COLOR_GRANATE = '#831843';        // Granate elegante
const COLOR_TEXTO = '#1e293b';          // Texto legible
const COLOR_MUTED = '#64748b';          // Texto secundario
const COLOR_CARD_FONDO = '#f8fafc';     // Fondo de tarjeta
const COLOR_BORDE = '#cbd5e1';          // Borde suave
const COLOR_BLANCO = '#ffffff';
const COLOR_VERDE = '#065f46';          // Verde para base de datos
const COLOR_NARANJA = '#b45309';        // Naranja para backend
const COLOR_AZUL_FRONT = '#1d4ed8';     // Azul para frontend

const doc = new PDFDocument({
  size: 'LETTER',
  margins: { top: 45, bottom: 45, left: 45, right: 45 },
  bufferPages: true,
  autoFirstPage: true
});

const writeStream = fs.createWriteStream(rutaDestinoPrincipal);
doc.pipe(writeStream);

function asegurarEspacio(altoRequerido) {
  if (doc.y + altoRequerido > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

// ----------------------------------------------------------------------------
// PORTADA AMIGABLE Y RESUMIDA
// ----------------------------------------------------------------------------
function generarPortada() {
  const anchoPagina = doc.page.width;
  const margen = 45;
  const ancho = anchoPagina - (margen * 2);

  // Cinta decorativa superior
  doc.rect(0, 0, anchoPagina, 12).fill(COLOR_AZUL_PRINCIPAL);
  doc.rect(0, 12, anchoPagina, 4).fill(COLOR_AZUL_SUAVE);

  doc.y = 65;

  // Encabezado
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_MUTED)
     .text('TEKZON C.A. · SISTEMA DE GESTIÓN DE SERVICIO TÉCNICO E INVENTARIO', { align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
     .text('Documento Explicativo Simplificado · Versión para Todo Público', { align: 'center' });

  doc.moveDown(1.5);

  // Tarjeta central principal
  const yCard = doc.y;
  doc.roundedRect(margen, yCard, ancho, 225, 8)
     .fillAndStroke(COLOR_CARD_FONDO, COLOR_BORDE);
  doc.roundedRect(margen, yCard, 8, 225, 4).fill(COLOR_AZUL_PRINCIPAL);

  doc.y = yCard + 20;
  doc.font('Helvetica-Bold').fontSize(24).fillColor(COLOR_AZUL_PRINCIPAL)
     .text('¿CÓMO FUNCIONA EL SISTEMA?', margen + 24, doc.y);

  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR_GRANATE)
     .text('Guía Resumida Módulo por Módulo (Pantallas, Servidor y Base de Datos)', margen + 24, doc.y + 4);

  doc.moveDown(1);
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXTO)
     .text(
       'Esta guía explica de manera muy fácil, sin enredos ni palabras técnicas difíciles, qué hace cada parte de TekZon C.A. Aquí entenderás qué ve y hace el usuario en la pantalla, qué revisa el sistema internamente y qué datos se guardan en la memoria de la empresa.',
       margen + 24,
       doc.y,
       { width: ancho - 45, lineGap: 3, align: 'justify' }
     );

  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_AZUL_PRINCIPAL)
     .text('Puntos clave que aprenderás en este documento:', margen + 24, doc.y);

  doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXTO)
     .text('✔ Las 3 capas del sistema explicadas con ejemplos de la vida real.', margen + 32, doc.y + 3)
     .text('✔ El recorrido de los 14 módulos (inventario, reparaciones, ventas, caja y reportes).', margen + 32, doc.y + 15)
     .text('✔ Cómo se conectan entre sí para que nunca falte dinero ni se pierda un repuesto.', margen + 32, doc.y + 27);

  doc.y = yCard + 245;

  // Explicación didáctica de las 3 partes
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_AZUL_PRINCIPAL)
     .text('1. LAS 3 PARTES DEL SISTEMA EXPLICADAS FÁCILMENTE');

  doc.moveDown(0.4);

  const capas = [
    {
      titulo: '1. EL FRONTEND (Lo que ve el usuario)',
      color: COLOR_AZUL_FRONT,
      texto: 'Es la cara del sistema: las páginas web con botones, colores, formularios y tablas donde el vendedor, técnico o administrador hace clic. Su trabajo es ser bonita, rápida y fácil de usar en computadoras o teléfonos.'
    },
    {
      titulo: '2. EL BACKEND (El cerebro detrás de escena)',
      color: COLOR_NARANJA,
      texto: 'Es el motor inteligente que trabaja en silencio. Cuando haces clic en "Guardar", el backend revisa que no haya errores (que la contraseña sea correcta, que haya stock suficiente, que los números cuadren) y le da órdenes a la base de datos.'
    },
    {
      titulo: '3. LA BASE DE DATOS (El archivador digital seguro)',
      color: COLOR_VERDE,
      texto: 'Es el almacén digital donde todo queda guardado para siempre en tablas ordenadas. Guarda los clientes, los productos, cuánto dinero hay en la caja y el historial de reparaciones. Nunca olvida nada y evita que se borre información por error.'
    }
  ];

  capas.forEach(c => {
    const yCapa = doc.y;
    doc.roundedRect(margen, yCapa, ancho, 52, 6).fillAndStroke('#f1f5f9', '#e2e8f0');
    doc.roundedRect(margen, yCapa, 5, 52, 2).fill(c.color);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(c.color).text(c.titulo, margen + 14, yCapa + 8);
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXTO).text(c.texto, margen + 14, yCapa + 22, { width: ancho - 28, lineGap: 2 });
    doc.y = yCapa + 58;
  });

  // Pie de portada
  doc.y = doc.page.height - 35;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_MUTED)
     .text('TEKZON C.A. · Barquisimeto, Estado Lara · Documentación Práctica del Proyecto', 0, doc.y, { align: 'center', width: anchoPagina });
}

// ----------------------------------------------------------------------------
// TARJETA DIDÁCTICA POR MÓDULO
// ----------------------------------------------------------------------------
function dibujarFichaModulo(mod) {
  asegurarEspacio(130);
  const margen = 45;
  const ancho = doc.page.width - (margen * 2);
  const yInicio = doc.y;

  // Título del módulo
  doc.roundedRect(margen, yInicio, ancho, 24, 4).fill(COLOR_AZUL_PRINCIPAL);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_BLANCO)
     .text(`${mod.numero}. MÓDULO: ${mod.nombre.toUpperCase()}`, margen + 12, yInicio + 7);

  doc.y = yInicio + 30;

  // Para qué sirve
  doc.font('Helvetica-Bold').fontSize(8.8).fillColor(COLOR_GRANATE).text('¿Para qué sirve? ', { continued: true });
  doc.font('Helvetica').fontSize(8.8).fillColor(COLOR_TEXTO).text(mod.proposito, { lineGap: 2 });
  doc.moveDown(0.4);

  // Fila 1: Pantalla (Frontend)
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_AZUL_FRONT).text('🖥️ En la Pantalla (Frontend): ', { continued: true });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXTO).text(mod.front, { lineGap: 2 });
  doc.moveDown(0.3);

  // Fila 2: Servidor (Backend)
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_NARANJA).text('⚙️ Por Detrás (Backend): ', { continued: true });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXTO).text(mod.back, { lineGap: 2 });
  doc.moveDown(0.3);

  // Fila 3: Base de Datos
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_VERDE).text('🗄️ En la Base de Datos: ', { continued: true });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXTO).text(mod.bd, { lineGap: 2 });

  // Separador suave
  doc.moveDown(0.5);
  doc.strokeColor('#e2e8f0').lineWidth(0.8)
     .moveTo(margen, doc.y).lineTo(margen + ancho, doc.y).stroke();
  doc.moveDown(0.5);
}

// ----------------------------------------------------------------------------
// CONTENIDO DEL RESUMEN MÓDULO POR MÓDULO
// ----------------------------------------------------------------------------
const modulosResumidos = [
  {
    numero: '1',
    nombre: 'Inicio de Sesión y Usuarios (Seguridad)',
    proposito: 'Controlar quién entra al sistema para que cada empleado vea solo lo que le corresponde (Administrador ve todo, Técnico ve reparaciones, Vendedor ve facturación).',
    front: 'Muestra una pantalla limpia de bienvenida donde escribes tu correo y contraseña, con un ojito para mostrar/ocultar la clave y avisos claros si te equivocas.',
    back: 'Revisa que el usuario exista y que la contraseña coincida con la que está guardada encriptada. Si es correcta, le entrega un "pase digital" (token seguro) para que pueda navegar.',
    bd: 'Lee la tabla "usuario" y "rol". Cuando entras con éxito, anota la hora exacta de tu ingreso en la tabla "bitacora_sesion".'
  },
  {
    numero: '2',
    nombre: 'Menú Principal y Panel de Control (Dashboard)',
    proposito: 'Darle al usuario un vistazo rápido del estado del negocio en cuanto entra al sistema, sin tener que buscar módulo por módulo.',
    front: 'Tarjetas grandes con números llamativos: cuántos equipos están en reparación hoy, cuántas ventas van en el día, cuánto dinero hay y cuántos repuestos están por agotarse.',
    back: 'Calcula al instante las sumas y totales consultando varias áreas del sistema y se las envía al navegador en menos de un segundo.',
    bd: 'Consulta en tiempo real las tablas de ventas, productos, órdenes técnicas y sesiones de caja.'
  },
  {
    numero: '3',
    nombre: 'Catálogo de Productos y Repuestos (Inventario)',
    proposito: 'Registrar todos los artículos que se venden o se usan para reparar (pantallas, baterías, cargadores, forros) con su código, precio de costo y precio de venta.',
    front: 'Una tabla ordenada con buscador instantáneo. Tiene botones para registrar un producto nuevo, editar su precio, ver su margen de ganancia y el botón "Generar Reporte".',
    back: 'Comprueba que no repitas el mismo código en dos productos distintos, calcula automáticamente la ganancia y le avisa a almacén que hay un nuevo artículo.',
    bd: 'Guarda la información en la tabla "producto" y crea automáticamente un registro en la tabla "inventario_stock" con las existencias iniciales.'
  },
  {
    numero: '4',
    nombre: 'Categorías de Artículos',
    proposito: 'Organizar los productos en grupos lógicos (ejemplo: Pantallas, Baterías, Accesorios, Herramientas) para encontrarlos rápido y saber en qué se gasta más.',
    front: 'Tarjetas visuales que muestran cada categoría y cuántos productos pertenecen a ella, junto con un botón para crear nuevas categorías o editarlas.',
    back: 'Evita que borres una categoría si todavía tiene productos adentro, para que ningún artículo se quede sin clasificación.',
    bd: 'Se guarda en la tabla "categoria", la cual está conectada directamente con la tabla "producto".'
  },
  {
    numero: '5',
    nombre: 'Proveedores (A quienes les compramos repuestos)',
    proposito: 'Guardar el directorio de distribuidores mayoristas de repuestos y accesorios con sus teléfonos, RIF, correo y persona de contacto.',
    front: 'Lista clara de empresas proveedoras con buscador por nombre o RIF, y un botón para consultar su historial de compras o sacar un reporte en PDF/Excel.',
    back: 'Verifica que el RIF sea válido y no esté repetido. Si una empresa ya te vendió repuestos en el pasado, no te deja borrarla para no arruinar la historia contable.',
    bd: 'Se almacena en la tabla "proveedor" y se enlaza con la tabla "compra".'
  },
  {
    numero: '6',
    nombre: 'Movimientos de Inventario (Entradas, Salidas y Kárdex)',
    proposito: 'Llevar la cuenta exacta de cada unidad que entra (compras) o sale (ventas o reparaciones) del almacén, sabiendo quién hizo el movimiento y por qué.',
    front: 'Una pantalla estilo libro contable (Kárdex) con etiquetas verdes para las entradas y rojas para las salidas, con filtros por fecha y botón de reporte.',
    back: 'Cada vez que hay un movimiento, suma o resta las unidades y revisa una regla de oro: nunca te deja sacar más piezas de las que realmente existen.',
    bd: 'Inserta una fila en "movimiento_inventario" con la fecha, la cantidad y el usuario, y actualiza el campo "stock_actual" en la tabla "inventario_stock".'
  },
  {
    numero: '7',
    nombre: 'Alertas de Stock (Avisos de productos por agotarse)',
    proposito: 'Avisar a tiempo cuando un repuesto se está terminando para pedir más antes de que el taller se quede sin piezas para trabajar.',
    front: 'Una bandeja con colores de semáforo (Rojo: Agotado, Amarillo: En Riesgo) y una tarjeta que te dice exactamente cuánto dinero necesitas para reponer el almacén.',
    back: 'Compara continuamente la existencia actual contra la cantidad mínima de seguridad que configuraste en cada producto.',
    bd: 'Filtra la tabla "inventario_stock" donde el stock actual sea menor o igual al stock mínimo configurado.'
  },
  {
    numero: '8',
    nombre: 'Dispositivos de Clientes en Taller',
    proposito: 'Tener una ficha de cada celular o tablet que ingresa a reparación, con su marca, modelo, color y su número único de serie o IMEI.',
    front: 'Buscador inteligente donde escribes el IMEI o el nombre del cliente y encuentras de inmediato el teléfono y cuántas veces ha venido a reparación.',
    back: 'Valida que el IMEI tenga el formato correcto y lo asocia automáticamente al cliente dueño del equipo.',
    bd: 'Se guarda en la tabla "dispositivo" y se conecta con la tabla "cliente".'
  },
  {
    numero: '9',
    nombre: 'Panel del Técnico (Órdenes de Reparación)',
    proposito: 'Gestionar el arreglo del equipo desde que llega hasta que se entrega, pasando por: Pendiente → En Reparación → Listo → Entregado.',
    front: 'Columnas y tarjetas con colores claros que muestran el estado de cada teléfono, la falla que tiene, el técnico a cargo y el costo total.',
    back: 'Permite al técnico anotar el diagnóstico y agregar repuestos de almacén. Al entregarlo, manda el cobro directo a la caja para que el dinero no se pierda.',
    bd: 'Guarda los datos en "orden_tecnico" y si usó repuestos, los anota en la tabla "orden_repuesto", rebajándolos del almacén.'
  },
  {
    numero: '10',
    nombre: 'Directorio de Clientes',
    proposito: 'Registrar los datos de las personas que compran o mandan a reparar (nombre, cédula, teléfono y correo) para contactarlos fácilmente.',
    front: 'Tabla con buscador rápido por cédula. Al tocar un cliente, puedes ver todos los teléfonos que ha traído a reparar y todas sus compras.',
    back: 'Revisa que la cédula no esté duplicada y calcula cuánto dinero ha gastado el cliente en total en el negocio (fidelización).',
    bd: 'Se almacena en la tabla "cliente" y se relaciona con sus dispositivos y sus compras.'
  },
  {
    numero: '11',
    nombre: 'Caja Chica (Control de Efectivo USD y Bolívares)',
    proposito: 'Controlar el dinero físico en cada turno de trabajo: con cuánto dinero se abre la caja, qué entra, qué gastos menores salen y el arqueo al cerrar.',
    front: 'Panel financiero que te dice cuánto dinero debe haber en el cajón en Dólares y Bolívares. Incluye botones para registrar gastos y cerrar la caja.',
    back: 'No permite hacer ventas si la caja no está abierta. Al cerrar, compara el dinero contado por el cajero contra lo registrado y detecta sobrantes o faltantes.',
    bd: 'Registra los turnos en "caja_sesion" y cada centavo que entra o sale en la tabla "caja_movimiento".'
  },
  {
    numero: '12',
    nombre: 'Ventas en Mostrador (Facturación y Cobro)',
    proposito: 'Cobrar rápido repuestos y accesorios a los clientes que compran directamente en la tienda.',
    front: 'Un catálogo visual donde haces clic en los productos para agregarlos al carrito de compras, eliges si pagan en efectivo o pago móvil y presionas "Procesar".',
    back: 'Hace todo en un solo instante seguro: revisa que haya stock, calcula el IVA, descuenta los productos de almacén e ingresa el dinero a la caja.',
    bd: 'Crea la factura en "venta", anota los artículos en "detalle_venta", rebaja "inventario_stock" y crea la entrada en "caja_movimiento".'
  },
  {
    numero: '13',
    nombre: 'Generador de Reportes (PDF, Excel y Correo)',
    proposito: 'Sacar informes organizados y profesionales de cualquier módulo con solo presionar el botón "Generar Reporte" para tomar buenas decisiones.',
    front: 'Una ventana emergente donde eliges las fechas que quieres ver, si prefieres el reporte en PDF o Excel, y una casilla opcional para colocar un correo.',
    back: 'Construye el documento PDF con tablas limpias y márgenes bonitos, o crea un archivo Excel con fórmulas matemáticas automáticas.',
    bd: 'Lee y combina la información de varias tablas para entregarte estadísticas de ganancias, productos más vendidos y rendimiento de técnicos.'
  },
  {
    numero: '14',
    nombre: 'Botón de Ayuda y Manual Interactivo',
    proposito: 'Enseñar a cualquier empleado nuevo cómo usar la pantalla en la que está parado en ese momento, sin tener que leer un libro enorme de instrucciones.',
    front: 'Un botón con ícono de salvavidas/ayuda en la parte superior derecha de la pantalla (al lado de las notificaciones). Al presionarlo, abre una guía paso a paso del módulo activo.',
    back: 'Está optimizado para abrirse de inmediato sin esperar que el servidor cargue nada, reconociendo en qué parte del sistema te encuentras.',
    bd: 'Funciona directamente en el navegador del usuario para una respuesta instantánea.'
  }
];

// ----------------------------------------------------------------------------
// SECCIÓN DE EJEMPLOS EN LA VIDA REAL
// ----------------------------------------------------------------------------
function dibujarEjemplosVidaReal() {
  asegurarEspacio(160);
  const margen = 45;
  const ancho = doc.page.width - (margen * 2);

  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_AZUL_PRINCIPAL)
     .text('2. DOS EJEMPLOS CLAROS DE LA VIDA REAL');
  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLOR_MUTED)
     .text('Así es como el sistema trabaja automáticamente todos los días:');

  doc.moveDown(0.5);

  const ejemplos = [
    {
      titulo: 'EJEMPLO 1: Un cliente compra una pantalla y un forro en mostrador',
      pasos: [
        '1. Pantalla (Front): El vendedor abre "Ventas", busca el forro y la pantalla, y los añade al carrito.',
        '2. Servidor (Back): Al hacer clic en "Cobrar", el backend verifica que queden unidades en almacén.',
        '3. Base de Datos (BD): Resta 1 forro y 1 pantalla del inventario, suma el dinero a la caja chica del día y guarda la factura.',
        '4. Resultado: El stock queda actualizado y el dinero queda registrado para el cuadre de caja de la tarde.'
      ]
    },
    {
      titulo: 'EJEMPLO 2: Un cliente deja un teléfono que no enciende para reparar',
      pasos: [
        '1. Pantalla (Front): En "Recepción", se escribe la cédula del cliente, el modelo del teléfono y su IMEI.',
        '2. Servidor (Back): Crea la orden técnica en estado "Pendiente" y se la asigna al taller.',
        '3. En Taller: El técnico revisa el equipo, cambia el estado a "En Reparación" y le coloca una batería nueva de almacén.',
        '4. Entrega final: El equipo pasa a "Listo", el cliente lo retira, se marca "Entregado" y el cobro ingresa a caja.'
      ]
    }
  ];

  ejemplos.forEach(ej => {
    const yEj = doc.y;
    doc.roundedRect(margen, yEj, ancho, 72, 6).fillAndStroke('#f8fafc', COLOR_BORDE);
    doc.roundedRect(margen, yEj, 5, 72, 2).fill(COLOR_AZUL_SUAVE);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_AZUL_PRINCIPAL).text(ej.titulo, margen + 14, yEj + 7);

    let yPaso = yEj + 22;
    ej.pasos.forEach(p => {
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_TEXTO).text(p, margen + 14, yPaso, { width: ancho - 28 });
      yPaso += 11.5;
    });

    doc.y = yEj + 78;
  });
}

// ----------------------------------------------------------------------------
// SECCIÓN DE USUARIOS Y CONTRASEÑAS PARA PROBAR
// ----------------------------------------------------------------------------
function dibujarCuentasAcceso() {
  asegurarEspacio(90);
  const margen = 45;
  const ancho = doc.page.width - (margen * 2);

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_AZUL_PRINCIPAL)
     .text('3. USUARIOS Y CLAVES PARA INGRESAR AL SISTEMA');
  doc.moveDown(0.3);

  const usuarios = [
    { rol: 'Administrador (Dueño / Gerente)', correo: 'admin@tekzon.com', clave: 'admin123', puede: 'Tiene acceso a todos los módulos y reportes.' },
    { rol: 'Técnico de Reparaciones', correo: 'tecnico@tekzon.com', clave: 'tecnico123', puede: 'Gestiona órdenes de taller, dispositivos y repuestos.' },
    { rol: 'Vendedor de Mostrador', correo: 'vendedor@tekzon.com', clave: 'vendedor123', puede: 'Realiza ventas, maneja caja chica y registra clientes.' }
  ];

  usuarios.forEach(u => {
    const yU = doc.y;
    doc.roundedRect(margen, yU, ancho, 24, 4).fillAndStroke('#f1f5f9', '#e2e8f0');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_AZUL_PRINCIPAL).text(u.rol, margen + 8, yU + 7, { width: 150 });
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXTO).text(`Correo: ${u.correo}  |  Clave: ${u.clave}`, margen + 165, yU + 7, { width: 220 });
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(COLOR_MUTED).text(u.puede, margen + 390, yU + 7, { width: ancho - 395 });
    doc.y = yU + 28;
  });
}

// ============================================================================
// CONSTRUCCIÓN DEL DOCUMENTO
// ============================================================================
console.log('Generando documento resumido y explicativo en PDF...');

// Página 1: Portada y explicación general
generarPortada();

// Página 2 en adelante: Módulos explicados
doc.addPage();
doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_AZUL_PRINCIPAL)
   .text('RESUMEN DE TODOS LOS MÓDULOS DEL SISTEMA');
doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLOR_MUTED)
   .text('Explicación clara de qué hace la pantalla, el servidor y la base de datos en cada área:');
doc.moveDown(0.8);

modulosResumidos.forEach(mod => {
  dibujarFichaModulo(mod);
});

// Sección final de ejemplos y cuentas
doc.addPage();
dibujarEjemplosVidaReal();
doc.moveDown(0.5);
dibujarCuentasAcceso();

// ----------------------------------------------------------------------------
// PIE DE PÁGINA Y NUMERACIÓN EN SEGUNDA PASADA
// ----------------------------------------------------------------------------
const totalPaginas = doc.bufferedPageRange().count;
console.log('Total paginas resumen:', totalPaginas);

for (let i = 0; i < totalPaginas; i++) {
  doc.switchToPage(i);
  if (i === 0) continue; // Portada sin cabecera/pie

  const margen = 45;
  const ancho = doc.page.width - (margen * 2);
  const yPie = doc.page.height - 30;

  // Encabezado simple
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR_MUTED)
     .text('TEKZON C.A. · GUÍA EXPLICATIVA Y RESUMEN DEL SISTEMA', margen, 20, { width: ancho, align: 'left' });
  doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_MUTED)
     .text('Fácil de entender · Módulo por Módulo', margen, 20, { width: ancho, align: 'right' });
  doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(margen, 30).lineTo(doc.page.width - margen, 30).stroke();

  // Pie simple
  doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(margen, yPie).lineTo(doc.page.width - margen, yPie).stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_MUTED)
     .text('TekZon C.A. · Sistema de Gestión de Taller e Inventario · IUJO Barquisimeto', margen, yPie + 6);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_AZUL_PRINCIPAL)
     .text(`Página ${i + 1} de ${totalPaginas}`, doc.page.width - margen - 60, yPie + 6, { width: 60, align: 'right' });
}

doc.end();

writeStream.on('finish', () => {
  console.log(`Documento PDF resumido generado con éxito en: ${rutaDestinoPrincipal}`);
  try {
    fs.copyFileSync(rutaDestinoPrincipal, rutaDestinoArtifacts);
    console.log(`Copia guardada en artifacts: ${rutaDestinoArtifacts}`);
  } catch (err) {
    console.error('Error al copiar:', err.message);
  }
});
