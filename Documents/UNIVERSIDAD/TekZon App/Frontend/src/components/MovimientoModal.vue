<script setup>
/**
 * ==========================================================================
 * COMPONENTE MOVIMIENTOMODAL.VUE - TEKZON C.A.
 * ==========================================================================
 * CRUD 3 · Movimientos de Inventario (Historial transaccional)
 *
 * PROPÓSITO FUNCIONAL:
 *   Formulario modal para registrar una ENTRADA (compra, devolución,
 *   reposición) o una SALIDA (uso en orden de servicio, merma, traslado)
 *   física de mercancía. Muestra la existencia actual del producto
 *   seleccionado y previsualiza la existencia resultante antes de confirmar.
 *
 * PROPÓSITO TÉCNICO:
 *   - MAPEO CON LA BASE DE DATOS: los `v-model` usan los nombres EXACTOS de las
 *     columnas de `movimiento_inventario` (cod_producto, tipo_movimiento,
 *     cantidad, motivo) y de `producto` (existencia, stock_minimo).
 *
 *   - INTERCONEXIÓN CON EL CRUD 1: la lista de productos se obtiene en vivo de
 *     `ProductoServices.listarProductos()`. Cero arrays estáticos.
 *
 *   - CÁLCULO ATÓMICO EN EL SERVIDOR: el frontend NUNCA envía la existencia
 *     resultante; el backend la calcula dentro de una transacción SQL
 *     (SELECT ... FOR UPDATE) y actualiza `producto.existencia` en la misma
 *     operación en que inserta el asiento del historial. Aquí sólo se previsualiza
 *     de forma informativa.
 *
 *   - CONFIRMACIÓN PREVIA (`mostrarConfirmacion`): registrar una entrada o
 *     salida altera el stock físico, por lo que se pide confirmación explícita
 *     con el resumen del movimiento antes de enviar el POST.
 *
 *   - 3 ESTADOS DE UI: Cargando (`cargandoProductos` en el selector y
 *     `guardando` durante el POST), Éxito (la página lanza el Toast con la
 *     traza "existencia previa -> posterior") y Error (`mensajeError` con el
 *     código HTTP: 400 por stock insuficiente o motivo faltante, 404 producto
 *     inexistente, 500 fallo del servidor).
 * ==========================================================================
 */
import { ref, computed, watch, onMounted } from 'vue';
import ProductoServices from '../services/ProductoServices.js';
import MovimientoServices, { ID_USUARIO_RESPONSABLE } from '../services/MovimientoServices.js';

const props = defineProps({
  /** Producto preseleccionado (cuando se abre el modal desde una fila). */
  producto: { type: Object, default: null },
  /** Bandera controlada por la página mientras el POST está en curso. */
  cargando: { type: Boolean, default: false }
});

const emit = defineEmits(['guardar', 'cerrar']);

// ---------------------------------------------------------------------------
// ESTADO DEL FORMULARIO
// Nombres de campo = nombres EXACTOS de las columnas de `movimiento_inventario`.
// ---------------------------------------------------------------------------
const formulario = ref({
  cod_producto: '',
  tipo_movimiento: 'ENTRADA',
  cantidad: 1,
  motivo: ''
});

// ---------------------------------------------------------------------------
// ESTADOS DE UI (Cargando / Éxito / Error)
// ---------------------------------------------------------------------------
/** Estado de Carga: catálogo de productos para el selector. */
const cargandoProductos = ref(false);
/** Estado de Carga: envío del movimiento. */
const guardando = ref(false);
/** Estado de Error: notificación con código HTTP. */
const mensajeError = ref('');
/** Estado de Error: validaciones por campo. */
const erroresValidacion = ref({});
/** Control del modal de confirmación previa al registro. */
const mostrarConfirmacion = ref(false);
/** Lista de productos activos servida por el CRUD 1. */
const listaProductos = ref([]);

/** Tipos de movimiento ofrecidos por la interfaz (el AJUSTE va por el CRUD 2). */
const tiposMovimiento = [
  {
    valor: 'ENTRADA',
    etiqueta: 'Entrada',
    icono: 'bi-box-arrow-in-down',
    ayuda: 'Compra, devolución o reposición de mercancía.'
  },
  {
    valor: 'SALIDA',
    etiqueta: 'Salida',
    icono: 'bi-box-arrow-up',
    ayuda: 'Uso en orden de servicio, merma o traslado.'
  }
];

