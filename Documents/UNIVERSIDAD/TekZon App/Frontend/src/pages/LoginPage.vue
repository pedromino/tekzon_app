<script setup>
/**
 * ==========================================================================
 * PÁGINA DE INICIO DE SESIÓN (LoginPage.vue) - TEKZON C.A.
 * ==========================================================================
 * MÓDULO 1 · USUARIO (LOGIN) · Rol Administrador
 *
 * PROPÓSITO FUNCIONAL:
 *   Puerta de entrada al sistema. Solicita el usuario y la contraseña, los
 *   valida contra el backend y, si son correctos, entrega el control al Panel
 *   del sistema (Inventario, Servicio Técnico, Venta Directa, etc.).
 *
 * PROPÓSITO TÉCNICO:
 *   Implementa los 3 estados de interfaz exigidos por la cátedra:
 *     · CARGANDO -> el botón se deshabilita y muestra un spinner mientras se
 *       espera la respuesta del API (evita el doble envío del formulario).
 *     · ÉXITO    -> se guarda el token en `services/sesion.js` y se navega a la
 *       ruta solicitada (o al catálogo), mostrando un Toast de bienvenida.
 *     · ERROR    -> panel de error rojo con el CÓDIGO HTTP y el mensaje que
 *       devolvió el backend (401 credenciales, 403 rol, 400 datos, 0 red).
 *
 *   VALIDACIÓN EN EL CLIENTE: se comprueba que los campos no estén vacíos antes
 *   de llamar al API, para no gastar una petición en un formulario incompleto.
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';

import AutenticacionServices from '../services/AutenticacionServices.js';
import UsuarioServices from '../services/UsuarioServices.js';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import { sesion, rutaInicioSegunRol, tieneAccesoRuta } from '../services/sesion.js';
import { describirError } from '../services/formato.js';

const router = useRouter();
const route = useRoute();

// ==========================================================================
// ESTADO DEL FORMULARIO
// ==========================================================================
const credenciales = ref({
  username: '',
  contrasenia: ''
});

/** Visibilidad de la contraseña (botón del ojo). */
const mostrarContrasenia = ref(false);

/** Estado de UI: true mientras se espera la respuesta del servidor. */
const enviando = ref(false);

/** Errores de validación por campo (se pintan bajo cada input). */
const erroresCampo = ref({ username: '', contrasenia: '' });

/** Error devuelto por el backend (panel rojo con el código HTTP). */
const errorServidor = ref(null);

/** Notificaciones Toast. */
const notificaciones = ref([]);

// ==========================================================================
// ESTADO DE AUTOREGISTRO PÚBLICO
// ==========================================================================
const modoRegistro = ref(false);
const datosRegistro = ref({
  nombre_usuario: '',
  username: '',
  contrasenia: '',
  confirmarContrasenia: ''
});
const mensajeExitoRegistro = ref('');

const limpiarFormularioRegistro = () => {
  datosRegistro.value = {
    nombre_usuario: '',
    username: '',
    contrasenia: '',
    confirmarContrasenia: ''
  };
};

const enviarRegistro = async () => {
  limpiarErrores();
  mensajeExitoRegistro.value = '';

  const { nombre_usuario, username, contrasenia, confirmarContrasenia } = datosRegistro.value;

  if (!nombre_usuario.trim()) {
    mostrarToast('Validación', 'Debe indicar su nombre completo.', 'warning');
    return;
  }
  if (!username.trim()) {
    mostrarToast('Validación', 'Debe indicar un nombre de usuario.', 'warning');
    return;
  }
  if (!contrasenia || contrasenia.length < 6) {
    mostrarToast('Validación', 'La contraseña debe tener mínimo 6 caracteres.', 'warning');
    return;
  }
  if (contrasenia !== confirmarContrasenia) {
    mostrarToast('Validación', 'Las contraseñas no coinciden.', 'warning');
    return;
  }

  enviando.value = true;
  try {
    const res = await UsuarioServices.registrarSolicitud({
      nombre_usuario: nombre_usuario.trim(),
      username: username.trim(),
      contrasenia
    });

    mensajeExitoRegistro.value = res.mensaje || '¡Solicitud enviada! Su cuenta quedó en espera de que el Administrador le asigne un rol.';
    mostrarToast('Registro recibido', 'Su solicitud fue enviada al Administrador.', 'success');
    limpiarFormularioRegistro();
    modoRegistro.value = false;
  } catch (error) {
    errorServidor.value = {
      codigo: error.codigoHttp || 'Error en registro',
      mensaje: error.mensaje || 'No se pudo completar el registro.'
    };
    mostrarToast('Error al registrar', error.mensaje || 'No se pudo enviar el registro.', 'danger');
  } finally {
    enviando.value = false;
  }
};

