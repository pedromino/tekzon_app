<script setup>
/**
 * ==========================================================================
 * COMPONENTE AJUSTESTOCKMODAL.VUE - TEKZON C.A.
 * ==========================================================================
 * CRUD 2 · Gestión y Ajuste de Existencias de Almacén (rol Almacenista)
 *
 * PROPÓSITO FUNCIONAL:
 *   Permite al almacenista corregir la existencia del sistema para que coincida
 *   con el CONTEO FÍSICO real del estante (arqueo). Además de la cantidad
 *   contada, este modal administra el `stock_minimo` (umbral de alerta) del
 *   producto y exige un MOTIVO obligatorio que quedará auditado en el kádex.
 *
 * PROPÓSITO TÉCNICO:
 *   - MAPEO CON LA BASE DE DATOS: los `v-model` usan los nombres EXACTOS de las
 *     columnas de la tabla `producto` (cod_producto, existencia, stock_minimo).
 *
 *   - VALIDACIÓN ESTRICTA DE NEGOCIO `validarStockMinimo()`: se impide guardar
 *     cuando el `stock_minimo` ingresado es MAYOR que la existencia resultante
 *     del arqueo. En ese caso se muestra un mensaje de error claro dentro del
 *     modal y el botón de guardado queda deshabilitado (`:disabled`). Esta es
 *     la validación que pidió la cátedra y sólo puede aplicarse aquí, donde
 *     existe una cantidad física real contra la cual comparar.
 *
 *   - CONFIRMACIÓN PREVIA (`modalConfirmacionAjuste`): el ajuste es una
 *     modificación importante del inventario, por lo que antes de enviar el
 *     PATCH al backend se abre un modal de confirmación con el resumen del
 *     cambio (existencia anterior -> nueva y la diferencia).
 *
 *   - 3 ESTADOS DE UI: Cargando (`cargandoDetalle` al leer la ficha y
 *     `guardando` al enviar), Éxito (la página lanza el Toast) y Error
 *     (`mensajeError` con el código HTTP 400/404/500 y `erroresValidacion`).
 * ==========================================================================
 */
import { ref, computed, watch } from 'vue';
import MovimientoServices, { ID_USUARIO_RESPONSABLE } from '../services/MovimientoServices.js';

const props = defineProps({
  /** Producto/existencia seleccionado en la tabla del catálogo. */
  producto: { type: Object, default: null },
  /** Bandera controlada por la página mientras el PATCH está en curso. */
  cargando: { type: Boolean, default: false }
});

const emit = defineEmits(['guardar', 'cerrar']);

// ---------------------------------------------------------------------------
// ESTADO LOCAL
// Nombres de campo = nombres EXACTOS de las columnas de la tabla `producto`.
// ---------------------------------------------------------------------------
/** Detalle fresco de la existencia leído desde la base de datos. */
const detalleExistencia = ref(null);
/** Conteo físico declarado por el almacenista (columna `existencia`). */
const existencia = ref(0);
/** Umbral de alerta declarado por el almacenista (columna `stock_minimo`). */
const stock_minimo = ref(0);
/** Justificación obligatoria del ajuste (exigencia de auditoría). */
const motivoAjuste = ref('');

// ---------------------------------------------------------------------------
// ESTADOS DE UI (Cargando / Éxito / Error)
// ---------------------------------------------------------------------------
/** Estado de Carga: consulta de la ficha de existencia. */
const cargandoDetalle = ref(false);
/** Estado de Carga: envío del ajuste al servidor. */
const guardando = ref(false);
/** Estado de Error: mensaje del backend con su código HTTP. */
const mensajeError = ref('');
/** Estado de Error: errores de validación por campo. */
const erroresValidacion = ref({});
/** Control del modal de confirmación previa al ajuste. */
const mostrarConfirmacion = ref(false);

