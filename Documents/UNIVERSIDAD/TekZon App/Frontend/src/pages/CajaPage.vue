<script setup>
/**
 * ==========================================================================
 * PÁGINA DE CAJA (CajaPage.vue) - TEKZON C.A.
 * ==========================================================================
 * Módulo 2 · Caja · Turnos y arqueo
 *
 * PROPÓSITO FUNCIONAL:
 *   Administra el TURNO DE CAJA, que es el marco contable donde se registran
 *   TODOS los cobros del sistema (ventas directas y servicios técnicos):
 *
 *     · Apertura del turno con su fondo inicial en dólares.
 *     · Panel de la caja activa con lo recaudado hasta el momento.
 *     · ARQUEO DETALLADO: pagos uno por uno, resumen por método de pago y
 *       totales separados por origen (Ventas directas / Servicios técnicos).
 *     · CIERRE CON ARQUEO: se compara el monto contado físicamente con el que
 *       registra el sistema y se clasifica la diferencia en CUADRADA, SOBRANTE
 *       o FALTANTE.
 *     · Historial de todos los turnos con su recaudación.
 *
 * PROPÓSITO TÉCNICO:
 *   · CERO DATOS SIMULADOS: cajas, pagos y totales provienen de la base
 *     `tekzon_bd` mediante `CajaServices`.
 *   · `obtenerCajaActiva()` devuelve `null` cuando no hay turno abierto: es una
 *     SITUACIÓN VÁLIDA del negocio, no un error, y la pantalla la trata como tal
 *     ofreciendo el botón "Abrir caja del día".
 *   · La DIFERENCIA del arqueo la calcula el backend (no el navegador) para que
 *     el resultado contable no dependa del cliente; aquí sólo se pinta con el
 *     color que corresponde.
 *   · 3 ESTADOS DE UI:
 *       CARGANDO -> `LoadingSpinner` y banderas `enviando` en los botones.
 *       ÉXITO    -> `ToastNotificaciones` con el mensaje y el tipo de diferencia.
 *       ERROR    -> Toast y panel persistente con el código HTTP y "Reintentar".
 *   · El 409 al abrir una caja ya abierta se muestra TAL CUAL lo redacta el
 *     backend.
 *   · Los modales se abren y cierran con el utilitario compartido
 *     `abrirModal` / `cerrarModal` (nunca con `data-bs-toggle`).
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import ModalGenerarReporte from '../components/ModalGenerarReporte.vue';
import CajaServices from '../services/CajaServices.js';
import { sesion } from '../services/sesion.js';
// Utilitario compartido de apertura/cierre de modales de Bootstrap 5.
import { abrirModal, cerrarModal } from '../utils/utilidadesModales.js';
// Helpers de formato y presentación compartidos por los módulos nuevos.
import {
  aDecimal,
  aNumero,
  describirError,
  etiquetaMetodoPago,
  formatearFecha,
  formatearMoneda,
  presentacionOrigenMovimiento
} from '../services/formato.js';

// ==========================================================================
// ESTADO REACTIVO PRINCIPAL
// ==========================================================================

/** Turno abierto (null = no hay ninguna caja abierta). */
const cajaActiva = ref(null);
/** Historial de turnos con su recaudación. */
const turnos = ref([]);

/** Formulario del modal de apertura. */
const formularioApertura = ref({
  montoApertura: 0,
  observaciones: ''
});

/** Formulario del modal de cierre con arqueo. */
const formularioCierre = ref({
  montoCierre: 0,
  observaciones: ''
});

/** Resultado devuelto por el backend al cerrar (diferencia y su clasificación). */
const resultadoCierre = ref(null);

/** Arqueo detallado del turno abierto en el modal: pagos, resumen y totales. */
const arqueoDetallado = ref(null);
/** Turno cuyo arqueo se está consultando. */
const turnoParaArqueo = ref(null);
/** Resumen por método de pago para el modal de cierre. */
const resumenMetodosCierre = ref([]);

// ==========================================================================
// ESTADOS DE UI (Cargando / Éxito / Error)
// ==========================================================================
const estadoCargando = ref(false);
const cargandoTurnos = ref(false);
const cargandoArqueo = ref(false);
const enviandoApertura = ref(false);
const enviandoCierre = ref(false);

const mensajeErrorCarga = ref('');
const codigoErrorCarga = ref('');
const mensajeErrorApertura = ref('');
const mensajeErrorCierre = ref('');

const notificaciones = ref([]);

// ==========================================================================
// SISTEMA DE NOTIFICACIONES TOAST
// ==========================================================================
const mostrarToast = (titulo, mensaje, tipo = 'success') => {
  const id = Date.now() + Math.random();

  notificaciones.value.push({ id, titulo, mensaje, tipo });

  // Autocierre a los 4 segundos para no saturar la interfaz.
  setTimeout(() => {
    notificaciones.value = notificaciones.value.filter((toast) => toast.id !== id);
  }, 4000);
};

const cerrarToastPorId = (id) => {
  notificaciones.value = notificaciones.value.filter((toast) => toast.id !== id);
};

const manejarNotificacionReporte = ({ titulo, mensaje, tipo }) => {
  mostrarToast(titulo, mensaje, tipo);
};

/** El toast de la diferencia usa 'success' si cuadra, 'warning' si sobra y 'error' si falta. */
const tipoToastDiferencia = (tipoDiferencia) => {
  if (tipoDiferencia === 'CUADRADA') return 'success';
  if (tipoDiferencia === 'SOBRANTE') return 'warning';

  return 'error';
};