// ==========================================================================
// SISTEMA DE NOTIFICACIONES TOAST
// ==========================================================================
const mostrarToast = (titulo, mensaje, tipo = 'success') => {
  const id = Date.now() + Math.random();

  notificaciones.value.push({ id, titulo, mensaje, tipo });

  // El Toast se retira solo después de 4 segundos.
  setTimeout(() => {
    notificaciones.value = notificaciones.value.filter((toast) => toast.id !== id);
  }, 4000);
};

const cerrarToastPorId = (id) => {
  notificaciones.value = notificaciones.value.filter((toast) => toast.id !== id);
};

/** Indica si hay un aviso de sesión expirada en la URL (?sesion=expirada). */
const sesionExpirada = computed(() => route.query.sesion === 'expirada');

/**
 * MENSAJE DE AVISO INICIAL.
 * Si el usuario llegó aquí porque su token expiró, se le explica el motivo.
 */
onMounted(() => {
  if (sesionExpirada.value) {
    mostrarToast(
      'Sesión finalizada',
      'Su sesión expiró o fue cerrada. Inicie sesión nuevamente para continuar.',
      'warning'
    );
  }
});

// ==========================================================================
// VALIDACIÓN Y ENVÍO
// ==========================================================================

/** Limpia el formulario de los errores previos. */
const limpiarErrores = () => {
  erroresCampo.value = { username: '', contrasenia: '' };
  errorServidor.value = null;
  sesion.ultimoError = null;
};

/**
 * VALIDA EL FORMULARIO EN EL CLIENTE.
 * @returns {boolean} true si los datos están completos.
 */
const validarFormulario = () => {
  const errores = { username: '', contrasenia: '' };

  if (!credenciales.value.username.trim()) {
    errores.username = 'El nombre de usuario es obligatorio.';
  }

  if (!credenciales.value.contrasenia) {
    errores.contrasenia = 'La contraseña es obligatoria.';
  }

  erroresCampo.value = errores;

  return !errores.username && !errores.contrasenia;
};

/**
 * INICIA SESIÓN.
 * PROPÓSITO TÉCNICO: el servicio guarda el token y publica el usuario en el
 * estado global; después se navega a la ruta que el usuario intentaba abrir
 * (`?redirigir=`) o al catálogo de productos.
 */
const iniciarSesion = async () => {
  limpiarErrores();

  // ---- 1. Validación en el cliente ----
  if (!validarFormulario()) {
    mostrarToast('Datos incompletos', 'Complete su usuario y contraseña.', 'warning');
    return;
  }

  enviando.value = true;

  try {
    // ---- 2. Llamada al backend (POST /api/autenticacion/login) ----
    const resultado = await AutenticacionServices.iniciarSesion({
      username: credenciales.value.username.trim(),
      contrasenia: credenciales.value.contrasenia
    });

    // ---- 3. ÉXITO ----
    mostrarToast('Acceso concedido', resultado.mensaje || 'Bienvenido al sistema.', 'success');

    // Se respeta la ruta solicitada si su rol tiene acceso; de lo contrario se envía a su módulo inicial
    const rutaSolicitada = route.query.redirigir;
    const rutaPorDefecto = rutaInicioSegunRol(resultado.usuario?.rol);
    const rutaDestino = (rutaSolicitada && tieneAccesoRuta(rutaSolicitada, resultado.usuario?.rol))
      ? rutaSolicitada
      : rutaPorDefecto;

    // Pequeña espera para que el usuario alcance a ver el Toast de bienvenida.
    setTimeout(() => router.push(rutaDestino), 450);
  } catch (error) {
    // ---- 4. ERROR: se traduce el código HTTP a un mensaje visible ----
    const descripcion = describirError(error);

    errorServidor.value = descripcion;
    sesion.ultimoError = descripcion.mensaje;

    mostrarToast('No se pudo iniciar sesión', descripcion.mensaje, 'error');
  } finally {
    // Se restaura el botón pase lo que pase (éxito o error).
    enviando.value = false;
  }
};
</script>

