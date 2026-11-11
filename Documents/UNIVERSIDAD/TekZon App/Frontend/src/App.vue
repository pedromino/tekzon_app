<script setup>
/**
 * ==========================================================================
 * COMPONENTE RAÍZ (App.vue) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Layout principal orquestador del sistema. Decide qué estructura mostrar
 *   según haya o no una SESIÓN INICIADA:
 *
 *     · SIN SESIÓN -> se renderiza la pantalla de Login a pantalla completa
 *       (el layout autenticado con menú lateral no debe aparecer).
 *     · CON SESIÓN -> se renderiza el layout completo:
 *           Menú lateral (Sidebar) + Barra superior (Topbar) + Vistas (router-view)
 *
 * PROPÓSITO TÉCNICO:
 *   - Se comprueba la ruta con `route.meta.publica`: la única ruta pública es
 *     `/login`. Es más fiable que comprobar el token porque durante la
 *     navegación al Login el token ya pudo haberse eliminado.
 *   - Al montar la aplicación se REVALIDA la sesión guardada
 *     (`verificarSesion`): si el token expiró mientras el navegador estaba
 *     cerrado, se cierra la sesión y el guard del router lleva al Login.
 * ==========================================================================
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import Sidebar from './components/Sidebar.vue';
import Topbar from './components/Topbar.vue';
import AutenticacionServices from './services/AutenticacionServices.js';
import { obtenerToken } from './services/sesion.js';

const route = useRoute();

/** Controla la visibilidad del menú lateral en pantallas pequeñas. */
const menuLateralAbierto = ref(false);

/** ¿La ruta actual es pública (la pantalla de Login)? */
const esRutaPublica = computed(() => Boolean(route.meta?.publica));

/** ¿Debe mostrarse el layout autenticado (menú + barra superior)? */
const mostrarLayout = computed(() => !esRutaPublica.value);

const alternarMenuLateral = () => {
  menuLateralAbierto.value = !menuLateralAbierto.value;
};

const cerrarMenuLateral = () => {
  menuLateralAbierto.value = false;
};

// Al recargar la página se revalida el token almacenado contra el backend.
onMounted(async () => {
  if (obtenerToken()) {
    await AutenticacionServices.verificarSesion();
  }
});
</script>

<template>
  <!-- ====================================================================
       CASO 1 · PANTALLA PÚBLICA (LOGIN) A PANTALLA COMPLETA
       ==================================================================== -->
  <router-view v-if="esRutaPublica" />

  <!-- ====================================================================
       CASO 2 · LAYOUT AUTENTICADO (menú + barra + vistas)
       ==================================================================== -->
  <div v-else class="app d-flex">
    <!-- Menú Lateral -->
    <Sidebar :is-open="menuLateralAbierto" @close="cerrarMenuLateral" />

    <!-- Contenedor Principal -->
    <div class="main flex-grow-1">
      <!-- Barra Superior Modularizada -->
      <Topbar @toggle-sidebar="alternarMenuLateral" />

      <!-- Vistas Dinámicas -->
      <router-view />

      <!-- Footer Corporativo -->
      <footer class="app-footer text-center">
        TekZon C.A. · Carrera 28 entre calles 45 y 46, Barquisimeto · IUJO ADS-433 · 2026
      </footer>
    </div>
  </div>
</template>
