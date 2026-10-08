<script setup>
/**
 * ==========================================================================
 * COMPONENTE SIDEBAR.VUE - TEKZON C.A.
 * ==========================================================================
 *   Este es el menú lateral de navegación del sistema. Agrupa las cuatro vistas del
 *   Módulo de Inventario según el CRUD que implementan, permitiendo al
 *   Administrador y al Almacenista acceder a cada operación.
 * ==========================================================================
 */

const props = defineProps({
  /** Controla la visibilidad del menú en pantallas pequeñas. */
  isOpen: Boolean
});

const emit = defineEmits(['close']);
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--open': isOpen }">
    <!-- Cabecera del menú con el logotipo corporativo -->
    <div class="sidebar__header d-flex align-items-center justify-content-between p-3">
      <div class="logo d-flex align-items-center text-white">
        <img src="../assets/img/logo.svg" alt="Logo TekZon" width="35" height="35" class="me-2" />
        <div>
          <!-- text-white asegura que el título principal brille en blanco puro -->
          <h5 class="mb-0 fw-bold text-white">TekZon</h5>
          <!-- text-white-50 le da el tono platinado/gris claro al subtítulo -->
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

        <li class="nav-item mb-2">
          <small class="text-muted fw-bold text-uppercase" style="font-size: 0.7rem;">General</small>
        </li>
        <li class="nav-item mb-3">
          <a href="#" class="nav-link text-white text-decoration-none">
            <i class="bi bi-grid me-2"></i> Dashboard
          </a>
        </li>

        <!-- ============ MÓDULO INVENTARIO ============ -->
        <li class="nav-item mb-2 mt-2">
          <small class="text-muted fw-bold text-uppercase" style="font-size: 0.7rem;">Inventario</small>
        </li>

        <!-- Catálogo maestro de productos -->
        <li class="nav-item">
          <router-link to="/inventario" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded">
            <i class="bi bi-box-seam me-2"></i> Catálogo de Productos
          </router-link>
        </li>

        <!-- Categorías de productos -->
        <li class="nav-item">
          <router-link to="/categorias" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded">
            <i class="bi bi-tags me-2"></i> Categorías
          </router-link>
        </li>

        <!-- Historial de transacciones -->
        <li class="nav-item">
          <router-link to="/movimientos" class="nav-link text-white text-decoration-none" active-class="active bg-dark rounded">
            <i class="bi bi-arrow-left-right me-2"></i> Entradas y Salidas
          </router-link>
        </li>

        <!-- SECCIÓN OPERACIONES -->
        <li class="nav-item mb-2 mt-4">
          <small class="text-muted fw-bold text-uppercase" style="font-size: 0.7rem;">Operaciones</small>
        </li>
        <li class="nav-item">
          <a href="#" class="nav-link text-white d-flex justify-content-between align-items-center text-decoration-none">
            <span><i class="bi bi-tools me-2"></i> Órdenes de servicio</span>
            <span class="badge bg-info rounded-pill">18</span>
          </a>
        </li>
        <li class="nav-item">
          <a href="#" class="nav-link text-white text-muted d-flex justify-content-between align-items-center text-decoration-none">
            <span><i class="bi bi-cart me-2"></i> Ventas</span>
            <span class="badge bg-secondary" style="font-size: 0.6rem;">FASE II</span>
          </a>
        </li>
      </ul>
    </nav>
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