/** Color del texto de la diferencia del arqueo (verde / ámbar / rojo). */
const colorDiferencia = (tipoDiferencia) => {
  if (tipoDiferencia === 'CUADRADA') return 'var(--color-success)';
  if (tipoDiferencia === 'SOBRANTE') return 'var(--color-warning)';

  return 'var(--color-danger)';
};

/** Clase de badge coherente con la clasificación de la diferencia. */
const claseBadgeDiferencia = (tipoDiferencia) => {
  if (tipoDiferencia === 'CUADRADA') return 'badge-ok';
  if (tipoDiferencia === 'SOBRANTE') return 'badge-low';

  return 'badge-out';
};

/** Etiqueta legible de la clasificación del arqueo. */
const etiquetaDiferencia = (tipoDiferencia) => {
  const etiquetas = {
    CUADRADA: 'Caja cuadrada',
    SOBRANTE: 'Sobrante en caja',
    FALTANTE: 'Faltante en caja'
  };

  return etiquetas[tipoDiferencia] || 'Diferencia calculada';
};

// ==========================================================================
// CARGA DE DATOS DESDE EL BACKEND (CERO DATOS SIMULADOS)
// ==========================================================================
/**
 * CONSULTA LA CAJA ACTIVA.
 * `null` significa "no hay turno abierto": se refleja en la interfaz con el aviso
 * correspondiente y el botón de apertura.
 */
const cargarCajaActiva = async () => {
  try {
    cajaActiva.value = await CajaServices.obtenerCajaActiva();
  } catch (error) {
    cajaActiva.value = null;

    const descripcion = describirError(error);
    mostrarToast(`Error al consultar la caja activa (${descripcion.codigo})`, descripcion.mensaje, 'error');
  }
};

/**
 * CONSULTA EL HISTORIAL DE TURNOS.
 * Cada turno llega con su recaudación ya agregada por MySQL.
 */
