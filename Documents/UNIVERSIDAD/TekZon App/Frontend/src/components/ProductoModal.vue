<script setup>
/**
 * ==========================================================================
 * COMPONENTE MODAL DE PRODUCTO - TEKZON C.A.
 * ==========================================================================
 * Gestiona el formulario unificado para registrar o editar repuestos y accesorios.
 */
import { reactive, watch } from 'vue';

const props = defineProps({
  producto: { type: Object, default: null },
  esEdicion: { type: Boolean, default: false },
  cargando: { type: Boolean, default: false }
});

const emit = defineEmits(['guardar', 'cerrar']);

// Estado local reactivo para el formulario
const form = reactive({
  codigo: '',
  nombre: '',
  categoria: 'Repuesto',
  marca: '',
  costo: 0,
  precio: 0,
  stock: 0,
  minimo: 0,
  imagen: 'pantalla.jpg',
  descripcion: ''
});

// Sincroniza los datos cuando se abre para editar
watch(() => props.producto, (nuevoVal) => {
  if (nuevoVal) {
    Object.assign(form, nuevoVal);
  } else {
    form.codigo = '';
    form.nombre = '';
    form.categoria = 'Repuesto';
    form.marca = '';
    form.costo = 0;
    form.precio = 0;
    form.stock = 0;
    form.minimo = 0;
    form.imagen = 'pantalla.jpg';
    form.descripcion = '';
  }
}, { immediate: true });

const enviarFormulario = () => {
  emit('guardar', { ...form });
};
</script>

<template>
  <div class="modal fade" id="productModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
      <form class="modal-content" @submit.prevent="enviarFormulario" novalidate>
        <div class="modal-header">
          <h2 class="modal-title">
            <i class="bi" :class="esEdicion ? 'bi-pencil-square' : 'bi-plus-square'"></i> 
            {{ esEdicion ? 'Editar producto' : 'Nuevo producto' }}
          </h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>

        <div class="modal-body">
          <div class="row g-3">
            <div class="col-12 col-md-6 field">
              <label class="form-label" for="fCodigo">Código del producto *</label>
              <input class="form-control" id="fCodigo" v-model="form.codigo" type="text" placeholder="REP-PAN-004" required :disabled="esEdicion">
            </div>

            <div class="col-12 col-md-6 field">
              <label class="form-label" for="fCategoria">Categoría *</label>
              <select class="form-select" id="fCategoria" v-model="form.categoria" required>
                <option value="Repuesto">Repuesto</option>
                <option value="Accesorio">Accesorio</option>
                <option value="Equipo">Equipo</option>
              </select>
            </div>

            <div class="col-12 col-md-6 field">
              <label class="form-label" for="fNombre">Nombre / descripción corta *</label>
              <input class="form-control" id="fNombre" v-model="form.nombre" type="text" placeholder="Pantalla OLED iPhone 13" required>
            </div>

            <div class="col-12 col-md-6 field">
              <label class="form-label" for="fMarca">Marca *</label>
              <input class="form-control" id="fMarca" v-model="form.marca" type="text" placeholder="Apple · Compatible" required>
            </div>

            <div class="col-12 col-sm-6 col-md-3 field">
              <label class="form-label" for="fCosto">Precio costo (USD) *</label>
              <input class="form-control" id="fCosto" v-model.number="form.costo" type="number" step="0.01" min="0" required>
            </div>

            <div class="col-12 col-sm-6 col-md-3 field">
              <label class="form-label" for="fPrecio">Precio venta (USD) *</label>
              <input class="form-control" id="fPrecio" v-model.number="form.precio" type="number" step="0.01" min="0.01" required>
            </div>

            <div class="col-12 col-sm-6 col-md-3 field">
              <label class="form-label" for="fStock">Stock actual *</label>
              <input class="form-control" id="fStock" v-model.number="form.stock" type="number" step="1" min="0" required>
            </div>

            <div class="col-12 col-sm-6 col-md-3 field">
              <label class="form-label" for="fMinimo">Stock mínimo *</label>
              <input class="form-control" id="fMinimo" v-model.number="form.minimo" type="number" step="1" min="0" required>
            </div>

            <div class="col-12 field">
              <label class="form-label" for="fDescripcion">Detalles adicionales</label>
              <textarea class="form-control" id="fDescripcion" v-model="form.descripcion" rows="2" placeholder="Compatibilidad, garantía, proveedor…"></textarea>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
          <!-- Deshabilitar botón durante el dispatch para evitar duplicados -->
          <button type="submit" class="btn btn-primary" :disabled="cargando">
            <span v-if="cargando" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            <i v-else class="bi bi-check2"></i> 
            {{ esEdicion ? 'Guardar cambios' : 'Registrar producto' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>