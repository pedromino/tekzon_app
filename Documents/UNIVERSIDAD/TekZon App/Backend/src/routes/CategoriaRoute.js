/**
 * ==========================================================================
 * RUTAS DE CATEGORÍA (categoriaRoute.js) - TEKZON C.A.
 * ==========================================================================
 * CRUD 4 · Registro y Gestión de Categorías de Productos
 *
 * PROPÓSITO FUNCIONAL:
 *   Declara los endpoints REST que consume `CategoriaServices.js` en Vue 3.
 *
 * PROPÓSITO TÉCNICO:
 *   Router de Express montado por `server.js` bajo el prefijo `/api/categorias`.
 *   El orden de declaración es importante: las rutas específicas como
 *   `/:id/reactivar` se registran ANTES de `/:id` para que Express no
 *   interprete "reactivar" como un identificador.
 *
 *   | Método | Ruta                        | Acción                          |
 *   |--------|-----------------------------|---------------------------------|
 *   | GET    | /api/categorias             | Listar (filtro soloActivas)     |
 *   | GET    | /api/categorias/:id         | Consultar una categoría         |
 *   | POST   | /api/categorias             | Crear categoría                 |
 *   | PUT    | /api/categorias/:id         | Editar / renombrar              |
 *   | DELETE | /api/categorias/:id         | Baja lógica (estado = 0)        |
 *   | PATCH  | /api/categorias/:id/reactivar | Reactivar (estado = 1)       |
 * ==========================================================================
 */
import { Router } from 'express';
import { CategoriaController } from '../controllers/CategoriaController.js';

const router = Router();

// Rutas específicas primero (evitan colisión con el patrón genérico /:id).
router.patch('/:id/reactivar', CategoriaController.patchReactivarCategoria);

// CRUD 4 completo sobre el recurso categoría.
router.get('/', CategoriaController.getCategorias);
router.get('/:id', CategoriaController.getCategoriaPorId);
router.post('/', CategoriaController.postCategoria);
router.put('/:id', CategoriaController.putCategoria);
router.delete('/:id', CategoriaController.deleteCategoria);

export default router;
