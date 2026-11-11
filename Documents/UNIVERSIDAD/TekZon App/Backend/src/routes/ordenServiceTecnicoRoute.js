/**
 * ==========================================================================
 * RUTAS DE ORDEN DE SERVICIO TÉCNICO (ordenServiceTecnicoRoute.js) - TEKZON
 * ==========================================================================
 * MÓDULO 2 · SERVICIO TÉCNICO Y CAJA (flujo completo)
 *
 * PROPÓSITO FUNCIONAL:
 *   Declara los endpoints REST del taller consumidos por
 *   `OrdenServiceTecnicoServices.js` en Vue 3.
 *
 * PROPÓSITO TÉCNICO:
 *   Router montado por `server.js` bajo el prefijo `/api/ordenes-tecnicas`.
 *
 *   ORDEN DE DECLARACIÓN (crítico en Express):
 *     Las rutas LITERALES (`/recepcion`, `/indicadores`) y las de SUBRECURSO
 *     (`/:id/estado`, `/:id/repuestos`, `/:id/cobrar`, `/:id/factura`) se
 *     declaran ANTES que la ruta genérica `/:id`. Si se declarara primero
 *     `/:id`, Express interpretaría la palabra "recepcion" como un identificador
 *     de orden y el endpoint de recepción nunca se alcanzaría.
 *
 *   Todas las rutas exigen sesión de Administrador
 *   (`exigirAdministradorAutenticado`).
 * ==========================================================================
 */
import { Router } from 'express';
import { OrdenServiceTecnicoController } from '../controllers/ordenServiceTecnicoController.js';
import { permitirRoles } from '../middlewares/autenticacionMiddleware.js';
import { validarCamposRequeridos } from '../middlewares/validatePayload.js';

const router = Router();

// ---- Módulo accesible por Administrador, Técnico y Cajero ----
router.use(...permitirRoles('administrador', 'tecnico', 'cajero'));

// ==========================================================================
// RUTAS LITERALES Y DE SUBRECURSO (siempre antes de /:id)
// ==========================================================================

/** Recepción: cliente + dispositivo + orden "Pendiente" en una sola operación. */
router.post(
  '/recepcion',
  validarCamposRequeridos([
    { campo: 'cedula_cli', alternos: ['cedula'], etiqueta: 'cédula del cliente' },
    { campo: 'nombre_cliente', alternos: ['nombre'], etiqueta: 'nombre del cliente' },
    { campo: 'apellido_cliente', alternos: ['apellido'], etiqueta: 'apellido del cliente' },
    { campo: 'nombre_dis', alternos: ['tipo_dispositivo'], etiqueta: 'tipo de dispositivo' },
    { campo: 'marca', etiqueta: 'marca del dispositivo' },
    { campo: 'falla_reportada', alternos: ['falla'], etiqueta: 'falla reportada' }
  ]),
  OrdenServiceTecnicoController.postRecepcion
);

/** Lista de técnicos disponibles. */
router.get('/tecnicos', OrdenServiceTecnicoController.getTecnicos);

/** Indicadores KPI del taller. */
router.get('/indicadores', OrdenServiceTecnicoController.getIndicadores);

/** Cambio de estado y diagnóstico (Panel del Técnico). */
router.patch('/:id/estado', OrdenServiceTecnicoController.patchEstado);

/** Consumo de repuestos: descuenta inventario y registra el kádex. */
router.post('/:id/repuestos', OrdenServiceTecnicoController.postRepuesto);
router.delete('/:id/repuestos/:codigoProducto', OrdenServiceTecnicoController.deleteRepuesto);

/** Cobro, facturación y cierre de la orden. */
router.post('/:id/cobrar', OrdenServiceTecnicoController.postCobrar);
router.get('/:id/factura', OrdenServiceTecnicoController.getFactura);

// ==========================================================================
// RUTAS GENÉRICAS (van al final)
// ==========================================================================
router.get('/', OrdenServiceTecnicoController.getOrdenes);
router.get('/:id', OrdenServiceTecnicoController.getOrdenPorId);

export default router;
