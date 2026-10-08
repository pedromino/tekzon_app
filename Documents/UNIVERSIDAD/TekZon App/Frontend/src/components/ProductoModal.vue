<script setup>
/**
 * ==========================================================================
 * COMPONENTE PRODUCTOMODAL.VUE - TEKZON C.A.
 * ==========================================================================
 * CRUD 1 · Registro y Catálogo Maestro de Productos
 *
 * PROPÓSITO FUNCIONAL:
 *   Formulario modal para dar de alta o editar la FICHA TÉCNICA de un
 *   producto. La cantidad física (existencia) NO se captura aquí: nace en 0 y
 *   sólo la modifican el CRUD 2 (ajuste de almacén) y el CRUD 3 (kádex).
 *
 * PROPÓSITO TÉCNICO:
 *   - MAPEO DIRECTO CON LA BASE DE DATOS: cada `v-model` del formulario se
 *     llama EXACTAMENTE igual que su columna en la tabla `producto` de
 *     `tekzon_bd` (cod_producto, nombre_producto, precio_costo, precio_venta,
 *     id_categoria, marca, descripcion, imagen, stock_minimo, existencia).
 *     Así el objeto que se emite al guardar es el mismo que consume el
 *     backend, sin traducciones intermedias que puedan desincronizarse.
 *
 *   - INTERCONEXIÓN CON EL CRUD 4: el selector de categorías se carga en vivo
 *     desde `CategoriaServices.listarCategoriasActivas()`. No hay ninguna
 *     opción de categoría escrita en el HTML (cero datos quemados).
 *
 *   - VALIDACIÓN DE NEGOCIO `validarStockMinimo()`: el stock mínimo es el
 *     umbral de alerta de reposición, por lo que no puede superar la
 *     existencia real del producto. En el ALTA la existencia es siempre 0, de
 *     modo que se muestra una ADVERTENCIA informativa (el backend forzará el
 *     stock a 0 y el almacenista lo cargará después en el CRUD 2). En la
 *     EDICIÓN la regla es ESTRICTA: si el mínimo supera la existencia actual
 *     se muestra el error y el botón de guardado queda deshabilitado.
 *
 *   - 3 ESTADOS DE UI: Cargando (`cargandoCategorias` en el selector y la prop
 *     `cargando` durante el guardado), Éxito (la página lanza el Toast y cierra
 *     el modal) y Error (`mensajeError` con el código HTTP 400/404/500 y
 *     `erroresValidacion` por campo).
 * ==========================================================================
 */
import { ref, watch, computed, onMounted } from 'vue';
import CategoriaServices from '../services/CategoriaServices.js';

const props = defineProps({
  /** Producto a editar (null cuando es un alta nueva). */
  producto: { type: Object, default: null },
  /** Bandera que indica si el formulario está en modo edición. */
  esEdicion: { type: Boolean, default: false },
  /** Bandera controlada por la página mientras la petición está en curso. */
  cargando: { type: Boolean, default: false },
  /** Mensaje de error devuelto por el backend (HTTP 400/404/500). */
  errorBackend: { type: String, default: '' }
});

const emit = defineEmits(['guardar', 'cerrar']);

// ---------------------------------------------------------------------------
// ESTADO DEL FORMULARIO
// Nombres de campo = nombres EXACTOS de las columnas de la tabla `producto`.
// ---------------------------------------------------------------------------
/**
 * Estructura base del formulario.
 * NÓTESE la AUSENCIA del campo `existencia`: la cantidad física no se captura
 * en la ficha técnica (corrección docente), sólo se muestra como referencia.
 */
const crearFormularioVacio = () => ({
  cod_producto: '',
  nombre_producto: '',
  id_categoria: '',
  marca: '',
  precio_costo: 0,
  precio_venta: 0,
  stock_minimo: 0,
  imagen: 'pantalla.jpg',
  descripcion: ''
});

const formulario = ref(crearFormularioVacio());

/** Existencia real del producto en la base de datos (sólo lectura). */
const existenciaActual = ref(0);

