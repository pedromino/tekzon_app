<script setup>
/**
 * ==========================================================================
 * PÁGINA DE RESUMEN GENERAL (DashboardPage.vue) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Panel de inicio del sistema. Reúne en UNA sola pantalla los indicadores de
 *   TODOS los módulos, evidenciando que están integrados y que comparten la
 *   misma base de datos relacional:
 *
 *     · Inventario    -> productos, unidades y valorización del almacén.
 *     · Kárdex        -> entradas, salidas y ajustes del CRUD 3.
 *     · Servicio Téc. -> órdenes por estado, pendientes de cobro e ingresos.
 *     · Venta Directa -> facturación de hoy, del mes y ticket promedio.
 *     · Alertas       -> productos agotados o por debajo del stock mínimo.
 *
 * PROPÓSITO TÉCNICO:
 *   Cada bloque de indicadores se consulta en su propio `try/catch`. Es
 *   deliberado: si un módulo falla (por ejemplo, la caja aún no existe), el
 *   resto del panel SIGUE funcionando y sólo ese bloque muestra su aviso. Un
 *   fallo aislado no puede tumbar la pantalla de inicio.
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';

import ProductoServices from '../services/ProductoServices.js';
import MovimientoServices from '../services/MovimientoServices.js';
import OrdenServiceTecnicoServices from '../services/OrdenServiceTecnicoServices.js';
import VentaServices from '../services/VentaServices.js';
import AlertaStockServices from '../services/AlertaStockServices.js';
import CajaServices from '../services/CajaServices.js';
import { formatearMoneda, formatearFecha, presentacionOrigenMovimiento, aNumero } from '../services/formato.js';

// ==========================================================================
// ESTADO REACTIVO
// ==========================================================================
const estadoCargando = ref(true);

/** Indicadores de inventario (CRUD 1). */
const resumenInventario = ref({ productos: 0, unidades: 0, valorVenta: 0, agotados: 0, bajoMinimo: 0 });

/** Indicadores del kárdex (CRUD 3). */
const resumenKardex = ref({ ENTRADA: { total_asientos: 0, total_unidades: 0 }, SALIDA: { total_asientos: 0, total_unidades: 0 }, AJUSTE: { total_asientos: 0, total_unidades: 0 } });

/** Indicadores del taller (Módulo 2 · Servicio Técnico). */
const resumenTaller = ref({ porEstado: {}, totalOrdenes: 0, pendientesCobro: 0, ingresosServicio: 0 });

/** Indicadores del mostrador (Módulo 3 · Venta Directa). */
const resumenVentas = ref({ totalFacturas: 0, montoHoy: 0, facturasHoy: 0, montoMes: 0, ticketPromedio: 0, totalUnidades: 0 });

/** Indicadores de alertas (Módulo 4). */
const resumenAlertas = ref({ pendientes: 0, agotados: 0, totalAlertas: 0, detalleRiesgo: [] });

/** Caja activa (null cuando no hay turno abierto). */
const cajaActiva = ref(null);

/** Últimos movimientos del kádex y últimos productos vendidos. */
const ultimosMovimientos = ref([]);
const masVendidos = ref([]);

/** Mensajes de error por bloque (no bloquean el resto del panel). */
const erroresBloque = ref([]);

// ==========================================================================
// CARGA DE DATOS
// ==========================================================================

/**
 * CARGA LOS INDICADORES DE TODOS LOS MÓDULOS.
 * Cada bloque está aislado para que un fallo no impida ver los demás.
 */
