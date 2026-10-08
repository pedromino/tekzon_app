<script setup>
/**
 * ==========================================================================
 * PÁGINA DE MOVIMIENTOS (MovimientosPage.vue) - TEKZON C.A.
 * ==========================================================================
 * CRUD 3 · Movimientos de Inventario (Historial transaccional)
 * 
 *   Presenta el libro de historial del almacén: cada Entrada, Salida y Ajuste con su
 *   existencia previa, la cantidad afectada y la existencia posterior. Incluye
 *   filtros por tipo de movimiento, producto y rango de fechas, además del
 *   botón para registrar una nueva Entrada o Salida física.
 
 *   - PUREZA DE DATOS: la tabla se alimenta exclusivamente de
 *     `MovimientoServices.listarMovimientos()`, que consulta la tabla
 *     `movimiento_inventario` de la base `tekzon_bd`. Cero filas simuladas.
 *   - Los filtros se envían como parámetros de consulta al backend (no se
 *     filtran en memoria), de modo que el historial siempre refleja la verdad
 *     almacenada y respeta el límite de filas.
 *   - Implementa los 3 estados de UI:
 *       CARGANDO -> `LoadingSpinner`.
 *       ÉXITO    -> Toast con la traza "existencia previa -> posterior".
 *       ERROR    -> Toast con el código HTTP (400 filtro inválido, 404,
 *                   500) y panel de error persistente con "Reintentar".
 *   - El botón de envío del modal queda `:disabled` durante el POST.
 *   - La lista de productos para el filtro proviene del CRUD 1, lo que
 *     evidencia la interconexión entre los módulos.
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import MovimientoModal from '../components/MovimientoModal.vue';
import MovimientoServices from '../services/MovimientoServices.js';
import ProductoServices from '../services/ProductoServices.js';
// Utilitario compartido de apertura/cierre de modales de Bootstrap 5.
import { abrirModal, cerrarModal } from '../utils/utilidadesModales.js';

// ==========================================================================
// ESTADO REACTIVO PRINCIPAL
// ==========================================================================
const movimientos = ref([]);          // Asientos del historial (CRUD 3)
const productos = ref([]);            // Catálogo para el filtro (CRUD 1)
const resumenKardex = ref(null);      // KPI agregados del historial
const indicadoresStock = ref(null);   // KPI de existencias (CRUD 2)

// Filtros de la tabla transaccional
const filtroTipo = ref('');
const filtroProducto = ref('');
const filtroFechaDesde = ref('');
const filtroFechaHasta = ref('');
const filtroTexto = ref('');

// ==========================================================================
// ESTADOS DE UI (Cargando / Éxito / Error)
// ==========================================================================
const estadoCarga = ref(false);
const cargandoFiltro = ref(false);
const mensajeErrorCarga = ref('');
const codigoErrorCarga = ref(null);

const productoParaMovimiento = ref(null);
const procesandoMovimiento = ref(false);

/** Bandera que evita repetir el aviso de bajo stock en cada refresco. */
const alertasYaNotificadas = ref(false);

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

/** Traduce un error del API a un mensaje con su código HTTP visible. */
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

// ==========================================================================
// CONTROL PROGRAMÁTICO DE MODALES (Bootstrap 5)
// ==========================================================================
// Se delega en el utilitario compartido `utilidadesModales.js`, que además
// reporta en consola si la API de Bootstrap no está disponible en window.
// (Antes existía aquí una guarda silenciosa que ocultaba ese fallo y hacía
//  que los botones parecieran "no hacer nada".)
// ---------------------------------------------------------------------------

// ==========================================================================
// CARGA DE DATOS DESDE EL BACKEND (CERO DATOS SIMULADOS)
// ==========================================================================
/**
 * CARGA EL Historial CON LOS FILTROS ACTIVOS.
 *
 * PROPÓSITO TÉCNICO: cada filtro viaja al backend como query string y la
 * consulta SQL se parametriza en `movimientoModel`, evitando filtrar en
 * memoria y garantizando que la información mostrada sea la de la base.
 */
