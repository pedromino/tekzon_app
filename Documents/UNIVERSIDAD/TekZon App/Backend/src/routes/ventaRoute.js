/**
 * ==========================================================================
 * RUTAS DE VENTA DIRECTA (ventaRoute.js) - TEKZON C.A.
 * ==========================================================================
 * MÓDULO 3 · VENTA DIRECTA (MOSTRADOR)
 *
 * PROPÓSITO FUNCIONAL:
 *   Declara los endpoints REST de la venta rápida, consumidos por
 *   `VentaServices.js` en Vue 3.
 *
 * PROPÓSITO TÉCNICO:
 *   Router montado por `server.js` bajo el prefijo `/api/ventas`.
 *
 *   ORDEN DE DECLARACIÓN: las rutas literales (`/indicadores`, `/mas-vendidos`,
 *   `/metodos-pago`) van ANTES de `/:numFactura`; si no, Express intentaría
 *   buscar una factura llamada "indicadores".
 *
 *   Todas las rutas exigen sesión de Administrador
 *   (`exigirAdministradorAutenticado`).
 * ==========================================================================
 */
import { Router } from 'express';
import { VentaController } from '../controllers/ventaController.js';
import { permitirRoles } from '../middlewares/autenticacionMiddleware.js';
import { validarCamposRequeridos } from '../middlewares/validatePayload.js';

const router = Router();

// ---- Módulo accesible por Administrador y Cajero ----
router.use(...permitirRoles('administrador', 'cajero'));

// ==========================================================================
// RUTAS LITERALES (siempre antes de /:numFactura)
// ==========================================================================
router.get('/indicadores', VentaController.getIndicadores);
router.get('/mas-vendidos', VentaController.getMasVendidos);
router.get('/metodos-pago', VentaController.getMetodosPago);

// ==========================================================================
// REGISTRO DE LA VENTA
// ==========================================================================
router.post(
  '/',
  // Validación temprana de lo indispensable para facturar.
  validarCamposRequeridos([
    { campo: 'cedula_cli', alternos: ['cedula'], etiqueta: 'cédula del cliente' },
    { campo: 'productos', alternos: ['carrito', 'detalle'], etiqueta: 'productos del carrito' },
    { campo: 'metodo_pago', alternos: ['metodoPago'], etiqueta: 'método de pago' }
  ]),
  VentaController.postVenta
);

/** Anulación de una factura con devolución de mercancía al inventario. */
router.post('/:numFactura/anular', VentaController.postAnularVenta);

// ==========================================================================
// RUTAS GENÉRICAS (van al final)
// ==========================================================================
router.get('/', VentaController.getVentas);
router.get('/:numFactura', VentaController.getVentaPorFactura);

export default router;
