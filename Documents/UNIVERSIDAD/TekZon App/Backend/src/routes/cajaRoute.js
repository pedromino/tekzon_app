/**
 * ==========================================================================
 * RUTAS DE CAJA (cajaRoute.js) - TEKZON C.A.
 * ==========================================================================
 * MÓDULO 2 · CAJA (marco contable de los cobros)
 *
 * PROPÓSITO FUNCIONAL:
 *   Declara los endpoints REST del turno de caja, consumidos por
 *   `CajaServices.js` en Vue 3.
 *
 * PROPÓSITO TÉCNICO:
 *   Router montado por `server.js` bajo el prefijo `/api/caja`.
 *   La ruta literal `/activa` se declara antes de `/:id/pagos` y `/:id/cerrar`.
 *   Todas las rutas exigen sesión de Administrador.
 * ==========================================================================
 */
import { Router } from 'express';
import { CajaController } from '../controllers/cajaController.js';
import { permitirRoles } from '../middlewares/autenticacionMiddleware.js';

const router = Router();

// ---- Módulo accesible por Administrador y Cajero ----
router.use(...permitirRoles('administrador', 'cajero'));

// Rutas literales primero.
router.get('/activa', CajaController.getCajaActiva);
router.post('/abrir', CajaController.postAbrirCaja);

// Rutas con identificador.
router.get('/:id/pagos', CajaController.getPagosDeCaja);
router.post('/:id/cerrar', CajaController.postCerrarCaja);

// Listado general.
router.get('/', CajaController.getCajas);

export default router;
