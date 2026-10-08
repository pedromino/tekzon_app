<script setup>
/**
 * ==========================================================================
 * COMPONENTE RAÍZ - TEKZON C.A.
 * Layout principal orquestador.
 * ==========================================================================
 */
import { ref } from 'vue';
import Sidebar from './components/Sidebar.vue';
import Topbar from './components/Topbar.vue';

const isSidebarOpen = ref(false);

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value;
};

const closeSidebar = () => {
  isSidebarOpen.value = false;
};
</script>

<template>
  <div class="app d-flex">
    
    <!-- Menú Lateral -->
    <Sidebar :is-open="isSidebarOpen" @close="closeSidebar" />

    <!-- Contenedor Principal -->
    <div class="main flex-grow-1">
      
      <!-- Barra Superior Modularizada -->
      <Topbar @toggle-sidebar="toggleSidebar" />

      <!-- Vistas Dinámicas -->
      <router-view />

      <!-- Footer Corporativo -->
      <footer class="app-footer text-center">
        TekZon C.A. · Carrera 28 entre calles 45 y 46, Barquisimeto · IUJO ADS-433 · 2026
      </footer>

    </div>
  </div>
</template>