// ---------------------------------------------------------------------------
// ESTADOS DE UI (Cargando / Éxito / Error)
// ---------------------------------------------------------------------------
/** Estado de Carga: true mientras se consultan las categorías al backend. */
const cargandoCategorias = ref(false);
/** Estado de Error: mensaje al no poder cargar el catálogo de categorías. */
const mensajeError = ref('');
/** Estado de Error: diccionario de errores de validación por campo. */
const erroresValidacion = ref({});
/** Catálogo de categorías activas servido por el CRUD 4. */
const listaCategorias = ref([]);

/** Catálogo de imágenes disponibles en el proyecto (recurso estático). */
const catalogoImagenes = [
  { archivo: 'pantalla.jpg', etiqueta: 'Pantalla' },
  { archivo: 'bateria.jpg', etiqueta: 'Batería' },
  { archivo: 'cargador.jpg', etiqueta: 'Cargador' },
  { archivo: 'audifonos.jpg', etiqueta: 'Audífonos' },
  { archivo: 'laptop.jpg', etiqueta: 'Laptop' },
  { archivo: 'funda.jpg', etiqueta: 'Funda' }
];

/** Ruta de la vista previa de la imagen seleccionada. */
const rutaVistaPrevia = computed(
  () => `/assets/img/productos/${formulario.value.imagen || 'pantalla.jpg'}`
);

/**
 * Referencia al producto original recibido por props. Se conserva para poder
 * mostrar el nombre de su categoría cuando ésta fue dada de baja lógica.
 */
const productoActualOriginal = ref(null);

/**
 * CATÁLOGO DE CATEGORÍAS A MOSTRAR EN EL SELECTOR.
 *
 *  el backend sólo devuelve categorías con estado = 1.
 * Si el producto que se está editando pertenece a una categoría que fue
 * desactivada después (baja lógica), se añade al listado como opción
 * deshabilitada para que el usuario vea su clasificación actual y pueda
 * cambiarla, sin que el `v-model` quede apuntando a un valor inexistente.
 */
const categoriasParaSelector = computed(() => {
  const categorias = [...listaCategorias.value];

  const idCategoriaActual = Number(formulario.value.id_categoria);

  const yaEstaEnLista = categorias.some(
    (categoria) => Number(categoria.id_categoria) === idCategoriaActual
  );

  if (props.esEdicion && idCategoriaActual && !yaEstaEnLista) {
    categorias.unshift({
      id_categoria: idCategoriaActual,
      nombre_categoria: `${productoActualOriginal.value?.nombre_categoria || 'Categoría'} (inactiva)`,
      estado: 0,
      inactiva: true
    });
  }

  return categorias;
});

// ---------------------------------------------------------------------------
// VALIDACIÓN DE NEGOCIO: STOCK MÍNIMO vs EXISTENCIA
// ---------------------------------------------------------------------------
/**
 *
 * el `stock_minimo` es el umbral que dispara la alerta de
 * reposición. No tiene sentido lógico que sea mayor que la existencia real del
 * producto, porque la alerta estaría disparada de forma permanente.
 *
 *   · ALTA      -> la existencia es 0 por diseño; se devuelve una ADVERTENCIA
 *                  informativa y el usuario puede guardar. El almacenista
 *                  cargará el stock en el CRUD 2 (Ajuste de Existencias).
 *   · EDICIÓN   -> hay una existencia real contra la cual comparar; si el
 *                  mínimo la supera se devuelve un ERROR que deshabilita el
 *                  botón de guardado.
 *
 * @returns {{hayError: boolean, hayAdvertencia: boolean, mensaje: string}}
 */
const validarStockMinimo = () => {
  const stockMinimo = Number(formulario.value.stock_minimo || 0);
  const existencia = Number(existenciaActual.value || 0);

  // --- ALTA: sólo advertencia informativa (existencia forzada a 0) ---
  if (!props.esEdicion) {
    if (stockMinimo > existencia) {
      return {
        hayError: false,
        hayAdvertencia: true,
        mensaje:
          `El stock mínimo (${stockMinimo} u.) es mayor que la existencia (${existencia} u.). `
          + 'El producto se guardará con existencia 0 y quedará en alerta hasta que registre '
          + 'una Entrada o un Ajuste de existencia en el almacén.'
      };
    }

    return { hayError: false, hayAdvertencia: false, mensaje: '' };
  }

  // --- EDICIÓN: regla ESTRICTA, bloquea el guardado ---
  if (stockMinimo > existencia) {
    return {
      hayError: true,
      hayAdvertencia: false,
      mensaje:
        `El stock mínimo (${stockMinimo} u.) no puede ser mayor que la existencia actual `
        + `(${existencia} u.). Registre primero una Entrada o un Ajuste de existencia en el `
        + 'módulo de almacén, o reduzca el stock mínimo.'
    };
  }

  return { hayError: false, hayAdvertencia: false, mensaje: '' };
};