const cargarTurnos = async () => {
  cargandoTurnos.value = true;
  mensajeErrorCarga.value = '';
  codigoErrorCarga.value = '';

  try {
    turnos.value = await CajaServices.listarCajas();
  } catch (error) {
    turnos.value = [];

    const descripcion = describirError(error);
    codigoErrorCarga.value = descripcion.codigo;
    mensajeErrorCarga.value = descripcion.mensaje;

    mostrarToast(`Error al cargar los turnos de caja (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    cargandoTurnos.value = false;
  }
};

/** CARGA INICIAL DE LA PÁGINA: caja activa e historial de turnos. */
const cargarPaginaCaja = async () => {
  estadoCargando.value = true;

  await Promise.all([cargarCajaActiva(), cargarTurnos()]);

  estadoCargando.value = false;
};

onMounted(() => {
  cargarPaginaCaja();
});

/** Refresca el módulo completo (se usa tras abrir o cerrar un turno). */
const refrescarModuloCaja = async () => {
  await Promise.all([cargarCajaActiva(), cargarTurnos()]);
};

// ==========================================================================
// INDICADORES DEL TURNO
// ==========================================================================
/** Total recaudado por el turno abierto (suma de ventas y servicios). */
const totalRecaudadoTurno = computed(() => aDecimal(cajaActiva.value?.totalRecaudado));
/** Total facturado por VENTA DIRECTA en el turno abierto. */
const totalVentasTurno = computed(() => aDecimal(cajaActiva.value?.totalVentas));
/** Total facturado por SERVICIO TÉCNICO en el turno abierto. */
const totalServiciosTurno = computed(() => aDecimal(cajaActiva.value?.totalServicios));
/** Cantidad de pagos registrados en el turno abierto. */
const totalPagosTurno = computed(() => aNumero(cajaActiva.value?.totalPagos));

/** Recaudación histórica de todos los turnos mostrados. */
const recaudacionHistorica = computed(() =>
  aDecimal(turnos.value.reduce((suma, turno) => suma + aDecimal(turno.totalRecaudado), 0))
);

/** Turnos que siguen abiertos (normalmente como máximo uno). */
const turnosAbiertos = computed(() => turnos.value.filter((turno) => turno.abierta).length);

// ==========================================================================
// APERTURA DEL TURNO (MODAL modalAbrirCaja)
// ==========================================================================
/** Abre el modal de apertura con el fondo inicial en cero. */
const prepararAperturaCaja = () => {
  formularioApertura.value = { montoApertura: 0, observaciones: '' };
  mensajeErrorApertura.value = '';

  abrirModal('modalAbrirCaja');
};

/**
 * CONFIRMA LA APERTURA DEL TURNO.
 * Si ya existe una caja abierta el backend responde 409 y su mensaje se muestra
 * tal cual, sin reinterpretarlo.
 */
const confirmarAperturaCaja = async () => {
  if (enviandoApertura.value) return;

  if (aNumero(formularioApertura.value.montoApertura) < 0) {
    mensajeErrorApertura.value = 'El monto de apertura no puede ser negativo.';
    mostrarToast('Monto inválido', mensajeErrorApertura.value, 'warning');
    return;
  }

  enviandoApertura.value = true;
  mensajeErrorApertura.value = '';

  try {
    const resultado = await CajaServices.abrirCaja({
      montoApertura: aNumero(formularioApertura.value.montoApertura),
      observaciones: String(formularioApertura.value.observaciones).trim()
    });

    mostrarToast(
      `Caja N° ${resultado.caja.id} abierta`,
      `${resultado.mensaje || 'Turno de caja iniciado.'} Fondo inicial: ${formatearMoneda(resultado.caja.montoApertura)}.`,
      'success'
    );

    await refrescarModuloCaja();
    cerrarModal('modalAbrirCaja');
  } catch (error) {
    const descripcion = describirError(error);

    // El 409 informa que ya hay un turno abierto: se muestra el texto del backend.
    mensajeErrorApertura.value = error?.codigoHttp === 409 ? error.mensaje : descripcion.mensaje;

    mostrarToast(`No se pudo abrir la caja (${descripcion.codigo})`, mensajeErrorApertura.value, 'error');
  } finally {
    enviandoApertura.value = false;
  }
};

// ==========================================================================
// CIERRE CON ARQUEO (MODAL modalCerrarCaja)
// ==========================================================================
/**
 * Abre el modal de cierre preparando el arqueo.
 * Se muestra el total que registra el SISTEMA y se pide el monto contado
 * físicamente; el backend devolverá la diferencia y su clasificación.
 */
const prepararCierreCaja = async () => {
  if (!cajaActiva.value) {
    mostrarToast('No hay caja abierta', 'No existe ningún turno de caja para cerrar.', 'info');
    return;
  }

  formularioCierre.value = { montoCierre: 0, observaciones: '' };
  resultadoCierre.value = null;
  mensajeErrorCierre.value = '';
  resumenMetodosCierre.value = [];

  try {
    await cargarCajaActiva();
    const arqueo = await CajaServices.obtenerPagosDeCaja(cajaActiva.value.id);
    resumenMetodosCierre.value = arqueo?.resumenPorMetodo || [];
  } catch {
    // Si falla el detalle se continua con el valor consolidado
  }

  abrirModal('modalCerrarCaja');
};

/**
 * CONFIRMA EL CIERRE DEL TURNO CON ARQUEO.
 *
 * PROPÓSITO FUNCIONAL: el arqueo compara lo CONTADO con lo REGISTRADO por el
 * sistema. El backend calcula la diferencia y la clasifica en CUADRADA,
 * SOBRANTE o FALTANTE; ese resultado se muestra con el color correspondiente.
 */
const confirmarCierreCaja = async () => {
  if (enviandoCierre.value) return;

  if (aNumero(formularioCierre.value.montoCierre) < 0) {
    mensajeErrorCierre.value = 'El monto contado no puede ser negativo.';
    mostrarToast('Monto inválido', mensajeErrorCierre.value, 'warning');
    return;
  }

  const confirmado = window.confirm(
    `¿Confirma cerrar el turno de caja N° ${cajaActiva.value.id}?\n`
    + `El sistema registra ${formatearMoneda(totalRecaudadoTurno.value)} y usted contó `
    + `${formatearMoneda(formularioCierre.value.montoCierre)}.`
  );

  if (!confirmado) return;

  enviandoCierre.value = true;
  mensajeErrorCierre.value = '';

  try {
    const resultado = await CajaServices.cerrarCaja(cajaActiva.value.id, {
      montoCierre: aNumero(formularioCierre.value.montoCierre),
      observaciones: String(formularioCierre.value.observaciones).trim()
    });

    // El resultado se conserva para pintarlo dentro del propio modal.
    resultadoCierre.value = resultado;

    mostrarToast(
      `Caja N° ${resultado.caja.id} cerrada · ${etiquetaDiferencia(resultado.tipoDiferencia)}`,
      `${resultado.mensaje || 'Turno cerrado con arqueo.'} `
        + `Sistema: ${formatearMoneda(resultado.totalRecaudado)} · Diferencia: ${formatearMoneda(resultado.diferencia)}.`,
      tipoToastDiferencia(resultado.tipoDiferencia)
    );

    // Se recargan la caja activa (que pasa a ser null) y el historial de turnos.
    formularioCierre.value = { montoCierre: 0, observaciones: '' };
    await refrescarModuloCaja();
  } catch (error) {
    const descripcion = describirError(error);
    mensajeErrorCierre.value = descripcion.mensaje;

    mostrarToast(`No se pudo cerrar la caja (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    enviandoCierre.value = false;
  }
};

/** Cierra el modal de arqueo y descarta el resultado mostrado. */
const finalizarCierreCaja = () => {
  resultadoCierre.value = null;
  cerrarModal('modalCerrarCaja');
};

// ==========================================================================
// ARQUEO DETALLADO (MODAL modalArqueoDetalle)
// ==========================================================================
/**
 * CONSULTA EL ARQUEO DETALLADO DE UN TURNO.
 * Devuelve los pagos uno por uno, el resumen por método de pago y los totales
 * separados por origen (ventas directas y servicios técnicos).
 */
const verArqueoDetallado = async (turno) => {
  turnoParaArqueo.value = turno;
  arqueoDetallado.value = null;
  cargandoArqueo.value = true;

  // El modal se abre de inmediato para que se vea el estado de Carga.
  abrirModal('modalArqueoDetalle');

  try {
    arqueoDetallado.value = await CajaServices.obtenerPagosDeCaja(turno.id);
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`Error al consultar el arqueo (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    cargandoArqueo.value = false;
  }
};

/** Documento que originó cada pago (factura de venta u orden de servicio). */
const documentoDelPago = (pago) => {
  if (pago.factura) return `Factura N° ${pago.factura}`;
  if (pago.orden) return `Orden N° ${pago.orden}`;

  return '—';
};

/** Caja que se muestra en el detalle (la consultada o la activa). */
const cajaDelArqueo = computed(() => arqueoDetallado.value?.caja || turnoParaArqueo.value || cajaActiva.value || null);
</script>

<template>
  <main class="content" id="contenido">
    <!-- ================= ESTADO DE ÉXITO / ERROR (pila de Toasts) ================= -->
    <ToastNotificaciones :notificaciones="notificaciones" @cerrar="cerrarToastPorId" />

    <div class="page-head">
      <div>
        <h2>Turnos de caja y arqueo</h2>
        <p>
          Todo cobro del sistema (venta directa o servicio técnico) queda asociado a un turno de caja.
          Al cerrar se compara lo contado físicamente con lo registrado y se clasifica la diferencia.
        </p>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-primary d-flex align-items-center gap-2" type="button" @click="abrirModal('modalReporteCaja')">
          <i class="bi bi-file-earmark-bar-graph"></i>
          <span>Generar Reporte</span>
        </button>
        <button class="btn btn-outline-secondary" type="button" :disabled="estadoCargando" @click="refrescarModuloCaja">
          <span v-if="estadoCargando" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
          <i v-else class="bi bi-arrow-clockwise"></i> Actualizar
        </button>
        <button
          class="btn btn-primary d-flex align-items-center gap-2"
          type="button"
          :disabled="Boolean(cajaActiva)"
          @click="prepararAperturaCaja"
        >
          <i class="bi bi-safe2"></i>
          <span>Abrir caja del día</span>
        </button>
      </div>
    </div>

    <!-- ================= ESTADO DE CARGA ================= -->
    <LoadingSpinner
      v-if="estadoCargando && turnos.length === 0 && !cajaActiva"
      mensaje="Cargando los turnos de caja desde la base de datos..."
    />

    <template v-else>
      <!-- ================= ESTADO DE ERROR PERSISTENTE ================= -->
      <div v-if="mensajeErrorCarga" class="readonly-note" role="alert">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span><strong>{{ codigoErrorCarga }}</strong> · {{ mensajeErrorCarga }}</span>
        <button class="btn btn-sm btn-outline-danger ms-auto" type="button" @click="refrescarModuloCaja">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button>
      </div>

      <!-- ==========================================================================
           PANEL DE LA CAJA ACTIVA
           ==========================================================================
           Si hay turno abierto se muestra su resumen y las acciones de arqueo y
           cierre. Si no lo hay, se advierte y se ofrece abrir el turno del día.
      -->
      <section class="card-ts mb-3">
        <div class="card-ts__head">
          <div>
            <h3 class="card-ts__title">
              Caja activa — {{ cajaActiva ? cajaActiva.usuario : (sesion.usuario?.nombre || 'Mi sesión') }}
            </h3>
            <p class="card-ts__sub">
              {{ cajaActiva
                ? 'Turno personal en curso · todas las transacciones se registran a tu nombre'
                : 'Sin turno abierto para tu usuario · el sistema no permitirá cobrar' }}
            </p>
          </div>
          <span class="badge-ts" :class="cajaActiva ? 'badge-ok' : 'badge-neutral'">
            {{ cajaActiva ? 'ABIERTA' : 'CERRADA' }}
          </span>
        </div>

        <div class="card-ts__body">
          <!-- ---------------- CASO 1 · HAY TURNO ABIERTO ---------------- -->
          <template v-if="cajaActiva">
            <div class="row g-3 mb-3">
              <div class="col-6 col-lg-3">
                <div class="kpi">
                  <div class="kpi__top">
                    <p class="kpi__label">Turno de caja</p>
                    <i class="bi bi-safe2 kpi__icon"></i>
                  </div>
                  <p class="kpi__value">N° {{ cajaActiva.id }}</p>
                  <p class="kpi__meta">
                    <i class="bi bi-calendar-check"></i>
                    {{ formatearFecha(cajaActiva.fechaApertura, true) }}
                  </p>
                </div>
              </div>

              <div class="col-6 col-lg-3">
                <div class="kpi">
                  <div class="kpi__top">
                    <p class="kpi__label">Cajero responsable</p>
                    <i class="bi bi-person-badge kpi__icon"></i>
                  </div>
                  <p class="kpi__value" style="font-size:1.15rem;">{{ cajaActiva.usuario }}</p>
                  <p class="kpi__meta">Monto de apertura: {{ formatearMoneda(cajaActiva.montoApertura) }}</p>
                </div>
              </div>

              <div class="col-6 col-lg-3">
                <div class="kpi">
                  <div class="kpi__top">
                    <p class="kpi__label">Operaciones del turno</p>
                    <i class="bi bi-list-check kpi__icon"></i>
                  </div>
                  <p class="kpi__value">{{ totalPagosTurno }}</p>
                  <p class="kpi__meta">
                    Ventas: {{ formatearMoneda(totalVentasTurno) }} · Servicios: {{ formatearMoneda(totalServiciosTurno) }}
                  </p>
                </div>
              </div>

              <div class="col-6 col-lg-3">
                <div class="kpi kpi--featured">
                  <div class="kpi__top">
                    <p class="kpi__label">Total recaudado hasta ahora</p>
                    <i class="bi bi-cash-stack kpi__icon"></i>
                  </div>
                  <p class="kpi__value">{{ formatearMoneda(totalRecaudadoTurno) }}</p>
                  <p class="kpi__meta">Suma de ventas directas y servicios técnicos</p>
                  <div class="progress-thin"><span style="width:100%"></span></div>
                </div>
              </div>
            </div>

            <div class="summary-strip mb-3">
              <span class="chip"><i class="bi bi-cart-check"></i> Ventas directas: <strong>{{ formatearMoneda(totalVentasTurno) }}</strong></span>
              <span class="chip"><i class="bi bi-tools"></i> Servicios técnicos: <strong>{{ formatearMoneda(totalServiciosTurno) }}</strong></span>
              <span class="chip" v-if="cajaActiva.observaciones">
                <i class="bi bi-chat-left-text"></i> {{ cajaActiva.observaciones }}
              </span>
            </div>

            <div class="d-flex flex-wrap gap-2">
              <button class="btn btn-outline-secondary" type="button" @click="verArqueoDetallado(cajaActiva)">
                <i class="bi bi-clipboard-data"></i> Ver arqueo detallado
              </button>
              <button class="btn btn-danger" type="button" @click="prepararCierreCaja">
                <i class="bi bi-lock"></i> Cerrar caja
              </button>
            </div>
          </template>

          <!-- ---------------- CASO 2 · NO HAY TURNO ABIERTO ---------------- -->
          <div v-else class="empty-state py-4">
            <i class="bi bi-safe2"></i>
            <h3>No hay ningún turno de caja abierto</h3>
            <p class="small">
              Sin un turno abierto no es posible registrar cobros en el mostrador ni en el taller,
              porque cada pago debe quedar asociado a una caja.
            </p>
            <button class="btn btn-primary" type="button" @click="prepararAperturaCaja">
              <i class="bi bi-safe2"></i> Abrir caja del día
            </button>
          </div>
        </div>
      </section>

      <!-- ==========================================================================
           HISTORIAL DE TURNOS DE CAJA
           ========================================================================== -->
      <section class="card-ts">
        <div class="card-ts__head">
          <div>
            <h3 class="card-ts__title">Historial de turnos</h3>
            <p class="card-ts__sub">{{ turnos.length }} turno(s) registrado(s) en el sistema</p>
          </div>
        </div>

        <div class="summary-strip px-3 pt-3">
          <span class="chip"><i class="bi bi-safe2"></i> Turnos mostrados: <strong>{{ turnos.length }}</strong></span>
          <span class="chip"><i class="bi bi-unlock"></i> Abiertos: <strong>{{ turnosAbiertos }}</strong></span>
          <span class="chip"><i class="bi bi-cash-stack"></i> Recaudación histórica: <strong>{{ formatearMoneda(recaudacionHistorica) }}</strong></span>
        </div>

        <!-- Sub-estado: sin turnos registrados -->
        <div v-if="turnos.length === 0" class="empty-state">
          <i class="bi bi-safe2"></i>
          <h3>No hay turnos de caja registrados</h3>
          <p class="small">Abra la caja del día para comenzar a registrar los cobros del sistema.</p>
          <button class="btn btn-primary" type="button" @click="prepararAperturaCaja">
            <i class="bi bi-safe2"></i> Abrir caja del día
          </button>
        </div>

        <div v-else class="p-3">
          <div class="table-wrap">
            <table class="table table-ts">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Apertura</th>
                  <th scope="col">Cierre</th>
                  <th scope="col">Usuario</th>
                  <th scope="col" class="text-end">Monto apertura</th>
                  <th scope="col" class="text-end">Total recaudado</th>
                  <th scope="col" class="text-end">Ventas</th>
                  <th scope="col" class="text-end">Servicios</th>
                  <th scope="col" class="text-end">Acción</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="turno in turnos" :key="turno.id">
                  <td><span class="code-chip">Caja {{ turno.id }}</span></td>
                  <td>
                    <span class="badge-ts" :class="turno.abierta ? 'badge-ok' : 'badge-neutral'">
                      {{ turno.abierta ? 'ABIERTA' : 'CERRADA' }}
                    </span>
                  </td>
                  <td class="tabular">{{ formatearFecha(turno.fechaApertura, true) }}</td>
                  <td class="tabular">{{ turno.fechaCierre ? formatearFecha(turno.fechaCierre, true) : '—' }}</td>
                  <td>{{ turno.usuario }}</td>
                  <td class="text-end tabular">{{ formatearMoneda(turno.montoApertura) }}</td>
                  <td class="text-end tabular"><strong>{{ formatearMoneda(turno.totalRecaudado) }}</strong></td>
                  <td class="text-end tabular text-muted-2">{{ formatearMoneda(turno.totalVentas) }}</td>
                  <td class="text-end tabular text-muted-2">{{ formatearMoneda(turno.totalServicios) }}</td>
                  <td class="text-end">
                    <button class="btn btn-ghost btn-icon" type="button" title="Ver arqueo del turno" @click="verArqueoDetallado(turno)">
                      <i class="bi bi-clipboard-data"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <!-- ==========================================================================
         MODAL DE APERTURA DE CAJA (id: modalAbrirCaja)
         ==========================================================================
         Captura el fondo inicial del turno y sus observaciones. Si ya existe un
         turno abierto, el backend responde 409 y su mensaje se muestra literal.
    -->
    <div class="modal fade" id="modalAbrirCaja" tabindex="-1" aria-hidden="true" aria-labelledby="modalAbrirCajaLabel">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modalAbrirCajaLabel">
              <i class="bi bi-safe2"></i> Abrir turno de caja
            </h5>
            <button type="button" class="btn-close" aria-label="Cerrar" :disabled="enviandoApertura" @click="cerrarModal('modalAbrirCaja')"></button>
          </div>

          <form @submit.prevent="confirmarAperturaCaja" novalidate>
            <div class="modal-body">
              <!-- Cajero responsable del turno -->
              <div class="p-2 mb-3 bg-light rounded small border d-flex align-items-center gap-2">
                <i class="bi bi-person-badge text-primary" style="font-size:1.15rem;"></i>
                <div>
                  <strong>Cajero responsable:</strong> {{ sesion.usuario?.nombre || 'Usuario actual' }}
                  <span class="text-muted-2">({{ sesion.usuario?.rol || 'Cajero' }})</span>
                </div>
              </div>

              <!-- Estado de Error (por ejemplo, el 409 de caja ya abierta) -->
              <div v-if="mensajeErrorApertura" class="readonly-note" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <span>{{ mensajeErrorApertura }}</span>
              </div>

              <div class="row g-3">
                <div class="col-12">
                  <label class="form-label" for="caja-monto-apertura">Monto de apertura (USD)*</label>
                  <input
                    id="caja-monto-apertura"
                    type="number"
                    step="0.01"
                    min="0"
                    class="form-control tabular"
                    v-model.number="formularioApertura.montoApertura"
                    :disabled="enviandoApertura"
                  >
                  <div class="form-text">
                    Fondo con el que inicia el turno (sencillo y efectivo disponible en caja).
                  </div>
                </div>

                <div class="col-12">
                  <label class="form-label" for="caja-observaciones-apertura">Observaciones</label>
                  <textarea
                    id="caja-observaciones-apertura"
                    class="form-control"
                    v-model="formularioApertura.observaciones"
                    :disabled="enviandoApertura"
                    placeholder="Ej.: Turno de la mañana, fondo entregado por gerencia."
                  ></textarea>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" :disabled="enviandoApertura" @click="cerrarModal('modalAbrirCaja')">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary" :disabled="enviandoApertura">
                <span v-if="enviandoApertura" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                <i v-else class="bi bi-unlock"></i>
                {{ enviandoApertura ? 'Abriendo la caja...' : 'Abrir caja' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- ==========================================================================
         MODAL DE CIERRE CON ARQUEO (id: modalCerrarCaja)
         ==========================================================================
         Muestra lo que registra el SISTEMA y pide lo CONTADO físicamente. El
         backend devuelve la diferencia y su clasificación (CUADRADA / SOBRANTE /
         FALTANTE), que se pinta con el color correspondiente.
    -->
    <div class="modal fade" id="modalCerrarCaja" tabindex="-1" aria-hidden="true" aria-labelledby="modalCerrarCajaLabel">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modalCerrarCajaLabel">
              <i class="bi bi-lock"></i> Cerrar caja con arqueo
            </h5>
            <button type="button" class="btn-close" aria-label="Cerrar" :disabled="enviandoCierre" @click="cerrarModal('modalCerrarCaja')"></button>
          </div>

          <form @submit.prevent="confirmarCierreCaja" novalidate>
            <div class="modal-body">
              <!-- Estado de Error del cierre -->
              <div v-if="mensajeErrorCierre" class="readonly-note" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <span>{{ mensajeErrorCierre }}</span>
              </div>

              <!-- Resumen del turno que se va a cerrar -->
              <div v-if="cajaActiva" class="p-3 mb-3" style="background:var(--surface-soft);border-radius:var(--radius-md);">
                <div class="d-flex justify-content-between">
                  <span class="small text-muted-2">Turno</span>
                  <strong class="small">Caja N° {{ cajaActiva.id }} · {{ cajaActiva.usuario }}</strong>
                </div>
                <div class="d-flex justify-content-between mt-1">
                  <span class="small text-muted-2">Apertura</span>
                  <span class="small tabular">{{ formatearFecha(cajaActiva.fechaApertura, true) }}</span>
                </div>
                <div class="d-flex justify-content-between mt-1">
                  <span class="small text-muted-2">Fondo inicial</span>
                  <span class="small tabular">{{ formatearMoneda(cajaActiva.montoApertura) }}</span>
                </div>
                <div class="d-flex justify-content-between mt-1">
                  <span class="small text-muted-2">Ventas directas</span>
                  <span class="small tabular">{{ formatearMoneda(totalVentasTurno) }}</span>
                </div>
                <div class="d-flex justify-content-between mt-1">
                  <span class="small text-muted-2">Servicios técnicos</span>
                  <span class="small tabular">{{ formatearMoneda(totalServiciosTurno) }}</span>
                </div>
                <div v-if="resumenMetodosCierre.length > 0" class="mt-2 pt-2" style="border-top:1px dashed var(--border-color);">
                  <span class="small text-muted-2 d-block mb-1 fw-semibold">Desglose por método de pago:</span>
                  <div v-for="m in resumenMetodosCierre" :key="m.metodoPago" class="d-flex justify-content-between small text-muted-2 py-0">
                    <span>{{ etiquetaMetodoPago(m.metodoPago) }} ({{ m.totalOperaciones }} op.):</span>
                    <strong class="tabular">{{ formatearMoneda(m.totalUsd) }}</strong>
                  </div>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-2 pt-2" style="border-top:1px solid var(--border-color);">
                  <span class="fw-semibold">Total que registra el sistema</span>
                  <strong class="tabular fs-5">{{ formatearMoneda(totalRecaudadoTurno) }}</strong>
                </div>
              </div>

              <!-- ---------------- RESULTADO DEL ARQUEO YA CALCULADO ---------------- -->
              <div v-if="resultadoCierre" class="p-3 mb-3" style="border:1px solid var(--border-color);border-radius:var(--radius-md);">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="fw-semibold">Resultado del arqueo</span>
                  <span class="badge-ts" :class="claseBadgeDiferencia(resultadoCierre.tipoDiferencia)">
                    {{ etiquetaDiferencia(resultadoCierre.tipoDiferencia) }}
                  </span>
                </div>
                <div class="d-flex justify-content-between mt-2">
                  <span class="small text-muted-2">Total registrado por el sistema</span>
                  <span class="small tabular">{{ formatearMoneda(resultadoCierre.totalRecaudado) }}</span>
                </div>
                <div class="d-flex justify-content-between mt-1">
                  <span class="small text-muted-2">Monto contado físicamente</span>
                  <span class="small tabular">{{ formatearMoneda(resultadoCierre.caja?.montoCierre) }}</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-2">
                  <span class="fw-semibold">Diferencia</span>
                  <strong
                    class="tabular fs-5"
                    :style="{ color: colorDiferencia(resultadoCierre.tipoDiferencia) }"
                  >
                    {{ formatearMoneda(resultadoCierre.diferencia) }}
                  </strong>
                </div>
                <p class="form-text mb-0 mt-2">{{ resultadoCierre.mensaje }}</p>
              </div>

              <div v-else class="row g-3">
                <div class="col-12">
                  <label class="form-label" for="caja-monto-cierre">Monto contado físicamente (USD)*</label>
                  <input
                    id="caja-monto-cierre"
                    type="number"
                    step="0.01"
                    min="0"
                    class="form-control tabular"
                    v-model.number="formularioCierre.montoCierre"
                    :disabled="enviandoCierre"
                  >
                  <div class="form-text">
                    Cuente el efectivo y los comprobantes del turno y escriba el total.
                    El sistema lo comparará con {{ formatearMoneda(totalRecaudadoTurno) }}.
                  </div>
                </div>

                <div class="col-12">
                  <label class="form-label" for="caja-observaciones-cierre">Observaciones del arqueo</label>
                  <textarea
                    id="caja-observaciones-cierre"
                    class="form-control"
                    v-model="formularioCierre.observaciones"
                    :disabled="enviandoCierre"
                    placeholder="Ej.: Se detectó un faltante por vuelto entregado de más."
                  ></textarea>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <template v-if="resultadoCierre">
                <button type="button" class="btn btn-primary" @click="finalizarCierreCaja">
                  <i class="bi bi-check2-circle"></i> Entendido
                </button>
              </template>
              <template v-else>
                <button type="button" class="btn btn-outline-secondary" :disabled="enviandoCierre" @click="cerrarModal('modalCerrarCaja')">
                  Cancelar
                </button>
                <button type="submit" class="btn btn-danger" :disabled="enviandoCierre">
                  <span v-if="enviandoCierre" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                  <i v-else class="bi bi-lock"></i>
                  {{ enviandoCierre ? 'Cerrando y arquando...' : 'Cerrar caja y arquear' }}
                </button>
              </template>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- ==========================================================================
         MODAL DE ARQUEO DETALLADO (id: modalArqueoDetalle)
         ==========================================================================
         Pagos uno por uno, resumen por método de pago y totales separados por
         origen (Ventas directas / Servicios técnicos).
    -->
    <div class="modal fade" id="modalArqueoDetalle" tabindex="-1" aria-hidden="true" aria-labelledby="modalArqueoDetalleLabel">
      <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modalArqueoDetalleLabel">
              <i class="bi bi-clipboard-data"></i> Arqueo detallado del turno
            </h5>
            <button type="button" class="btn-close" aria-label="Cerrar" @click="cerrarModal('modalArqueoDetalle')"></button>
          </div>

          <div class="modal-body">
            <!-- Estado de carga del arqueo -->
            <div v-if="cargandoArqueo" class="empty-state py-4">
              <div class="spinner-border text-primary mb-3" role="status" aria-hidden="true"></div>
              <h3>Calculando el arqueo...</h3>
              <p class="small">Reuniendo los pagos del turno desde la base de datos.</p>
            </div>

            <div v-else-if="!arqueoDetallado" class="empty-state py-4">
              <i class="bi bi-clipboard-x"></i>
              <h3>No se pudo obtener el arqueo</h3>
              <p class="small">Cierre este cuadro y vuelva a intentarlo.</p>
            </div>

            <template v-else>
              <!-- Encabezado del turno consultado -->
              <div v-if="cajaDelArqueo" class="summary-strip mb-3">
                <span class="chip"><i class="bi bi-safe2"></i> Caja N° <strong>{{ cajaDelArqueo.id }}</strong></span>
                <span class="chip"><i class="bi bi-person-badge"></i> {{ cajaDelArqueo.usuario }}</span>
                <span class="chip"><i class="bi bi-calendar-check"></i> Apertura: <strong>{{ formatearFecha(cajaDelArqueo.fechaApertura, true) }}</strong></span>
                <span class="chip">
                  <i class="bi bi-flag"></i> Estado:
                  <strong>{{ cajaDelArqueo.abierta ? 'ABIERTA' : 'CERRADA' }}</strong>
                </span>
              </div>

              <!-- ---------------- TOTALES POR ORIGEN ---------------- -->
              <div class="row g-3 mb-3">
                <div class="col-6 col-lg-4">
                  <div class="kpi">
                    <div class="kpi__top">
                      <p class="kpi__label">Ventas directas</p>
                      <i class="bi bi-cart-check kpi__icon"></i>
                    </div>
                    <p class="kpi__value" style="font-size:1.35rem;">{{ formatearMoneda(arqueoDetallado.totales.totalVentas) }}</p>
                    <p class="kpi__meta">Cobros originados por el mostrador</p>
                  </div>
                </div>

                <div class="col-6 col-lg-4">
                  <div class="kpi">
                    <div class="kpi__top">
                      <p class="kpi__label">Servicios técnicos</p>
                      <i class="bi bi-tools kpi__icon"></i>
                    </div>
                    <p class="kpi__value" style="font-size:1.35rem;">{{ formatearMoneda(arqueoDetallado.totales.totalServicios) }}</p>
                    <p class="kpi__meta">Cobros de órdenes del taller</p>
                  </div>
                </div>

                <div class="col-12 col-lg-4">
                  <div class="kpi kpi--featured">
                    <div class="kpi__top">
                      <p class="kpi__label">Total recaudado</p>
                      <i class="bi bi-cash-stack kpi__icon"></i>
                    </div>
                    <p class="kpi__value" style="font-size:1.35rem;">{{ formatearMoneda(arqueoDetallado.totales.totalRecaudado) }}</p>
                    <p class="kpi__meta">{{ arqueoDetallado.totales.totalOperaciones }} operación(es) registrada(s)</p>
                    <div class="progress-thin"><span style="width:100%"></span></div>
                  </div>
                </div>
              </div>

              <!-- ---------------- RESUMEN POR MÉTODO DE PAGO ---------------- -->
              <h6 class="mb-2"><i class="bi bi-credit-card-2-front"></i> Resumen por método de pago</h6>

              <div v-if="arqueoDetallado.resumenPorMetodo.length === 0" class="readonly-note" style="background:var(--surface-soft);color:var(--text-muted);border-color:var(--border-color);">
                <i class="bi bi-info-circle"></i>
                <span>Este turno no registra pagos por ningún método todavía.</span>
              </div>

              <div v-else class="table-wrap mb-3" style="border:1px solid var(--border-color);border-radius:var(--radius-sm);">
                <table class="table table-ts mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Método de pago</th>
                      <th scope="col" class="text-center">Operaciones</th>
                      <th scope="col" class="text-end">Total (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="fila in arqueoDetallado.resumenPorMetodo" :key="fila.metodoPago">
                      <td>{{ etiquetaMetodoPago(fila.metodoPago) }}</td>
                      <td class="text-center tabular">{{ fila.totalOperaciones }}</td>
                      <td class="text-end tabular"><strong>{{ formatearMoneda(fila.totalUsd) }}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- ---------------- PAGOS UNO POR UNO ---------------- -->
              <h6 class="mb-2"><i class="bi bi-list-ol"></i> Pagos registrados en el turno</h6>

              <div v-if="arqueoDetallado.pagos.length === 0" class="readonly-note" style="background:var(--surface-soft);color:var(--text-muted);border-color:var(--border-color);">
                <i class="bi bi-info-circle"></i>
                <span>Todavía no se ha registrado ningún pago en este turno de caja.</span>
              </div>

              <div v-else class="table-wrap" style="border:1px solid var(--border-color);border-radius:var(--radius-sm);">
                <table class="table table-ts mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
                      <th scope="col">Origen</th>
                      <th scope="col">Documento</th>
                      <th scope="col">Cliente</th>
                      <th scope="col">Método</th>
                      <th scope="col">Referencia</th>
                      <th scope="col" class="text-end">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="pago in arqueoDetallado.pagos" :key="pago.id">
                      <td class="tabular">{{ formatearFecha(pago.fecha, true) }}</td>
                      <td>
                        <span class="badge-ts" :class="presentacionOrigenMovimiento(pago.tipoOrigen).clase">
                          <i class="bi" :class="presentacionOrigenMovimiento(pago.tipoOrigen).icono"></i>
                          {{ presentacionOrigenMovimiento(pago.tipoOrigen).etiqueta }}
                        </span>
                      </td>
                      <td><span class="code-chip">{{ documentoDelPago(pago) }}</span></td>
                      <td>{{ pago.cliente }}</td>
                      <td>{{ etiquetaMetodoPago(pago.metodoPago) }}</td>
                      <td class="text-muted-2">{{ pago.referencia || '—' }}</td>
                      <td class="text-end tabular"><strong>{{ formatearMoneda(pago.monto) }}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" @click="cerrarModal('modalArqueoDetalle')">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL DE GENERACIÓN DE REPORTES (PDF / EXCEL / CORREO) -->
    <ModalGenerarReporte
      id-modal="modalReporteCaja"
      tipo-reporte="caja"
      titulo="Reporte Gerencial de Arqueo y Control de Turnos de Caja"
      subtitulo="Auditoría de aperturas, cierres de turno, recaudación acumulada y cuadre por método de pago."
      clasificacion="GERENCIAL"
      @notificar="manejarNotificacionReporte"
    />
  </main>
</template>
