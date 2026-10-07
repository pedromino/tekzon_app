<script setup>
defineProps({
  producto: Object,
  cargando: Boolean
});

const emit = defineEmits(['confirmarEliminacion']);
</script>

<template>
  <div class="modal fade" id="deleteModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content p-4 text-center">
        <div class="mb-3 text-danger">
          <div class="rounded-circle bg-danger-subtle d-inline-flex p-3">
            <i class="bi bi-trash3 fs-1"></i>
          </div>
        </div>
        
        <h3 class="fw-bold mb-2">¿Está seguro de eliminar este registro?</h3>
        <p class="text-muted mb-4" v-if="producto">
          Se dará de baja "<strong>{{ producto.nombre }}</strong>" ({{ producto.codigo }}). Esta acción no se puede deshacer.
        </p>

        <div class="d-flex justify-content-center gap-2">
          <button type="button" class="btn btn-outline-secondary px-4" data-bs-dismiss="modal">
            Cancelar
          </button>
          <button 
            type="button" 
            class="btn btn-danger px-4" 
            :disabled="cargando"
            @click="emit('confirmarEliminacion', producto)"
          >
            <span v-if="cargando" class="spinner-border spinner-border-sm me-1" role="status"></span>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>