/** Resultado reactivo de la validación de stock mínimo. */
const resultadoValidacionMinimo = computed(() => validarStockMinimo());

/** True cuando la regla de negocio impide guardar (deshabilita el botón). */
const guardadoBloqueado = computed(() => resultadoValidacionMinimo.value.hayError);

// ---------------------------------------------------------------------------
// CARGA DINÁMICA DE LAS CATEGORÍAS (interconexión con el CRUD 4)
// ---------------------------------------------------------------------------
/**
 * SOLICITA AL BACKEND LAS CATEGORÍAS ACTIVAS.
 * Consulta `GET /api/categorias?soloActivas=true` a través de
 * `CategoriaServices`. Envuelto en try/catch para activar el estado de Error
 * con el código HTTP recibido sin romper la interfaz.
 */
const cargarCategoriasActivas = async () => {
  cargandoCategorias.value = true;
  mensajeError.value = '';

  try {
    listaCategorias.value = await CategoriaServices.listarCategoriasActivas();
  } catch (error) {
    listaCategorias.value = [];
    mensajeError.value =
      `[HTTP ${error.codigoHttp || 500}] ${error.mensaje || 'No se pudieron cargar las categorías.'}`;
  } finally {
    cargandoCategorias.value = false;
  }
};

/**
 * Reinicia el formulario cuando cambia el producto recibido por props.
 * En edición también se recarga el selector de categorías por si el CRUD 4
 * cambió mientras el usuario navegaba entre páginas.
 */
watch(
  () => props.producto,
  (nuevoProducto) => {
    erroresValidacion.value = {};

    if (nuevoProducto) {
      productoActualOriginal.value = nuevoProducto;

      formulario.value = {
        cod_producto: nuevoProducto.cod_producto ?? nuevoProducto.codigo ?? '',
        nombre_producto: nuevoProducto.nombre_producto ?? nuevoProducto.nombre ?? '',
        id_categoria: nuevoProducto.id_categoria ?? nuevoProducto.categoria ?? '',
        marca: nuevoProducto.marca ?? '',
        precio_costo: Number(nuevoProducto.precio_costo ?? nuevoProducto.costo ?? 0),
        precio_venta: Number(nuevoProducto.precio_venta ?? nuevoProducto.precio ?? 0),
        stock_minimo: Number(nuevoProducto.stock_minimo ?? nuevoProducto.minimo ?? 0),
        imagen: nuevoProducto.imagen || 'pantalla.jpg',
        descripcion: nuevoProducto.descripcion || ''
      };

      // La existencia proviene de la base de datos: es el valor contra el que
      // se compara el stock mínimo en la validación estricta de edición.
      existenciaActual.value = Number(nuevoProducto.existencia ?? 0);

      // Se refrescan las categorías para incluir la del producto si estuviera inactiva.
      cargarCategoriasActivas();
    } else {
      productoActualOriginal.value = null;
      formulario.value = crearFormularioVacio();
      existenciaActual.value = 0;
    }
  },
  { immediate: true }
);

// Al montar el componente se cargan las categorías desde la base de datos.
onMounted(() => {
  cargarCategoriasActivas();
});

/**
 * VALIDACIÓN DE ENTRADA EN EL CLIENTE.
 *
 * PROPÓSITO FUNCIONAL: evita un viaje innecesario al servidor cuando faltan
 * datos evidentes. El backend conserva su propia validación como última línea
 * de defensa (HTTP 400).
 */