/** Existencia actual registrada en el sistema (dato real de MySQL). */
const existenciaSistema = computed(() => {
  if (detalleExistencia.value) return Number(detalleExistencia.value.existencia || 0);
  return Number(props.producto?.existencia ?? props.producto?.stock ?? 0);
});

/** Stock mínimo actualmente configurado en el sistema. */
const stockMinimoSistema = computed(() => {
  if (detalleExistencia.value) return Number(detalleExistencia.value.stock_minimo || 0);
  return Number(props.producto?.stock_minimo ?? props.producto?.minimo ?? 0);
});

/** Nombre legible del producto auditado. */
const nombreProducto = computed(() =>
  detalleExistencia.value?.nombre_producto
  ?? props.producto?.nombre_producto
  ?? props.producto?.nombre
  ?? 'Producto sin nombre'
);

/** Código del producto auditado (columna `cod_producto`). */
const codigoProducto = computed(() =>
  detalleExistencia.value?.cod_producto
  ?? props.producto?.cod_producto
  ?? props.producto?.codigo
  ?? ''
);

/**
 * DIFERENCIA DEL ARQUEO calculada en vivo.
 * Positiva => SOBRANTE físico; negativa => FALTANTE físico.
 */
const diferenciaAjuste = computed(() => Number(existencia.value || 0) - existenciaSistema.value);

/** Clasificación visual de la diferencia. */
const tipoDiferencia = computed(() => {
  if (diferenciaAjuste.value > 0) return { clave: 'SOBRANTE', etiqueta: 'Sobrante físico', clase: 'badge-ok' };
  if (diferenciaAjuste.value < 0) return { clave: 'FALTANTE', etiqueta: 'Faltante físico', clase: 'badge-out' };
  return { clave: 'SIN_CAMBIO', etiqueta: 'Sin diferencia', clase: 'badge-neutral' };
});

// ---------------------------------------------------------------------------
// VALIDACIÓN ESTRICTA DE NEGOCIO: STOCK MÍNIMO vs EXISTENCIA
// ---------------------------------------------------------------------------
/**
 * VALIDAR STOCK MÍNIMO (regla estricta exigida por la cátedra).
 *
 * PROPÓSITO FUNCIONAL: el `stock_minimo` es el umbral que dispara la alerta de
 * reposición. Si el almacenista lo fija por encima de la cantidad que realmente
 * hay en el estante, la alerta quedaría encendida de forma permanente y el
 * indicador de reposición perdería todo su valor operativo.
 *
 * PROPÓSITO TÉCNICO: devuelve un objeto con el estado de la validación para que
 * la plantilla pueda (a) pintar el mensaje de error y (b) deshabilitar el botón
 * de guardado mediante la prop calculada `guardadoBloqueado`.
 *
 * @returns {{hayError: boolean, mensaje: string}}
 */
const validarStockMinimo = () => {
  const minimo = Number(stock_minimo.value || 0);
  const existenciaResultante = Number(existencia.value || 0);

  // Los valores no numéricos o negativos se reportan como error de formato.
  if (Number.isNaN(minimo) || minimo < 0) {
    return { hayError: true, mensaje: 'El stock mínimo debe ser un número mayor o igual a 0.' };
  }

  if (!Number.isInteger(minimo)) {
    return { hayError: true, mensaje: 'El stock mínimo debe ser un número entero de unidades.' };
  }

  // REGLA PRINCIPAL: el mínimo no puede superar la existencia resultante.
  if (minimo > existenciaResultante) {
    return {
      hayError: true,
      mensaje:
        `El stock mínimo (${minimo} u.) no puede ser mayor que la existencia `
        + `(${existenciaResultante} u.). Reduzca el stock mínimo o registre primero una `
        + 'Entrada de mercancía para aumentar la existencia.'
    };
  }

  return { hayError: false, mensaje: '' };
};

/** Resultado reactivo de la validación estricta. */
const resultadoValidacionMinimo = computed(() => validarStockMinimo());

