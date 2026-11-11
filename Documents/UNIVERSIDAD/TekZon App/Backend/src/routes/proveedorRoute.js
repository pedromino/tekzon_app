/**
 * ==========================================================================
 * RUTAS DE PROVEEDORES (proveedorRoute.js) - TEKZON C.A.
 * ==========================================================================
 * MÓDULO DE PROVEEDORES
 * ==========================================================================
 */
import { Router } from 'express';
import { ProveedorController } from '../controllers/proveedorController.js';
import { permitirRoles } from '../middlewares/autenticacionMiddleware.js';

const router = Router();

// Módulo accesible para usuarios autenticados con rol Administrador o Almacenista (y Cajero/Técnico para consultas si aplica)
router.use(...permitirRoles('administrador', 'almacenista', 'cajero', 'tecnico'));

router.get('/', ProveedorController.getProveedores);
router.get('/:rif', ProveedorController.getProveedorPorRif);

// Modificaciones solo para administrador y almacenista
router.post('/', ...permitirRoles('administrador', 'almacenista'), ProveedorController.postProveedor);
router.put('/:rif', ...permitirRoles('administrador', 'almacenista'), ProveedorController.putProveedor);
router.patch('/:rif/estado', ...permitirRoles('administrador', 'almacenista'), ProveedorController.patchEstado);

export default router;