/** Producto actualmente seleccionado en el formulario. */
const productoSeleccionado = computed(() =>
  listaProductos.value.find(
    (producto) => producto.cod_producto === formulario.value.cod_producto
  ) || null
);

/** Existencia actual del producto seleccionado (columna `producto.existencia`). */
const existenciaActual = computed(() => Number(productoSeleccionado.value?.existencia || 0));

/** Stock mínimo del producto seleccionado (columna `producto.stock_minimo`). */
const stockMinimoProducto = computed(() => Number(productoSeleccionado.value?.stock_minimo || 0));

/** Existencia resultante previsualizada (cálculo informativo en el cliente). */
const existenciaResultante = computed(() => {
  const cantidad = Number(formulario.value.cantidad || 0);

  return formulario.value.tipo_movimiento === 'ENTRADA'
    ? existenciaActual.value + cantidad
    : existenciaActual.value - cantidad;
});

/** True cuando la salida solicitada excede el stock disponible. */
const stockInsuficiente = computed(() =>
  formulario.value.tipo_movimiento === 'SALIDA'
  && Boolean(formulario.value.cod_producto)
  && existenciaResultante.value < 0
);

/** True cuando la operación dejará el producto bajo el umbral de alerta. */
const quedaraBajoMinimo = computed(() =>
  Boolean(productoSeleccionado.value)
  && !stockInsuficiente.value
  && existenciaResultante.value <= stockMinimoProducto.value
);

/**
 * CARGA EL CATÁLOGO DE PRODUCTOS DESDE EL BACKEND (interconexión CRUD 1).
 *
 * envuelto en try/catch para exponer el estado de Error con
 * el código HTTP correspondiente si el servidor no responde.
 */
const cargarProductos = async () => {
  cargandoProductos.value = true;
  mensajeError.value = '';

  try {
    listaProductos.value = await ProductoServices.listarProductos(false);
  } catch (error) {
    listaProductos.value = [];
    mensajeError.value =
      `[HTTP ${error.codigoHttp || 500}] ${error.mensaje || 'No se pudo cargar el catálogo de productos.'}`;
  } finally {
    cargandoProductos.value = false;
  }
};

onMounted(() => {
  cargarProductos();
});

/**
 * Reinicia el formulario al abrir el modal con un producto preseleccionado.
 * Si no viene producto, arranca en blanco con tipo ENTRADA y cantidad 1.
 */
watch(
  () => props.producto,
  (nuevoProducto) => {
    erroresValidacion.value = {};
    mensajeError.value = '';
    mostrarConfirmacion.value = false;

    formulario.value = {
      cod_producto: nuevoProducto?.cod_producto ?? nuevoProducto?.codigo ?? '',
      tipo_movimiento: 'ENTRADA',
      cantidad: 1,
      motivo: ''
    };
  },
  { immediate: true }
);

/** Sincroniza la bandera de guardado con la prop del padre. */
watch(
  () => props.cargando,
  (valor) => {
    guardando.value = Boolean(valor);
  }
);

/**
 * VALIDACIÓN LOCAL DEL MOVIMIENTO.
 * Réplica de las reglas del backend para dar respuesta inmediata; el servidor
 * vuelve a validar y es la autoridad final (HTTP 400/404).
 */
const validarMovimiento = () => {
  const errores = {};

  if (!formulario.value.cod_producto) {
    errores.cod_producto = 'Debe seleccionar el producto a movilizar.';
  }

  if (!['ENTRADA', 'SALIDA'].includes(formulario.value.tipo_movimiento)) {
    errores.tipo_movimiento = 'El tipo de movimiento debe ser Entrada o Salida.';
  }

  const cantidad = Number(formulario.value.cantidad);

  if (!Number.isFinite(cantidad)) {
    errores.cantidad = 'La cantidad debe ser un valor numérico.';
  } else if (!Number.isInteger(cantidad)) {
    errores.cantidad = 'La cantidad debe ser un número entero de unidades.';
  } else if (cantidad <= 0) {
    errores.cantidad = 'La cantidad debe ser mayor que cero.';
  } else if (stockInsuficiente.value) {
    errores.cantidad = `Stock insuficiente: sólo hay ${existenciaActual.value} unidad(es) disponibles.`;
  }

  const motivo = String(formulario.value.motivo).trim();

  if (!motivo) {
    errores.motivo = 'El motivo o justificación del movimiento es obligatorio.';
  } else if (motivo.length > 150) {
    errores.motivo = 'El motivo no puede superar los 150 caracteres.';
  }

  erroresValidacion.value = errores;
  return Object.keys(errores).length === 0;
};

