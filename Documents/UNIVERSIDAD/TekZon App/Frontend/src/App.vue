<script setup>
/**
 * ==========================================================================
 * COMPONENTE RAÍZ (APP.VUE) - TEKZON C.A.
 * ==========================================================================
 */
import { ref } from 'vue';
import Sidebar from './components/Sidebar.vue';
import InventarioPage from './pages/InventarioPage.vue';

const isSidebarOpen = ref(false);

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value;
};

// NUEVA: Función para cerrar explícitamente el sidebar al presionar la "X"
const closeSidebar = () => {
  isSidebarOpen.value = false;
};
</script>

<template>
  <div class="app d-flex">
    
    <!-- Componente del Menú Lateral (Escuchamos el evento @close) -->
    <Sidebar :is-open="isSidebarOpen" @close="closeSidebar" />

    <!-- Contenedor Principal -->
    <div class="main flex-grow-1">
      
      <!-- Topbar / Barra Superior -->
      <header class="topbar d-flex align-items-center px-3">
        
        <!-- Botón Hamburguesa integrado en la barra -->
        <button 
          class="btn btn-ghost btn-icon d-md-none me-2" 
          type="button" 
          @click="toggleSidebar"
          aria-label="Abrir menú"
        >
          <i class="bi bi-list fs-4"></i>
        </button>

        <div class="topbar__title">
          <h1>Inventario</h1>
          <p>Módulo CRUD · Administrador</p>
        </div>

        <div class="topbar__search input-icon d-none d-md-block ms-3">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input class="form-control" type="search" placeholder="Buscar orden, cliente o producto" aria-label="Buscar">
        </div>

        <div class="topbar__actions ms-auto">
          <button class="btn btn-ghost btn-icon has-dot btn-notify" type="button" aria-label="Notificaciones"><i class="bi bi-bell fs-5"></i></button>
          <div class="user-chip">
            <span class="avatar avatar--sm">PC</span>
            <div class="user-chip__text"><strong>Paola Cordero</strong><span>Administrador</span></div>
          </div>
        </div>
      </header>

      <!-- Vista Dinámica de Inventario -->
      <InventarioPage />

      <!-- Footer Corporativo -->
      <footer class="app-footer text-center">
        TekZon C.A. · Carrera 28 entre calles 45 y 46, Barquisimeto · IUJO ADS-433 · 2026
      </footer>

    </div>
  </div>
</template>