/** True cuando la regla de negocio impide guardar (deshabilita el botón). */
const guardadoBloqueado = computed(() => resultadoValidacionMinimo.value.hayError);

/** True cuando el conteo coincide con el sistema y no hay ajuste ni cambio de mínimo. */
const sinCambiosQueRegistrar = computed(() =>
  diferenciaAjuste.value === 0 && Number(stock_minimo.value) === stockMinimoSistema.value
);

// ---------------------------------------------------------------------------
// CARGA DE LA FICHA DE EXISTENCIA DESDE EL BACKEND
// ---------------------------------------------------------------------------
/**
 * CARGA LA FICHA DE EXISTENCIA.
 *
 * PROPÓSITO TÉCNICO: consulta `GET /api/inventario/stock/:cod_producto`, que
 * devuelve la existencia real, el stock mínimo y el ÚLTIMO ARQUEO registrado
 * (con su motivo y responsable). Así el modal nunca trabaja con datos obsoletos
 * del listado y el almacenista ve el contexto antes de corregir.
 */
const cargarDetalleExistencia = async () => {
  const codigo = props.producto?.cod_producto ?? props.producto?.codigo;

  if (!codigo) {
    detalleExistencia.value = null;
    return;
  }

  cargandoDetalle.value = true;
  mensajeError.value = '';

  try {
    detalleExistencia.value = await MovimientoServices.obtenerExistenciaPorCodigo(codigo);

    // El conteo y el mínimo arrancan en los valores del sistema para que el
    // almacenista sólo escriba cuando el dato real difiera.
    existencia.value = existenciaSistema.value;
    stock_minimo.value = stockMinimoSistema.value;
  } catch (error) {
    detalleExistencia.value = null;
    mensajeError.value =
      `[HTTP ${error.codigoHttp || 500}] ${error.mensaje || 'No se pudo consultar la existencia del producto.'}`;
    existencia.value = existenciaSistema.value;
    stock_minimo.value = stockMinimoSistema.value;
  } finally {
    cargandoDetalle.value = false;
  }
};

/**
 * Observa la apertura del modal (cambio de producto) para refrescar la ficha
 * desde MySQL y limpiar los estados previos.
 */
