/**
 * ==========================================================================
 * RUTAS DE USUARIOS Y CONFIGURACIÓN (usuarioRoute.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Enrutador Express · Módulo de Configuración del Sistema
 *
 * PROPÓSITO FUNCIONAL:
 *   Define los endpoints para que el usuario Administrador gestione todos los
 *   usuarios del sistema:
 *     · Listar usuarios activos/inactivos y solicitudes pendientes.
 *     · Notificaciones de nuevos registros para asignación de rol.
 *     · Creación, actualización, cambio de contraseña y deshabilitación.
 *
 * PROPÓSITO TÉCNICO:
 *   · Todas las rutas están aseguradas por `exigirAdministradorAutenticado`.
 *   · Se definen las rutas específicas (`/pendientes`, `/roles`) antes de
 *     las rutas con parámetros dinámicos (`/:id`) para evitar colisiones.
 * ==========================================================================
 */
import { Router } from 'express';
import { UsuarioController } from '../controllers/usuarioController.js';
import { exigirAdministradorAutenticado } from '../middlewares/autenticacionMiddleware.js';
import { validarCamposRequeridos } from '../middlewares/validatePayload.js';

const router = Router();

// Todas las rutas de administración de usuarios exigen rol Administrador
router.use(...exigirAdministradorAutenticado);

// 1. Solicitudes de aprobación y catálogo de roles
router.get('/pendientes', UsuarioController.getPendientes);
router.get('/roles', UsuarioController.getRoles);

// 2. Operaciones específicas sobre usuarios
router.patch(
  '/:id/estado',
  validarCamposRequeridos([
    { campo: 'estado', etiqueta: 'estado (1 o 0)' }
  ]),
  UsuarioController.patchEstado
);

router.patch(
  '/:id/aprobar',
  validarCamposRequeridos([
    { campo: 'id_rolusuario', alternos: ['rol', 'id_rol'], etiqueta: 'rol a asignar' }
  ]),
  UsuarioController.patchAprobar
);

router.patch('/:id/rechazar', UsuarioController.patchRechazar);

router.patch(
  '/:id/contrasenia',
  validarCamposRequeridos([
    { campo: 'contrasenia', alternos: ['nuevaContrasenia', 'password'], etiqueta: 'nueva contraseña' }
  ]),
  UsuarioController.patchContrasenia
);

// 3. CRUD general de usuarios
router.get('/', UsuarioController.getUsuarios);

router.post(
  '/',
  validarCamposRequeridos([
    { campo: 'nombre_usuario', alternos: ['nombre'], etiqueta: 'nombre completo' },
    { campo: 'username', alternos: ['usuario'], etiqueta: 'nombre de usuario' },
    { campo: 'contrasenia', alternos: ['password'], etiqueta: 'contraseña' },
    { campo: 'id_rolusuario', alternos: ['rol', 'id_rol'], etiqueta: 'rol' }
  ]),
  UsuarioController.postUsuario
);

router.put('/:id', UsuarioController.putUsuario);

router.delete('/:id', UsuarioController.deleteUsuario);

export default router;