// ---------------------------------------------------------------------------
// CONFIRMACIÓN PREVIA Y ENVÍO
// ---------------------------------------------------------------------------
/**
 * ABRE EL MODAL DE CONFIRMACIÓN PREVIA.
 *
 * PROPÓSITO FUNCIONAL: una entrada o salida modifica la columna
 * `producto.existencia` y genera un asiento en `movimiento_inventario`, por lo
 * que se pide una confirmación explícita con el resumen antes de escribir.
 */
const abrirModalConfirmacion = () => {
  if (guardando.value || cargandoProductos.value || stockInsuficiente.value) return;
  if (!validarMovimiento()) return;

  mostrarConfirmacion.value = true;
  abrirModalBootstrap('confirmarMovimientoModal');
};

/**
 * CONFIRMA Y EMITE EL MOVIMIENTO A LA PÁGINA PADRE.
 * La página realiza el POST y muestra el Toast con la existencia posterior
 * calculada por el backend dentro de su transacción.
 */
const confirmarMovimiento = () => {
  if (guardando.value || stockInsuficiente.value) return;

  cerrarModalBootstrap('confirmarMovimientoModal');
  mostrarConfirmacion.value = false;

  emit('guardar', {
    cod_producto: formulario.value.cod_producto,
    tipo_movimiento: formulario.value.tipo_movimiento,
    cantidad: Number(formulario.value.cantidad),
    motivo: String(formulario.value.motivo).trim(),
    id_usuario: ID_USUARIO_RESPONSABLE
  });
};

/** Cancela la confirmación sin tocar la base de datos. */
const cancelarConfirmacion = () => {
  cerrarModalBootstrap('confirmarMovimientoModal');
  mostrarConfirmacion.value = false;
};

// ---------------------------------------------------------------------------
// UTILIDADES DE MODALES BOOTSTRAP
// ---------------------------------------------------------------------------
// Se delega en el utilitario compartido `utilidadesModales.js`, que reporta en
// consola si la API de Bootstrap no está disponible en window. Antes la guarda
// era silenciosa y los botones parecían "no hacer nada" sin dejar rastro.
// ---------------------------------------------------------------------------
import {
  abrirModal as abrirModalBootstrap,
  cerrarModal as cerrarModalBootstrap
} from '../utils/utilidadesModales.js';

/** Texto de la acción para los mensajes ("entrada" / "salida"). */
const nombreAccion = computed(() =>
  formulario.value.tipo_movimiento === 'ENTRADA' ? 'entrada' : 'salida'
);
</script>

