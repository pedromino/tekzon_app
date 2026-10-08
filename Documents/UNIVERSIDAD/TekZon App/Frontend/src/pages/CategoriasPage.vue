<script setup>
/**
 * ==========================================================================
 * PÁGINA DE CATEGORÍAS (CategoriasPage.vue) - TEKZON C.A.
 * ==========================================================================
 * CRUD 4 · Registro y Gestión de Categorías de Productos
 *
 * PROPÓSITO FUNCIONAL:
 *   Administra la clasificación de repuestos, accesorios y equipos del
 *   catálogo maestro: alta, edición (renombrado) y ACTIVACIÓN/DESACTIVACIÓN
 *   mediante un switch de baja lógica. Muestra cuántos productos dependen de
 *   cada categoría para advertir el impacto antes de desactivarla.
 *
 * PROPÓSITO TÉCNICO:
 *   - PUREZA DE DATOS: la tabla se alimenta de `CategoriaServices`, que
 *     consulta la tabla `categoria` de `tekzon_bd`. Cero arreglos estáticos.
 *   - BAJA LÓGICA: el switch invoca DELETE (estado = 0) o PATCH /reactivar
 *     (estado = 1). Nunca se ejecuta un borrado físico, preservando la llave
 *     foránea `fk_producto_categoria` que sostiene la interconexión con el
 *     CRUD 1.
 *   - Implementa los 3 estados de UI:
 *       CARGANDO -> `LoadingSpinner` y spinner por fila mientras cambia el
 *                   switch (`categoriaEnProceso`).
 *       ÉXITO    -> Toast con el mensaje y el número de productos afectados.
 *       ERROR    -> Toast con el código HTTP (400 duplicado/estado inválido,
 *                   404 inexistente, 500 del servidor) y panel persistente
 *                   con botón "Reintentar".
 *   - Todos los botones usan `:disabled` durante las peticiones.
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import CategoriaModal from '../components/CategoriaModal.vue';
import ModalConfirmacion from '../components/ModalConfirmacion.vue';
import CategoriaServices from '../services/CategoriaServices.js';
import ProductoServices from '../services/ProductoServices.js';
// Utilitario compartido de apertura/cierre de modales de Bootstrap 5.
import { abrirModal, cerrarModal } from '../utils/utilidadesModales.js';

// ==========================================================================
// ESTADO REACTIVO PRINCIPAL
// ==========================================================================
const categorias = ref([]);      // Categorías reales de la tabla `categoria`
const productos = ref([]);       // Catálogo del CRUD 1 (para el filtro)

const textoBusqueda = ref('');
const filtroEstado = ref('');    // '' | 'activas' | 'inactivas'

// ==========================================================================
// ESTADOS DE UI (Cargando / Éxito / Error)
// ==========================================================================
const estadoCarga = ref(false);
const mensajeErrorCarga = ref('');
const codigoErrorCarga = ref(null);

const categoriaActual = ref(null);
const esEdicion = ref(false);
const procesandoGuardado = ref(false);
/** Identificador de la categoría cuyo switch está cambiando de estado. */
const categoriaEnProceso = ref(null);

// ---------------------------------------------------------------------------
// ESTADO DEL MODAL DE CONFIRMACIÓN (reemplaza a window.confirm)
// ---------------------------------------------------------------------------
/** Categoría sobre la que se ejecutará la baja lógica o la reactivación. */
const categoriaAConfirmar = ref(null);
/** True mientras la baja/reactivación viaja al servidor. */
const procesandoCambioEstado = ref(false);

const notificaciones = ref([]);

// ==========================================================================
// SISTEMA DE NOTIFICACIONES TOAST
// ==========================================================================
const mostrarToast = (titulo, mensaje, tipo = 'success') => {
  const id = Date.now() + Math.random();

  notificaciones.value.push({ id, titulo, mensaje, tipo });

  setTimeout(() => {
    notificaciones.value = notificaciones.value.filter((toast) => toast.id !== id);
  }, 4000);
};

const cerrarToastPorId = (id) => {
  notificaciones.value = notificaciones.value.filter((toast) => toast.id !== id);
};

/* Esto raduce un error del API a un mensaje con su código HTTP visible. */
const describirError = (error) => {
  const codigo = error?.codigoHttp ?? 500;
  const detalle = error?.mensaje || 'Ocurrió un error inesperado.';

  if (error?.esErrorConexion) {
    return { codigo: 'SIN CONEXIÓN', mensaje: detalle };
  }

  const etiquetas = {
    400: 'Datos inválidos',
    404: 'Recurso no encontrado',
    409: 'Conflicto de integridad',
    500: 'Error interno del servidor'
  };

  return {
    codigo: `HTTP ${codigo}`,
    mensaje: `${etiquetas[codigo] ? `${etiquetas[codigo]}: ` : ''}${detalle}`
  };
};

