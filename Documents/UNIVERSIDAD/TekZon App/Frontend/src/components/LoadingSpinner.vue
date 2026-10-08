<script setup>
/**
 * ==========================================================================
 * COMPONENTE DE CARGA (LOADINGSPINNER.VUE)
 * ==========================================================================
 * Muestra un indicador visual animado (spinner)
 */
defineProps({
  mensaje: {
    type: String,
    default: 'Cargando registros...'
  }
});
</script>

<template>
  <div class="empty-state py-5 text-center">
    <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
    <h3>{{ mensaje }}</h3>
    <p class="small text-muted">Sincronizando de forma asíncrona con la base de datos.</p>
  </div>
</template>