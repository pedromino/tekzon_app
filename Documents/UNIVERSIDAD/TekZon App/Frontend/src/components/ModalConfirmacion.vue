<script setup>

import { computed } from 'vue';

const props = defineProps({
  /** Identificador único del modal en el DOM (permite varios en una página). */
  idModal: {
    type: String,
    default: 'modalConfirmacion'
  },
  /** Título que se muestra en la cabecera del modal. */
  titulo: {
    type: String,
    default: 'Confirmar acción'
  },
  /** Mensaje principal; admite texto plano. */
  mensaje: {
    type: String,
    default: '¿Está seguro de continuar con esta operación?'
  },
  /** Texto secundario de apoyo (consecuencias, advertencias, etc.). */
  detalle: {
    type: String,
    default: ''
  },
  /** Texto del botón que confirma la operación. */
  textoConfirmar: {
    type: String,
    default: 'Sí, confirmar'
  },
  /** Texto del botón que cancela la operación. */
  textoCancelar: {
    type: String,
    default: 'Cancelar'
  },
  /**
   * Variante visual Bootstrap del botón de confirmación:
   * 'primary' (modificación), 'danger' (destructiva) o 'warning' (ajuste).
   */
  variante: {
    type: String,
    default: 'primary'
  },
  /** Icono de Bootstrap Icons mostrado en el círculo superior. */
  icono: {
    type: String,
    default: 'bi-question-circle'
  },
  /** Estado de Carga: true mientras la petición está en curso. */
  procesando: {
    type: Boolean,
    default: false
  },
  /** Deshabilita el botón de confirmación por reglas de negocio del padre. */
  deshabilitado: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['confirmar', 'cancelar']);

/**
 * Clase del botón de confirmación según la variante elegida.
 * Se calcula aquí para que las páginas no repitan esta lógica.
 */
const claseBotonConfirmar = computed(() => `btn btn-${props.variante}`);

/**
 * Tono del círculo del icono. Las variantes destructivas usan el rojo
 * corporativo y las modificaciones el azul de marca.
 */
const claseIcono = computed(() => {
  if (props.variante === 'danger') return 'error';
  if (props.variante === 'warning') return 'warning';
  return 'success';
});

/**
 * Emite la confirmación SOLO si no hay una petición en curso ni la acción
 * está bloqueada, evitando así duplicar operaciones sobre MySQL.
 */
const confirmarAccion = () => {
  if (props.procesando || props.deshabilitado) return;
  emit('confirmar');
};

/** Emite la cancelación; se bloquea mientras la petición viaja al servidor. */
const cancelarAccion = () => {
  if (props.procesando) return;
  emit('cancelar');
};
</script>

<template>
  <div class="modal fade" :id="idModal" tabindex="-1" aria-hidden="true" :aria-labelledby="`${idModal}Label`">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" :id="`${idModal}Label`">
            <i class="bi bi-shield-check"></i>
            {{ titulo }}
          </h5>
          <button
            type="button"
            class="btn-close"
            aria-label="Cerrar"
            :disabled="procesando"
            @click="cancelarAccion"
          ></button>
        </div>

        <div class="modal-body text-center">
          <!-- Icono de estado: rojo para acciones destructivas, azul para el resto -->
          <div class="fb-icon mx-auto mb-3" :class="claseIcono">
            <i class="bi" :class="icono"></i>
          </div>

          <p class="mb-2 fw-semibold">{{ mensaje }}</p>

          <!-- Detalle de consecuencias: explica qué ocurrirá en la base de datos -->
          <p v-if="detalle" class="small text-muted-2 mb-0">{{ detalle }}</p>
        </div>

        <div class="modal-footer justify-content-center">
          <!-- Botón de cancelación: nunca modifica la base de datos -->
          <button
            type="button"
            class="btn btn-outline-secondary"
            :disabled="procesando"
            @click="cancelarAccion"
          >
            <i class="bi bi-x-lg"></i> {{ textoCancelar }}
          </button>

          <!-- Botón de confirmación: se deshabilita durante la petición (evita duplicados) -->
          <button
            type="button"
            :class="claseBotonConfirmar"
            :disabled="procesando || deshabilitado"
            @click="confirmarAccion"
          >
            <span v-if="procesando" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            <i v-else class="bi bi-check2-circle"></i>
            {{ procesando ? 'Procesando...' : textoConfirmar }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
