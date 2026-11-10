<script setup>
/**
 * ==========================================================================
 * COMPONENTE TOPBAR (Topbar.vue) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Barra superior del layout autenticado. Muestra:
 *     · El TÍTULO y SUBTÍTULO del módulo activo (leídos de `route.meta`).
 *     · Campana de notificaciones con contador de alertas de stock mínimo (Módulo 4).
 *     · Notificaciones de NUEVOS USUARIOS REGISTRADOS: modal interactivo que
 *       aparece al Administrador para configurar y asignar roles a los nuevos usuarios.
 *     · La FICHA DEL USUARIO de la sesión (Módulo 1) con sus iniciales y rol.
 *
 * PROPÓSITO TÉCNICO:
 *   - Sincroniza en tiempo real las alertas de inventario y los nuevos registros
 *     mediante consultas reactivas a `AlertaStockServices` y `UsuarioServices`.
 *   - Gestiona la apertura programática de modales con `abrirModal` y `cerrarModal`.
 * ==========================================================================
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import AlertaStockServices from '../services/AlertaStockServices.js';
import AutenticacionServices from '../services/AutenticacionServices.js';
import UsuarioServices from '../services/UsuarioServices.js';
import { abrirModal, cerrarModal } from '../utils/utilidadesModales.js';
import { sesion, inicialesUsuario, etiquetaRol, esAdministrador } from '../services/sesion.js';

// Evento que comunica a App.vue la apertura del menú lateral en móvil.
const emit = defineEmits(['toggle-sidebar']);

const route = useRoute();
const router = useRouter();

/** Título del módulo activo (declarado en el `meta` de la ruta). */
const tituloModulo = computed(() => route.meta?.titulo || 'TekZon');

/** Subtítulo explicativo del módulo activo. */
const subtituloModulo = computed(() => route.meta?.subtitulo || 'Sistema de gestión técnica e inventario');

/** Ficha del usuario de la sesión. */
const nombreUsuario = computed(() => sesion.usuario?.nombre || 'Usuario');
const rolUsuario = computed(() => etiquetaRol.value);

// ==========================================================================
// CAMPANA DE ALERTAS DE STOCK (MÓDULO 4)
// ==========================================================================
const alertas = ref([]);
const totalPendientes = ref(0);
const panelAbierto = ref(false);
const cargandoAlertas = ref(false);

let temporizadorNotificaciones = null;

const cargarAlertas = async () => {
  if (!esAdministrador.value) return;
  cargandoAlertas.value = true;
  try {
    const listado = await AlertaStockServices.listarAlertas({ soloPendientes: true });
    alertas.value = listado.slice(0, 5);
    totalPendientes.value = listado.length;
  } catch {
    // Silencio deliberado
  } finally {
    cargandoAlertas.value = false;
  }
};

const alternarPanelAlertas = () => {
  panelAbierto.value = !panelAbierto.value;
  if (panelAbierto.value) cargarAlertas();
};

const irAAlertas = () => {
  panelAbierto.value = false;
  router.push('/alertas');
};

const atenderAlerta = async (alerta) => {
  try {
    await AlertaStockServices.atenderAlerta(alerta.id);
    await cargarAlertas();
  } catch (error) {
    console.error('No se pudo atender la alerta:', error);
  }
};

// ==========================================================================
// NOTIFICACIÓN Y MODAL DE NUEVOS USUARIOS REGISTRADOS
// ==========================================================================
const usuariosPendientes = ref([]);
const totalUsuariosPendientes = ref(0);
const rolesDisponibles = ref([]);
const asignacionesRoles = ref({});
const guardandoRol = ref({});

/**
 * Consulta las solicitudes de nuevos usuarios en espera de rol.
 */
