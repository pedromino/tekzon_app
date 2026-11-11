/**
 * ==========================================================================
 * SERVIDOR PRINCIPAL (server.js) - TEKZON C.A.
 * ==========================================================================
 * Sistema de Gestión Técnica e Inventario · Asignatura ADS-433 · IUJO
 * --------------------------------------------------------------------------
 * PROPÓSITO FUNCIONAL:
 *   Punto de entrada del backend RESTful. Inicializa Express, habilita CORS
 *   para el cliente Vue 3, registra los middlewares globales y monta las rutas
 *   de TODOS los módulos del sistema bajo el prefijo /api:
 *
 *     FASE I · MÓDULO DE INVENTARIO (4 CRUDs ya operativos)
 *       CRUD 1 · Catálogo Maestro de Productos -> /api/productos
 *       CRUD 2 · Ajuste de Existencias         -> /api/inventario/stock
 *       CRUD 3 · Movimientos (Kárdex)          -> /api/movimientos
 *       CRUD 4 · Categorías de Productos       -> /api/categorias
 *
 *     FASE II · MÓDULOS NUEVOS (esta entrega)
 *       MÓDULO 1 · Usuario (LOGIN, rol Administrador) -> /api/autenticacion
 *       MÓDULO 2 · Servicio Técnico y Caja
 *                    Recepción y órdenes -> /api/ordenes-tecnicas
 *                    Clientes            -> /api/clientes
 *                    Dispositivos        -> /api/dispositivos
 *                    Turnos de caja      -> /api/caja
 *       MÓDULO 3 · Venta Directa (Mostrador)   -> /api/ventas
 *       MÓDULO 4 · Alertas de Stock Mínimo     -> /api/alertas/stock
 *
 * PROPÓSITO TÉCNICO:
 *   Arquitectura por capas: Routes -> Controllers -> Services -> Models -> DB.
 *   Cada módulo tiene su propio archivo de rutas, de modo que el
 *   desacoplamiento permita evolucionar uno sin afectar a los demás.
 *   Al final se registran el manejador de rutas no encontradas (404) y el
 *   manejador centralizado de errores (500), garantizando que TODA respuesta
 *   del API salga en JSON y con un código HTTP semántico.
 * ==========================================================================
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// ---- Importación de los routers de los 4 CRUDs del módulo de inventario ----
import productoRoutes from './src/routes/productoRoute.js';
import categoriaRoutes from './src/routes/CategoriaRoute.js';
import movimientoRoutes from './src/routes/MovimientoRoute.js';
import inventarioStockRoutes from './src/routes/inventarioStockRoute.js';

// ---- MÓDULO 1 · Usuario (LOGIN) ----
import autenticacionRoutes from './src/routes/autenticacionRoute.js';

// ---- MÓDULO 2 · Servicio Técnico y Caja (y sus entidades de recepción) ----
import ordenServiceTecnicoRoutes from './src/routes/ordenServiceTecnicoRoute.js';
import clienteRoutes from './src/routes/clienteRoute.js';
import dispositivoRoutes from './src/routes/dispositivoRoute.js';
import cajaRoutes from './src/routes/cajaRoute.js';

// ---- MÓDULO 3 · Venta Directa (Mostrador) ----
import ventaRoutes from './src/routes/ventaRoute.js';

// ---- MÓDULO 4 · Automatización de alertas de stock mínimo ----
import alertaStockRoutes from './src/routes/alertaStockRoute.js';

// ---- MÓDULO DE CONFIGURACIÓN Y GESTIÓN DE USUARIOS ----
import usuarioRoutes from './src/routes/usuarioRoute.js';

// ---- MÓDULO DE PROVEEDORES ----
import proveedorRoutes from './src/routes/proveedorRoute.js';

// ---- MÓDULO DE REPORTES (PDF, EXCEL Y CORREO) ----
import reporteRoutes from './src/routes/reporteRoute.js';

// ---- Importación de los middlewares globales personalizados ----
import { manejadorRutaNoEncontrada, manejadorErroresGlobal } from './src/middlewares/errorHandler.js';

// Carga de las variables de entorno definidas en el archivo .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================================================
// MIDDLEWARES GLOBALES
// ==========================================================================
app.use(cors()); // Permite las peticiones cruzadas desde el frontend en Vue 3
app.use(express.json()); // Habilita la lectura de payloads en formato JSON
app.use(express.urlencoded({ extended: true })); // Soporta formularios clásicos

// Middleware de trazabilidad: registra en consola cada petición recibida con
// su método, ruta y código de respuesta. Facilita la sustentación técnica.
app.use((req, res, siguiente) => {
  const horaPeticion = new Date().toISOString();
  res.on('finish', () => {
    console.log(`[${horaPeticion}] ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
  });
  siguiente();
});

// ==========================================================================
// MONTAJE DE LAS RUTAS DEL MÓDULO DE INVENTARIO (FASE I · 4 CRUDs)
// ==========================================================================
app.use('/api/productos', productoRoutes);                // CRUD 1
app.use('/api/inventario/stock', inventarioStockRoutes);  // CRUD 2
app.use('/api/movimientos', movimientoRoutes);            // CRUD 3
app.use('/api/categorias', categoriaRoutes);              // CRUD 4

// ==========================================================================
// MONTAJE DE LAS RUTAS DE LOS MÓDULOS NUEVOS (FASE II)
// ==========================================================================
app.use('/api/autenticacion', autenticacionRoutes);              // MÓDULO 1 · LOGIN
app.use('/api/ordenes-tecnicas', ordenServiceTecnicoRoutes);     // MÓDULO 2 · Taller
app.use('/api/clientes', clienteRoutes);                         // MÓDULO 2 · Clientes
app.use('/api/dispositivos', dispositivoRoutes);                 // MÓDULO 2 · Equipos
app.use('/api/caja', cajaRoutes);                                // MÓDULO 2 · Caja
app.use('/api/ventas', ventaRoutes);                             // MÓDULO 3 · Mostrador
app.use('/api/alertas/stock', alertaStockRoutes);                // MÓDULO 4 · Alertas
app.use('/api/usuarios', usuarioRoutes);                         // MÓDULO DE USUARIOS Y ROLES
app.use('/api/proveedores', proveedorRoutes);                   // MÓDULO DE PROVEEDORES
app.use('/api/reportes', reporteRoutes);                         // MOTOR DE REPORTES (PDF, EXCEL, EMAIL)

// ==========================================================================
// RUTA DE COMPROBACIÓN DE ESTADO DEL SERVICIO
// ==========================================================================
app.get('/', (req, res) => {
  res.status(200).json({
    empresa: 'TekZon C.A.',
    sistema: 'Sistema de Gestión Técnica e Inventario · ADS-433',
    estado: 'Servidor operativo y conectado a la base de datos relacional',
    modulos: {
      // ---- FASE I · Inventario ----
      crud1_catalogo_productos: 'GET|POST|PUT|DELETE /api/productos',
      crud2_ajuste_existencias: 'GET|PATCH /api/inventario/stock',
      crud3_movimientos_kardex: 'GET|POST /api/movimientos',
      crud4_categorias: 'GET|POST|PUT|DELETE /api/categorias',
      // ---- FASE II · Módulos nuevos ----
      modulo1_autenticacion: 'POST /api/autenticacion/login, POST /api/autenticacion/registrar',
      modulo2_servicio_tecnico: 'GET|POST|PATCH /api/ordenes-tecnicas',
      modulo2_clientes: 'GET|POST|PUT|DELETE /api/clientes',
      modulo2_dispositivos: 'GET|POST|PUT|DELETE /api/dispositivos',
      modulo2_caja: 'GET|POST /api/caja',
      modulo3_venta_directa: 'GET|POST /api/ventas',
      modulo4_alertas_stock: 'GET|PATCH /api/alertas/stock',
      modulo_usuarios_configuracion: 'GET|POST|PUT|PATCH|DELETE /api/usuarios'
    }
  });
});

// ==========================================================================
// MANEJO CENTRALIZADO DE ERRORES (debe ir SIEMPRE al final)
// ==========================================================================
app.use(manejadorRutaNoEncontrada); // 404 para endpoints inexistentes
app.use(manejadorErroresGlobal);    // 500 para excepciones no controladas

// ==========================================================================
// ARRANQUE DEL SERVIDOR
// ==========================================================================
app.listen(PORT, () => {
  console.log('==========================================================');
  console.log(`  TekZon C.A. · Backend operativo en el puerto ${PORT}`);
  console.log(`  API REST: http://localhost:${PORT}/api`);
  console.log('  Módulo de inventario : 4 CRUDs interconectados activos');
  console.log('  Módulos nuevos       : login, servicio técnico, caja,');
  console.log('                         venta directa y alertas de stock');
  console.log('==========================================================');

  // Advertencia de seguridad: el token de sesión se firma con JWT_SECRETO.
  if (!process.env.JWT_SECRETO) {
    console.warn(
      '  [SEGURIDAD] Defina JWT_SECRETO en el archivo .env para firmar los\n'
      + '              tokens de sesión con una clave propia del proyecto.'
    );
  }
});

export default app;