const validarFormulario = () => {
  const errores = {};

  const codigo = String(formulario.value.cod_producto).trim();
  const nombre = String(formulario.value.nombre_producto).trim();
  const marca = String(formulario.value.marca).trim();

  if (!codigo) {
    errores.cod_producto = 'El código del producto es obligatorio.';
  } else if (codigo.length > 50) {
    errores.cod_producto = 'El código no puede superar los 50 caracteres.';
  }

  if (!nombre) {
    errores.nombre_producto = 'El nombre del producto es obligatorio.';
  }

  if (!marca) {
    errores.marca = 'La marca del producto es obligatoria.';
  }

  if (!formulario.value.id_categoria) {
    errores.id_categoria = 'Debe seleccionar una categoría.';
  }

  if (Number(formulario.value.precio_costo) < 0 || Number.isNaN(Number(formulario.value.precio_costo))) {
    errores.precio_costo = 'El precio de costo debe ser un número mayor o igual a 0.';
  }

  if (Number(formulario.value.precio_venta) <= 0 || Number.isNaN(Number(formulario.value.precio_venta))) {
    errores.precio_venta = 'El precio de venta debe ser un número mayor que 0.';
  } else if (Number(formulario.value.precio_venta) < Number(formulario.value.precio_costo)) {
    errores.precio_venta = 'El precio de venta no puede ser menor que el costo.';
  }

  const stockMinimo = Number(formulario.value.stock_minimo);

  if (Number.isNaN(stockMinimo) || stockMinimo < 0) {
    errores.stock_minimo = 'El stock mínimo debe ser un número mayor o igual a 0.';
  } else if (!Number.isInteger(stockMinimo)) {
    errores.stock_minimo = 'El stock mínimo debe ser un número entero de unidades.';
  } else if (resultadoValidacionMinimo.value.hayError) {
    // Reutiliza el mensaje de la regla de negocio para no duplicar textos.
    errores.stock_minimo = resultadoValidacionMinimo.value.mensaje;
  }

  erroresValidacion.value = errores;
  return Object.keys(errores).length === 0;
};

/**
 * ENVÍA EL FORMULARIO A LA PÁGINA PADRE.
 *
 * PROPÓSITO TÉCNICO: se emite un objeto con los nombres EXACTOS de las
 * columnas de MySQL. La página (InventarioPage.vue) es la dueña del estado de
 * carga y del Toast de éxito, manteniendo una única fuente de verdad.
 */
const enviarFormulario = () => {
  if (props.cargando || guardadoBloqueado.value) return;
  if (!validarFormulario()) return;

  emit('guardar', {
    cod_producto: String(formulario.value.cod_producto).trim(),
    nombre_producto: String(formulario.value.nombre_producto).trim(),
    id_categoria: Number(formulario.value.id_categoria),
    marca: String(formulario.value.marca).trim(),
    precio_costo: Number(formulario.value.precio_costo),
    precio_venta: Number(formulario.value.precio_venta),
    stock_minimo: Number(formulario.value.stock_minimo),
    imagen: formulario.value.imagen,
    descripcion: String(formulario.value.descripcion).trim()
    // Se omite `existencia`: la cantidad física no se captura en el CRUD 1.
  });
};
</script>