<template>
  <div class="modal fade" id="movimientoModal" tabindex="-1" aria-hidden="true" aria-labelledby="movimientoModalLabel">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="movimientoModalLabel">
            <i class="bi bi-arrow-left-right"></i>
            Registrar movimiento de almacén
          </h5>
          <button type="button" class="btn-close" aria-label="Cerrar" :disabled="guardando" @click="emit('cerrar')"></button>
        </div>

        <form @submit.prevent="abrirModalConfirmacion" novalidate>
          <div class="modal-body">
            <!-- ============ ESTADO DE ERROR GLOBAL (HTTP 400/404/500) ============ -->
            <div v-if="mensajeError" class="readonly-note" role="alert">
              <i class="bi bi-exclamation-triangle-fill"></i>
              <span>{{ mensajeError }}</span>
            </div>

            <!-- ============ ESTADO DE CARGA del catálogo de productos ============ -->
            <div v-if="cargandoProductos" class="empty-state py-4">
              <div class="spinner-border text-primary mb-3" role="status" aria-hidden="true"></div>
              <h3>Cargando catálogo de productos...</h3>
              <p class="small">Consultando el servidor Tekzon...</p>
            </div>

            <div v-else class="row g-3">
              <!-- Producto = columna `cod_producto` (datos reales del CRUD 1) -->
              <div class="col-md-7">
                <label class="form-label" for="movimiento-producto">Producto</label>
                <select
                  id="movimiento-producto"
                  class="form-select"
                  :class="{ 'is-invalid': erroresValidacion.cod_producto }"
                  v-model="formulario.cod_producto"
                  :disabled="guardando"
                >
                  <option value="" disabled>Selecciona el producto...</option>
                  <option
                    v-for="producto in listaProductos"
                    :key="producto.cod_producto"
                    :value="producto.cod_producto"
                  >
                    {{ producto.cod_producto }} · {{ producto.nombre_producto }} (existencia: {{ producto.existencia }})
                  </option>
                </select>
                <div v-if="erroresValidacion.cod_producto" class="invalid-feedback">
                  {{ erroresValidacion.cod_producto }}
                </div>
                <div v-else-if="listaProductos.length === 0" class="form-text text-danger">
                  No hay productos activos en el catálogo. Regístrelos en el módulo de Inventario.
                </div>
              </div>

              <!-- Existencia actual del producto elegido (columna `existencia`) -->
              <div class="col-md-5">
                <label class="form-label">Existencia actual</label>
                <div class="d-flex align-items-center gap-2" style="min-height:46px;">
                  <span class="badge-ts badge-info no-dot">
                    <i class="bi bi-box-seam"></i>
                    {{ productoSeleccionado ? `${existenciaActual} u.` : '—' }}
                  </span>
                  <small v-if="productoSeleccionado" class="text-muted-2">
                    Mínimo {{ stockMinimoProducto }} u.
                  </small>
                </div>
              </div>

              <!-- Tipo de movimiento = columna `tipo_movimiento` -->
              <div class="col-12">
                <label class="form-label">Tipo de movimiento*</label>
                <div class="d-flex flex-wrap gap-2">
                  <button
                    v-for="tipo in tiposMovimiento"
                    :key="tipo.valor"
                    type="button"
                    class="btn"
                    :class="formulario.tipo_movimiento === tipo.valor
                      ? (tipo.valor === 'ENTRADA' ? 'btn-success' : 'btn-danger')
                      : 'btn-outline-secondary'"
                    :disabled="guardando"
                    @click="formulario.tipo_movimiento = tipo.valor"
                  >
                    <i class="bi" :class="tipo.icono"></i> {{ tipo.etiqueta }}
                  </button>
                </div>
                <div class="form-text">
                  {{ tiposMovimiento.find(t => t.valor === formulario.tipo_movimiento)?.ayuda }}
                </div>
              </div>

              <!-- Cantidad = columna `cantidad` -->
              <div class="col-md-5">
                <label class="form-label" for="movimiento-cantidad">Cantidad de unidades*</label>
                <input
                  id="movimiento-cantidad"
                  type="number"
                  step="1"
                  min="1"
                  class="form-control"
                  :class="{ 'is-invalid': erroresValidacion.cantidad }"
                  v-model.number="formulario.cantidad"
                  :disabled="guardando"
                >
                <div v-if="erroresValidacion.cantidad" class="invalid-feedback">{{ erroresValidacion.cantidad }}</div>
              </div>

              <!-- Existencia resultante previsualizada -->
              <div class="col-md-7">
                <label class="form-label">Existencia resultante</label>
                <div class="d-flex align-items-center gap-2 flex-wrap" style="min-height:46px;">
                  <template v-if="productoSeleccionado">
                    <strong class="tabular">{{ existenciaActual }} → {{ existenciaResultante }}</strong>
                    <span v-if="stockInsuficiente" class="badge-ts badge-out">Stock insuficiente</span>
                    <span v-else-if="quedaraBajoMinimo" class="badge-ts badge-low">Quedará bajo el mínimo</span>
                    <span v-else class="badge-ts badge-ok">Disponible</span>
                  </template>
                  <small v-else class="text-muted-2">Seleccione un producto para previsualizar el stock.</small>
                </div>
              </div>

              <!-- Motivo = columna `motivo` (obligatorio) -->
              <div class="col-12">
                <label class="form-label" for="movimiento-motivo">Motivo / justificación*</label>
                <textarea
                  id="movimiento-motivo"
                  class="form-control"
                  :class="{ 'is-invalid': erroresValidacion.motivo }"
                  v-model="formulario.motivo"
                  :disabled="guardando"
                  maxlength="150"
                  :placeholder="formulario.tipo_movimiento === 'ENTRADA'
                    ? 'Ej.: Compra a proveedor MayorTech C.A. según factura 00123.'
                    : 'Ej.: Repuesto utilizado en la orden de servicio OT-0001.'"
                ></textarea>
                <div v-if="erroresValidacion.motivo" class="invalid-feedback">{{ erroresValidacion.motivo }}</div>
                <div v-else class="form-text">
                  La justificación es obligatoria y quedará registrada en el historial de movimientos ({{ formulario.motivo.length }}/150).
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" :disabled="guardando" @click="emit('cerrar')">
              Cancelar
            </button>
            <!-- Botón deshabilitado durante el POST y ante stock insuficiente -->
            <button
              type="submit"
              class="btn"
              :class="formulario.tipo_movimiento === 'ENTRADA' ? 'btn-success' : 'btn-danger'"
              :disabled="guardando || cargandoProductos || stockInsuficiente"
            >
              <span v-if="guardando" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
              {{ guardando
                ? 'Registrando movimiento...'
                : `Revisar y registrar ${nombreAccion}` }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!--
    ==========================================================================
    PASO DE CONFIRMACIÓN PREVIA AL MOVIMIENTO
    ==========================================================================
    Registrar una entrada o salida actualiza `producto.existencia` y crea un
    asiento en `movimiento_inventario`. Por tratarse de una modificación
    importante del stock se exige confirmación explícita con el resumen exacto
    del cambio antes de enviar el POST al backend.
  -->
  <div class="modal fade" id="confirmarMovimientoModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-shield-check"></i> Confirmar movimiento de almacén
          </h5>
          <button type="button" class="btn-close" aria-label="Cerrar" :disabled="guardando" @click="cancelarConfirmacion"></button>
        </div>

        <div class="modal-body">
          <p class="mb-3">
            ¿Confirma registrar una
            <strong :class="formulario.tipo_movimiento === 'ENTRADA' ? 'text-success' : 'text-danger'">
              {{ nombreAccion }}
            </strong>
            de <strong>{{ formulario.cantidad }}</strong> unidad(es)?
          </p>

          <ul class="list-unstyled small mb-3">
            <li class="d-flex justify-content-between py-1" style="border-bottom:1px solid var(--border-color);">
              <span class="text-muted-2">Producto</span>
              <strong>{{ productoSeleccionado?.nombre_producto || '—' }}</strong>
            </li>
            <li class="d-flex justify-content-between py-1" style="border-bottom:1px solid var(--border-color);">
              <span class="text-muted-2">Código</span>
              <span class="code-chip">{{ formulario.cod_producto }}</span>
            </li>
            <li class="d-flex justify-content-between py-1" style="border-bottom:1px solid var(--border-color);">
              <span class="text-muted-2">Existencia actual</span>
              <strong class="tabular">{{ existenciaActual }} u.</strong>
            </li>
            <li class="d-flex justify-content-between py-1" style="border-bottom:1px solid var(--border-color);">
              <span class="text-muted-2">Existencia resultante</span>
              <strong class="tabular">{{ existenciaResultante }} u.</strong>
            </li>
            <li class="d-flex justify-content-between py-1">
              <span class="text-muted-2">Estado posterior</span>
              <span v-if="quedaraBajoMinimo" class="badge-ts badge-low">Bajo el mínimo</span>
              <span v-else class="badge-ts badge-ok">Disponible</span>
            </li>
          </ul>

          <p class="small text-muted-2 mb-0">
            <i class="bi bi-info-circle"></i>
            Al confirmar, el servidor calculará la existencia de forma atómica dentro de una
            transacción y registrará el asiento en el historial con esta justificación:
            «{{ formulario.motivo }}».
          </p>
        </div>

        <div class="modal-footer justify-content-center">
          <button type="button" class="btn btn-outline-secondary" :disabled="guardando" @click="cancelarConfirmacion">
            Cancelar
          </button>
          <!-- Botón deshabilitado durante el POST para evitar movimientos duplicados -->
          <button
            type="button"
            class="btn"
            :class="formulario.tipo_movimiento === 'ENTRADA' ? 'btn-success' : 'btn-danger'"
            :disabled="guardando"
            @click="confirmarMovimiento"
          >
            <span v-if="guardando" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            <i v-else class="bi bi-check2-circle"></i>
            {{ guardando ? 'Registrando...' : `Sí, registrar ${nombreAccion}` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
