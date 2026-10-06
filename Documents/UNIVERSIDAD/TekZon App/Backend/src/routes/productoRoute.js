import { Router } from 'express';
import { ProductoController } from '../controllers/productoController.js';

const router = Router();

router.get('/', ProductoController.getProductos);
router.get('/:id', ProductoController.getProductoById);
router.post('/', ProductoController.createProducto);
router.put('/:id', ProductoController.updateProducto);
router.delete('/:id', ProductoController.deleteProducto);

export default router;