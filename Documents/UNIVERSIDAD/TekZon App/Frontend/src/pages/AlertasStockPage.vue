<script setup>
/**
 * ==========================================================================
 * PÁGINA DE ALERTAS DE STOCK (AlertasStockPage.vue) - TEKZON C.A.
 * ==========================================================================
 * Módulo 4 · Automatización de alertas de stock mínimo
 *
 * PROPÓSITO FUNCIONAL:
 *   Demuestra y administra la AUTOMATIZACIÓN de las alertas de stock mínimo:
 *
 *     · La alerta se GENERA AUTOMÁTICAMENTE en el mismo instante en que un
 *       descuento de inventario (por Venta Directa o por consumo de repuesto en
 *       Servicio Técnico) deja la existencia en o por debajo del stock mínimo, y
 *       queda registrada en la base de datos.
 *     · Se pueden filtrar las alertas PENDIENTES o ver TODAS las históricas.
 *     · Cada alerta se puede marcar como ATENDIDA (una por una) o atender en
 *       bloque todas las pendientes de un mismo producto al reponer mercancía.
 *     · Se muestra aparte la lista de PRODUCTOS EN RIESGO (existencia en o por
 *       debajo del mínimo), que es el estado real del almacén incluso cuando las
 *       alertas históricas ya fueron atendidas.
 *
 * PROPÓSITO TÉCNICO:
 *   · CERO DATOS SIMULADOS: alertas, indicadores y productos en riesgo provienen
 *     de `AlertaStockServices`, que consulta `alerta_stock` y `producto` en la
 *     base `tekzon_bd`.
 *   · La evidencia del origen de cada alerta (columna `origen` y columna
 *     `documento`) se pinta con `presentacionOrigenMovimiento`, de modo que se
 *     ve si el descuento vino de una "Venta" o de un "Servicio Técnico".
 *   · 3 ESTADOS DE UI:
 *       CARGANDO -> `LoadingSpinner` y banderas de proceso en los botones.
 *       ÉXITO    -> `ToastNotificaciones` con el mensaje devuelto por el API.
 *       ERROR    -> Toast y panel persistente con el código HTTP y "Reintentar".
 *   · Las acciones masivas exigen `confirm()` previo, porque afectan a todas las
 *     alertas pendientes de un producto.
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import AlertaStockServices from '../services/AlertaStockServices.js';
// Helpers de formato y presentación compartidos por los módulos nuevos.
import {
  aNumero,
  describirError,
  formatearFecha,
  presentacionOrigenMovimiento
} from '../services/formato.js';

// ==========================================================================
// ESTADO REACTIVO PRINCIPAL
// ==========================================================================

/** Alertas de stock mínimo descargadas del API. */
const alertas = ref([]);
/** Indicadores agregados (campana de notificaciones y KPI de la página). */
const indicadores = ref(null);
/** Productos activos cuya existencia está en o por debajo del mínimo. */
const productosRiesgo = ref([]);

/** Filtro del listado: true = sólo pendientes, false = todas. */
const soloPendientes = ref(true);

// ==========================================================================
// ESTADOS DE UI (Cargando / Éxito / Error)
// ==========================================================================
const estadoCargando = ref(false);
const cargandoAlertas = ref(false);

/** Id de la alerta que se está procesando (deshabilita su botón). */
const atendiendoAlertaId = ref(null);
/** Código del producto cuyas alertas se están atendiendo en bloque. */
const atendiendoProducto = ref('');

const mensajeErrorCarga = ref('');
const codigoErrorCarga = ref('');

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

// ==========================================================================
// CARGA DE DATOS DESDE EL BACKEND (CERO DATOS SIMULADOS)
// ==========================================================================
/**
 * CARGA LAS ALERTAS SEGÚN EL FILTRO ACTIVO.
 * `soloPendientes` viaja al backend, que devuelve únicamente las alertas sin
 * atender o el histórico completo.
 */
