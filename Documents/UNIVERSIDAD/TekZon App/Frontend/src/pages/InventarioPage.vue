<script setup>
import { ref, computed, onMounted } from 'vue';
import ModalProducto from '../components/ProductoModal.vue';
import EliminarProductoModal from '../components/EliminarProductoModal.vue';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import ProductoServices from '../services/ProductoServices.js';

// Estados reactivos principales
const productos = ref([]);
const vistaActual = ref('cards');
const textoBusqueda = ref('');
const filtroCategoria = ref('');
const filtroEstado = ref('');

// Estados de la interfaz obligatorios
const estadoCarga = ref(false);
const productoActual = ref(null);
const productoAEliminar = ref(null);
const esEdicion = ref(false);
const procesandoGuardado = ref(false);
const procesandoEliminacion = ref(false);

// Sistema de Notificaciones Toasts dinámicas
const notificaciones = ref([]);

const mostrarToast = (titulo, mensaje, tipo = 'success') => {
  const id = Date.now();
  notificaciones.value.push({ id, titulo, mensaje, tipo });
  setTimeout(() => {
    notificaciones.value = notificaciones.value.filter(t => t.id !== id);
  }, 4000);
};

const cerrarToastPorId = (id) => {
  notificaciones.value = notificaciones.value.filter(t => t.id !== id);
};

// Funciones de lectura adaptadas (DTO / Resilientes)
const getCodigo = (p) => p.codigo || p.cod_producto || 'Sin código';
const getNombre = (p) => p.nombre || p.nombre_producto || 'Sin nombre';
const getCosto = (p) => Number(p.costo || p.precio_costo || 0);
const getPrecio = (p) => Number(p.precio || p.precio_venta || 0);
const getStock = (p) => Number(p.stock || p.existencia || 0);
const getMinimo = (p) => Number(p.minimo || p.stock_minimo || 0);
const getCategoria = (p) => p.categoria || p.id_categoria || 'General';

// Consumo asíncrono desde el backend
const cargarInventario = async () => {
  estadoCarga.value = true;
  try {
    const data = await ProductoServices.listarProductos();
    productos.value = Array.isArray(data) ? data : (data.data || []);
  } catch (error) {
    console.error("Fallo de conexión:", error);
    mostrarToast("Error de conexión", "No se pudo conectar con el servidor.", "error");
  } finally {
    estadoCarga.value = false;
  }
};

const obtenerEstadoStock = (p) => {
  const stock = getStock(p);
  const minimo = getMinimo(p);
  if (stock <= 0) return { key: 'agotado', etiqueta: 'Agotado', clase: 'badge-out' };
  if (stock <= minimo) return { key: 'bajo', etiqueta: 'Stock bajo', clase: 'badge-low' };
  return { key: 'disponible', etiqueta: 'Disponible', clase: 'badge-ok' };
};

const productosFiltrados = computed(() => {
  return productos.value.filter(p => {
    const texto = textoBusqueda.value.toLowerCase();
    const coincideTexto = !texto || 
      getNombre(p).toLowerCase().includes(texto) || 
      getCodigo(p).toLowerCase().includes(texto) || 
      (p.marca && p.marca.toLowerCase().includes(texto));
    
    const coincideCat = !filtroCategoria.value || getCategoria(p) == filtroCategoria.value;
    const coincideEstado = !filtroEstado.value || obtenerEstadoStock(p).key === filtroEstado.value;
    return coincideTexto && coincideCat && coincideEstado;
  });
});

const totalArticulos = computed(() => productos.value.length);
const totalValorCosto = computed(() => productos.value.reduce((s, p) => s + (getCosto(p) * getStock(p)), 0));

const prepararCreacion = () => {
  // Limpiamos el objeto para que el formulario nazca completamente en blanco
  productoActual.value = {
    codigo: '',
    nombre: '',
    categoria: '',
    marca: '',
    costo: 0,
    precio: 0,
    stock: 0,
    minimo: 0,
    imagen: '',
    descripcion: ''
  };
  esEdicion.value = false;
};

const prepararEdicion = (producto) => {
  productoActual.value = { ...producto };
  esEdicion.value = true;
};

const prepararEliminacion = (producto) => {
  productoAEliminar.value = producto;
};