/*
 * CARGA LAS CATEGORÍAS Y EL CATÁLOGO.
 *
 * Las categorías se piden SIN filtro de estado (para poder
 * administrar también las inactivas) y el catálogo se usa para calcular el
 * porcentaje de uso de cada clasificación. `Promise.all` paraleliza ambas
 * consultas.
 */
const cargarCategorias = async () => {
  estadoCarga.value = true;
  mensajeErrorCarga.value = '';
  codigoErrorCarga.value = null;

  try {
    const [listaCategorias, catalogoProductos] = await Promise.all([
      CategoriaServices.listarCategorias(false),
      ProductoServices.listarProductos(false)
    ]);

    categorias.value = listaCategorias;
    productos.value = catalogoProductos;
  } catch (error) {
    categorias.value = [];

    const descripcion = describirError(error);
    codigoErrorCarga.value = descripcion.codigo;
    mensajeErrorCarga.value = descripcion.mensaje;

    mostrarToast(`Error al cargar categorías (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    estadoCarga.value = false;
  }
};

onMounted(() => {
  cargarCategorias();
});

// ==========================================================================
// INDICADORES KPI
// ==========================================================================
const totalCategorias = computed(() => categorias.value.length);
const totalActivas = computed(() => categorias.value.filter((c) => c.activa).length);
const totalInactivas = computed(() => totalCategorias.value - totalActivas.value);
/** Productos activos que tienen una categoría asignada. */
const totalProductosClasificados = computed(() =>
  productos.value.filter((producto) => producto.estado === 1 && producto.id_categoria).length
);

/**
 * Conteo real de productos por categoría calculado en el cliente.
 * El backend también lo entrega (`total_productos`); se recalcula aquí para
 * que el switch refleje de inmediato cualquier cambio del catálogo.
 */
const conteoProductosPorCategoria = computed(() => {
  const conteo = {};

  productos.value
    .filter((producto) => producto.estado === 1)
    .forEach((producto) => {
      const id = Number(producto.id_categoria);
      if (!id) return;
      conteo[id] = (conteo[id] || 0) + 1;
    });

  return conteo;
});

// ==========================================================================
// FILTRADO
// ==========================================================================
const categoriasFiltradas = computed(() => {
  const texto = textoBusqueda.value.trim().toLowerCase();

  return categorias.value.filter((categoria) => {
    const coincideTexto = !texto || String(categoria.nombre_categoria).toLowerCase().includes(texto);

    const coincideEstado = filtroEstado.value === 'activas'
      ? categoria.activa
      : filtroEstado.value === 'inactivas'
        ? !categoria.activa
        : true;

    return coincideTexto && coincideEstado;
  });
});

// ==========================================================================
// CRUD 4: ALTA Y EDICIÓN
// ==========================================================================
const prepararCreacion = () => {
  categoriaActual.value = null;
  esEdicion.value = false;
  abrirModal('categoriaModal');
};

const prepararEdicion = (categoria) => {
  categoriaActual.value = { ...categoria };
  esEdicion.value = true;
  abrirModal('categoriaModal');
};

/*
 * GUARDA LA CATEGORÍA.
 * El estado de Éxito se comunica con el Toast y se refresca la tabla.
 */
const guardarCategoria = async (datosCategoria) => {
  procesandoGuardado.value = true;

  try {
    if (esEdicion.value) {
      const resultado = await CategoriaServices.actualizarCategoria(
        datosCategoria.id_categoria,
        datosCategoria
      );
      mostrarToast('¡Categoría actualizada!', resultado.mensaje, 'success');
    } else {
      const resultado = await CategoriaServices.crearCategoria(datosCategoria);
      mostrarToast('¡Categoría registrada!', resultado.mensaje, 'success');
    }

    await cargarCategorias();
    cerrarModal('categoriaModal');
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`No se pudo guardar (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    procesandoGuardado.value = false;
  }
};

// ==========================================================================
// CRUD 4: BAJA LÓGICA / REACTIVACIÓN (SWITCH DE ESTADO)
// ==========================================================================
/**
 * ABRE EL MODAL DE CONFIRMACIÓN PARA CAMBIAR EL ESTADO DE UNA CATEGORÍA.
 *
 * tanto la desactivación (baja lógica) como la
 * reactivación modifican la columna `estado` de la tabla `categoria`, por lo
 * que se exige una confirmación explícita ANTES de escribir en MySQL.
 */
const solicitarCambioEstado = (categoria) => {
  categoriaAConfirmar.value = categoria;
  abrirModal('confirmarEstadoCategoriaModal');
};

/**
 * CANCELA LA CONFIRMACIÓN SIN TOCAR LA BASE DE DATOS.
 * El switch vuelve a reflejar el estado real porque el `:checked` está ligado
 * a `categoria.activa` y no se modificó ningún dato.
 */
const cancelarCambioEstado = () => {
  cerrarModal('confirmarEstadoCategoriaModal');
  categoriaAConfirmar.value = null;
};

/**
 * EJECUTA EL CAMBIO DE ESTADO CONFIRMADO.
 *el switch decide entre desactivar (DELETE -> estado = 0)
 * y reactivar (PATCH -> estado = 1). La baja NUNCA es física, de modo que la
 * llave foránea `fk_producto_categoria` que sostiene la interconexión con el
 * CRUD 1 permanece intacta.
 */
const confirmarCambioEstadoCategoria = async () => {
  const categoria = categoriaAConfirmar.value;

  if (!categoria) return;

  const vaADesactivar = categoria.activa;

  procesandoCambioEstado.value = true;
  categoriaEnProceso.value = categoria.id_categoria;

  try {
    if (vaADesactivar) {
      const resultado = await CategoriaServices.desactivarCategoria(categoria.id_categoria);
      mostrarToast('Categoría desactivada', resultado.mensaje, 'success');
    } else {
      const resultado = await CategoriaServices.reactivarCategoria(categoria.id_categoria);
      mostrarToast('Categoría reactivada', resultado.mensaje, 'success');
    }

    // Se recarga desde MySQL para que la tabla y los KPI reflejen el nuevo estado.
    await cargarCategorias();
    cerrarModal('confirmarEstadoCategoriaModal');
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`Operación rechazada (${descripcion.codigo})`, descripcion.mensaje, 'error');

    // Se recarga para que el switch vuelva a reflejar el estado real de MySQL.
    await cargarCategorias();
    cerrarModal('confirmarEstadoCategoriaModal');
  } finally {
    procesandoCambioEstado.value = false;
    categoriaEnProceso.value = null;
    categoriaAConfirmar.value = null;
  }
};

/** Cuenta los productos activos asociados a una categoría. */
function conteoProductosPorCatalogo(idCategoria) {
  return conteoProductosPorCategoria.value[Number(idCategoria)] || 0;
}

// ==========================================================================
// TEXTOS DINÁMICOS DEL MODAL DE CONFIRMACIÓN
// ==========================================================================
/** True cuando la acción confirmada desactivará la categoría. */
const confirmacionEsDesactivacion = computed(() => Boolean(categoriaAConfirmar.value?.activa));

/** Título del modal según el sentido de la operación. */
const tituloConfirmacion = computed(() =>
  confirmacionEsDesactivacion.value ? 'Confirmar desactivación' : 'Confirmar reactivación'
);

/** Mensaje principal del modal de confirmación. */
const mensajeConfirmacion = computed(() => {
  const categoria = categoriaAConfirmar.value;

  if (!categoria) return '¿Está seguro de continuar con esta operación?';

  return confirmacionEsDesactivacion.value
    ? `¿Confirma desactivar la categoría "${categoria.nombre_categoria}"?`
    : `¿Confirma reactivar la categoría "${categoria.nombre_categoria}"?`;
});

/** Detalle de consecuencias en la base de datos, con el conteo real de productos. */
const detalleConfirmacion = computed(() => {
  const categoria = categoriaAConfirmar.value;

  if (!categoria) return '';

  if (confirmacionEsDesactivacion.value) {
    const asociados = conteoProductosPorCatalogo(categoria.id_categoria);

    return asociados > 0
      ? `Se aplicará una BAJA LÓGICA (estado = 0). Los ${asociados} producto(s) que clasifica `
        + 'conservarán su clasificación histórica y la integridad referencial se mantiene.'
      : 'Se aplicará una BAJA LÓGICA (estado = 0). La categoría dejará de ofrecerse en el '
        + 'formulario de alta de productos. No se elimina ninguna fila de la base de datos.';
  }

  return 'La categoría volverá a estar disponible en el formulario de alta de productos (estado = 1).';
});
</script>

<template>
  <main class="content" id="contenido">
    <!-- ESTADO DE ÉXITO / ERROR: pila de notificaciones flotantes -->
    <ToastNotificaciones :notificaciones="notificaciones" @cerrar="cerrarToastPorId" />

    <div class="page-head">
      <div>
        <h2>Categorías de productos</h2>
        <p>
          Clasificación de repuestos, accesorios y equipos.
        </p>
      </div>
      <button class="btn btn-primary" type="button" @click="prepararCreacion">
        <i class="bi bi-plus-lg"></i> Nueva categoría
      </button>
    </div>

    <!-- ================= ESTADO DE CARGA ================= -->
    <LoadingSpinner v-if="estadoCarga" mensaje="Cargando categorías de productos..." />

    <template v-else>
      <!-- ================= ESTADO DE ERROR PERSISTENTE ================= -->
      <div v-if="mensajeErrorCarga" class="readonly-note mb-3" role="alert">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span><strong>{{ codigoErrorCarga }}</strong> · {{ mensajeErrorCarga }}</span>
        <button class="btn btn-sm btn-outline-danger ms-auto" type="button" @click="cargarCategorias">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button>
      </div>

      <!-- ================= INDICADORES KPI ================= -->
      <section class="row g-3 mb-3">
        <div class="col-6 col-lg-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Categorías registradas</p>
              <i class="bi bi-tags kpi__icon"></i>
            </div>
            <p class="kpi__value">{{ totalCategorias }}</p>
            <p class="kpi__meta">Clasificaciones en la base de datos</p>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Categorías activas</p>
              <i class="bi bi-check-circle kpi__icon" style="color:var(--color-success)"></i>
            </div>
            <p class="kpi__value">{{ totalActivas }}</p>
            <p class="kpi__meta">Disponibles en el formulario de productos</p>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Categorías inactivas</p>
              <i class="bi bi-slash-circle kpi__icon" style="color:var(--color-danger)"></i>
            </div>
            <p class="kpi__value">{{ totalInactivas }}</p>
            <p class="kpi__meta">Estado deshabilitadas</p>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi kpi--featured">
            <div class="kpi__top">
              <p class="kpi__label">Productos clasificados</p>
              <i class="bi bi-box-seam kpi__icon"></i>
            </div>
            <p class="kpi__value">{{ totalProductosClasificados }}</p>
            <p class="kpi__meta">Artículos activos con categoría asignada</p>
            <div class="progress-thin"><span style="width:100%"></span></div>
          </div>
        </div>
      </section>

      <!-- ================= TABLA DE CATEGORÍAS ================= -->
      <section class="card-ts">
        <div class="toolbar">
          <div class="input-icon">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input
              class="form-control"
              v-model="textoBusqueda"
              type="search"
              placeholder="Buscar categoría por nombre"
              aria-label="Buscar categoría"
            >
          </div>

          <select class="form-select" v-model="filtroEstado" aria-label="Filtrar por estado">
            <option value="">Todas</option>
            <option value="activas">Solo activas</option>
            <option value="inactivas">Solo inactivas</option>
          </select>
        </div>

        <div class="summary-strip px-3 pt-3">
          <span class="chip">
            <i class="bi bi-funnel"></i> Mostrando <strong>{{ categoriasFiltradas.length }}</strong> de
            <strong>{{ totalCategorias }}</strong> categorías
          </span>
          <span class="chip"><i class="bi bi-toggle-on"></i> Activas: <strong>{{ totalActivas }}</strong></span>
          <span class="chip"><i class="bi bi-toggle-off"></i> Inactivas: <strong>{{ totalInactivas }}</strong></span>
        </div>

        <!-- Sub-estado: sin resultados -->
        <div v-if="categoriasFiltradas.length === 0" class="empty-state">
          <i class="bi bi-tags"></i>
          <h3>{{ totalCategorias === 0 ? 'No hay categorías registradas' : 'Sin resultados para el filtro' }}</h3>
          <p class="small">
            {{ totalCategorias === 0
              ? 'Registre la primera clasificación de productos con el botón "Nueva categoría".'
              : 'Modifique la búsqueda o el filtro de estado.' }}
          </p>
          <button v-if="totalCategorias === 0" class="btn btn-primary" type="button" @click="prepararCreacion">
            <i class="bi bi-plus-lg"></i> Registrar primera categoría
          </button>
          <button v-else class="btn btn-outline-secondary" type="button"
                  @click="textoBusqueda = ''; filtroEstado = ''">
            <i class="bi bi-x-circle"></i> Limpiar filtros
          </button>
        </div>

        <div v-else class="p-3">
          <div class="table-wrap">
            <table class="table table-ts">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Categoría</th>
                  <th scope="col" class="text-center">Productos activos</th>
                  <th scope="col" class="text-center">Participación</th>
                  <th scope="col">Estado</th>
                  <th scope="col" class="text-center">Activación</th>
                  <th scope="col" class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="categoria in categoriasFiltradas" :key="categoria.id_categoria">
                  <td class="tabular text-muted-2">{{ categoria.id_categoria }}</td>

                  <td>
                    <strong class="fw-semibold d-block">{{ categoria.nombre_categoria }}</strong>
                    <small class="text-muted-2">Clasificación del catálogo maestro</small>
                  </td>

                  <td class="text-center tabular">
                    <span class="badge-ts" :class="conteoProductosPorCatalogo(categoria.id_categoria) > 0 ? 'badge-brand' : 'badge-neutral'">
                      {{ conteoProductosPorCatalogo(categoria.id_categoria) }}
                    </span>
                  </td>

                  <td class="text-center" style="min-width:140px;">
                    <div class="stock-meter">
                      <span
                        :style="{
                          width: totalProductosClasificados
                            ? `${(conteoProductosPorCatalogo(categoria.id_categoria) / totalProductosClasificados) * 100}%`
                            : '0%',
                          backgroundColor: 'var(--brand-primary)'
                        }"
                      ></span>
                    </div>
                    <small class="text-muted-2">
                      {{ totalProductosClasificados
                        ? Math.round((conteoProductosPorCatalogo(categoria.id_categoria) / totalProductosClasificados) * 100)
                        : 0 }}%
                    </small>
                  </td>

                  <td>
                    <span class="badge-ts" :class="categoria.activa ? 'badge-ok' : 'badge-out'">
                      {{ categoria.activa ? 'Activa' : 'Inactiva' }}
                    </span>
                  </td>

                  <!-- SWITCH DE ACTIVACIÓN / DESACTIVACIÓN LÓGICA -->
                  <td class="text-center">
                    <div class="form-check form-switch d-inline-flex align-items-center gap-2 mb-0">
                      <input
                        class="form-check-input"
                        type="checkbox"
                        role="switch"
                        :id="`switch-categoria-${categoria.id_categoria}`"
                        :checked="categoria.activa"
                        :disabled="categoriaEnProceso === categoria.id_categoria"
                        @change="solicitarCambioEstado(categoria)"
                      >
                      <span v-if="categoriaEnProceso === categoria.id_categoria"
                            class="spinner-border spinner-border-sm text-primary"
                            role="status" aria-hidden="true"></span>
                      <label class="form-check-label small text-muted-2" :for="`switch-categoria-${categoria.id_categoria}`">
                        {{ categoria.activa ? 'Desactivar' : 'Activar' }}
                      </label>
                    </div>
                  </td>

                  <td class="text-end">
                    <button
                      class="btn btn-ghost btn-icon"
                      type="button"
                      title="Editar categoría"
                      :disabled="categoriaEnProceso === categoria.id_categoria"
                      @click="prepararEdicion(categoria)"
                    >
                      <i class="bi bi-pencil-square"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <!-- ================= MODAL DE ALTA / EDICIÓN (CRUD 4) ================= -->
    <CategoriaModal
      :categoria="categoriaActual"
      :es-edicion="esEdicion"
      :cargando="procesandoGuardado"
      @guardar="guardarCategoria"
      @cerrar="cerrarModal('categoriaModal')"
    />

    <!--
      ==========================================================================
      MODAL DE CONFIRMACIÓN DE CAMBIO DE ESTADO (sustituye a window.confirm)
      ==========================================================================
      La desactivación (baja lógica, estado = 0) y la reactivación (estado = 1)
      modifican la tabla `categoria`, por lo que se exige confirmación explícita
      antes de ejecutar el DELETE / PATCH en el backend. El texto se adapta al
      sentido de la operación y al número real de productos que la categoría
      clasifica.
    -->
    <ModalConfirmacion
      id-modal="confirmarEstadoCategoriaModal"
      :titulo="tituloConfirmacion"
      :mensaje="mensajeConfirmacion"
      :detalle="detalleConfirmacion"
      :texto-confirmar="confirmacionEsDesactivacion ? 'Sí, desactivar' : 'Sí, reactivar'"
      :texto-cancelar="'Cancelar'"
      :variante="confirmacionEsDesactivacion ? 'danger' : 'primary'"
      :icono="confirmacionEsDesactivacion ? 'bi-toggle-off' : 'bi-toggle-on'"
      :procesando="procesandoCambioEstado"
      @confirmar="confirmarCambioEstadoCategoria"
      @cancelar="cancelarCambioEstado"
    />
  </main>
</template>