const cargarResumen = async () => {
  estadoCargando.value = true;
  erroresBloque.value = [];

  // Se lanzan todas las consultas EN PARALELO para que el panel cargue rápido.
  const [
    resultadoProductos,
    resultadoKardex,
    resultadoTaller,
    resultadoVentas,
    resultadoAlertas,
    resultadoCaja
  ] = await Promise.allSettled([
    ProductoServices.listarProductos(false),
    MovimientoServices.listarMovimientos({ limite: 8 }),
    OrdenServiceTecnicoServices.obtenerIndicadores(),
    VentaServices.obtenerIndicadores(),
    AlertaStockServices.obtenerIndicadores(),
    CajaServices.obtenerCajaActiva()
  ]);

  /* ---- 1. INVENTARIO ---- */
  if (resultadoProductos.status === 'fulfilled') {
    const productos = resultadoProductos.value || [];

    resumenInventario.value = {
      productos: productos.filter((p) => p.estado === 1).length,
      unidades: productos.reduce((suma, p) => suma + aNumero(p.existencia), 0),
      valorVenta: productos.reduce((suma, p) => suma + (aNumero(p.existencia) * aNumero(p.precio)), 0),
      agotados: productos.filter((p) => p.estado === 1 && aNumero(p.existencia) === 0).length,
      bajoMinimo: productos.filter(
        (p) => p.estado === 1 && aNumero(p.existencia) > 0 && aNumero(p.existencia) <= aNumero(p.minimo)
      ).length
    };
  } else {
    erroresBloque.value.push('No se pudieron cargar los indicadores de inventario.');
  }

  /* ---- 2. KÁRDEX (CRUD 3) ---- */
  if (resultadoKardex.status === 'fulfilled') {
    ultimosMovimientos.value = resultadoKardex.value || [];
  } else {
    erroresBloque.value.push('No se pudo cargar el historial de movimientos del almacén.');
  }

  // El resumen agregado del kádex se consulta aparte (endpoint propio del CRUD 3).
  try {
    const resumen = await MovimientoServices.obtenerResumenMovimientos();
    if (resumen) resumenKardex.value = resumen;
  } catch {
    // El bloque del kádex ya avisó por el fallo anterior si lo hubo.
  }

  /* ---- 3. SERVICIO TÉCNICO ---- */
  if (resultadoTaller.status === 'fulfilled') {
    resumenTaller.value = resultadoTaller.value;
  } else {
    erroresBloque.value.push('No se pudieron cargar los indicadores del taller.');
  }

  /* ---- 4. VENTA DIRECTA ---- */
  if (resultadoVentas.status === 'fulfilled') {
    resumenVentas.value = resultadoVentas.value;
  } else {
    erroresBloque.value.push('No se pudieron cargar los indicadores de ventas.');
  }

  // Informe de productos más vendidos (Módulo 3).
  try {
    masVendidos.value = await VentaServices.listarMasVendidos(5);
  } catch {
    masVendidos.value = [];
  }

  /* ---- 5. ALERTAS DE STOCK (Módulo 4) ---- */
  if (resultadoAlertas.status === 'fulfilled') {
    resumenAlertas.value = resultadoAlertas.value;
  } else {
    erroresBloque.value.push('No se pudieron cargar las alertas de stock.');
  }

  /* ---- 6. CAJA ---- */
  if (resultadoCaja.status === 'fulfilled') {
    cajaActiva.value = resultadoCaja.value;
  } else {
    erroresBloque.value.push('No se pudo consultar el estado de la caja.');
  }

  estadoCargando.value = false;
};

onMounted(cargarResumen);

// ==========================================================================
// PROPIEDADES CALCULADAS
// ==========================================================================

/** Total de unidades que salieron del almacén (kárdex). */
const unidadesSalidas = computed(() => aNumero(resumenKardex.value?.SALIDA?.total_unidades));

/** Total de unidades que entraron al almacén (kárdex). */
const unidadesEntradas = computed(() => aNumero(resumenKardex.value?.ENTRADA?.total_unidades));

/** Órdenes listas (reparadas) que todavía no han sido cobradas. */
const ordenesPendientesCobro = computed(() => aNumero(resumenTaller.value?.pendientesCobro));

/** Valor total del almacén a precio de venta. */
const valorAlmacen = computed(() => formatearMoneda(resumenInventario.value.valorVenta));

/** Facturación total de hoy (ventas de mostrador + servicios cobrados hoy). */
const facturacionHoy = computed(() => formatearMoneda(resumenVentas.value.montoHoy));

/** Hay alertas de stock sin atender. */
const hayAlertasPendientes = computed(() => aNumero(resumenAlertas.value.pendientes) > 0);
</script>

