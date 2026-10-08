/**
 * ==========================================================================
 * RUTAS DE PRODUCTO (productoRoute.js) - TEKZON C.A.
 * ==========================================================================
 * CRUD 1 · Registro y Catálogo Maestro de Productos
 *
 * PROPÓSITO FUNCIONAL:
 *   Declara los endpoints REST consumidos por `ProductoServices.js` en Vue 3.
 *
 * PROPÓSITO TÉCNICO:
 *   Router de Express montado por `server.js` bajo el prefijo `/api/productos`.
 *   La ruta `/:id/reactivar` se declara antes que `/:id` para evitar que
 *   Express interprete "reactivar" como un código de producto.
 *
 *   | Método | Ruta                            | Acción                        |
 *   |--------|---------------------------------|-------------------------------|
 *   | GET    | /api/productos                  | Catálogo maestro              |
 *   | GET    | /api/productos/:id              | Consultar ficha técnica       |
 *   | POST   | /api/productos                  | Alta SIN captura de stock     |
 *   | PUT    | /api/productos/:id              | Editar ficha (stock intacto)  |
 *   | DELETE | /api/productos/:id              | Baja lógica (estado = 0)      |
 *   | PATCH  | /api/productos/:id/reactivar    | Reactivar (estado = 1)        |
 * ==========================================================================
 */
import { Router } from 'express';
import { ProductoController } from '../controllers/productoController.js';

const router = Router();

// Ruta específica primero (evita colisión con el patrón genérico /:id).
router.patch('/:id/reactivar', ProductoController.patchReactivarProducto);

// CRUD 1 completo sobre el recurso producto.
router.get('/', ProductoController.getProductos);
router.get('/:id', ProductoController.getProductoPorCodigo);
router.post('/', ProductoController.postProducto);
router.put('/:id', ProductoController.putProducto);
router.delete('/:id', ProductoController.deleteProducto);

export default router;
