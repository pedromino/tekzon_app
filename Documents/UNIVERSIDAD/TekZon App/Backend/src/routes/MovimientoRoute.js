/**
 * ==========================================================================
 * RUTAS DE MOVIMIENTO (movimientoRoute.js) - TEKZON C.A.
 * ==========================================================================
 * CRUD 3 · Movimientos de Inventario (Kárdex transaccional)
 *
 * PROPÓSITO FUNCIONAL:
 *   Declara los endpoints REST consumidos por `MovimientoServices.js` en Vue 3
 *   para registrar Entradas/Salidas y consultar el historial del almacén.
 *
 * PROPÓSITO TÉCNICO:
 *   Router montado por `server.js` bajo el prefijo `/api/movimientos`.
 *   Las rutas literales (`/resumen`) y las de mayor especificidad
 *   (`/producto/:cod_producto`) se declaran ANTES de `/:id` para que Express
 *   no interprete "resumen" o "producto" como un identificador numérico.
 *
 *   | Método | Ruta                                        | Acción                    |
 *   |--------|---------------------------------------------|---------------------------|
 *   | GET    | /api/movimientos                            | Historial del kádex       |
 *   | GET    | /api/movimientos/resumen                    | KPI agregados             |
 *   | GET    | /api/movimientos/producto/:cod_producto     | Kárdex por producto       |
 *   | GET    | /api/movimientos/:id                        | Asiento puntual           |
 *   | POST   | /api/movimientos                            | Entrada o Salida física   |
 * ==========================================================================
 */
import { Router } from 'express';
import { MovimientoController } from '../controllers/MovimientoController.js';

const router = Router();

// Rutas literales y específicas primero (evitan colisión con /:id).
router.get('/resumen', MovimientoController.getResumenMovimientos);
router.get('/producto/:cod_producto', MovimientoController.getMovimientosPorProducto);

// CRUD 3: consulta del kádex y registro de movimientos.
router.get('/', MovimientoController.getMovimientos);
router.get('/:id', MovimientoController.getMovimientoPorId);
router.post('/', MovimientoController.postMovimiento);

export default router;
