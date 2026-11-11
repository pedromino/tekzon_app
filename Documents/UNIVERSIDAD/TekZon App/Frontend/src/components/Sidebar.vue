<script setup>
/**
 * ==========================================================================
 * COMPONENTE SIDEBAR (Sidebar.vue) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Menú lateral de navegación del sistema. Agrupa TODAS las vistas por módulo,
 *   de modo que el Administrador (único rol de esta fase, con permisos
 *   globales) acceda a cualquier operación desde un solo lugar:
 *
 *     PANEL          · Dashboard (resumen general)
 *     INVENTARIO     · Catálogo, Categorías, Entradas y Salidas  (FASE I)
 *     SERVICIO TÉC.  · Recepción, Panel del Técnico, Dispositivos (MÓDULO 2)
 *     VENTAS Y CAJA  · Venta Directa, Caja, Clientes             (MÓDULOS 2 y 3)
 *     ALMACÉN        · Alertas de Stock                          (MÓDULO 4)
 *
 * PROPÓSITO TÉCNICO:
 *   - La sección "Alertas de Stock" muestra un CONTADOR EN VIVO con el número de
 *     alertas pendientes, alimentado por `AlertaStockServices`.
 *   - La cabecera inferior muestra el usuario REAL de la sesión (Módulo 1) y el
 *     botón de cierre de sesión.
 *   - Se usa `router-link` con `active-class` para que el elemento activo quede
 *     resaltado automáticamente.
 * ==========================================================================
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import AutenticacionServices from '../services/AutenticacionServices.js';
import AlertaStockServices from '../services/AlertaStockServices.js';
import UsuarioServices from '../services/UsuarioServices.js';
import { sesion, inicialesUsuario, etiquetaRol, cerrarSesionLocal, esAdministrador, tieneAccesoRuta } from '../services/sesion.js';

const props = defineProps({
  /** Controla la visibilidad del menú en pantallas pequeñas. */
  isOpen: Boolean
});

const emit = defineEmits(['close']);

const router = useRouter();

/** Cantidad de alertas de stock pendientes (contador del menú). */
const alertasPendientes = ref(0);
/** Cantidad de usuarios en espera de asignación de rol. */
const usuariosPendientes = ref(0);

// Identificador del temporizador que refresca el contador periódicamente.
// Sin él, el contador quedaría desactualizado cuando el descuento de stock lo
// provoca OTRA pantalla (por ejemplo, al cobrar una venta).
let temporizadorAlertas = null;

/**
 * CONSULTA EL NÚMERO DE ALERTAS DE STOCK Y USUARIOS PENDIENTES.
 * Se captura cualquier error para no romper el menú si el backend está caído.
 */
const consultarContadores = async () => {
  if (!esAdministrador.value) return;
  try {
    const [indicadores, pendientes] = await Promise.all([
      AlertaStockServices.obtenerIndicadores().catch(() => ({ pendientes: 0 })),
      UsuarioServices.obtenerPendientes().catch(() => ({ total: 0 }))
    ]);
    alertasPendientes.value = indicadores.pendientes;
    usuariosPendientes.value = pendientes.total;
  } catch {
    // Silencio deliberado: el menú no debe mostrar errores propios.
  }
};

onMounted(() => {
  consultarContadores();

  // Refresco cada 30 segundos (latido ligero de contadores).
  temporizadorAlertas = setInterval(consultarContadores, 30000);
});

onUnmounted(() => {
  // Se libera el temporizador para evitar fugas de memoria.
  if (temporizadorAlertas) clearInterval(temporizadorAlertas);
});

/** Nombre y rol del usuario que tiene la sesión abierta. */
const nombreUsuario = computed(() => sesion.usuario?.nombre || 'Usuario');
const rolUsuario = computed(() => etiquetaRol.value);

