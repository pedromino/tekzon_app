<script setup>
/**
 * ==========================================================================
 * VISTA DE INVENTARIO Y CRUD - TEKZON C.A.
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';
import ModalProducto from '../components/ProductoModal.vue';

// Estados reactivos principales
const productos = ref([]);
const vistaActual = ref('cards');
const textoBusqueda = ref('');
const filtroCategoria = ref('');
const filtroEstado = ref('');

// Estados de la interfaz obligatorios
const estadoCarga = ref(false);
const mensajeError = ref(null);
const mensajeExito = ref(null);

// Estado para el modal de creación/edición
const productoActual = ref(null);
const esEdicion = ref(false);
const procesandoGuardado = ref(false);

// Consumo asíncrono desde el backend (Node.js/Express)
const cargarInventario = async () => {
  estadoCarga.value = true;
  mensajeError.value = null;
  try {
    const respuesta = await fetch('http://localhost:3000/api/productos');
    if (!respuesta.ok) throw new Error(`Error del servidor: ${respuesta.status}`);
    productos.value = await respuesta.json();
  } catch (error) {
    console.error("Fallo de conexión:", error);
    mensajeError.value = "No se pudo conectar con el servidor para obtener el inventario.";
  } finally {
    estadoCarga.value = false;
  }
};

const obtenerEstadoStock = (p) => {
  if (p.stock <= 0) return { key: 'agotado', etiqueta: 'Agotado', clase: 'badge-out' };
  if (p.stock <= p.minimo) return { key: 'bajo', etiqueta: 'Stock bajo', clase: 'badge-low' };
  return { key: 'disponible', etiqueta: 'Disponible', clase: 'badge-ok' };
};

const productosFiltrados = computed(() => {
  return productos.value.filter(p => {
    const coincideTexto = !textoBusqueda.value || [p.nombre, p.codigo, p.marca].some(v => v.toLowerCase().includes(textoBusqueda.value.toLowerCase()));
    const coincideCat = !filtroCategoria.value || p.categoria === filtroCategoria.value;
    const coincideEstado = !filtroEstado.value || obtenerEstadoStock(p).key === filtroEstado.value;
    return coincideTexto && coincideCat && coincideEstado;
  });
});

const totalArticulos = computed(() => productos.value.length);
const totalValorCosto = computed(() => productos.value.reduce((s, p) => s + (p.costo * p.stock), 0));

const prepararCreacion = () => {
  productoActual.value = null;
  esEdicion.value = false;
};

const prepararEdicion = (producto) => {
  productoActual.value = { ...producto };
  esEdicion.value = true;
};

const guardarDatosProducto = async (datosFormulario) => {
  procesandoGuardado.value = true;
  mensajeError.value = null;
  try {
    const url = esEdicion.value 
      ? `http://localhost:3000/api/productos/${datosFormulario.codigo}` 
      : 'http://localhost:3000/api/productos';
    const metodo = esEdicion.value ? 'PUT' : 'POST';

    const respuesta = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosFormulario)
    });

    if (!respuesta.ok) throw new Error("No se pudo procesar la solicitud en el servidor.");

    await cargarInventario();
    mensajeExito.value = esEdicion.value ? "¡Producto actualizado exitosamente!" : "¡Producto registrado exitosamente!";
    
    const modalEl = document.getElementById('productModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();

    setTimeout(() => { mensajeExito.value = null; }, 4000);
  } catch (error) {
    mensajeError.value = error.message;
  } finally {
    procesandoGuardado.value = false;
  }
};

onMounted(() => {
  cargarInventario();
});
</script>

<template>
  <main class="content" id="contenido">
    <div class="page-head">
      <div>
        <h2>Inventario de repuestos y accesorios</h2>
        <p>Catálogo con precios en USD y equivalente en Bs. · Alertas automáticas de stock mínimo.</p>
      </div>
      <button class="btn btn-primary" type="button" data-bs-toggle="modal" data-bs-target="#productModal" @click="prepararCreacion">
        <i class="bi bi-plus-lg"></i> Nuevo producto
      </button>
    </div>

    <div v-if="mensajeExito" class="alert alert-success alert-dismissible fade show" role="alert">
      <i class="bi bi-check-circle-fill me-2"></i> {{ mensajeExito }}
      <button type="button" class="btn-close" @click="mensajeExito = null" aria-label="Cerrar"></button>
    </div>

    <div v-if="mensajeError" class="alert alert-danger alert-dismissible fade show" role="alert">
      <i class="bi bi-exclamation-triangle-fill me-2"></i> <strong>Error de sistema:</strong> {{ mensajeError }}
      <button type="button" class="btn-close" @click="mensajeError = null" aria-label="Cerrar"></button>
    </div>

    <div class="summary-strip mb-3">
      <span class="chip"><i class="bi bi-box-seam"></i> Artículos: <strong>{{ totalArticulos }}</strong></span>
      <span class="chip"><i class="bi bi-cash-stack"></i> Valor (costo): <strong>${{ totalValorCosto.toFixed(2) }}</strong></span>
    </div>

    <section class="card-ts">
      <div class="toolbar">
        <div class="input-icon">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input class="form-control" v-model="textoBusqueda" type="search" placeholder="Buscar por nombre, código o marca">
        </div>
        <select class="form-select" v-model="filtroCategoria">
          <option value="">Todas las categorías</option>
          <option value="Repuesto">Repuesto</option>
          <option value="Accesorio">Accesorio</option>
          <option value="Equipo">Equipo</option>
        </select>
        <select class="form-select" v-model="filtroEstado">
          <option value="">Todos los estados</option>
          <option value="disponible">Disponible</option>
          <option value="bajo">Stock bajo</option>
          <option value="agotado">Agotado</option>
        </select>
        <div class="view-switch" role="group">
          <button type="button" :class="{ active: vistaActual === 'cards' }" @click="vistaActual = 'cards'"><i class="bi bi-grid-3x2-gap"></i> Cards</button>
          <button type="button" :class="{ active: vistaActual === 'table' }" @click="vistaActual = 'table'"><i class="bi bi-table"></i> Tabla</button>
        </div>
      </div>

      <div v-if="estadoCarga" class="empty-state py-5">
        <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
        <h3>Cargando registros...</h3>
        <p class="small">Sincronizando de forma asíncrona con el servidor y la base de datos relacional.</p>
      </div>

      <div v-else-if="vistaActual === 'cards'" class="product-grid">
        <article v-for="p in productosFiltrados" :key="p.codigo" class="product-card">
          <div class="product-card__media">
            <img :src="`/assets/img/productos/${p.imagen || 'pantalla.jpg'}`" :alt="p.nombre" width="480" height="360" loading="lazy">
            <span class="badge-ts" :class="obtenerEstadoStock(p).clase">{{ obtenerEstadoStock(p).etiqueta }}</span>
            <span class="cat">{{ p.categoria }}</span>
          </div>
          <div class="product-card__body">
            <span class="code-chip">{{ p.codigo }}</span>
            <h3>{{ p.nombre }}</h3>
            <span class="brand">{{ p.marca }}</span>
            <div class="product-card__price">
              <strong>${{ p.precio.toFixed(2) }}</strong>
            </div>
            <div class="d-flex justify-content-between mt-2 small text-muted-2">
              <span>Stock: <strong class="text-body">{{ p.stock }}</strong> u.</span>
              <span>Mín. {{ p.minimo }}</span>
            </div>
          </div>
          <div class="product-card__foot">
            <button class="btn btn-outline-secondary btn-sm" type="button" data-bs-toggle="modal" data-bs-target="#productModal" @click="prepararEdicion(p)">
              <i class="bi bi-pencil-square"></i> Editar
            </button>
          </div>
        </article>
      </div>

      <div v-else class="p-3">
        <div class="table-wrap">
          <table class="table table-ts">
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Código</th>
                <th scope="col">Categoría</th>
                <th scope="col" class="text-end">Costo</th>
                <th scope="col" class="text-end">Precio venta</th>
                <th scope="col" class="text-center">Stock / mín.</th>
                <th scope="col">Estado</th>
                <th scope="col" class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in productosFiltrados" :key="p.codigo">
                <td>
                  <strong class="fw-semibold d-block">{{ p.nombre }}</strong>
                  <small class="text-muted-2">{{ p.marca }}</small>
                </td>
                <td><span class="code-chip">{{ p.codigo }}</span></td>
                <td>{{ p.categoria }}</td>
                <td class="text-end tabular">${{ p.costo.toFixed(2) }}</td>
                <td class="text-end tabular"><strong>${{ p.precio.toFixed(2) }}</strong></td>
                <td class="text-center tabular">{{ p.stock }} / {{ p.minimo }}</td>
                <td><span class="badge-ts" :class="obtenerEstadoStock(p).clase">{{ obtenerEstadoStock(p).etiqueta }}</span></td>
                <td class="text-end">
                  <button class="btn btn-ghost btn-icon" type="button" data-bs-toggle="modal" data-bs-target="#productModal" @click="prepararEdicion(p)" aria-label="Editar">
                    <i class="bi bi-pencil-square"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <ModalProducto 
      :producto="productoActual" 
      :esEdicion="esEdicion" 
      :cargando="procesandoGuardado"
      @guardar="guardarDatosProducto" 
    />
  </main>
</template>