// Guardar o Actualizar producto con cierre automático de modal
const guardarDatosProducto = async (datosFormulario) => {
  procesandoGuardado.value = true;
  try {
    if (esEdicion.value) {
      await ProductoServices.actualizarProducto(datosFormulario.codigo, datosFormulario);
      mostrarToast("¡Actualizado!", "El registro fue modificado con éxito.", "success");
    } else {
      await ProductoServices.crearProducto(datosFormulario);
      mostrarToast("¡Registrado!", "El nuevo producto fue guardado con éxito.", "success");
    }
    
    await cargarInventario();
    
    // Cierre automático seguro del modal principal
    const modalEl = document.getElementById('productModal');
    if (modalEl) {
      if (window.bootstrap && window.bootstrap.Modal) {
        const modalInstance = window.bootstrap.Modal.getInstance(modalEl) || window.bootstrap.Modal.getOrCreateInstance(modalEl);
        modalInstance.hide();
      }
      
      // Respaldo manual para asegurar que se quite el fondo gris (backdrop) y se recupere el scroll
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      const backdrop = document.querySelector('.modal-backdrop');
      if (backdrop) backdrop.remove();
      modalEl.classList.remove('show');
      modalEl.style.display = 'none';
      modalEl.setAttribute('aria-hidden', 'true');
    }
  } catch (error) {
    console.error("Error al guardar:", error);
    mostrarToast("Error de sistema", "No se pudo procesar la solicitud en el servidor.", "error");
  } finally {
    procesandoGuardado.value = false;
  }
};

const confirmarEliminacionProducto = async (producto) => {
  if (!producto || !producto.codigo) return;
  
  procesandoEliminacion.value = true;
  
  try {
    // 1. Eliminación real en la base de datos a través del servicio y la API REST
    await ProductoServices.eliminarProducto(producto.codigo);
    
    // 2. Refrescamos la lista de la tabla consumiendo el backend
    await cargarInventario();
    
    // 3. Lanzamos el Toast idéntico al de tu maquetación de referencia
    mostrarToast(
      "Registro eliminado", 
      `${producto.codigo} fue dado de baja del inventario.`, 
      "success"
    );
    
    // 4. Cierre automático inmediato del modal de Bootstrap y limpieza de backdrop
    const modalEl = document.getElementById('deleteModal');
    if (modalEl) {
      // Intentamos cerrar con la API oficial de Bootstrap si está disponible
      if (window.bootstrap && window.bootstrap.Modal) {
        const modalInstance = window.bootstrap.Modal.getInstance(modalEl) || window.bootstrap.Modal.getOrCreateInstance(modalEl);
        modalInstance.hide();
      }
      
      // Respaldo de seguridad por el DOM para asegurar que el modal se cierre y quite la pantalla gris
      document.body.classList.remove('modal-open');
      const backdrop = document.querySelector('.modal-backdrop');
      if (backdrop) backdrop.remove();
      modalEl.classList.remove('show');
      modalEl.style.display = 'none';
      modalEl.setAttribute('aria-hidden', 'true');
    }

  } catch (error) {
    console.error("Error al eliminar en el servidor:", error);
    mostrarToast("Error", "No se pudo eliminar el registro en la base de datos.", "error");
  } finally {
    procesandoEliminacion.value = false;
  }
};


onMounted(() => {
  cargarInventario();
});
</script>