<template>
  <div class="auth">
    <!-- ==================================================================
         COLUMNA IZQUIERDA · PRESENTACIÓN CORPORATIVA
         ================================================================== -->
    <section class="auth__visual">
      <div class="brand-word">
        <div class="d-flex align-items-center gap-2">
          <img src="../assets/img/logo.svg" alt="Logo TekZon" width="42" height="42" />
          <div>
            TekZon
            <small>Gestión técnica e inventario</small>
          </div>
        </div>
      </div>

      <div class="auth__quote">
        <h2>Controle su inventario, su taller y su facturación en un solo sistema.</h2>
        <p class="mt-3">
          Recepción de equipos, órdenes de servicio técnico, consumo de repuestos,
          venta directa de mostrador y alertas automáticas de stock mínimo.
        </p>

        <!-- Módulos disponibles (resumen de la entrega) -->
        <div class="auth__features">
          <span><i class="bi bi-box-seam"></i> Inventario</span>
          <span><i class="bi bi-tools"></i> Servicio Técnico</span>
          <span><i class="bi bi-cart-check"></i> Venta Directa</span>
          <span><i class="bi bi-bell"></i> Alertas de Stock</span>
        </div>
      </div>

      <p class="mb-0" style="font-size: .78rem; color: rgba(255,255,255,.65);">
        TekZon C.A. · Barquisimeto
      </p>
    </section>

    <!-- ==================================================================
         COLUMNA DERECHA · FORMULARIO DE ACCESO
         ================================================================== -->
    <section class="auth__panel">
      <div class="auth-card">
        <div class="auth-card__logo">
          <img src="../assets/img/logo.svg" alt="Logo TekZon" />
          <div class="brand-word" style="font-size: 1.35rem;">
            TekZon
            <small>Sistema de gestión</small>
          </div>
        </div>

        <!-- Pestañas de modo: Iniciar Sesión / Registro -->
        <div class="btn-group w-100 mb-3" role="group">
          <button
            type="button"
            class="btn btn-sm"
            :class="!modoRegistro ? 'btn-primary' : 'btn-outline-secondary'"
            @click="modoRegistro = false; limpiarErrores();"
          >
            <i class="bi bi-box-arrow-in-right me-1"></i> Iniciar sesión
          </button>
          <button
            type="button"
            class="btn btn-sm"
            :class="modoRegistro ? 'btn-primary' : 'btn-outline-secondary'"
            @click="modoRegistro = true; limpiarErrores();"
          >
            <i class="bi bi-person-plus me-1"></i> Solicitar registro
          </button>
        </div>

        <h1 v-if="!modoRegistro">Iniciar sesión</h1>
        <h1 v-else>Solicitud de registro</h1>

        <p v-if="!modoRegistro" class="lead-sm">
          Ingrese con su cuenta para acceder a los módulos autorizados del sistema.
        </p>
        <p v-else class="lead-sm">
          Complete sus datos. Su cuenta quedará registrada y el <strong>Administrador</strong> le asignará su rol correspondiente.
        </p>

        <!-- Mensaje de éxito de autoregistro -->
        <div v-if="mensajeExitoRegistro" class="alert alert-success d-flex align-items-start gap-2 py-2 px-3 mb-3">
          <i class="bi bi-check-circle-fill text-success mt-1"></i>
          <div style="font-size: .82rem;">
            {{ mensajeExitoRegistro }}
          </div>
        </div>

        <!-- Aviso de sesión expirada (también se notifica por Toast) -->
        <div v-if="sesionExpirada && !modoRegistro" class="alert alert-warning d-flex align-items-start gap-2 py-2 px-3 mb-3">
          <i class="bi bi-clock-history mt-1"></i>
          <div style="font-size: .8rem;">
            Su sesión anterior expiró por seguridad. Vuelva a identificarse.
          </div>
        </div>

        <!-- ============================================================
             PANEL DE ERROR DEL SERVIDOR (estado de Error de la interfaz)
             ============================================================ -->
        <div v-if="errorServidor" class="alert alert-danger py-2 px-3 mb-3">
          <div class="d-flex align-items-center gap-2 mb-1">
            <i class="bi bi-exclamation-octagon"></i>
            <strong style="font-size: .85rem;">{{ errorServidor.codigo }}</strong>
          </div>
          <p class="mb-0" style="font-size: .82rem;">{{ errorServidor.mensaje }}</p>
        </div>

        <!-- ============================================================
             FORMULARIO 1: INICIO DE SESIÓN
             ============================================================ -->
        <form v-if="!modoRegistro" novalidate @submit.prevent="iniciarSesion">
          <!-- ---- Usuario ---- -->
          <div class="mb-3">
            <label for="usuario" class="form-label">Nombre de usuario</label>
            <div class="input-icon">
              <i class="bi bi-person" aria-hidden="true"></i>
              <input
                id="usuario"
                v-model="credenciales.username"
                type="text"
                class="form-control"
                :class="{ 'is-invalid': erroresCampo.username }"
                placeholder="Nombre de usuario"
                autocomplete="username"
                :disabled="enviando"
              />
            </div>
            <div v-if="erroresCampo.username" class="invalid-feedback d-block">
              {{ erroresCampo.username }}
            </div>
          </div>

          <!-- ---- Contraseña ---- -->
          <div class="mb-3">
            <label for="contrasenia" class="form-label">Contraseña</label>
            <div class="input-icon">
              <i class="bi bi-shield-lock" aria-hidden="true"></i>
              <input
                id="contrasenia"
                v-model="credenciales.contrasenia"
                :type="mostrarContrasenia ? 'text' : 'password'"
                class="form-control"
                :class="{ 'is-invalid': erroresCampo.contrasenia }"
                placeholder="••••••••"
                autocomplete="current-password"
                :disabled="enviando"
                style="padding-right: 2.75rem;"
              />
              <!-- Botón para mostrar/ocultar la contraseña -->
              <button
                type="button"
                class="btn btn-link position-absolute end-0 top-50 translate-middle-y text-muted"
                style="z-index: 3;"
                :aria-label="mostrarContrasenia ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                @click="mostrarContrasenia = !mostrarContrasenia"
              >
                <i :class="mostrarContrasenia ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
              </button>
            </div>
            <div v-if="erroresCampo.contrasenia" class="invalid-feedback d-block">
              {{ erroresCampo.contrasenia }}
            </div>
          </div>

          <!-- ---- Botón de envío (estado CARGANDO) ---- -->
          <button type="submit" class="btn btn-primary w-100" :disabled="enviando">
            <span
              v-if="enviando"
              class="spinner-border spinner-border-sm me-2"
              role="status"
              aria-hidden="true"
            ></span>
            <i v-else class="bi bi-box-arrow-in-right me-2"></i>
            {{ enviando ? 'Verificando credenciales…' : 'Entrar al sistema' }}
          </button>
        </form>

        <!-- ============================================================
             FORMULARIO 2: AUTOREGISTRO PÚBLICO
             ============================================================ -->
        <form v-else novalidate @submit.prevent="enviarRegistro">
          <div class="mb-3">
            <label class="form-label">Nombre Completo</label>
            <div class="input-icon">
              <i class="bi bi-card-heading"></i>
              <input
                v-model="datosRegistro.nombre_usuario"
                type="text"
                class="form-control"
                placeholder="Ej. Pedro Pérez"
                :disabled="enviando"
              />
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label">Nombre de Usuario (Login)</label>
            <div class="input-icon">
              <i class="bi bi-person"></i>
              <input
                v-model="datosRegistro.username"
                type="text"
                class="form-control"
                placeholder="ej. pperez"
                :disabled="enviando"
              />
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label">Contraseña</label>
            <div class="input-icon">
              <i class="bi bi-shield-lock"></i>
              <input
                v-model="datosRegistro.contrasenia"
                type="password"
                class="form-control"
                placeholder="Mínimo 6 caracteres"
                :disabled="enviando"
              />
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label">Confirmar Contraseña</label>
            <div class="input-icon">
              <i class="bi bi-check2-circle"></i>
              <input
                v-model="datosRegistro.confirmarContrasenia"
                type="password"
                class="form-control"
                placeholder="Repita su contraseña"
                :disabled="enviando"
              />
            </div>
          </div>

          <button type="submit" class="btn btn-success w-100 mb-2" :disabled="enviando">
            <span
              v-if="enviando"
              class="spinner-border spinner-border-sm me-2"
              role="status"
              aria-hidden="true"
            ></span>
            <i v-else class="bi bi-person-check me-2"></i>
            {{ enviando ? 'Enviando registro…' : 'Registrar mi solicitud' }}
          </button>
        </form>
      </div>
    </section>

    <!-- Pila de notificaciones Toast -->
    <ToastNotificaciones :notificaciones="notificaciones" @cerrar="cerrarToastPorId" />
  </div>
</template>