<template>
  <main class="content">
    <!-- ================= CABECERA DE LA PÁGINA ================= -->
    <div class="page-head">
      <div>
        <h2 class="mb-1">Resumen general del sistema</h2>
        <p class="text-muted-2 mb-0">
          Estado consolidado de inventario, servicio técnico, venta directa y alertas de stock.
        </p>
      </div>
      <button class="btn btn-outline-secondary" type="button" :disabled="estadoCargando" @click="cargarResumen">
        <span v-if="estadoCargando" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
        <i v-else class="bi bi-arrow-clockwise me-2"></i> Actualizar
      </button>
    </div>

    <!-- ================= AVISOS DE BLOQUES QUE FALLARON ================= -->
    <div v-if="erroresBloque.length > 0" class="alert alert-warning py-2 px-3 mb-3">
      <strong style="font-size: .85rem;">
        <i class="bi bi-exclamation-triangle me-1"></i> Algunos indicadores no se pudieron cargar:
      </strong>
      <ul class="mb-0 mt-1" style="font-size: .8rem;">
        <li v-for="(error, indice) in erroresBloque" :key="indice">{{ error }}</li>
      </ul>
    </div>

    <!-- ================= ESTADO CARGANDO ================= -->
    <div v-if="estadoCargando" class="card-ts">
      <div class="card-ts__body text-center py-5">
        <span class="spinner-border text-primary" role="status" aria-hidden="true"></span>
        <p class="text-muted-2 mt-3 mb-0">Consultando los indicadores del sistema…</p>
      </div>
    </div>

    <template v-else>
      <!-- ==============================================================
           FILA 1 · INDICADORES PRINCIPALES
           ============================================================== -->
      <div class="row g-3 mb-3">
        <!-- Productos activos en catálogo -->
        <div class="col-6 col-lg-3">
          <div class="kpi h-100">
            <div class="kpi__top">
              <p class="kpi__label">Productos en catálogo</p>
              <i class="bi bi-box-seam kpi__icon"></i>
            </div>
            <div class="kpi__value tabular">{{ resumenInventario.productos }}</div>
            <p class="kpi__meta">
              {{ resumenInventario.unidades }} unidad(es) en existencia
            </p>
          </div>
        </div>

        <!-- Valorización del almacén -->
        <div class="col-6 col-lg-3">
          <div class="kpi h-100">
            <div class="kpi__top">
              <p class="kpi__label">Valor del almacén</p>
              <i class="bi bi-cash-stack kpi__icon"></i>
            </div>
            <div class="kpi__value tabular">{{ valorAlmacen }}</div>
            <p class="kpi__meta">Valorizado a precio de venta</p>
          </div>
        </div>

        <!-- Facturación de hoy -->
        <div class="col-6 col-lg-3">
          <div class="kpi h-100">
            <div class="kpi__top">
              <p class="kpi__label">Ventas de hoy</p>
              <i class="bi bi-cart-check kpi__icon"></i>
            </div>
            <div class="kpi__value tabular">{{ facturacionHoy }}</div>
            <p class="kpi__meta">{{ resumenVentas.facturasHoy }} factura(s) emitida(s)</p>
          </div>
        </div>

        <!-- Órdenes pendientes de cobro -->
        <div class="col-6 col-lg-3">
          <div class="kpi h-100" :class="{ 'kpi--featured': ordenesPendientesCobro > 0 }">
            <div class="kpi__top">
              <p class="kpi__label">Órdenes por cobrar</p>
              <i class="bi bi-tools kpi__icon"></i>
            </div>
            <div class="kpi__value tabular">{{ ordenesPendientesCobro }}</div>
            <p class="kpi__meta">Equipos reparados sin facturar</p>
          </div>
        </div>
      </div>

      <!-- ==============================================================
           FILA 2 · ALERTA DE STOCK MÍNIMO (Módulo 4)
           ============================================================== -->
      <div
        class="card-ts mb-3"
        :class="{ 'border-danger': hayAlertasPendientes }"
      >
        <div class="card-ts__head d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2">
            <i
              class="bi fs-5"
              :class="hayAlertasPendientes ? 'bi-exclamation-triangle-fill text-danger' : 'bi-check-circle-fill text-success'"
            ></i>
            <div>
              <h3 class="card-ts__title">
                {{ hayAlertasPendientes ? 'Alertas de stock mínimo activas' : 'Sin alertas de stock pendientes' }}
              </h3>
              <p class="card-ts__sub">
                Generadas automáticamente al descontar inventario por Venta Directa o Servicio Técnico.
              </p>
            </div>
          </div>
          <router-link to="/alertas" class="btn btn-sm btn-primary">
            <i class="bi bi-list-check me-1"></i> Ver alertas
          </router-link>
        </div>

        <div class="card-ts__body pt-2">
          <div class="summary-strip mb-3">
            <span class="badge-ts" :class="hayAlertasPendientes ? 'badge-low' : 'badge-ok'">
              {{ resumenAlertas.pendientes }} pendiente(s)
            </span>
            <span class="badge-ts badge-out">{{ resumenAlertas.agotados }} agotado(s)</span>
            <span class="badge-ts badge-neutral">{{ resumenAlertas.totalAlertas }} alerta(s) histórica(s)</span>
          </div>

          <!-- Detalle de los productos en riesgo de desabastecimiento -->
          <div v-if="resumenAlertas.detalleRiesgo.length > 0" class="table-wrap">
            <table class="table-ts table align-middle">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th class="text-end">Existencia</th>
                  <th class="text-end">Stock mínimo</th>
                  <th>Situación</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="producto in resumenAlertas.detalleRiesgo" :key="producto.codigo">
                  <td>
                    <div class="fw-semibold">{{ producto.nombre }}</div>
                    <span class="code-chip">{{ producto.codigo }}</span>
                  </td>
                  <td class="text-muted-2">{{ producto.categoria }}</td>
                  <td class="text-end tabular">{{ producto.existencia }}</td>
                  <td class="text-end tabular">{{ producto.stockMinimo }}</td>
                  <td>
                    <span class="badge-ts" :class="producto.existencia === 0 ? 'badge-out' : 'badge-low'">
                      {{ producto.existencia === 0 ? 'Agotado' : 'Bajo mínimo' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-else class="text-muted-2 mb-0" style="font-size: .85rem;">
            <i class="bi bi-check2-circle me-1 text-success"></i>
            Todas las existencias están por encima de su stock mínimo.
          </p>
        </div>
      </div>

      <!-- ==============================================================
           FILA 3 · TALLER, MOSTRADOR Y CAJA
           ============================================================== -->
      <div class="row g-3 mb-3">
        <!-- Órdenes de servicio técnico por estado -->
        <div class="col-lg-4">
          <div class="card-ts h-100">
            <div class="card-ts__head">
              <h3 class="card-ts__title">Servicio técnico</h3>
              <p class="card-ts__sub">{{ resumenTaller.totalOrdenes }} orden(es) registrada(s)</p>
            </div>
            <div class="card-ts__body pt-2">
              <div class="stock-row" v-for="(cantidad, estado) in resumenTaller.porEstado" :key="estado">
                <span class="flex-grow-1" style="font-size: .85rem;">{{ estado }}</span>
                <strong class="tabular">{{ cantidad }}</strong>
              </div>

              <div class="d-flex justify-content-between mt-3 pt-3 border-top">
                <span class="text-muted-2" style="font-size: .82rem;">Ingresos por servicio</span>
                <strong class="tabular">{{ formatearMoneda(resumenTaller.ingresosServicio) }}</strong>
              </div>

              <router-link to="/ordenes" class="btn btn-sm btn-outline-secondary w-100 mt-3">
                <i class="bi bi-tools me-1"></i> Ir al Panel del Técnico
              </router-link>
            </div>
          </div>
        </div>

        <!-- Productos más vendidos -->
        <div class="col-lg-4">
          <div class="card-ts h-100">
            <div class="card-ts__head">
              <h3 class="card-ts__title">Más vendidos</h3>
              <p class="card-ts__sub">{{ resumenVentas.totalFacturas }} factura(s) · {{ resumenVentas.totalUnidades }} u.</p>
            </div>
            <div class="card-ts__body pt-2">
              <p v-if="masVendidos.length === 0" class="text-muted-2 mb-0" style="font-size: .85rem;">
                Aún no hay ventas registradas en el mostrador.
              </p>

              <div v-for="producto in masVendidos" :key="producto.codigo" class="stock-row">
                <img
                  :src="`/assets/img/${producto.imagen}`"
                  :alt="producto.nombre"
                  width="34"
                  height="34"
                  class="rounded"
                  style="object-fit: cover;"
                  @error="($event.target.style.display = 'none')"
                />
                <div class="flex-grow-1" style="min-width: 0;">
                  <div class="text-truncate" style="font-size: .82rem;">{{ producto.nombre }}</div>
                  <small class="text-muted-2">{{ formatearMoneda(producto.montoVendido) }}</small>
                </div>
                <strong class="tabular">{{ producto.unidadesVendidas }} u.</strong>
              </div>

              <div class="d-flex justify-content-between mt-3 pt-3 border-top">
                <span class="text-muted-2" style="font-size: .82rem;">Ticket promedio</span>
                <strong class="tabular">{{ formatearMoneda(resumenVentas.ticketPromedio) }}</strong>
              </div>

              <router-link to="/ventas" class="btn btn-sm btn-outline-secondary w-100 mt-3">
                <i class="bi bi-cart-check me-1"></i> Ir a Venta Directa
              </router-link>
            </div>
          </div>
        </div>

        <!-- Estado de la caja y del almacén -->
        <div class="col-lg-4">
          <div class="card-ts h-100">
            <div class="card-ts__head">
              <h3 class="card-ts__title">Caja y almacén</h3>
              <p class="card-ts__sub">Movimientos y turno de caja</p>
            </div>
            <div class="card-ts__body pt-2">
              <!-- ---- Caja activa ---- -->
              <div v-if="cajaActiva" class="mb-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="text-muted-2" style="font-size: .82rem;">Caja abierta</span>
                  <span class="badge-ts badge-ok">Turno #{{ cajaActiva.id }}</span>
                </div>
                <div class="d-flex justify-content-between">
                  <span class="text-muted-2" style="font-size: .82rem;">Recaudado</span>
                  <strong class="tabular">{{ formatearMoneda(cajaActiva.totalRecaudado) }}</strong>
                </div>
                <div class="d-flex justify-content-between">
                  <span class="text-muted-2" style="font-size: .82rem;">Apertura</span>
                  <span class="tabular" style="font-size: .82rem;">{{ formatearFecha(cajaActiva.fechaApertura) }}</span>
                </div>
              </div>

              <div v-else class="alert alert-warning py-2 px-3 mb-3" style="font-size: .8rem;">
                <i class="bi bi-exclamation-triangle me-1"></i>
                No hay ningún turno de caja abierto. No se podrán registrar cobros.
              </div>

              <!-- ---- Resumen del kádex ---- -->
              <div class="stock-row">
                <i class="bi bi-box-arrow-in-down text-success"></i>
                <span class="flex-grow-1" style="font-size: .85rem;">Entradas al almacén</span>
                <strong class="tabular">{{ unidadesEntradas }} u.</strong>
              </div>
              <div class="stock-row">
                <i class="bi bi-box-arrow-up text-danger"></i>
                <span class="flex-grow-1" style="font-size: .85rem;">Salidas del almacén</span>
                <strong class="tabular">{{ unidadesSalidas }} u.</strong>
              </div>

              <router-link to="/caja" class="btn btn-sm btn-outline-secondary w-100 mt-3">
                <i class="bi bi-cash-stack me-1"></i> Ir a Caja
              </router-link>
            </div>
          </div>
        </div>
      </div>

      <!-- ==============================================================
           FILA 4 · ÚLTIMOS MOVIMIENTOS DEL KÁRDEX (integración entre módulos)
           ============================================================== -->
      <div class="card-ts">
        <div class="card-ts__head d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div>
            <h3 class="card-ts__title">Últimos movimientos de inventario</h3>
            <p class="card-ts__sub">
              Cada asiento indica qué proceso lo originó: Almacén, Venta o Servicio Técnico.
            </p>
          </div>
          <router-link to="/movimientos" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-arrow-left-right me-1"></i> Ver kárdex completo
          </router-link>
        </div>

        <div class="card-ts__body pt-2">
          <p v-if="ultimosMovimientos.length === 0" class="text-muted-2 mb-0" style="font-size: .85rem;">
            Todavía no hay movimientos registrados en el almacén.
          </p>

          <div v-else class="table-wrap">
            <table class="table-ts table align-middle">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Tipo</th>
                  <th>Origen</th>
                  <th class="text-end">Cantidad</th>
                  <th class="text-end">Existencia</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="movimiento in ultimosMovimientos" :key="movimiento.id_movimiento || movimiento.id">
                  <td class="text-muted-2" style="font-size: .8rem;">
                    {{ formatearFecha(movimiento.fecha_movimiento || movimiento.fecha, true) }}
                  </td>
                  <td>
                    <div class="fw-semibold">{{ movimiento.nombre_producto || movimiento.producto }}</div>
                    <span class="code-chip">{{ movimiento.cod_producto || movimiento.codigo }}</span>
                  </td>
                  <td>
                    <span
                      class="badge-ts"
                      :class="{
                        'badge-ok': (movimiento.tipo_movimiento || movimiento.tipo) === 'ENTRADA',
                        'badge-out': (movimiento.tipo_movimiento || movimiento.tipo) === 'SALIDA',
                        'badge-info': (movimiento.tipo_movimiento || movimiento.tipo) === 'AJUSTE'
                      }"
                    >
                      {{ movimiento.tipo_movimiento || movimiento.tipo }}
                    </span>
                  </td>
                  <td>
                    <span
                      class="badge-ts"
                      :class="presentacionOrigenMovimiento(movimiento.origen).clase"
                    >
                      <i class="bi me-1" :class="presentacionOrigenMovimiento(movimiento.origen).icono"></i>
                      {{ presentacionOrigenMovimiento(movimiento.origen).etiqueta }}
                    </span>
                  </td>
                  <td class="text-end tabular">{{ movimiento.cantidad }}</td>
                  <td class="text-end tabular" style="font-size: .8rem;">
                    {{ movimiento.existencia_previa }} → <strong>{{ movimiento.existencia_posterior }}</strong>
                  </td>
                  <td class="text-muted-2" style="font-size: .78rem; max-width: 260px;">
                    {{ movimiento.motivo }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </main>
</template>