const cargarKardex = async () => {
  cargandoFiltro.value = true;
  mensajeErrorCarga.value = '';
  codigoErrorCarga.value = null;

  try {
    movimientos.value = await MovimientoServices.listarMovimientos({
      tipo: filtroTipo.value,
      cod_producto: filtroProducto.value,
      fechaDesde: filtroFechaDesde.value,
      fechaHasta: filtroFechaHasta.value,
      limite: 500
    });
  } catch (error) {
    movimientos.value = [];

    const descripcion = describirError(error);
    codigoErrorCarga.value = descripcion.codigo;
    mensajeErrorCarga.value = descripcion.mensaje;

    mostrarToast(`Error al consultar el kádex (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    cargandoFiltro.value = false;
  }
};

/**
 * CARGA LOS DATOS DE SOPORTE DE LA PÁGINA.
 * El catálogo de productos (CRUD 1) y los indicadores (CRUD 2 y 3) se piden
 * en paralelo para alimentar los filtros y las tarjetas KPI.
 */
const cargarDatosSoporte = async () => {
  estadoCarga.value = true;

  try {
    const [listaProductos, resumen, indicadores] = await Promise.all([
      ProductoServices.listarProductos(false),
      MovimientoServices.obtenerResumenMovimientos(),
      MovimientoServices.obtenerIndicadoresStock()
    ]);

    productos.value = listaProductos;
    resumenKardex.value = resumen;
    indicadoresStock.value = indicadores;

    // Alerta automática de bajo stock al cargar la tabla del kádex.
    notificarAlertasDeStock(indicadores);
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`Error al cargar indicadores (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    estadoCarga.value = false;
  }
};

/**
 * ALERTA AUTOMÁTICA DE BAJO STOCK AL CARGAR EL Historial.
 *
 * PROPÓSITO FUNCIONAL: al entrar a Entradas y Salidas el sistema avisa de los
 * artículos agotados o por debajo del mínimo, para que el almacenista registre
 * las reposiciones correspondientes sin salir de la vista.
 *
 * PROPÓSITO TÉCNICO: los conteos provienen de MySQL a través del endpoint
 * /api/inventario/stock/indicadores (funciones de agregación COUNT + CASE), no
 * de un cálculo local sobre datos quemados. La bandera
 * `alertasYaNotificadas` evita repetir el aviso en cada refresco consecutivo.
 */
const notificarAlertasDeStock = (indicadores) => {
  const totalAgotados = Number(indicadores?.total_agotados ?? 0);
  const totalBajo = Number(indicadores?.total_stock_bajo ?? 0);
  const totalAlertas = totalAgotados + totalBajo;

  // Sin alertas pendientes: se reinicia la bandera para el próximo ciclo.
  if (totalAlertas === 0) {
    alertasYaNotificadas.value = false;
    return;
  }

  if (alertasYaNotificadas.value) return;

  mostrarToast(
    'Alerta de existencias',
    `${totalAlertas} artículo(s) requieren reposición: ${totalAgotados} agotado(s) y ${totalBajo} por debajo del stock mínimo. Registre las entradas correspondientes.`,
    'warning'
  );

  alertasYaNotificadas.value = true;
};

/** Carga inicial de la página. */
const cargarPaginaCompleta = async () => {
  estadoCarga.value = true;

  await Promise.all([cargarDatosSoporte(), cargarKardex()]);

  estadoCarga.value = false;
};

onMounted(() => {
  cargarPaginaCompleta();
});

/** Limpia todos los filtros y vuelve a consultar el kádex completo. */
const limpiarFiltros = async () => {
  filtroTipo.value = '';
  filtroProducto.value = '';
  filtroFechaDesde.value = '';
  filtroFechaHasta.value = '';
  filtroTexto.value = '';

  await cargarKardex();
};

// ==========================================================================
// INDICADORES KPI DEL Historial
// ==========================================================================
const totalEntradas = computed(() => resumenKardex.value?.ENTRADA?.total_unidades ?? 0);
const totalSalidas = computed(() => resumenKardex.value?.SALIDA?.total_unidades ?? 0);
const totalAjustes = computed(() => resumenKardex.value?.AJUSTE?.total_unidades ?? 0);
const asientosEntrada = computed(() => resumenKardex.value?.ENTRADA?.total_asientos ?? 0);
const asientosSalida = computed(() => resumenKardex.value?.SALIDA?.total_asientos ?? 0);
const asientosAjuste = computed(() => resumenKardex.value?.AJUSTE?.total_asientos ?? 0);
const unidadesEnAlmacen = computed(() => indicadoresStock.value?.total_unidades ?? 0);
/** Flujo neto del período consultado: entradas menos salidas. */
const flujoNeto = computed(() => totalEntradas.value - totalSalidas.value);

// ==========================================================================
// FILTRADO LOCAL POR TEXTO (sobre el resultado ya filtrado por el backend)
// ==========================================================================
const movimientosFiltrados = computed(() => {
  const texto = filtroTexto.value.trim().toLowerCase();

  if (!texto) return movimientos.value;

  return movimientos.value.filter((movimiento) =>
    String(movimiento.cod_producto).toLowerCase().includes(texto)
    || String(movimiento.nombre_producto).toLowerCase().includes(texto)
    || String(movimiento.motivo).toLowerCase().includes(texto)
    || String(movimiento.nombre_usuario).toLowerCase().includes(texto)
  );
});

// ==========================================================================
// UTILIDADES DE PRESENTACIÓN
// ==========================================================================
/** Formatea una fecha ISO de MySQL al formato local venezolano. */
const formatearFecha = (fecha) => {
  if (!fecha) return '—';

  const objetoFecha = new Date(fecha);
  if (Number.isNaN(objetoFecha.getTime())) return '—';

  return objetoFecha.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Devuelve la configuración visual de cada tipo de movimiento.
 * ENTRADA -> verde, SALIDA -> rojo, AJUSTE -> informativo.
 */
const estiloTipoMovimiento = (tipo) => {
  const estilos = {
    ENTRADA: { clase: 'badge-ok', icono: 'bi-box-arrow-in-down', etiqueta: 'Entrada', signo: '+' },
    SALIDA: { clase: 'badge-out', icono: 'bi-box-arrow-up', etiqueta: 'Salida', signo: '−' },
    AJUSTE: { clase: 'badge-info', icono: 'bi-clipboard-check', etiqueta: 'Ajuste', signo: '±' }
  };

  return estilos[tipo] || { clase: 'badge-neutral', icono: 'bi-question-circle', etiqueta: tipo, signo: '' };
};

/**
 * Describe la variación del stock en una sola línea legible.
 * Ej.: "15 → 20" con la diferencia indicada.
 */
const describirVariacion = (movimiento) => {
  const anterior = Number(movimiento.existencia_previa);
  const posterior = Number(movimiento.existencia_posterior);

  return `${anterior} → ${posterior}`;
};

/** Color del texto de la variación según el sentido del movimiento. */
const colorVariacion = (movimiento) => {
  const anterior = Number(movimiento.existencia_previa);
  const posterior = Number(movimiento.existencia_posterior);

  if (posterior > anterior) return 'var(--color-success)';
  if (posterior < anterior) return 'var(--color-danger)';
  return 'var(--text-muted)';
};

// ==========================================================================
// REGISTRO DE MOVIMIENTOS (CRUD 3)
// ==========================================================================
const prepararMovimiento = (movimiento = null) => {
  // Si se invoca desde una fila, se preselecciona su producto en el modal.
  productoParaMovimiento.value = movimiento
    ? { codigo: movimiento.cod_producto, nombre: movimiento.nombre_producto, existencia: movimiento.existencia_actual, minimo: movimiento.stock_minimo }
    : null;

  abrirModal('movimientoModal');
};

/**
 * CONFIRMA EL REGISTRO DE UNA ENTRADA O SALIDA.
 * El backend calcula la existencia posterior de forma atómica y la devuelve;
 * ese resultado se muestra literalmente en el Toast (estado de Éxito).
 */
const confirmarMovimiento = async (datosMovimiento) => {
  procesandoMovimiento.value = true;

  try {
    const resultado = await MovimientoServices.registrarMovimiento(datosMovimiento);

    mostrarToast('Movimiento registrado en el kádex', resultado.mensaje, 'success');

    // Refresco integral: kádex, indicadores y filtro de productos.
    await Promise.all([cargarKardex(), cargarDatosSoporte()]);
    cerrarModal('movimientoModal');
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`Movimiento rechazado (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    procesandoMovimiento.value = false;
    productoParaMovimiento.value = null;
  }
};
</script>

<template>
  <main class="content" id="contenido">
    <!-- ESTADO DE ÉXITO / ERROR: pila de notificaciones flotantes -->
    <ToastNotificaciones :notificaciones="notificaciones" @cerrar="cerrarToastPorId" />

    <div class="page-head">
      <div>
        <h2>Historial de movimientos de inventario</h2>
        <p>
          Entradas, salidas y ajustes con cálculo atómico de existencia previa y posterior.
          Toda transacción exige una justificación.
        </p>
      </div>
      <button class="btn btn-primary" type="button" @click="prepararMovimiento(null)">
        <i class="bi bi-plus-lg"></i> Registrar entrada / salida
      </button>
    </div>

    <!-- ================= ESTADO DE CARGA ================= -->
    <LoadingSpinner
      v-if="estadoCarga && movimientos.length === 0"
      mensaje="Cargando el Historial desde la base de datos..."
    />

    <template v-else>
      <!-- ================= ESTADO DE ERROR PERSISTENTE ================= -->
      <div v-if="mensajeErrorCarga" class="readonly-note mb-3" role="alert">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span><strong>{{ codigoErrorCarga }}</strong> · {{ mensajeErrorCarga }}</span>
        <button class="btn btn-sm btn-outline-danger ms-auto" type="button" @click="cargarKardex">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button>
      </div>

      <!-- ================= INDICADORES KPI DEL Historial ================= -->
      <section class="row g-3 mb-3">
        <div class="col-6 col-lg-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Entradas registradas</p>
              <i class="bi bi-box-arrow-in-down kpi__icon" style="color:var(--color-success)"></i>
            </div>
            <p class="kpi__value">{{ totalEntradas }}</p>
            <p class="kpi__meta">{{ asientosEntrada }} asiento(s) en el historial</p>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Salidas registradas</p>
              <i class="bi bi-box-arrow-up kpi__icon" style="color:var(--color-danger)"></i>
            </div>
            <p class="kpi__value">{{ totalSalidas }}</p>
            <p class="kpi__meta">{{ asientosSalida }} asiento(s) en el historial</p>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Ajustes de arqueo</p>
              <i class="bi bi-clipboard-check kpi__icon" style="color:var(--color-info)"></i>
            </div>
            <p class="kpi__value">{{ totalAjustes }}</p>
            <p class="kpi__meta">{{ asientosAjuste }} corrección(es) justificada(s)</p>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi kpi--featured">
            <div class="kpi__top">
              <p class="kpi__label">Unidades en almacén</p>
              <i class="bi bi-boxes kpi__icon"></i>
            </div>
            <p class="kpi__value">{{ unidadesEnAlmacen }}</p>
            <p class="kpi__meta">
              Flujo neto del período:
              <span class="kpi__trend" :class="flujoNeto >= 0 ? 'up' : 'down'">
                {{ flujoNeto >= 0 ? '+' : '' }}{{ flujoNeto }} u.
              </span>
            </p>
            <div class="progress-thin"><span style="width:100%"></span></div>
          </div>
        </div>
      </section>

      <!-- ================= TABLA TRANSACCIONAL DEL Historial ================= -->
      <section class="card-ts">
        <div class="toolbar">
          <div class="input-icon">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input
              class="form-control"
              v-model="filtroTexto"
              type="search"
              placeholder="Buscar por producto, motivo o responsable"
              aria-label="Buscar en el Historial"
            >
          </div>

          <!-- Filtro por tipo de movimiento -->
          <select class="form-select" v-model="filtroTipo" aria-label="Filtrar por tipo de movimiento" @change="cargarKardex">
            <option value="">Todos los movimientos</option>
            <option value="ENTRADA">Solo entradas</option>
            <option value="SALIDA">Solo salidas</option>
            <option value="AJUSTE">Solo ajustes</option>
          </select>

          <!-- Filtro por producto: datos reales del CRUD 1 -->
          <select class="form-select" v-model="filtroProducto" aria-label="Filtrar por producto" @change="cargarKardex">
            <option value="">Todos los productos</option>
            <option v-for="producto in productos" :key="`filtro-${producto.codigo}`" :value="producto.codigo">
              {{ producto.codigo }} · {{ producto.nombre }}
            </option>
          </select>

          <div class="d-flex align-items-center gap-2">
            <input
              class="form-control"
              type="date"
              v-model="filtroFechaDesde"
              aria-label="Fecha desde"
              @change="cargarKardex"
            >
            <span class="text-muted-2 small">a</span>
            <input
              class="form-control"
              type="date"
              v-model="filtroFechaHasta"
              aria-label="Fecha hasta"
              @change="cargarKardex"
            >
          </div>

          <button class="btn btn-outline-secondary" type="button" :disabled="cargandoFiltro" @click="limpiarFiltros">
            <span v-if="cargandoFiltro" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            <i v-else class="bi bi-x-circle"></i> Limpiar
          </button>
        </div>

        <div class="summary-strip px-3 pt-3">
          <span class="chip"><i class="bi bi-journal-text"></i> Asientos mostrados: <strong>{{ movimientosFiltrados.length }}</strong></span>
          <span class="chip"><i class="bi bi-arrow-down-circle"></i> Entradas: <strong>{{ totalEntradas }}</strong></span>
          <span class="chip"><i class="bi bi-arrow-up-circle"></i> Salidas: <strong>{{ totalSalidas }}</strong></span>
          <span class="chip"><i class="bi bi-sliders"></i> Ajustes: <strong>{{ totalAjustes }}</strong></span>
        </div>

        <!-- Sub-estado: filtro sin resultados -->
        <div v-if="movimientosFiltrados.length === 0" class="empty-state">
          <i class="bi bi-journal-x"></i>
          <h3>No hay movimientos que coincidan</h3>
          <p class="small">
            {{ movimientos.length === 0
              ? 'Aún no se ha registrado ninguna entrada, salida o ajuste en el almacén.'
              : 'Ajuste los filtros de tipo, producto o fecha para ver otros asientos.' }}
          </p>
          <button class="btn btn-primary" type="button" @click="prepararMovimiento(null)">
            <i class="bi bi-plus-lg"></i> Registrar primer movimiento
          </button>
        </div>

        <div v-else class="p-3">
          <div class="table-wrap">
            <table class="table table-ts">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Fecha y hora</th>
                  <th scope="col">Producto</th>
                  <th scope="col">Tipo</th>
                  <th scope="col" class="text-center">Cantidad</th>
                  <th scope="col" class="text-center">Existencia previa</th>
                  <th scope="col" class="text-center">Existencia posterior</th>
                  <th scope="col">Motivo / justificación</th>
                  <th scope="col">Responsable</th>
                  <th scope="col" class="text-end">Acción</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="movimiento in movimientosFiltrados" :key="movimiento.id_movimiento">
                  <td class="tabular text-muted-2">{{ movimiento.id_movimiento }}</td>
                  <td class="tabular">{{ formatearFecha(movimiento.fecha_movimiento) }}</td>
                  <td>
                    <div class="cell-product">
                      <img :src="`/assets/img/productos/${movimiento.imagen || 'pantalla.jpg'}`" :alt="movimiento.nombre_producto">
                      <div>
                        <strong class="fw-semibold d-block">{{ movimiento.nombre_producto }}</strong>
                        <span class="code-chip">{{ movimiento.cod_producto }}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="badge-ts" :class="estiloTipoMovimiento(movimiento.tipo_movimiento).clase">
                      <i class="bi" :class="estiloTipoMovimiento(movimiento.tipo_movimiento).icono"></i>
                      {{ estiloTipoMovimiento(movimiento.tipo_movimiento).etiqueta }}
                    </span>
                  </td>
                  <td class="text-center tabular">
                    <strong>{{ estiloTipoMovimiento(movimiento.tipo_movimiento).signo }}{{ movimiento.cantidad }}</strong>
                  </td>
                  <td class="text-center tabular text-muted-2">{{ movimiento.existencia_previa }}</td>
                  <td class="text-center tabular">
                    <strong :style="{ color: colorVariacion(movimiento) }">
                      {{ describirVariacion(movimiento) }}
                    </strong>
                  </td>
                  <td style="max-width:280px;">
                    <span class="d-block text-truncate" :title="movimiento.motivo">{{ movimiento.motivo }}</span>
                  </td>
                  <td>
                    <span class="small d-block">{{ movimiento.nombre_usuario }}</span>
                    <small class="text-muted-2">ID {{ movimiento.id_usuario }}</small>
                  </td>
                  <td class="text-end">
                    <button
                      class="btn btn-ghost btn-icon"
                      type="button"
                      title="Registrar movimiento de este producto"
                      @click="prepararMovimiento(movimiento)"
                    >
                      <i class="bi bi-arrow-left-right"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <!-- ================= MODAL DE REGISTRO (CRUD 3) ================= -->
    <MovimientoModal
      :producto="productoParaMovimiento"
      :cargando="procesandoMovimiento"
      @guardar="confirmarMovimiento"
      @cerrar="cerrarModal('movimientoModal')"
    />
  </main>
</template>
