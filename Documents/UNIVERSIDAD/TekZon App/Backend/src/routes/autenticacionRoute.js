/**
 * ==========================================================================
 * RUTAS DE AUTENTICACIÓN (autenticacionRoute.js) - TEKZON C.A.
 * ==========================================================================
 * MÓDULO 1 · USUARIO (LOGIN) · Rol Administrador
 *
 * PROPÓSITO FUNCIONAL:
 *   Declara los endpoints del inicio de sesión consumidos por
 *   `AutenticacionServices.js` en Vue 3.
 *
 * PROPÓSITO TÉCNICO:
 *   Router montado por `server.js` bajo el prefijo `/api/autenticacion`.
 *   `POST /login` es la ÚNICA ruta pública del módulo (debe serlo: es la puerta
 *   de entrada). Las demás exigen un token válido mediante `exigirSesion`.
 *
 *   | Método | Ruta                             | Protegida | Acción                  |
 *   |--------|----------------------------------|-----------|-------------------------|
 *   | POST   | /api/autenticacion/login         | No        | Iniciar sesión          |
 *   | GET    | /api/autenticacion/perfil        | Sí        | Usuario de la sesión    |
 *   | GET    | /api/autenticacion/verificar     | Sí        | Estado de la sesión     |
 *   | POST   | /api/autenticacion/cerrar-sesion | Sí        | Cerrar sesión           |
 * ==========================================================================
 */
import { Router } from 'express';
import { AutenticacionController } from '../controllers/autenticacionController.js';
import { exigirSesion } from '../middlewares/autenticacionMiddleware.js';
import { validarCamposRequeridos } from '../middlewares/validatePayload.js';

const router = Router();

// ---- RUTAS PÚBLICAS: inicio de sesión y autoregistro ----
// Se valida de forma temprana que lleguen las credenciales, evitando que un
// payload incompleto llegue hasta la capa de servicios.
router.post(
  '/login',
  validarCamposRequeridos([
    { campo: 'username', alternos: ['usuario'], etiqueta: 'nombre de usuario' },
    { campo: 'contrasenia', alternos: ['password'], etiqueta: 'contraseña' }
  ]),
  AutenticacionController.postLogin
);

router.post(
  '/registrar',
  validarCamposRequeridos([
    { campo: 'nombre_usuario', alternos: ['nombre'], etiqueta: 'nombre completo' },
    { campo: 'username', alternos: ['usuario'], etiqueta: 'nombre de usuario' },
    { campo: 'contrasenia', alternos: ['password'], etiqueta: 'contraseña' }
  ]),
  AutenticacionController.postRegistrar
);

// ---- RUTAS PROTEGIDAS: requieren token de sesión válido ----
router.get('/perfil', exigirSesion, AutenticacionController.getPerfil);
router.get('/verificar', exigirSesion, AutenticacionController.getVerificar);
router.post('/cerrar-sesion', exigirSesion, AutenticacionController.postCerrarSesion);

export default router;