watch(
  () => props.producto,
  (nuevoProducto) => {
    erroresValidacion.value = {};
    mensajeError.value = '';
    motivoAjuste.value = '';
    mostrarConfirmacion.value = false;

    if (nuevoProducto) {
      cargarDetalleExistencia();
    } else {
      detalleExistencia.value = null;
      existencia.value = 0;
      stock_minimo.value = 0;
    }
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

// ---------------------------------------------------------------------------
// VALIDACIÓN DEL FORMULARIO Y CONFIRMACIÓN PREVIA
// ---------------------------------------------------------------------------
/**
 * VALIDACIÓN COMPLETA DEL AJUSTE.
 * Reúne la regla estricta del stock mínimo con el resto de comprobaciones.
 */
const validarAjuste = () => {
  const errores = {};

  const conteo = Number(existencia.value);

  if (!Number.isFinite(conteo)) {
    errores.existencia = 'Debe indicar la existencia contada.';
  } else if (!Number.isInteger(conteo)) {
    errores.existencia = 'La existencia debe ser un número entero de unidades.';
  } else if (conteo < 0) {
    errores.existencia = 'La existencia no puede ser negativa.';
  }

  // Regla de negocio estricta sobre el stock mínimo.
  if (resultadoValidacionMinimo.value.hayError) {
    errores.stock_minimo = resultadoValidacionMinimo.value.mensaje;
  }

  if (!String(motivoAjuste.value).trim()) {
    errores.motivo = 'El motivo del ajuste es obligatorio: toda corrección debe justificarse.';
  } else if (String(motivoAjuste.value).trim().length > 150) {
    errores.motivo = 'El motivo no puede superar los 150 caracteres.';
  }

  if (sinCambiosQueRegistrar.value) {
    errores.existencia =
      'La existencia y el stock mínimo coinciden con los del sistema: no hay ajuste que registrar.';
  }

  erroresValidacion.value = errores;
  return Object.keys(errores).length === 0;
};

/**
 * ABRE EL MODAL DE CONFIRMACIÓN PREVIA.
 *
 * PROPÓSITO FUNCIONAL: un ajuste de existencia es una modificación importante
 * del inventario, por lo que se pide una confirmación explícita mostrando el
 * resumen del cambio (anterior -> nuevo y la diferencia) antes de escribir en
 * la base de datos.
 */
const abrirModalConfirmacion = () => {
  if (guardando.value || cargandoDetalle.value || guardadoBloqueado.value) return;
  if (!validarAjuste()) return;

  mostrarConfirmacion.value = true;
  abrirModalBootstrap('confirmarAjusteModal');
};

/**
 * CONFIRMA Y EMITE EL AJUSTE A LA PÁGINA PADRE.
 * La página ejecuta el PATCH y muestra el Toast de éxito o error.
 */
const confirmarAjuste = () => {
  if (guardando.value || guardadoBloqueado.value) return;

  cerrarModalBootstrap('confirmarAjusteModal');
  mostrarConfirmacion.value = false;

  emit('guardar', {
    cod_producto: codigoProducto.value,
    existencia: Number(existencia.value),
    stock_minimo: Number(stock_minimo.value),
    motivo: String(motivoAjuste.value).trim(),
    id_usuario: ID_USUARIO_RESPONSABLE
  });
};

/** Cancela la confirmación sin tocar la base de datos. */
const cancelarConfirmacion = () => {
  cerrarModalBootstrap('confirmarAjusteModal');
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

/** Formatea la fecha del último ajuste para mostrarla en el modal. */
const formatearFecha = (fecha) => {
  if (!fecha) return 'Sin registros';

  const objetoFecha = new Date(fecha);
  if (Number.isNaN(objetoFecha.getTime())) return 'Sin registros';

  return objetoFecha.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};
</script>

<template>
  <div class="modal fade" id="ajusteStockModal" tabindex="-1" aria-hidden="true" aria-labelledby="ajusteStockModalLabel">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="ajusteStockModalLabel">
            <i class="bi bi-clipboard-check"></i>
            Ajuste y arqueo de existencias
          </h5>
          <button type="button" class="btn-close" aria-label="Cerrar" :disabled="guardando" @click="emit('cerrar')"></button>
        </div>

        <div class="modal-body">
          <!-- ================= ESTADO DE CARGA de la ficha de existencia ================= -->
          <div v-if="cargandoDetalle" class="empty-state py-4">
            <div class="spinner-border text-primary mb-3" role="status" aria-hidden="true"></div>
            <h3>Consultando existencia en el almacén...</h3>
            <p class="small">Leyendo el stock actual y el último arqueo desde la base de datos.</p>
          </div>

          <template v-else>
            <!-- ================= ESTADO DE ERROR (HTTP 400/404/500) ================= -->
            <div v-if="mensajeError" class="readonly-note" role="alert">
              <i class="bi bi-exclamation-triangle-fill"></i>
              <span>{{ mensajeError }}</span>
            </div>

            <!-- Resumen del producto auditado -->
            <div class="card-ts mb-3">
              <div class="card-ts__body">
                <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <div>
                    <span class="code-chip">{{ codigoProducto }}</span>
                    <h3 class="h6 mt-2 mb-0">{{ nombreProducto }}</h3>
                    <small class="text-muted-2">{{ detalleExistencia?.nombre_categoria || 'Sin categoría' }}</small>
                  </div>
                  <div class="text-end">
                    <p class="kpi__label mb-1">Existencia en sistema</p>
                    <p class="kpi__value mb-0">{{ existenciaSistema }}</p>
                    <small class="text-muted-2">Mínimo configurado: {{ stockMinimoSistema }} u.</small>
                  </div>
                </div>

                <!-- Contexto del último arqueo registrado en el kádex -->
                <div class="mt-3 pt-3" style="border-top:1px solid var(--border-color);">
                  <template v-if="detalleExistencia?.ultimo_ajuste">
                    <p class="mb-1 small text-muted-2">
                      <i class="bi bi-clock-history"></i>
                      Último ajuste: <strong>{{ formatearFecha(detalleExistencia.ultimo_ajuste.fecha_movimiento) }}</strong>
                      · {{ detalleExistencia.ultimo_ajuste.nombre_usuario || 'Almacenista' }}
                    </p>
                    <p class="mb-0 small">
                      Motivo anterior: «{{ detalleExistencia.ultimo_ajuste.motivo }}»
                      ({{ detalleExistencia.ultimo_ajuste.existencia_previa }} → {{ detalleExistencia.ultimo_ajuste.existencia_posterior }})
                    </p>
                  </template>
                  <p v-else class="mb-0 small text-muted-2">
                    <i class="bi bi-info-circle"></i> Este producto no registra ajustes previos de almacén.
                  </p>
                </div>
              </div>
            </div>

            <div class="row g-3">
              <!-- Existencia física contada = columna `existencia` -->
              <div class="col-md-4">
                <label class="form-label" for="ajuste-existencia">Existencia física contada (existencia) *</label>
                <input
                  id="ajuste-existencia"
                  type="number"
                  min="0"
                  step="1"
                  class="form-control"
                  :class="{ 'is-invalid': erroresValidacion.existencia }"
                  v-model.number="existencia"
                  :disabled="guardando"
                >
                <div v-if="erroresValidacion.existencia" class="invalid-feedback">
                  {{ erroresValidacion.existencia }}
                </div>
                <div v-else class="form-text">Unidades reales encontradas en el estante.</div>
              </div>

              <!-- Stock mínimo = columna `stock_minimo` -->
              <div class="col-md-4">
                <label class="form-label" for="ajuste-minimo">Stock mínimo (stock_minimo) *</label>
                <input
                  id="ajuste-minimo"
                  type="number"
                  min="0"
                  step="1"
                  class="form-control"
                  :class="{ 'is-invalid': erroresValidacion.stock_minimo }"
                  v-model.number="stock_minimo"
                  :disabled="guardando"
                >
                <div v-if="erroresValidacion.stock_minimo" class="invalid-feedback">
                  {{ erroresValidacion.stock_minimo }}
                </div>
                <div v-else class="form-text">Umbral de la alerta de reposición.</div>
              </div>

              <!-- Diferencia calculada en vivo -->
              <div class="col-md-4">
                <label class="form-label">Diferencia del arqueo</label>
                <div class="d-flex align-items-center" style="min-height:46px;">
                  <span class="badge-ts" :class="tipoDiferencia.clase">
                    {{ diferenciaAjuste > 0 ? '+' : '' }}{{ diferenciaAjuste }} u. · {{ tipoDiferencia.etiqueta }}
                  </span>
                </div>
              </div>

              <!-- ============ VALIDACIÓN ESTRICTA: ERROR (deshabilita el guardado) ============ -->
              <div v-if="resultadoValidacionMinimo.hayError" class="col-12">
                <div class="readonly-note" role="alert">
                  <i class="bi bi-exclamation-triangle-fill"></i>
                  <span>{{ resultadoValidacionMinimo.mensaje }}</span>
                </div>
              </div>

              <!-- Motivo obligatorio -->
              <div class="col-12">
                <label class="form-label" for="ajuste-motivo">Motivo / justificación del ajuste *</label>
                <textarea
                  id="ajuste-motivo"
                  class="form-control"
                  :class="{ 'is-invalid': erroresValidacion.motivo }"
                  v-model="motivoAjuste"
                  :disabled="guardando"
                  maxlength="150"
                  placeholder="Ej.: Arqueo físico mensual, conteo en estante B3; se detectó mercancía dañada."
                ></textarea>
                <div v-if="erroresValidacion.motivo" class="invalid-feedback">{{ erroresValidacion.motivo }}</div>
                <div v-else class="form-text">
                  El ajuste quedará auditado en el kádex como movimiento tipo AJUSTE ({{ motivoAjuste.length }}/150).
                </div>
              </div>
            </div>
          </template>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" :disabled="guardando" @click="emit('cerrar')">
            Cancelar
          </button>
          <!--
            Botón deshabilitado durante la petición (evita duplicados) y cuando
            la validación estricta del stock mínimo falla.
          -->
          <button
            type="button"
            class="btn btn-primary"
            :disabled="guardando || cargandoDetalle || guardadoBloqueado || Boolean(mensajeError)"
            @click="abrirModalConfirmacion"
          >
            <span v-if="guardando" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            {{ guardando ? 'Aplicando ajuste...' : 'Revisar y aplicar ajuste' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!--
    ==========================================================================
    PASO DE CONFIRMACIÓN PREVIA AL AJUSTE
    ==========================================================================
    El ajuste modifica la columna `existencia` de la tabla `producto` y genera
    un asiento en `movimiento_inventario`. Por tratarse de una modificación
    importante del inventario se exige una confirmación explícita mostrando el
    resumen exacto del cambio antes de enviar el PATCH al backend.
  -->
  <div class="modal fade" id="confirmarAjusteModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="bi bi-shield-check"></i> Confirmar ajuste de existencia
          </h5>
          <button type="button" class="btn-close" aria-label="Cerrar" :disabled="guardando" @click="cancelarConfirmacion"></button>
        </div>

        <div class="modal-body">
          <p class="mb-3">
            ¿Confirma el ajuste de existencia del producto
            <strong>{{ codigoProducto }}</strong> — {{ nombreProducto }}?
          </p>

          <ul class="list-unstyled small mb-3">
            <li class="d-flex justify-content-between py-1" style="border-bottom:1px solid var(--border-color);">
              <span class="text-muted-2">Existencia actual en sistema</span>
              <strong class="tabular">{{ existenciaSistema }} u.</strong>
            </li>
            <li class="d-flex justify-content-between py-1" style="border-bottom:1px solid var(--border-color);">
              <span class="text-muted-2">Existencia contada físicamente</span>
              <strong class="tabular">{{ existencia }} u.</strong>
            </li>
            <li class="d-flex justify-content-between py-1" style="border-bottom:1px solid var(--border-color);">
              <span class="text-muted-2">Diferencia del arqueo</span>
              <span class="badge-ts" :class="tipoDiferencia.clase">
                {{ diferenciaAjuste > 0 ? '+' : '' }}{{ diferenciaAjuste }} u. · {{ tipoDiferencia.etiqueta }}
              </span>
            </li>
            <li class="d-flex justify-content-between py-1">
              <span class="text-muted-2">Stock mínimo que quedará configurado</span>
              <strong class="tabular">{{ stock_minimo }} u.</strong>
            </li>
          </ul>

          <p class="small text-muted-2 mb-0">
            <i class="bi bi-info-circle"></i>
            Al confirmar se actualizará la columna <code>existencia</code> de la tabla
            <code>producto</code> y se registrará un asiento de tipo <strong>AJUSTE</strong> en el
            kádex con esta justificación: «{{ motivoAjuste }}».
          </p>
        </div>

        <div class="modal-footer justify-content-center">
          <button type="button" class="btn btn-outline-secondary" :disabled="guardando" @click="cancelarConfirmacion">
            Cancelar
          </button>
          <!-- Botón deshabilitado durante el PATCH para evitar ajustes duplicados -->
          <button type="button" class="btn btn-warning" :disabled="guardando" @click="confirmarAjuste">
            <span v-if="guardando" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            <i v-else class="bi bi-check2-circle"></i>
            {{ guardando ? 'Aplicando ajuste...' : 'Sí, aplicar ajuste' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
