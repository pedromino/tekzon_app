<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

// Definimos el evento para comunicarnos con App.vue en la versión móvil
const emit = defineEmits(['toggle-sidebar']);

// Lógica de títulos dinámicos movida aquí para limpiar App.vue
const route = useRoute();

const tituloModulo = computed(() => {
  switch (route.path) {
    case '/movimientos': return 'Entradas y Salidas';
    case '/categorias': return 'Categorías de Productos';
    case '/inventario': default: return 'Inventario';
  }
});

const subtituloModulo = computed(() => {
  switch (route.path) {
    case '/movimientos': return 'Kárdex transaccional · Entradas, salidas y ajustes';
    case '/categorias': return 'Clasificación de agrupación de artículos';
    case '/inventario': default: return 'Catálogo maestro y Ajuste de existencias';
  }
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

    <div class="topbar__title">
      <h1>{{ tituloModulo }}</h1>
      <p>{{ subtituloModulo }}</p>
    </div>

    <div class="topbar__search input-icon d-none d-md-block ms-3">
      <i class="bi bi-search" aria-hidden="true"></i>
      <input class="form-control" type="search" placeholder="Buscar orden, cliente o producto" aria-label="Buscar">
    </div>

    <div class="topbar__actions ms-auto">
      <button class="btn btn-ghost btn-icon has-dot btn-notify" type="button" aria-label="Notificaciones">
        <i class="bi bi-bell fs-5"></i>
      </button>
      <div class="user-chip">
        <span class="avatar avatar--sm">PC</span>
        <div class="user-chip__text">
          <strong>Paola Cordero</strong>
          <span>Administrador</span>
        </div>
      </div>
    </div>
  </header>
</template>