/** CIERRA LA SESIÓN y devuelve al usuario a la pantalla de acceso. */
const salirDelSistema = async () => {
  await AutenticacionServices.cerrarSesion();

  // Salvaguarda: si el servicio no limpió el estado, se limpia aquí.
  cerrarSesionLocal();

  emit('close');
  router.push('/login');
};
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--open': isOpen }">
    <!-- Cabecera del menú con el logotipo corporativo -->
    <div class="sidebar__header d-flex align-items-center justify-content-between p-3">
      <div class="logo d-flex align-items-center text-white">
        <img src="../assets/img/logo.svg" alt="Logo TekZon" width="35" height="35" class="me-2" />
        <div>
          <h5 class="mb-0 fw-bold text-white">TekZon</h5>
          <small class="text-white-50" style="font-size: 0.75rem;">GESTIÓN TÉCNICA</small>
        </div>
      </div>
      <button class="btn btn-link text-white d-md-none" @click="emit('close')" aria-label="Cerrar menú">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>

    <!-- Menú de navegación -->
    <nav class="sidebar__nav p-3">
      <ul class="nav flex-column">

        <!-- ======================= GENERAL ======================= -->
        <template v-if="tieneAccesoRuta('/resumen')">
          <li class="nav-item mb-2">
            <small class="text-muted fw-bold text-uppercase" style="font-size: 0.7rem;">General</small>
          </li>
          <li class="nav-item mb-3">
            <router-link to="/resumen" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded">
              <i class="bi bi-grid me-2"></i> Dashboard
            </router-link>
          </li>
        </template>

        <!-- ==================== INVENTARIO Y COMPRAS ==================== -->
        <template v-if="esAdministrador || tieneAccesoRuta('/inventario')">
          <li class="nav-item mb-2 mt-2">
            <small class="text-muted fw-bold text-uppercase" style="font-size: 0.7rem;">Inventario y Compras</small>
          </li>
          <li class="nav-item">
            <router-link to="/inventario" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded" exact-active-class="active bg-dark rounded">
              <i class="bi bi-box-seam me-2"></i> Catálogo de Productos
            </router-link>
          </li>
          <li class="nav-item">
            <router-link to="/categorias" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded">
              <i class="bi bi-tags me-2"></i> Categorías
            </router-link>
          </li>
          <li class="nav-item">
            <router-link to="/movimientos" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded">
              <i class="bi bi-arrow-left-right me-2"></i> Entradas y Salidas
            </router-link>
          </li>
          <li class="nav-item">
            <router-link to="/proveedores" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded">
              <i class="bi bi-truck me-2"></i> Proveedores
            </router-link>
          </li>
        </template>

        <!-- =============== SERVICIO TÉCNICO (MÓDULO 2) =============== -->
        <template v-if="tieneAccesoRuta('/recepcion') || tieneAccesoRuta('/ordenes') || tieneAccesoRuta('/dispositivos')">
          <li class="nav-item mb-2 mt-4">
            <small class="text-muted fw-bold text-uppercase" style="font-size: 0.7rem;">Servicio Técnico</small>
          </li>
          <li v-if="tieneAccesoRuta('/recepcion')" class="nav-item">
            <router-link to="/recepcion" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded">
              <i class="bi bi-clipboard-plus me-2"></i> Recepción de Equipos
            </router-link>
          </li>
          <li v-if="tieneAccesoRuta('/ordenes')" class="nav-item">
            <router-link to="/ordenes" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded">
              <i class="bi bi-tools me-2"></i> Panel del Técnico
            </router-link>
          </li>
          <li v-if="tieneAccesoRuta('/dispositivos')" class="nav-item">
            <router-link to="/dispositivos" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded">
              <i class="bi bi-laptop me-2"></i> Dispositivos
            </router-link>
          </li>
        </template>

        <!-- =============== VENTAS Y CAJA (MÓDULOS 2 y 3) =============== -->
        <template v-if="tieneAccesoRuta('/ventas') || tieneAccesoRuta('/caja') || tieneAccesoRuta('/clientes')">
          <li class="nav-item mb-2 mt-4">
            <small class="text-muted fw-bold text-uppercase" style="font-size: 0.7rem;">Ventas y Caja</small>
          </li>
          <li v-if="tieneAccesoRuta('/ventas')" class="nav-item">
            <router-link to="/ventas" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded">
              <i class="bi bi-cart-check me-2"></i> Venta Directa
            </router-link>
          </li>
          <li v-if="tieneAccesoRuta('/caja')" class="nav-item">
            <router-link to="/caja" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded">
              <i class="bi bi-cash-stack me-2"></i> Caja
            </router-link>
          </li>
          <li v-if="tieneAccesoRuta('/clientes')" class="nav-item">
            <router-link to="/clientes" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded">
              <i class="bi bi-people me-2"></i> Clientes
            </router-link>
          </li>
        </template>

        <!-- ============ ALMACÉN Y ALERTAS (MÓDULO 4) ============ -->
        <template v-if="esAdministrador">
          <li class="nav-item mb-2 mt-4">
            <small class="text-muted fw-bold text-uppercase" style="font-size: 0.7rem;">Almacén</small>
          </li>
          <li class="nav-item">
            <router-link to="/alertas" class="nav-link text-white d-flex justify-content-between align-items-center text-decoration-none" active-class="active bg-dark rounded">
              <span><i class="bi bi-exclamation-triangle me-2"></i> Alertas de Stock</span>
              <!-- Contador en vivo de alertas pendientes -->
              <span v-if="alertasPendientes > 0" class="badge bg-danger rounded-pill">
                {{ alertasPendientes }}
              </span>
            </router-link>
          </li>
        </template>

        <!-- ============ ADMINISTRACIÓN Y CONFIGURACIÓN ============ -->
        <template v-if="esAdministrador">
          <li class="nav-item mb-2 mt-4">
            <small class="text-muted fw-bold text-uppercase" style="font-size: 0.7rem;">Administración</small>
          </li>
          <li class="nav-item">
            <router-link to="/configuracion" class="nav-link text-white d-flex justify-content-between align-items-center text-decoration-none" active-class="active bg-dark rounded">
              <span><i class="bi bi-gear me-2"></i> Permisos de Usuario</span>
              <!-- Contador en vivo de usuarios pendientes de aprobación -->
              <span v-if="usuariosPendientes > 0" class="badge bg-warning text-dark rounded-pill fw-bold">
                {{ usuariosPendientes }}
              </span>
            </router-link>
          </li>
        </template>
      </ul>
    </nav>

    <!-- ============ PIE DEL MENÚ · USUARIO DE LA SESIÓN ============ -->
    <div class="sidebar__foot p-3 border-top border-secondary border-opacity-25">
      <div class="d-flex align-items-center gap-2 mb-2">
        <span class="avatar avatar--sm">{{ inicialesUsuario }}</span>
        <div class="text-white" style="line-height: 1.2; min-width: 0;">
          <div class="fw-semibold text-truncate" style="font-size: .82rem;">{{ nombreUsuario }}</div>
          <small class="text-white-50" style="font-size: .7rem;">{{ rolUsuario }}</small>
        </div>
      </div>
      <button class="btn btn-sm btn-outline-light w-100" type="button" @click="salirDelSistema">
        <i class="bi bi-box-arrow-right me-2"></i> Cerrar sesión
      </button>
    </div>
  </aside>
</template>

<style scoped>
/* Estilos base heredados del sistema de diseño de TekZon */
.sidebar {
  width: 260px;
  background-color: #0b0a08; /* brand-dark */
  min-height: 100vh;
  transition: transform 0.3s ease;
}
.nav-link {
  opacity: 0.8;
  transition: all 0.2s;
  padding: 0.6rem 1rem;
}
.nav-link:hover, .nav-link.active {
  opacity: 1;
  background-color: #087ea4; /* brand-primary */
}
.sidebar.sidebar--open {
  transform: translateX(0);
}
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    z-index: 1050;
    transform: translateX(-100%);
  }
}
</style>
