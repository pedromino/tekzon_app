<script setup>
/**
 * ==========================================================================
 * COMPONENTE CATEGORIAMODAL.VUE - TEKZON C.A.
 * ==========================================================================
 * CRUD 4 · Registro y Gestión de Categorías de Productos
 *
 *   Formulario modal para dar de alta o renombrar una categoría que clasifica
 *   los repuestos, accesorios y equipos del catálogo maestro. Advierte cuando
 *   la categoría ya está siendo usada por productos activos, ya que la baja es
 *   LÓGICA (estado = 0) y los productos conservan su clasificación histórica.
 *
 *   - El botón de envío usa `:disabled="guardando"` para evitar duplicados.
 * ==========================================================================
 */
import { ref, computed, watch } from 'vue';

const props = defineProps({
  /** Categoría a editar (null cuando es un alta nueva). */
  categoria: { type: Object, default: null },
  /** Bandera que indica si el formulario está en modo edición. */
  esEdicion: { type: Boolean, default: false },
  /** Bandera controlada por la página mientras la petición está en curso. */
  cargando: { type: Boolean, default: false },
  /** Mensaje de error devuelto por el backend (HTTP 400/404/500). */
  errorBackend: { type: String, default: '' }
});

const emit = defineEmits(['guardar', 'cerrar']);

// ---------------------------------------------------------------------------
// ESTADO DEL FORMULARIO Y DE UI
// ---------------------------------------------------------------------------
/** Nombre de la categoría = columna `nombre_categoria`. */
const nombre_categoria = ref('');
/** Estado de Carga: envío de la petición al servidor. */
const guardando = ref(false);
/** Estado de Error: error de validación del campo nombre. */
const errorNombre = ref('');

/** Longitud máxima admitida por el DDL de la tabla `categoria`. */
const longitudMaxima = 50;

/** Contador de caracteres restantes para la retroalimentación visual. */
const caracteresRestantes = computed(
  () => longitudMaxima - String(nombre_categoria.value).length
);

/**
 * Reinicia el formulario según la categoría recibida.
 * En edición se precarga el nombre actual; en alta se limpia por completo.
 */
watch(
  () => props.categoria,
  (nuevaCategoria) => {
    errorNombre.value = '';

    nombre_categoria.value = nuevaCategoria
      ? (nuevaCategoria.nombre_categoria ?? nuevaCategoria.nombre ?? '')
      : '';
  },
  { immediate: true }
);

/** Sincroniza la bandera de guardado con la prop de la página padre. */
watch(
  () => props.cargando,
  (valor) => {
    guardando.value = Boolean(valor);
  }
);

/**
 * VALIDACIÓN LOCAL DEL NOMBRE.
 * Réplica de las reglas de `categoriaService` en el backend, que conserva la
 * autoridad final sobre duplicados y formato (HTTP 400).
 */
const validarCategoria = () => {
  const nombreLimpio = String(nombre_categoria.value).trim();

  if (!nombreLimpio) {
    errorNombre.value = 'El nombre de la categoría es obligatorio.';
  } else if (nombreLimpio.length > longitudMaxima) {
    errorNombre.value = `El nombre no puede superar los ${longitudMaxima} caracteres.`;
  } else {
    errorNombre.value = '';
  }

  return errorNombre.value === '';
};

/**
 * ENVÍA LA CATEGORÍA A LA PÁGINA PADRE.
 * La página ejecuta el POST/PUT y gestiona el Toast de éxito o error.
 * Se emite el nombre EXACTO de la columna de MySQL.
 */
const enviarCategoria = () => {
  if (guardando.value) return;
  if (!validarCategoria()) return;

  emit('guardar', {
    id_categoria: props.categoria?.id_categoria ?? props.categoria?.id ?? null,
    nombre_categoria: String(nombre_categoria.value).trim()
  });
};
</script>

<template>
  <div class="modal fade" id="categoriaModal" tabindex="-1" aria-hidden="true" aria-labelledby="categoriaModalLabel">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="categoriaModalLabel">
            <i class="bi" :class="esEdicion ? 'bi-pencil-square' : 'bi-tags'"></i>
            {{ esEdicion ? 'Editar categoría' : 'Registrar nueva categoría' }}
          </h5>
          <button type="button" class="btn-close" aria-label="Cerrar" :disabled="guardando" @click="emit('cerrar')"></button>
        </div>

        <form @submit.prevent="enviarCategoria" novalidate>
          <div class="modal-body">
            <!-- ============ ESTADO DE ERROR (HTTP 400/404/500) ============ -->
            <div v-if="errorBackend" class="readonly-note" role="alert">
              <i class="bi bi-exclamation-triangle-fill"></i>
              <span>{{ errorBackend }}</span>
            </div>

            <div class="row g-3">
              <div class="col-12">
                <label class="form-label" for="categoria-nombre">Nombre de la categoría *</label>
                <input
                  id="categoria-nombre"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errorNombre }"
                  v-model="nombre_categoria"
                  :disabled="guardando"
                  :maxlength="longitudMaxima"
                  placeholder="Ej.: Baterías y fuentes de poder"
                  autocomplete="off"
                >
                <div v-if="errorNombre" class="invalid-feedback">{{ errorNombre }}</div>
                <div v-else class="form-text">
                  El nombre debe ser único en el sistema · {{ caracteresRestantes }} caracteres disponibles.
                </div>
              </div>

              <!-- Advertencia de impacto cuando la categoría ya tiene productos -->
              <div v-if="esEdicion && categoria?.total_productos > 0" class="col-12">
                <div class="readonly-note" style="background:#e3f4f7;color:var(--color-info);border-color:#b9e8e1;">
                  <i class="bi bi-info-circle-fill"></i>
                  <span>
                    Esta categoría clasifica <strong>{{ categoria.total_productos }} producto(s)</strong> activo(s).
                    Al desactivarla conservarán su clasificación histórica y las
                    claves foráneas del catálogo permanecerán intactas.
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" :disabled="guardando" @click="emit('cerrar')">
              Cancelar
            </button>
            <!-- Botón deshabilitado durante la petición para evitar duplicados -->
            <button type="submit" class="btn btn-primary" :disabled="guardando">
              <span v-if="guardando" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
              {{ guardando ? 'Guardando...' : (esEdicion ? 'Guardar cambios' : 'Registrar categoría') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
