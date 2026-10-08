/**
 * ==========================================================================
 * RUTAS DE STOCK (inventarioStockRoute.js) - TEKZON C.A.
 * ==========================================================================
 * CRUD 2 · Gestión y Ajuste de Existencias de Almacén (rol Almacenista)
 *
 * PROPÓSITO FUNCIONAL:
 *   Declara los endpoints REST consumidos por `MovimientoServices.js` /
 *   `AjusteStockModal.vue` para la búsqueda rápida, la auditoría del stock
 *   actual y la corrección justificada de existencias.
 *
 * PROPÓSITO TÉCNICO:
 *   Router montado por `server.js` bajo el prefijo `/api/inventario/stock`.
 *   Las rutas literales (`/indicadores`, `/alertas`) se declaran ANTES de
 *   `/:cod_producto` porque un código de producto es un texto arbitrario
 *   (p. ej. "REP-PAN-001") y podría colisionar con esas palabras reservadas.
 *
 *   | Método | Ruta                                          | Acción                    |
 *   |--------|-----------------------------------------------|---------------------------|
 *   | GET    | /api/inventario/stock                         | Auditoría de existencias  |
 *   | GET    | /api/inventario/stock/indicadores             | KPI del almacén           |
 *   | GET    | /api/inventario/stock/alertas                 | Alertas de stock mínimo   |
 *   | GET    | /api/inventario/stock/:cod_producto           | Ficha de existencia       |
 *   | PATCH  | /api/inventario/stock/:cod_producto           | Ajuste justificado        |
 * ==========================================================================
 */
import { Router } from 'express';
import { InventarioStockController } from '../controllers/inventarioStockController.js';

const router = Router();

// Rutas literales primero (evitan que "indicadores" o "alertas" se
// interpreten como un código de producto).
router.get('/indicadores', InventarioStockController.getIndicadores);
router.get('/alertas', InventarioStockController.getAlertas);

// CRUD 2: auditoría y ajuste de existencias.
router.get('/', InventarioStockController.getExistencias);
router.get('/:cod_producto', InventarioStockController.getExistenciaPorCodigo);
router.patch('/:cod_producto', InventarioStockController.patchAjustarExistencia);

export default router;