const cargarUsuariosPendientes = async () => {
  if (!esAdministrador.value) return;
  try {
    const [dataPendientes, roles] = await Promise.all([
      UsuarioServices.obtenerPendientes(),
      UsuarioServices.listarRoles()
    ]);

    usuariosPendientes.value = dataPendientes.pendientes || [];
    totalUsuariosPendientes.value = dataPendientes.total || 0;
    rolesDisponibles.value = roles;

    // Asignar rol por defecto (técnico o primer rol) para cada usuario nuevo
    usuariosPendientes.value.forEach((u) => {
      if (!asignacionesRoles.value[u.id_usuario]) {
        const rolPorDefecto = roles.find((r) => r.tipo_usuario === 'tecnico')?.id_rolusuario || roles[0]?.id_rolusuario;
        asignacionesRoles.value[u.id_usuario] = rolPorDefecto;
      }
    });
  } catch {
    // Silencio deliberado
  }
};

/**
 * Abre el modal de notificaciones de nuevos usuarios.
 */
const abrirModalNotificacionUsuarios = async () => {
  await cargarUsuariosPendientes();
  abrirModal('modalNotificacionUsuarios');
};

/**
 * Asigna el rol seleccionado a un nuevo usuario directamente desde el modal.
 */
const asignarRolNuevoUsuario = async (usuario) => {
  const idRol = asignacionesRoles.value[usuario.id_usuario];
  if (!idRol) return;

  guardandoRol.value[usuario.id_usuario] = true;
  try {
    await UsuarioServices.aprobarUsuario(usuario.id_usuario, idRol);
    await cargarUsuariosPendientes();
    if (usuariosPendientes.value.length === 0) {
      cerrarModal('modalNotificacionUsuarios');
    }
  } catch (err) {
    console.error('Error al asignar rol:', err);
  } finally {
    guardandoRol.value[usuario.id_usuario] = false;
  }
};

/**
 * Navega a la pantalla completa de configuración de usuarios.
 */
const irAConfiguracion = () => {
  cerrarModal('modalNotificacionUsuarios');
  router.push('/configuracion');
};

/** CIERRA LA SESIÓN y vuelve a la pantalla de acceso. */
const salirDelSistema = async () => {
  await AutenticacionServices.cerrarSesion();
  router.push('/login');
};

// ==========================================================================
// CICLO DE VIDA
// ==========================================================================
onMounted(() => {
  cargarAlertas();
  cargarUsuariosPendientes();

  // Polling ligero cada 30 segundos
  temporizadorNotificaciones = setInterval(() => {
    cargarAlertas();
    cargarUsuariosPendientes();
  }, 30000);
});

onUnmounted(() => {
  if (temporizadorNotificaciones) clearInterval(temporizadorNotificaciones);
});

watch(() => route.path, () => {
  panelAbierto.value = false;
  cargarAlertas();
  cargarUsuariosPendientes();
});
</script>

