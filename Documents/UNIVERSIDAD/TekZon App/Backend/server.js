/**
 * ==========================================================================
 * SERVIDOR PRINCIPAL - TEKZON C.A.
 * ==========================================================================
 * Inicializa la aplicación Express, configura los middlewares globales 
 * y enlaza las rutas del API RESTful con la base de datos.
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import productoRoutes from './src/routes/productoRoute.js';

// Cargar las variables de entorno desde el archivo .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globales requeridos por la arquitectura
app.use(cors()); // Permite peticiones cruzadas desde el frontend en Vue.js
app.use(express.json()); // Habilita la lectura de payloads en formato JSON

// Registro de Rutas del Módulo CRUD (Inventario / Productos)
app.use('/api/productos', productoRoutes);

// Ruta base de comprobación de estado del servidor
app.get('/', (req, res) => {
  res.status(200).json({ 
    empresa: 'TekZon C.A.',
    estado: 'Servidor operativo y conectado a base de datos relacional' 
  });
});

// Levantar el servidor en el puerto configurado
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo exitosamente en el puerto ${PORT}`);
});