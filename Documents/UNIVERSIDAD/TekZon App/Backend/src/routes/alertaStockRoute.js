/**
 * ==========================================================================
 * RUTAS DE ALERTAS DE STOCK (alertaStockRoute.js) - TEKZON C.A.
 * ==========================================================================
 * MÓDULO 4 · AUTOMATIZACIÓN DE ALERTAS DE STOCK MÍNIMO
 *
 * PROPÓSITO FUNCIONAL:
 *   Declara los endpoints REST que consultan y administran las alertas
 *   generadas automáticamente, consumidos por `AlertaStockServices.js` en Vue 3.
 *
 * PROPÓSITO TÉCNICO:
 *   Router montado por `server.js` bajo el prefijo `/api/alertas/stock`.
 *
 *   ORDEN DE DECLARACIÓN: las rutas literales (`/indicadores`,
 *   `/productos-riesgo`) y las de subrecurso (`/producto/:codigo/atender`) van
 *   ANTES de `/:id/atender`, porque un identificador numérico y una palabra
 *   podrían colisionar si el orden fuera el inverso.
 *
 *   Todas las rutas exigen sesión de Administrador.
 * ==========================================================================
 */
import { Router } from 'express';
import { AlertaStockController } from '../controllers/alertaStockController.js';
import { exigirAdministradorAutenticado } from '../middlewares/autenticacionMiddleware.js';

const router = Router();

// ---- A partir de aquí, todo exige sesión de Administrador ----
router.use(...exigirAdministradorAutenticado);

// Rutas literales primero.
router.get('/indicadores', AlertaStockController.getIndicadores);
router.get('/productos-riesgo', AlertaStockController.getProductosRiesgo);

// Subrecurso por código de producto (más específico que /:id).
router.patch('/producto/:codigo/atender', AlertaStockController.patchAtenderAlertasDeProducto);

// Recurso individual.
router.patch('/:id/atender', AlertaStockController.patchAtenderAlerta);

// Listado general.
router.get('/', AlertaStockController.getAlertas);

export default router;