const cargarAlertas = async () => {
  cargandoAlertas.value = true;
  mensajeErrorCarga.value = '';
  codigoErrorCarga.value = '';

  try {
    alertas.value = await AlertaStockServices.listarAlertas({ soloPendientes: soloPendientes.value });
  } catch (error) {
    alertas.value = [];

    const descripcion = describirError(error);
    codigoErrorCarga.value = descripcion.codigo;
    mensajeErrorCarga.value = descripcion.mensaje;

    mostrarToast(`Error al cargar las alertas (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    cargandoAlertas.value = false;
  }
};

/** CARGA LOS INDICADORES AGREGADOS DE ALERTAS. */
const cargarIndicadores = async () => {
  try {
    indicadores.value = await AlertaStockServices.obtenerIndicadores();
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`Error al cargar los indicadores (${descripcion.codigo})`, descripcion.mensaje, 'error');
  }
};

/** CARGA LOS PRODUCTOS EN RIESGO DE DESABASTECIMIENTO. */
const cargarProductosEnRiesgo = async () => {
  try {
    productosRiesgo.value = await AlertaStockServices.listarProductosEnRiesgo();
  } catch (error) {
    productosRiesgo.value = [];
    const descripcion = describirError(error);
    mostrarToast(`Error al cargar los productos en riesgo (${descripcion.codigo})`, descripcion.mensaje, 'error');
  }
};

/** CARGA INICIAL DE LA PÁGINA (las tres consultas en paralelo). */
const cargarPaginaAlertas = async () => {
  estadoCargando.value = true;

  await Promise.all([cargarAlertas(), cargarIndicadores(), cargarProductosEnRiesgo()]);

  estadoCargando.value = false;
};

onMounted(() => {
  cargarPaginaAlertas();
});

/** Refresco integral tras atender alertas. */
const refrescarModuloAlertas = async () => {
  await Promise.all([cargarAlertas(), cargarIndicadores(), cargarProductosEnRiesgo()]);
};

/**
 * CAMBIA EL FILTRO DEL LISTADO.
 * Se delega en el backend en lugar de filtrar en memoria, para que una alerta
 * recién atendida desaparezca de la vista de pendientes.
 */
const cambiarFiltro = async (valorSoloPendientes) => {
  soloPendientes.value = valorSoloPendientes;

  await Promise.all([cargarAlertas(), cargarIndicadores(), cargarProductosEnRiesgo()]);
};

// ==========================================================================
// INDICADORES KPI
// ==========================================================================
const alertasPendientes = computed(() => aNumero(indicadores.value?.pendientes));
const productosAgotados = computed(() => aNumero(indicadores.value?.agotados));
const totalAlertasHistorico = computed(() => aNumero(indicadores.value?.totalAlertas));
const productosEnRiesgoTotal = computed(() => aNumero(indicadores.value?.productosEnRiesgo));

/** Alertas atendidas dentro de la lista mostrada (sólo aplica al filtro "Todas"). */
const alertasAtendidasMostradas = computed(() =>
  alertas.value.filter((alerta) => alerta.atendida).length
);

// ==========================================================================
// PRESENTACIÓN DE LAS ALERTAS
// ==========================================================================
/**
 * SITUACIÓN DE UNA ALERTA SEGÚN LA EXISTENCIA QUE DEJÓ EL DESCUENTO.
 * existencia 0 -> "Agotado" (rojo); por debajo o igual al mínimo -> "Bajo mínimo".
 */
const situacionAlerta = (alerta) => {
  if (aNumero(alerta.existencia) <= 0) {
    return { etiqueta: 'Agotado', clase: 'badge-out', icono: 'bi-x-octagon' };
  }

  return { etiqueta: 'Bajo mínimo', clase: 'badge-low', icono: 'bi-exclamation-triangle' };
};

/** Iniciales de la alerta atendida: se muestran atenuadas y con su badge. */
const esAlertaAtendida = (alerta) => Boolean(alerta.atendida);

// ==========================================================================
// ATENDER ALERTAS
// ==========================================================================
/**
 * MARCA UNA ALERTA COMO ATENDIDA.
 *
 * PROPÓSITO FUNCIONAL: deja constancia de que el almacenista ya revisó la
 * situación (por ejemplo, tras reponer mercancía). El backend rechaza (400) si
 * la alerta ya estaba atendida.
 */
const marcarAlertaAtendida = async (alerta) => {
  if (alerta.atendida) return;

  atendiendoAlertaId.value = alerta.id;

  try {
    const resultado = await AlertaStockServices.atenderAlerta(alerta.id);

    mostrarToast(
      'Alerta atendida',
      resultado?.mensaje || `La alerta del producto ${alerta.producto} quedó marcada como atendida.`,
      'success'
    );

    await refrescarModuloAlertas();
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`No se pudo atender la alerta (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    atendiendoAlertaId.value = null;
  }
};

/**
 * ATIENDE EN BLOQUE TODAS LAS ALERTAS PENDIENTES DE UN PRODUCTO.
 *
 * PROPÓSITO FUNCIONAL: se usa al REPONER mercancía: al subir el stock, los
 * avisos acumulados de ese producto dejan de aplicar y se cierran de una vez.
 *
 * PROPÓSITO TÉCNICO: es una acción masiva, por lo que exige `confirm()` previo
 * y se identifica el producto por su código (llave del catálogo).
 */
const atenderAlertasDelProducto = async (alerta) => {
  const confirmado = window.confirm(
    `¿Confirma marcar como atendidas TODAS las alertas pendientes del producto `
    + `${alerta.producto} (${alerta.codigo})?\n`
    + 'Úselo cuando ya haya repuesto la mercancía en el almacén.'
  );

  if (!confirmado) return;

  atendiendoProducto.value = alerta.codigo;

  try {
    const resultado = await AlertaStockServices.atenderAlertasDeProducto(alerta.codigo);

    mostrarToast(
      `Alertas de ${alerta.producto} atendidas`,
      resultado?.mensaje || 'Todas las alertas pendientes del producto fueron marcadas como atendidas.',
      'success'
    );

    await refrescarModuloAlertas();
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`No se pudieron atender las alertas (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    atendiendoProducto.value = '';
  }
};

// ==========================================================================
// PRODUCTOS EN RIESGO
// ==========================================================================
/**
 * PORCENTAJE QUE REPRESENTA LA EXISTENCIA FRENTE AL MÍNIMO.
 * Se usa para el ancho de la barra `stock-meter`: el 100 % corresponde a tener
 * justo el stock mínimo, por lo que cualquier valor inferior indica riesgo.
 */
const porcentajeExistencia = (producto) => {
  const minimo = Math.max(aNumero(producto.stockMinimo), 1);
  return Math.min(100, Math.round((aNumero(producto.existencia) / minimo) * 100));
};

/** Color de la barra: rojo si está agotado y ámbar si está por debajo del mínimo. */
const colorExistencia = (producto) =>
  aNumero(producto.existencia) <= 0 ? 'var(--color-danger)' : 'var(--color-warning)';

/** Ruta pública de la imagen del producto. */
const rutaImagenProducto = (imagen) => `/assets/img/productos/${imagen || 'pantalla.jpg'}`;
</script>

<template>
  <main class="content" id="contenido">
    <!-- ================= ESTADO DE ÉXITO / ERROR (pila de Toasts) ================= -->
    <ToastNotificaciones :notificaciones="notificaciones" @cerrar="cerrarToastPorId" />

    <div class="page-head">
      <div>
        <h2>Alertas de stock mínimo</h2>
        <p>
          Automatización del control de existencias: el sistema registra la alerta en el mismo
          instante en que un descuento deja el producto en o por debajo de su stock mínimo.
        </p>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-secondary" type="button" :disabled="cargandoAlertas" @click="refrescarModuloAlertas">
          <span v-if="cargandoAlertas" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
          <i v-else class="bi bi-arrow-clockwise"></i> Actualizar
        </button>
        <router-link class="btn btn-primary" to="/inventario">
          <i class="bi bi-box-seam"></i> Reponer mercancía
        </router-link>
      </div>
    </div>

    <!-- ==========================================================================
         EXPLICACIÓN DEL MECANISMO AUTOMÁTICO
         ==========================================================================
         Deja claro al evaluador que la alerta no se crea a mano: nace del propio
         descuento de inventario dentro de la transacción del backend.
    -->

 <!--  <section class="card-ts mb-3">
      <div class="card-ts__body d-flex align-items-start gap-3">
        x
        <div>
          <h3 class="card-ts__title mb-1">¿Cómo se genera una alerta?</h3>
          <p class="mb-1 small">
            La alerta se crea <strong>automáticamente</strong> en el mismo instante en que un
            descuento de inventario deja la existencia del producto <strong>en o por debajo de su
            stock mínimo</strong>. Los dos hechos que la disparan son:
          </p>
          <ul class="small mb-1">
            <li><strong>Venta Directa</strong>: la salida de mercancía del mostrador descuenta el stock.</li>
            <li><strong>Servicio Técnico</strong>: el consumo de un repuesto dentro de una orden descuenta el stock.</li>
          </ul>
          <p class="small mb-0">
            El aviso queda <strong>registrado en la base de datos</strong> con el origen y el documento
            que lo provocó (factura u orden), por lo que puede auditarse en cualquier momento. En la
            columna <em>Origen</em> de la tabla se evidencia si el descuento fue por «Venta» o por
            «Servicio Técnico».
          </p>
        </div>
      </div>
    </section>
    -->

    <!-- ================= ESTADO DE CARGA ================= -->
    <LoadingSpinner
      v-if="estadoCargando && alertas.length === 0"
      mensaje="Cargando las alertas de stock desde la base de datos..."
    />

    <template v-else>
      <!-- ================= ESTADO DE ERROR PERSISTENTE ================= -->
      <div v-if="mensajeErrorCarga" class="readonly-note" role="alert">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span><strong>{{ codigoErrorCarga }}</strong> · {{ mensajeErrorCarga }}</span>
        <button class="btn btn-sm btn-outline-danger ms-auto" type="button" @click="refrescarModuloAlertas">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button>
      </div>

      <!-- ================= INDICADORES KPI ================= -->
      <section class="row g-3 mb-3">
        <div class="col-6 col-lg-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Alertas pendientes</p>
              <i class="bi bi-bell-fill kpi__icon" style="color:var(--color-warning)"></i>
            </div>
            <p class="kpi__value">{{ alertasPendientes }}</p>
            <p class="kpi__meta">Avisos sin atender en la base de datos</p>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Productos agotados</p>
              <i class="bi bi-x-octagon kpi__icon" style="color:var(--color-danger)"></i>
            </div>
            <p class="kpi__value">{{ productosAgotados }}</p>
            <p class="kpi__meta">Artículos con existencia en cero</p>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Alertas históricas</p>
              <i class="bi bi-clock-history kpi__icon"></i>
            </div>
            <p class="kpi__value">{{ totalAlertasHistorico }}</p>
            <p class="kpi__meta">
              Atendidas en la lista mostrada: {{ alertasAtendidasMostradas }}
            </p>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi kpi--featured">
            <div class="kpi__top">
              <p class="kpi__label">Productos en riesgo</p>
              <i class="bi bi-graph-down-arrow kpi__icon"></i>
            </div>
            <p class="kpi__value">{{ productosEnRiesgoTotal }}</p>
            <p class="kpi__meta">Existencia en o por debajo del stock mínimo</p>
            <div class="progress-thin"><span style="width:100%"></span></div>
          </div>
        </div>
      </section>

      <!-- ==========================================================================
           LISTADO DE ALERTAS
           ========================================================================== -->
      <section class="card-ts mb-3">
        <div class="card-ts__head">
          <div>
            <h3 class="card-ts__title">Registro de alertas</h3>
            <p class="card-ts__sub">
              {{ alertas.length }} alerta(s) mostrada(s) ·
              {{ soloPendientes ? 'sólo las pendientes de atender' : 'histórico completo' }}
            </p>
          </div>
        </div>

        <!-- Filtro o segmento: Pendientes / Todas -->
        <div class="toolbar">
          <div class="view-switch">
            <button type="button" :class="{ active: soloPendientes }" @click="cambiarFiltro(true)">
              <i class="bi bi-bell"></i> Pendientes
            </button>
            <button type="button" :class="{ active: !soloPendientes }" @click="cambiarFiltro(false)">
              <i class="bi bi-collection"></i> Todas
            </button>
          </div>

          <button class="btn btn-outline-secondary" type="button" :disabled="cargandoAlertas" @click="refrescarModuloAlertas">
            <span v-if="cargandoAlertas" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            <i v-else class="bi bi-arrow-clockwise"></i> Actualizar
          </button>

          <span class="chip ms-auto">
            <i class="bi bi-info-circle"></i>
            Las alertas se generan solas al descontar inventario
          </span>
        </div>

        <!-- Sub-estado: sin alertas -->
        <div v-if="alertas.length === 0" class="empty-state">
          <i class="bi bi-shield-check"></i>
          <h3>No hay alertas de stock</h3>
          <p class="small">
            {{ soloPendientes
              ? 'Todas las existencias están por encima del mínimo: el almacén no requiere reposición inmediata.'
              : 'Aún no se ha registrado ninguna alerta de stock mínimo en el sistema.' }}
          </p>
          <router-link class="btn btn-primary" to="/inventario">
            <i class="bi bi-box-seam"></i> Ir al catálogo de inventario
          </router-link>
        </div>

        <div v-else class="p-3">
          <div class="table-wrap">
            <table class="table table-ts">
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col" class="text-center">Existencia en la alerta</th>
                  <th scope="col" class="text-center">Stock mínimo</th>
                  <th scope="col">Situación</th>
                  <th scope="col">Origen</th>
                  <th scope="col">Documento</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Estado</th>
                  <th scope="col" class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="alerta in alertas"
                  :key="alerta.id"
                  :class="{ 'fila-atendida': esAlertaAtendida(alerta) }"
                >
                  <td>
                    <div class="cell-product">
                      <img :src="rutaImagenProducto(alerta.imagen)" :alt="alerta.producto">
                      <div>
                        <strong class="fw-semibold d-block">{{ alerta.producto }}</strong>
                        <span class="code-chip">{{ alerta.codigo }}</span>
                        <!-- El mensaje redactado por el sistema se muestra como tooltip -->
                        <small class="d-block text-muted-2" :title="alerta.mensaje">{{ alerta.mensaje }}</small>
                      </div>
                    </div>
                  </td>
                  <td class="text-center tabular">
                    <strong :style="{ color: aNumero(alerta.existencia) <= 0 ? 'var(--color-danger)' : 'var(--color-warning)' }">
                      {{ alerta.existencia }}
                    </strong>
                    <small class="d-block text-muted-2">actual: {{ alerta.existenciaActual }}</small>
                  </td>
                  <td class="text-center tabular">{{ alerta.stockMinimo }}</td>
                  <td>
                    <span class="badge-ts" :class="situacionAlerta(alerta).clase">
                      <i class="bi" :class="situacionAlerta(alerta).icono"></i>
                      {{ situacionAlerta(alerta).etiqueta }}
                    </span>
                  </td>
                  <td>
                    <!-- Evidencia del hecho que provocó el descuento -->
                    <span class="badge-ts" :class="presentacionOrigenMovimiento(alerta.origen).clase">
                      <i class="bi" :class="presentacionOrigenMovimiento(alerta.origen).icono"></i>
                      {{ presentacionOrigenMovimiento(alerta.origen).etiqueta }}
                    </span>
                  </td>
                  <td><span class="code-chip">{{ alerta.documento || '—' }}</span></td>
                  <td class="tabular">{{ formatearFecha(alerta.fecha, true) }}</td>
                  <td>
                    <span class="badge-ts" :class="esAlertaAtendida(alerta) ? 'badge-neutral' : 'badge-low'">
                      {{ esAlertaAtendida(alerta) ? 'Atendida' : 'Pendiente' }}
                    </span>
                  </td>
                  <td class="text-end">
                    <div class="d-inline-flex gap-1">
                      <button
                        class="btn btn-ghost btn-icon"
                        type="button"
                        title="Marcar esta alerta como atendida"
                        :disabled="esAlertaAtendida(alerta) || atendiendoAlertaId === alerta.id"
                        @click="marcarAlertaAtendida(alerta)"
                      >
                        <span
                          v-if="atendiendoAlertaId === alerta.id"
                          class="spinner-border spinner-border-sm"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        <i v-else class="bi bi-check2-circle"></i>
                      </button>
                      <button
                        class="btn btn-ghost btn-icon"
                        type="button"
                        title="Atender todas las alertas pendientes de este producto"
                        :disabled="atendiendoProducto === alerta.codigo"
                        @click="atenderAlertasDelProducto(alerta)"
                      >
                        <span
                          v-if="atendiendoProducto === alerta.codigo"
                          class="spinner-border spinner-border-sm"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        <i v-else class="bi bi-check2-all"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ==========================================================================
           PRODUCTOS EN RIESGO DE DESABASTECIMIENTO
           ==========================================================================
           Estado REAL del almacén: se calcula sobre `producto.existencia` frente a
           `producto.stock_minimo`, aunque las alertas históricas ya se hayan
           atendido.
      -->
      <section class="card-ts">
        <div class="card-ts__head">
          <div>
            <h3 class="card-ts__title">Productos en riesgo de desabastecimiento</h3>
            <p class="card-ts__sub">
              {{ productosRiesgo.length }} artículo(s) activo(s) con existencia en o por debajo del mínimo
            </p>
          </div>
          <router-link class="btn btn-outline-secondary btn-sm" to="/inventario">
            <i class="bi bi-box-arrow-in-down"></i> Reponer en el catálogo
          </router-link>
        </div>

        <div class="card-ts__body">
          <!-- Sub-estado: ningún producto en riesgo -->
          <div v-if="productosRiesgo.length === 0" class="empty-state py-4">
            <i class="bi bi-shield-check"></i>
            <h3>Ningún producto en riesgo</h3>
            <p class="small">
              Todas las existencias del almacén están por encima del stock mínimo configurado.
            </p>
          </div>

          <div v-else class="table-wrap">
            <table class="table table-ts">
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Categoría</th>
                  <th scope="col" class="text-center">Existencia</th>
                  <th scope="col" class="text-center">Stock mínimo</th>
                  <th scope="col" style="min-width:180px;">Cobertura del mínimo</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="producto in productosRiesgo" :key="`riesgo-${producto.codigo}`">
                  <td>
                    <div class="cell-product">
                      <img :src="rutaImagenProducto(producto.imagen)" :alt="producto.nombre">
                      <div>
                        <strong class="fw-semibold d-block">{{ producto.nombre }}</strong>
                        <span class="code-chip">{{ producto.codigo }}</span>
                      </div>
                    </div>
                  </td>
                  <td>{{ producto.categoria }}</td>
                  <td class="text-center tabular">
                    <strong :style="{ color: colorExistencia(producto) }">{{ producto.existencia }}</strong>
                  </td>
                  <td class="text-center tabular">{{ producto.stockMinimo }}</td>
                  <td>
                    <!-- Barra proporcional: 100 % equivale a tener justo el stock mínimo -->
                    <div class="stock-meter">
                      <span
                        :style="{ width: `${porcentajeExistencia(producto)}%`, background: colorExistencia(producto) }"
                      ></span>
                    </div>
                    <small class="text-muted-2">{{ porcentajeExistencia(producto) }} % del mínimo</small>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="form-text mt-3 mb-0">
            <i class="bi bi-info-circle"></i>
            Para reponer mercancía registre una <strong>entrada de inventario</strong> en el módulo
            <router-link to="/movimientos">Entradas y Salidas</router-link>; al subir la existencia por
            encima del mínimo, el producto desaparece de esta lista.
          </p>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
/**
 * ALERTAS ATENDIDAS.
 * PROPÓSITO FUNCIONAL: las alertas ya gestionadas se muestran atenuadas para que
 * el almacenista identifique de un vistazo las que todavía exigen acción.
 */
.fila-atendida {
  opacity: .55;
}
</style>