<template>
  <header class="topbar d-flex align-items-center px-3">
    <!-- Botón Hamburguesa que emite el evento al padre -->
    <button
      class="btn btn-ghost btn-icon d-md-none me-2"
      type="button"
      @click="emit('toggle-sidebar')"
      aria-label="Abrir menú"
    >
      <i class="bi bi-list fs-4"></i>
    </button>

    <!-- Título dinámico del módulo activo -->
    <div class="topbar__title">
      <h1>{{ tituloModulo }}</h1>
      <p>{{ subtituloModulo }}</p>
    </div>

    <div class="topbar__actions ms-auto position-relative d-flex align-items-center gap-1">
      <!-- ============ NOTIFICACIÓN DE NUEVOS USUARIOS (SOLO ADMINISTRADOR) ============ -->
      <button
        v-if="esAdministrador"
        class="btn btn-ghost btn-icon position-relative me-1"
        type="button"
        :title="totalUsuariosPendientes > 0 ? `${totalUsuariosPendientes} nuevo(s) usuario(s) registrado(s)` : 'Nuevos usuarios'"
        @click="abrirModalNotificacionUsuarios"
      >
        <i class="bi bi-person-fill-exclamation fs-5" :class="{ 'text-warning': totalUsuariosPendientes > 0 }"></i>
        <!-- Insignia amarilla de nuevos usuarios -->
        <span
          v-if="totalUsuariosPendientes > 0"
          class="position-absolute badge rounded-pill bg-warning text-dark fw-bold animate-pulse-badge"
          style="top: 1px; right: 1px; font-size: .65rem; z-index: 3;"
        >
          {{ totalUsuariosPendientes }}
        </span>
      </button>

      <!-- ============ CAMPANA DE ALERTAS DE STOCK (SOLO ADMINISTRADOR) ============ -->
      <button
        v-if="esAdministrador"
        class="btn btn-ghost btn-icon position-relative"
        type="button"
        :aria-label="`Notificaciones: ${totalPendientes} alertas pendientes`"
        @click="alternarPanelAlertas"
      >
        <i class="bi bi-bell fs-5"></i>

        <!-- Punto rojo con el número de alertas pendientes -->
        <span
          v-if="totalPendientes > 0"
          class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
          style="font-size: .6rem;"
        >
          {{ totalPendientes }}
        </span>
      </button>

      <!-- ---- Panel desplegable de alertas ---- -->
      <div
        v-if="panelAbierto"
        class="card-ts position-absolute end-0 mt-2 shadow"
        style="width: 360px; z-index: 1080; top: 100%;"
      >
        <div class="card-ts__head d-flex align-items-center justify-content-between">
          <div>
            <h2 class="card-ts__title">Alertas de stock</h2>
            <p class="card-ts__sub">{{ totalPendientes }} pendiente(s)</p>
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Cerrar panel" @click="panelAbierto = false">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div class="card-ts__body pt-2">
          <!-- Estado cargando -->
          <p v-if="cargandoAlertas" class="text-muted small mb-0">
            <span class="spinner-border spinner-border-sm me-2"></span> Consultando…
          </p>

          <!-- Estado vacío -->
          <p v-else-if="alertas.length === 0" class="text-muted small mb-0">
            <i class="bi bi-check-circle me-1 text-success"></i>
            No hay alertas de stock pendientes.
          </p>

          <!-- Listado de alertas -->
          <ul v-else class="list-unstyled mb-0">
            <li
              v-for="alerta in alertas"
              :key="alerta.id"
              class="d-flex align-items-start gap-2 py-2 border-bottom"
            >
              <i class="bi bi-exclamation-triangle-fill text-danger mt-1"></i>
              <div class="flex-grow-1" style="min-width: 0;">
                <div class="fw-semibold" style="font-size: .8rem;">{{ alerta.producto }}</div>
                <div class="text-muted" style="font-size: .72rem;">
                  Existencia {{ alerta.existencia }} u. · mínimo {{ alerta.stockMinimo }} u.
                </div>
                <div class="text-muted" style="font-size: .7rem;">
                  Origen: {{ alerta.origen === 'SERVICIO_TECNICO' ? 'Servicio Técnico' : 'Venta' }}
                  <span v-if="alerta.documento"> · {{ alerta.documento }}</span>
                </div>
              </div>
              <button
                class="btn btn-sm btn-outline-secondary"
                type="button"
                title="Marcar como atendida"
                @click="atenderAlerta(alerta)"
              >
                <i class="bi bi-check2"></i>
              </button>
            </li>
          </ul>

          <button class="btn btn-primary btn-sm w-100 mt-3" type="button" @click="irAAlertas">
            <i class="bi bi-list-check me-2"></i> Ver todas las alertas
          </button>
        </div>
      </div>
    </div>

    <!-- ============ FICHA DEL USUARIO DE LA SESIÓN (Módulo 1) ============ -->
    <div class="user-chip ms-2">
      <span class="avatar avatar--sm">{{ inicialesUsuario }}</span>
      <div class="user-chip__text">
        <strong>{{ nombreUsuario }}</strong>
        <span>{{ rolUsuario }}</span>
      </div>
      <button
        class="btn btn-ghost btn-icon btn-sm ms-1 btn-logout"
        type="button"
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
        @click="salirDelSistema"
      >
        <i class="bi bi-box-arrow-right"></i>
      </button>
    </div>

    <!-- ==================================================================
         MODAL DE NOTIFICACIONES: ASIGNAR ROL A NUEVOS USUARIOS REGISTRADOS
         ================================================================== -->
    <Teleport to="body">
      <div
        class="modal fade"
        id="modalNotificacionUsuarios"
        tabindex="-1"
        aria-hidden="true"
        style="z-index: 1060;"
      >
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
          <div class="modal-content shadow-lg border-0">
            <div class="modal-header bg-warning text-dark">
              <h5 class="modal-title fw-bold d-flex align-items-center gap-2">
                <i class="bi bi-bell-fill"></i>
                Notificaciones: Nuevos Usuarios Registrados
              </h5>
              <button type="button" class="btn-close" @click="cerrarModal('modalNotificacionUsuarios')"></button>
            </div>
            <div class="modal-body p-4">
              <div v-if="usuariosPendientes.length > 0">
                <div class="alert alert-warning d-flex align-items-center gap-2 mb-3">
                  <i class="bi bi-exclamation-circle-fill fs-5"></i>
                  <div style="font-size: 0.88rem;">
                    Hay <strong>{{ usuariosPendientes.length }} usuario(s) nuevo(s)</strong> que se han registrado en el sistema y están esperando que configure su rol para poder ingresar.
                  </div>
                </div>

                <div class="list-group gap-2">
                  <div
                    v-for="u in usuariosPendientes"
                    :key="u.id_usuario"
                    class="list-group-item list-group-item-action d-flex flex-wrap align-items-center justify-content-between p-3 border rounded shadow-sm"
                  >
                    <div class="me-3 mb-2 mb-md-0">
                      <h6 class="mb-1 fw-bold text-dark">{{ u.nombre_usuario }}</h6>
                      <small class="text-muted font-monospace d-block">
                        <i class="bi bi-person-badge"></i> @{{ u.username }} · ID: #{{ u.id_usuario }}
                      </small>
                    </div>

                    <div class="d-flex align-items-center gap-2 flex-grow-1 flex-md-grow-0">
                      <label class="form-label mb-0 small text-muted fw-semibold">Rol:</label>
                      <select
                        v-model="asignacionesRoles[u.id_usuario]"
                        class="form-select form-select-sm"
                        style="min-width: 140px;"
                      >
                        <option v-for="r in rolesDisponibles" :key="r.id_rolusuario" :value="r.id_rolusuario">
                          {{ r.tipo_usuario }}
                        </option>
                      </select>

                      <button
                        class="btn btn-sm btn-primary d-flex align-items-center gap-1 text-nowrap"
                        type="button"
                        :disabled="guardandoRol[u.id_usuario]"
                        @click="asignarRolNuevoUsuario(u)"
                      >
                        <span v-if="guardandoRol[u.id_usuario]" class="spinner-border spinner-border-sm"></span>
                        <i v-else class="bi bi-check-circle"></i>
                        Asignar Rol
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else class="text-center py-4">
                <i class="bi bi-patch-check-fill text-success display-4 mb-2"></i>
                <h5 class="fw-bold text-dark">No hay usuarios pendientes</h5>
                <p class="text-muted mb-0">Todos los usuarios registrados cuentan con un rol asignado y activo.</p>
              </div>
            </div>
            <div class="modal-footer bg-light d-flex justify-content-between">
              <button class="btn btn-outline-primary btn-sm" type="button" @click="irAConfiguracion">
                <i class="bi bi-gear-fill me-1"></i> Ir al Módulo de Configuración Completo
              </button>
              <button class="btn btn-secondary btn-sm" type="button" @click="cerrarModal('modalNotificacionUsuarios')">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </header>
</template>

<style scoped>
.topbar {
  height: 60px;
  background-color: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  position: relative;
  z-index: 100;
  overflow: visible;
}
.topbar__title h1 {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
  color: #0f172a;
}
.topbar__title p {
  font-size: 0.75rem;
  margin: 0;
  color: #64748b;
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  background-color: #f1f5f9;
}
.user-chip__text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}
.user-chip__text strong {
  font-size: 0.8rem;
  color: #0f172a;
}
.user-chip__text span {
  font-size: 0.7rem;
  color: #64748b;
  text-transform: capitalize;
}
.btn-ghost {
  background: transparent;
  border: none;
  color: #64748b;
}
.btn-ghost:hover {
  background-color: #f1f5f9;
  color: #0f172a;
}
.card-ts {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
}
.card-ts__title {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0;
}
.card-ts__sub {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0;
}

.animate-pulse-badge {
  animation: pulsoBadge 1.8s infinite;
  transform-origin: center center;
}

@keyframes pulsoBadge {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}
</style>
