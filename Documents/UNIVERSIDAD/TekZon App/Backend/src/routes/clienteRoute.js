/**
 * ==========================================================================
 * RUTAS DE CLIENTES (clienteRoute.js) - TEKZON C.A.
 * ==========================================================================
 * MÓDULO 2 · CARTERA DE CLIENTES (Recepción y Mostrador)
 *
 * PROPÓSITO FUNCIONAL:
 *   Declara los endpoints REST consumidos por `ClienteServices.js` en Vue 3.
 *
 * PROPÓSITO TÉCNICO:
 *   Router montado por `server.js` bajo el prefijo `/api/clientes`.
 *
 *   TODAS las rutas están protegidas con `exigirAdministradorAutenticado`
 *   (sesión válida + rol Administrador), porque los datos personales de los
 *   clientes son información sensible que sólo el rol con permisos globales
 *   debe poder consultar o modificar.
 *
 *   La ruta `/:cedula/historial` se declara ANTES de `/:cedula` por claridad
 *   semántica; Express distingue ambas por el número de segmentos de la URL.
 * ==========================================================================
 */
import { Router } from 'express';
import { ClienteController } from '../controllers/clienteController.js';
import { permitirRoles } from '../middlewares/autenticacionMiddleware.js';
import { validarCamposRequeridos } from '../middlewares/validatePayload.js';

const router = Router();

// ---- Módulo accesible por Administrador, Cajero y Técnico ----
router.use(...permitirRoles('administrador', 'cajero', 'tecnico'));

// Ruta específica con subrecurso (historial de equipos y facturas).
router.get('/:cedula/historial', ClienteController.getHistorialCliente);

// CRUD de clientes.
router.get('/', ClienteController.getClientes);
router.get('/:cedula', ClienteController.getClientePorCedula);

router.post(
  '/',
  // Validación temprana: la cédula, el nombre y el apellido son obligatorios.
  validarCamposRequeridos([
    { campo: 'cedula_cli', alternos: ['cedula'], etiqueta: 'cédula' },
    { campo: 'nombre_cliente', alternos: ['nombre'], etiqueta: 'nombre' },
    { campo: 'apellido_cliente', alternos: ['apellido'], etiqueta: 'apellido' }
  ]),
  ClienteController.postCliente
);

router.put('/:cedula', ClienteController.putCliente);
router.delete('/:cedula', ClienteController.deleteCliente);

export default router;