<template>
  <div class="modal fade" id="productModal" tabindex="-1" aria-hidden="true" aria-labelledby="productModalLabel">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="productModalLabel">
            <i class="bi" :class="esEdicion ? 'bi-pencil-square' : 'bi-plus-square'"></i>
            {{ esEdicion ? 'Editar ficha técnica del producto' : 'Registrar nuevo producto' }}
          </h5>
          <button type="button" class="btn-close" aria-label="Cerrar" :disabled="cargando" @click="emit('cerrar')"></button>
        </div>

        <form @submit.prevent="enviarFormulario" novalidate>
          <div class="modal-body">
            <!-- ============ ESTADO DE ERROR: fallo al cargar categorías ============ -->
            <div v-if="mensajeError" class="readonly-note" role="alert">
              <i class="bi bi-exclamation-triangle-fill"></i>
              <span>{{ mensajeError }}</span>
            </div>

            <!-- ============ ESTADO DE ERROR: rechazo del backend (400/404/500) ============ -->
            <div v-if="errorBackend" class="readonly-note" role="alert">
              <i class="bi bi-exclamation-triangle-fill"></i>
              <span>{{ errorBackend }}</span>
            </div>

            <div class="row g-3">
              <!-- Código = llave primaria `cod_producto` (no editable en edición) -->
              <div class="col-md-6">
                <label class="form-label" for="producto-codigo">Código del producto*</label>
                <input
                  id="producto-codigo"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': erroresValidacion.cod_producto }"
                  v-model="formulario.cod_producto"
                  :disabled="esEdicion || cargando"
                  maxlength="50"
                  placeholder="REP-PAN-004"
                  autocomplete="off"
                >
                <div v-if="erroresValidacion.cod_producto" class="invalid-feedback">{{ erroresValidacion.cod_producto }}</div>
                <div v-else-if="esEdicion" class="form-text">Llave primaria: no puede modificarse.</div>
              </div>

              <!-- Categoría = columna `id_categoria`, cargada en vivo desde el CRUD 4 -->
              <div class="col-md-6">
                <label class="form-label" for="producto-categoria">Categoría*</label>

                <!-- ESTADO DE CARGA del selector de categorías -->
                <div v-if="cargandoCategorias" class="d-flex align-items-center gap-2">
                  <span class="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true"></span>
                  <span class="form-text mb-0">Cargando categorías desde la base de datos...</span>
                </div>

                <template v-else>
                  <select
                    id="producto-categoria"
                    class="form-select"
                    :class="{ 'is-invalid': erroresValidacion.id_categoria }"
                    v-model="formulario.id_categoria"
                    :disabled="cargando || categoriasParaSelector.length === 0"
                  >
                    <option value="" disabled>Selecciona una categoría...</option>
                    <option
                      v-for="categoria in categoriasParaSelector"
                      :key="categoria.id_categoria"
                      :value="categoria.id_categoria"
                      :disabled="categoria.inactiva"
                    >
                      {{ categoria.nombre_categoria }}
                    </option>
                  </select>
                  <div v-if="erroresValidacion.id_categoria" class="invalid-feedback">
                    {{ erroresValidacion.id_categoria }}
                  </div>
                  <div v-else-if="categoriasParaSelector.length === 0" class="form-text text-danger">
                    No hay categorías activas. Regístrelas primero en el módulo de Categorías.
                  </div>
                </template>
              </div>

              <!-- Nombre = columna `nombre_producto` -->
              <div class="col-md-6">
                <label class="form-label" for="producto-nombre">Nombre*</label>
                <input
                  id="producto-nombre"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': erroresValidacion.nombre_producto }"
                  v-model="formulario.nombre_producto"
                  :disabled="cargando"
                  maxlength="150"
                  placeholder="Pantalla OLED iPhone 13"
                >
                <div v-if="erroresValidacion.nombre_producto" class="invalid-feedback">
                  {{ erroresValidacion.nombre_producto }}
                </div>
              </div>

              <!-- Marca = columna `marca` -->
              <div class="col-md-6">
                <label class="form-label" for="producto-marca">Marca*</label>
                <input
                  id="producto-marca"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': erroresValidacion.marca }"
                  v-model="formulario.marca"
                  :disabled="cargando"
                  maxlength="50"
                  placeholder="Apple · Compatible"
                >
                <div v-if="erroresValidacion.marca" class="invalid-feedback">{{ erroresValidacion.marca }}</div>
              </div>

              <!-- Costo = columna `precio_costo` -->
              <div class="col-md-4">
                <label class="form-label" for="producto-costo">Precio costo*</label>
                <input
                  id="producto-costo"
                  type="number"
                  step="0.01"
                  min="0"
                  class="form-control"
                  :class="{ 'is-invalid': erroresValidacion.precio_costo }"
                  v-model.number="formulario.precio_costo"
                  :disabled="cargando"
                >
                <div v-if="erroresValidacion.precio_costo" class="invalid-feedback">
                  {{ erroresValidacion.precio_costo }}
                </div>
              </div>

              <!-- Precio de venta = columna `precio_venta` -->
              <div class="col-md-4">
                <label class="form-label" for="producto-precio">Precio venta*</label>
                <input
                  id="producto-precio"
                  type="number"
                  step="0.01"
                  min="0"
                  class="form-control"
                  :class="{ 'is-invalid': erroresValidacion.precio_venta }"
                  v-model.number="formulario.precio_venta"
                  :disabled="cargando"
                >
                <div v-if="erroresValidacion.precio_venta" class="invalid-feedback">
                  {{ erroresValidacion.precio_venta }}
                </div>
              </div>

              <!-- Stock mínimo = columna `stock_minimo` (umbral de alerta) -->
              <div class="col-md-4">
                <label class="form-label" for="producto-minimo">Stock mínimo*</label>
                <input
                  id="producto-minimo"
                  type="number"
                  min="0"
                  step="1"
                  class="form-control"
                  :class="{ 'is-invalid': erroresValidacion.stock_minimo }"
                  v-model.number="formulario.stock_minimo"
                  :disabled="cargando"
                >
                <div v-if="erroresValidacion.stock_minimo" class="invalid-feedback">
                  {{ erroresValidacion.stock_minimo }}
                </div>
                <div v-else class="form-text">Umbral que activa la alerta de reposición.</div>
              </div>

              <!-- ============ VALIDACIÓN DE NEGOCIO: ERROR (bloquea guardado) ============ -->
              <div v-if="resultadoValidacionMinimo.hayError" class="col-12">
                <div class="readonly-note" role="alert">
                  <i class="bi bi-exclamation-triangle-fill"></i>
                  <span>{{ resultadoValidacionMinimo.mensaje }}</span>
                </div>
              </div>

              <!-- ============ VALIDACIÓN DE NEGOCIO: ADVERTENCIA (permite guardar) ============ -->
              <div v-else-if="resultadoValidacionMinimo.hayAdvertencia" class="col-12">
                <div class="readonly-note" style="background:#fef3c7;color:#92400e;border-color:#fcd34d;" role="status">
                  <i class="bi bi-info-circle-fill"></i>
                  <span>{{ resultadoValidacionMinimo.mensaje }}</span>
                </div>
              </div>

              <!-- Existencia = columna `existencia` (ESTO ES SOLO LECTURA, no se captura) -->
              <div class="col-12" v-if="esEdicion">
                <label class="form-label" for="producto-existencia">Existencia actual</label>
                <input
                  id="producto-existencia"
                  type="number"
                  class="form-control"
                  :value="existenciaActual"
                  disabled
                  readonly
                >
                <div class="form-text">
                  Campo de sólo lectura. La cantidad física se modifica en el módulo de
                  Almacén (Ajuste de existencias) y en Entradas y Salidas.
                </div>
              </div>

              <!-- Imagen = columna `imagen`, más su vista previa -->
              <div class="col-md-6">
                <label class="form-label" for="producto-imagen">Imagen del catálogo</label>
                <select id="producto-imagen" class="form-select" v-model="formulario.imagen" :disabled="cargando">
                  <option v-for="imagen in catalogoImagenes" :key="imagen.archivo" :value="imagen.archivo">
                    {{ imagen.etiqueta }}
                  </option>
                </select>
              </div>

              <div class="col-md-6">
                <label class="form-label">Vista previa</label>
                <div class="img-preview">
                  <img :src="rutaVistaPrevia" :alt="formulario.nombre_producto || 'Vista previa del producto'">
                  <p>La fotografía se mostrará en la vista de Cards del catálogo.</p>
                </div>
              </div>

              <!-- Descripción = columna `descripcion` -->
              <div class="col-12">
                <label class="form-label" for="producto-descripcion">Detalles adicionales (descripcion)</label>
                <textarea
                  id="producto-descripcion"
                  class="form-control"
                  v-model="formulario.descripcion"
                  :disabled="cargando"
                  placeholder="Compatibilidad, garantía, proveedor..."
                ></textarea>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" :disabled="cargando" @click="emit('cerrar')">
              Cancelar
            </button>
            <!--
              Botón deshabilitado durante la petición y
              cuando la regla de negocio del stock mínimo bloquea el guardado.
            -->
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="cargando || cargandoCategorias || guardadoBloqueado"
            >
              <span v-if="cargando" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
              {{ cargando ? 'Guardando...' : (esEdicion ? 'Guardar cambios' : 'Registrar producto') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
