/**
 * ==========================================================================
 * RUTAS DE REPORTES (reporteRoute.js) - TEKZON C.A.
 * ==========================================================================
 * MÓDULO DE GENERACIÓN DE REPORTES (PDF, EXCEL Y CORREO)
 * ==========================================================================
 */
import { Router } from 'express';
import { ReporteController } from '../controllers/reporteController.js';
import { autenticarToken } from '../middlewares/autenticacionMiddleware.js';

const router = Router();

// Todas las operaciones de reporte requieren usuario autenticado
router.use(autenticarToken);

router.post('/generar', ReporteController.generarReporte);
router.get('/datos/:tipo', ReporteController.getDatosReporte);

export default router;