<template>
  <main class="content" id="contenido">
    <!-- Componente global para la pila de Toasts flotantes -->
    <ToastNotificaciones :notificaciones="notificaciones" @cerrar="cerrarToastPorId" />

    <div class="page-head">
      <div>
        <h2>Inventario de repuestos y accesorios</h2>
        <p>Catálogo con precios en USD y equivalente en Bs. · Alertas automáticas de stock mínimo.</p>
      </div>
      <button class="btn btn-primary" type="button" data-bs-toggle="modal" data-bs-target="#productModal" @click="prepararCreacion">
        <i class="bi bi-plus-lg"></i> Nuevo producto
      </button>
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
          <option value="1">Repuesto</option>
          <option value="2">Accesorio</option>
          <option value="3">Equipo</option>
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
        <article v-for="p in productosFiltrados" :key="getCodigo(p)" class="product-card">
          <!-- Zona multimedia superior con insignias flotantes -->
          <div class="product-card__media">
            <img :src="`/assets/img/productos/${p.imagen || 'pantalla.jpg'}`" :alt="getNombre(p)" width="480" height="360" loading="lazy">
            <span class="badge-ts" :class="obtenerEstadoStock(p).clase">{{ obtenerEstadoStock(p).etiqueta }}</span>
            <span class="cat">{{ p.categoria == 1 ? 'Repuesto' : p.categoria == 2 ? 'Accesorio' : 'Equipo' }}</span>
          </div>

          <!-- Cuerpo de la tarjeta -->
          <div class="product-card__body">
            <span class="code-chip">{{ getCodigo(p) }}</span>
            <h3>{{ getNombre(p) }}</h3>
            <span class="brand">{{ p.marca || 'N/A' }}</span>
            
            <!-- Precios (USD y equivalente en Bs.) -->
            <div class="product-card__price">
              <strong>${{ getPrecio(p).toFixed(2) }}</strong>
              <span class="text-muted-2 small">Bs. {{ (getPrecio(p) * 36.50).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
            </div>

            <!-- Indicadores de Stock y Barra de Progreso -->
            <div class="d-flex justify-content-between mt-2 small text-muted-2">
              <span>Stock: <strong>{{ getStock(p) }}</strong> u.</span>
              <span>Mín. {{ getMinimo(p) }}</span>
            </div>
            <div class="stock-meter">
              <span :style="{ 
                width: Math.min(100, (getStock(p) / Math.max(getMinimo(p) * 2, 1)) * 100) + '%', 
                backgroundColor: getStock(p) <= getMinimo(p) ? 'var(--color-warning)' : 'var(--brand-primary)' 
              }"></span>
            </div>
          </div>

          <!-- Pie de tarjeta con botones de Editar y Eliminar idénticos a la maquetación -->
          <div class="product-card__foot d-flex gap-2">
            <button class="btn btn-outline-secondary btn-sm flex-grow-1" type="button" data-bs-toggle="modal" data-bs-target="#productModal" @click="prepararEdicion(p)">
              <i class="bi bi-pencil-square"></i> Editar
            </button>
            <button class="btn btn-outline-danger btn-sm" type="button" data-bs-toggle="modal" data-bs-target="#deleteModal" @click="prepararEliminacion(p)" aria-label="Eliminar">
              <i class="bi bi-trash3"></i>
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
                <th scope="col" class="text-end">Costo</th>
                <th scope="col" class="text-end">Precio venta</th>
                <th scope="col" class="text-center">Stock / mín.</th>
                <th scope="col">Estado</th>
                <th scope="col" class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in productosFiltrados" :key="getCodigo(p)">
                <td>
                  <strong class="fw-semibold d-block">{{ getNombre(p) }}</strong>
                  <small class="text-muted-2">{{ p.marca || 'N/A' }}</small>
                </td>
                <td><span class="code-chip">{{ getCodigo(p) }}</span></td>
                <td class="text-end tabular">${{ getCosto(p).toFixed(2) }}</td>
                <td class="text-end tabular"><strong>${{ getPrecio(p).toFixed(2) }}</strong></td>
                <td class="text-center tabular">{{ getStock(p) }} / {{ getMinimo(p) }}</td>
                <td><span class="badge-ts" :class="obtenerEstadoStock(p).clase">{{ obtenerEstadoStock(p).etiqueta }}</span></td>
                <td class="text-end">
                  <button class="btn btn-ghost btn-icon" type="button" data-bs-toggle="modal" data-bs-target="#productModal" @click="prepararEdicion(p)" aria-label="Editar">
                    <i class="bi bi-pencil-square"></i>
                  </button>
                  <button class="btn btn-ghost btn-icon text-danger" type="button" data-bs-toggle="modal" data-bs-target="#deleteModal" @click="prepararEliminacion(p)" aria-label="Eliminar">
                    <i class="bi bi-trash3"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Modales del sistema -->
    <ModalProducto 
      :producto="productoActual" 
      :esEdicion="esEdicion" 
      :cargando="procesandoGuardado"
      @guardar="guardarDatosProducto" 
    />

    <EliminarProductoModal 
      :producto="productoAEliminar"
      :cargando="procesandoEliminacion"
      @confirmarEliminacion="confirmarEliminacionProducto"
    />
  </main>
</template>