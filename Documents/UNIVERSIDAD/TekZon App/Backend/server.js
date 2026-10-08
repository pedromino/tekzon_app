/**
 * ==========================================================================
 * SERVIDOR PRINCIPAL (server.js) - TEKZON C.A.
 * ==========================================================================
 * Sistema de Gestión Técnica e Inventario · Asignatura ADS-433 · IUJO
 * --------------------------------------------------------------------------
 * PROPÓSITO FUNCIONAL:
 *   Punto de entrada del backend RESTful. Inicializa Express, habilita CORS
 *   para el cliente Vue 3, registra los middlewares globales y monta las
 *   rutas de los CUATRO CRUDs del módulo de inventario bajo el prefijo /api.
 *
 * PROPÓSITO TÉCNICO:
 *   Arquitectura por capas: Routes -> Controllers -> Services -> Models -> DB.
 *   Cada módulo del inventario tiene su propio archivo de rutas, de modo que
 *   el desacoplamiento permita evolucionar un CRUD sin afectar a los demás:
 *
 *     CRUD 1 · Catálogo Maestro de Productos -> /api/productos
 *     CRUD 2 · Ajuste de Existencias         -> /api/inventario/stock
 *     CRUD 3 · Movimientos (Kárdex)          -> /api/movimientos
 *     CRUD 4 · Categorías de Productos       -> /api/categorias
 *
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
// MONTAJE DE LAS RUTAS DEL MÓDULO DE INVENTARIO (4 CRUDs interconectados)
// ==========================================================================
app.use('/api/productos', productoRoutes);           // CRUD 1
app.use('/api/inventario/stock', inventarioStockRoutes); // CRUD 2
app.use('/api/movimientos', movimientoRoutes);        // CRUD 3
app.use('/api/categorias', categoriaRoutes);          // CRUD 4

// ==========================================================================
// RUTA DE COMPROBACIÓN DE ESTADO DEL SERVICIO
// ==========================================================================
app.get('/', (req, res) => {
  res.status(200).json({
    empresa: 'TekZon C.A.',
    sistema: 'Sistema de Gestión Técnica e Inventario · ADS-433',
    estado: 'Servidor operativo y conectado a la base de datos relacional',
    modulos: {
      crud1_catalogo_productos: 'GET|POST|PUT|DELETE /api/productos',
      crud2_ajuste_existencias: 'GET|PATCH /api/inventario/stock',
      crud3_movimientos_kardex: 'GET|POST /api/movimientos',
      crud4_categorias: 'GET|POST|PUT|DELETE /api/categorias'
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
  console.log('  Módulo de inventario: 4 CRUDs interconectados activos');
  console.log('==========================================================');
});

export default app;
