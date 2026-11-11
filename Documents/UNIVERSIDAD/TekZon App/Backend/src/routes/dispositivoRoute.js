/**
 * ==========================================================================
 * RUTAS DE DISPOSITIVOS (dispositivoRoute.js) - TEKZON C.A.
 * ==========================================================================
 * MÓDULO 2 · EQUIPOS DE LOS CLIENTES (Recepción del taller)
 *
 * PROPÓSITO FUNCIONAL:
 *   Declara los endpoints REST consumidos por `DispositivoServices.js` en Vue 3.
 *
 * PROPÓSITO TÉCNICO:
 *   Router montado por `server.js` bajo el prefijo `/api/dispositivos`.
 *
 *   El orden de declaración es importante: `/:id/transferir` es más específica
 *   que `/:id`, por lo que se declara primero para evitar ambigüedad en Express.
 *
 *   Todas las rutas exigen sesión de Administrador
 *   (`exigirAdministradorAutenticado`).
 * ==========================================================================
 */
import { Router } from 'express';
import { DispositivoController } from '../controllers/dispositivoController.js';
import { permitirRoles } from '../middlewares/autenticacionMiddleware.js';
import { validarCamposRequeridos } from '../middlewares/validatePayload.js';

const router = Router();

// ---- Módulo accesible por Administrador, Técnico y Cajero ----
router.use(...permitirRoles('administrador', 'tecnico', 'cajero'));

// Ruta específica primero (cambio de propietario del equipo).
router.patch('/:id/transferir', DispositivoController.patchTransferirDispositivo);

// CRUD de dispositivos.
router.get('/', DispositivoController.getDispositivos);
router.get('/:id', DispositivoController.getDispositivoPorId);

router.post(
  '/',
  // El tipo de equipo y la marca son imprescindibles; el propietario también.
  validarCamposRequeridos([
    { campo: 'nombre_dis', alternos: ['nombre_dispositivo'], etiqueta: 'tipo de dispositivo' },
    { campo: 'marca', etiqueta: 'marca' },
    { campo: 'cedula_cli', alternos: ['cedula'], etiqueta: 'cédula del propietario' }
  ]),
  DispositivoController.postDispositivo
);

router.put('/:id', DispositivoController.putDispositivo);
router.delete('/:id', DispositivoController.deleteDispositivo);

export default router;
