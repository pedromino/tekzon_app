<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  producto: Object,
  esEdicion: Boolean,
  cargando: Boolean
});

const emit = defineEmits(['guardar']);

const form = ref({
  codigo: '',
  nombre: '',
  categoria: '',
  marca: '',
  costo: 0,
  precio: 0,
  stock: 0,
  minimo: 0,
  imagen: 'pantalla.jpg',
  descripcion: ''
});

watch(() => props.producto, (nuevoValor) => {
  if (nuevoValor) {
    form.value = { ...nuevoValor };
  } else {
    form.value = {
      codigo: '',
      nombre: '',
      categoria: '',
      marca: '',
      costo: 0,
      precio: 0,
      stock: 0,
      minimo: 0,
      imagen: 'pantalla.jpg',
      descripcion: ''
    };
  }
}, { immediate: true });

const enviarFormulario = () => {
  emit('guardar', { ...form.value });
};
</script>

<template>
  <div class="modal fade" id="productModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi" :class="esEdicion ? 'bi-pencil-square' : 'bi-plus-square'"></i>
            {{ esEdicion ? 'Editar producto' : 'Nuevo producto' }}
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>

        <form @submit.prevent="enviarFormulario">
          <div class="modal-body">
            <div class="row g-3">
              <!-- Código -->
              <div class="col-md-6">
                <label class="form-label">Código del producto *</label>
                <input type="text" class="form-control" v-model="form.codigo" :disabled="esEdicion" required placeholder="REP-PAN-004">
              </div>

              <!-- Categoría -->
              <div class="col-md-6">
                <label class="form-label">Categoría *</label>
                <select class="form-select" v-model="form.categoria" required>
                  <option value="" disabled>Selecciona...</option>
                  <option value="1">Repuesto</option>
                  <option value="2">Accesorio</option>
                  <option value="3">Equipo</option>
                </select>
              </div>

              <!-- Nombre -->
              <div class="col-md-6">
                <label class="form-label">Nombre / descripción corta *</label>
                <input type="text" class="form-control" v-model="form.nombre" required placeholder="Pantalla OLED iPhone 13">
              </div>

              <!-- Marca -->
              <div class="col-md-6">
                <label class="form-label">Marca *</label>
                <input type="text" class="form-control" v-model="form.marca" required placeholder="Apple · Compatible">
              </div>

              <!-- Costo -->
              <div class="col-md-3">
                <label class="form-label">Precio costo (USD) *</label>
                <input type="number" step="0.01" class="form-control" v-model.number="form.costo" required>
              </div>

              <!-- Precio Venta -->
              <div class="col-md-3">
                <label class="form-label">Precio venta (USD) *</label>
                <input type="number" step="0.01" class="form-control" v-model.number="form.precio" required>
              </div>

              <!-- Stock -->
              <div class="col-md-3">
                <label class="form-label">Stock actual *</label>
                <input type="number" class="form-control" v-model.number="form.stock" required>
              </div>

              <!-- Stock Mínimo -->
              <div class="col-md-3">
                <label class="form-label">Stock mínimo *</label>
                <input type="number" class="form-control" v-model.number="form.minimo" required>
              </div>

              <!-- SELECTOR DE IMAGEN DEL CATÁLOGO + VISTA PREVIA -->
              <div class="col-md-6">
                <label class="form-label">Imagen del catálogo</label>
                <select class="form-select" v-model="form.imagen">
                  <option value="pantalla.jpg">Pantalla</option>
                  <option value="bateria.jpg">Batería</option>
                  <option value="cargador.jpg">Cargador</option>
                  <option value="audifonos.jpg">Audífonos</option>
                  <option value="laptop.jpg">Laptop</option>
                  <option value="funda.jpg">Funda</option>
                </select>
              </div>

              <div class="col-md-6">
                <label class="form-label">Vista previa</label>
                <div class="img-preview">
                  <img :src="`/assets/img/${form.imagen || 'pantalla.jpg'}`" alt="Vista previa">
                  <p>La foto se mostrará en la vista de Cards y detalles.</p>
                </div>
              </div>

              <!-- Detalles Adicionales -->
              <div class="col-12">
                <label class="form-label">Detalles adicionales</label>
                <textarea class="form-control" v-model="form.descripcion" placeholder="Compatibilidad, garantía, proveedor..."></textarea>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="cargando">
              <span v-if="cargando" class="spinner-border spinner-border-sm me-1" role="status"></span>
              {{ esEdicion ? 'Guardar cambios' : 'Registrar producto' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>