<script setup>
/**
 * ==========================================================================
 * COMPONENTE TOAST NOTIFICACIONES (TOASTNOTIFICACIONES.VUE)
 * ==========================================================================
 */
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  notificaciones: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['cerrar']);

// Diccionario interno para manejar los segundos restantes de cada toast activo
const tiemposRestantes = ref({});
let intervalo = null;

onMounted(() => {
  intervalo = setInterval(() => {
    props.notificaciones.forEach(t => {
      if (tiemposRestantes.value[t.id] === undefined) {
        tiemposRestantes.value[t.id] = 4; // Duración total en segundos
      } else if (tiemposRestantes.value[t.id] > 0) {
        tiemposRestantes.value[t.id]--;
      }
    });
  }, 1000);
});

onUnmounted(() => {
  if (intervalo) clearInterval(intervalo);
});

const cerrarToast = (id) => {
  emit('cerrar', id);
};
</script>

<template>
  <div class="toast-stack">
    <div 
      v-for="toast in notificaciones" 
      :key="toast.id" 
      class="toast-ts"
      :class="[toast.tipo]"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <!-- Icono dinámico -->
      <i class="bi" :class="{
        'bi-check-circle-fill': toast.tipo === 'success',
        'bi-exclamation-triangle-fill': toast.tipo === 'warning' || toast.tipo === 'error',
        'bi-info-circle-fill': toast.tipo === 'info'
      }"></i>

      <!-- Cuerpo del mensaje -->
      <div class="toast-ts__body">
        <strong>{{ toast.titulo }}</strong>
        <p>{{ toast.mensaje }}</p>
      </div>

      <!-- Temporizador numérico dinámico y botón cerrar -->
      <div class="d-flex align-items-center gap-2">
        <span class="toast-ts__timer">{{ tiemposRestantes[toast.id] !== undefined ? tiemposRestantes[toast.id] : 4 }}s</span>
        <button 
          type="button" 
          class="toast-ts__close" 
          @click="cerrarToast(toast.id)"
          aria-label="Cerrar"
        >
          <i class="bi bi-x fs-6"></i>
        </button>
      </div>

      <!-- Barra de progreso con animación CSS de 4 segundos -->
      <div class="toast-ts__progress animate-progress"></div>
    </div>
  </div>
</template>

<style scoped>
@keyframes shrinkProgress {
  from { width: 100%; }
  to { width: 0%; }
}

.animate-progress {
  animation: shrinkProgress 4s linear forwards;
}
</style>