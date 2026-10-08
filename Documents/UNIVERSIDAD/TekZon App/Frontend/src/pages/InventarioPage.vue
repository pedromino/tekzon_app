<script setup>
/**
 * ==========================================================================
 * PÁGINA DE INVENTARIO (InventarioPage.vue) - TEKZON C.A.
 * ==========================================================================
 * Módulo de Inventario · Integra el CRUD 1 (catálogo maestro) con el CRUD 2
 * (auditoría y ajuste de existencias del almacenista).
 *
 * PROPÓSITO FUNCIONAL:
 *   - Tabla del Catálogo Maestro con búsqueda, filtro por categoría (datos
 *     reales del CRUD 4), filtro por situación de stock y acciones por fila.
 *   - Indicadores KPI calculados por MySQL: artículos, unidades, valorización,
 *     agotados y productos bajo el stock mínimo.
 *   - Panel de ALERTAS de reposición (existencia <= stock_minimo).
 *   - Botón de AJUSTE DE STOCK por fila que abre `AjusteStockModal`.
 *
 * PROPÓSITO TÉCNICO:
 *   - PUREZA DE DATOS: no existe ningún array estático. Productos, categorías,
 *     indicadores y alertas provienen exclusivamente de la base `tekzon_bd` a
 *     través de `ProductoServices` y `MovimientoServices`.
 *   - Implementa de forma estricta los 3 estados de UI:
 *       CARGANDO -> componente `LoadingSpinner`.
 *       ÉXITO    -> `ToastNotificaciones` con el mensaje devuelto por el API.
 *       ERROR    -> Toast rojo con el código HTTP (400/404/500) y panel de
 *                   error persistente con botón "Reintentar".
 *   - Todos los botones de envío usan `:disabled` durante las peticiones para
 *     impedir operaciones duplicadas.
 *   - La apertura/cierre de modales es PROGRAMÁTICA (API de Bootstrap 5),
 *     garantizando que el backdrop y el scroll se restauren correctamente.
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import ProductoModal from '../components/ProductoModal.vue';
import EliminarProductoModal from '../components/EliminarProductoModal.vue';
import AjusteStockModal from '../components/AjusteStockModal.vue';
import MovimientoModal from '../components/MovimientoModal.vue';
import ModalConfirmacion from '../components/ModalConfirmacion.vue';
import ProductoServices from '../services/ProductoServices.js';
import CategoriaServices from '../services/CategoriaServices.js';
import MovimientoServices from '../services/MovimientoServices.js';
// Utilitario compartido de apertura/cierre de modales de Bootstrap 5.
import { abrirModal, cerrarModal } from '../utils/utilidadesModales.js';

// ==========================================================================
// ESTADO REACTIVO PRINCIPAL
// ==========================================================================
const productos = ref([]);            // Catálogo maestro (CRUD 1)
const categorias = ref([]);           // Clasificaciones activas (CRUD 4)
const indicadores = ref(null);        // KPI calculados por MySQL (CRUD 2)
const alertasStock = ref([]);         // Productos bajo el stock mínimo

const vistaActual = ref('cards');     // 'cards' | 'table'
const textoBusqueda = ref('');
const filtroCategoria = ref('');
const filtroSituacion = ref('');

// ==========================================================================
// ESTADOS DE UI (Cargando / Éxito / Error)
// ==========================================================================
const estadoCarga = ref(false);              // Estado de Carga de la página
const mensajeErrorCarga = ref('');           // Estado de Error persistente
const codigoErrorCarga = ref(null);          // Código HTTP del error de carga

// Registros seleccionados para las operaciones por fila
const productoActual = ref(null);
const productoAEliminar = ref(null);
const productoAAjustar = ref(null);
const productoParaMovimiento = ref(null);

// Banderas de modo y de proceso (deshabilitan los botones de envío)
const esEdicion = ref(false);
const procesandoGuardado = ref(false);
const procesandoEliminacion = ref(false);
const procesandoAjuste = ref(false);
const procesandoMovimiento = ref(false);

// Pila de notificaciones Toast (estado de Éxito / Error)
const notificaciones = ref([]);

// ---------------------------------------------------------------------------
// CONTROL DEL MODAL DE CONFIRMACIÓN PREVIA A LA EDICIÓN
// ---------------------------------------------------------------------------
/**
 * PROPÓSITO FUNCIONAL: editar la ficha técnica modifica la tabla `producto`
 * (nombre, precios, categoría y stock mínimo), por lo que se exige una
 * confirmación explícita antes de abrir el formulario de edición.
 *
 * PROPÓSITO TÉCNICO: `productoAConfirmarEdicion` guarda el registro sobre el
 * que se actuará y `mostrarConfirmacionEdicion` controla el modal reutilizable.
 */
const productoAConfirmarEdicion = ref(null);
const mostrarConfirmacionEdicion = ref(false);

/** Mensaje de error del backend mostrado DENTRO del formulario de producto. */
const errorBackendProducto = ref('');

/** Contador de alertas de bajo stock ya notificadas (evita repetir el mismo aviso). */
const alertasYaNotificadas = ref(false);

// ==========================================================================
// SISTEMA DE NOTIFICACIONES TOAST
// ==========================================================================
/**
 * PUBLICAR NOTIFICACIÓN.
 * @param {string} titulo  Encabezado del Toast.
 * @param {string} mensaje Cuerpo del mensaje (incluye el código HTTP si aplica).
 * @param {string} tipo    'success' | 'error' | 'warning' | 'info'
 */
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

/**
 * TRADUCE UN ERROR DEL API A UN MENSAJE VISUAL CON SU CÓDIGO HTTP.
 * Cumple el requisito de notificación clara para 400 / 404 / 500.
 */
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
// (Antes existía aquí una guarda silenciosa que ocultaba ese fallo.)
// ---------------------------------------------------------------------------

// ==========================================================================
// CARGA DE DATOS DESDE EL BACKEND (CERO DATOS SIMULADOS)
// ==========================================================================
/**
 * CARGA CONCURRENTE DEL MÓDULO.
 *
 * PROPÓSITO TÉCNICO: `Promise.all` lanza en paralelo las cuatro consultas
 * (productos, categorías activas, indicadores y alertas). Si CUALQUIERA falla,
 * se activa el estado de Error de la página con el código HTTP recibido.
 */
const cargarModuloInventario = async () => {
  estadoCarga.value = true;
  mensajeErrorCarga.value = '';
  codigoErrorCarga.value = null;

  try {
    const [listaProductos, listaCategorias, kpi, listaAlertas] = await Promise.all([
      ProductoServices.listarProductos(false),
      CategoriaServices.listarCategoriasActivas(),
      MovimientoServices.obtenerIndicadoresStock(),
      MovimientoServices.listarAlertasStockMinimo()
    ]);

    productos.value = listaProductos;
    categorias.value = listaCategorias;
    indicadores.value = kpi;
    alertasStock.value = listaAlertas;

    // Notificación automática de stock bajo tras refrescar la tabla.
    notificarAlertasDeStock(listaAlertas, kpi);
  } catch (error) {
    const descripcion = describirError(error);

    codigoErrorCarga.value = descripcion.codigo;
    mensajeErrorCarga.value = descripcion.mensaje;

    mostrarToast(
      `Error al cargar el inventario (${descripcion.codigo})`,
      descripcion.mensaje,
      'error'
    );
  } finally {
    estadoCarga.value = false;
  }
};

/**
 * ALERTA AUTOMÁTICA DE BAJO STOCK AL CARGAR LA TABLA.
 *
 * PROPÓSITO FUNCIONAL: al entrar al catálogo el sistema avisa de forma
 * proactiva cuántos artículos están agotados o por debajo del umbral, para que
 * el almacenista actúe sin tener que revisar fila por fila.
 *
 * PROPÓSITO TÉCNICO: el conteo proviene de MySQL (endpoint
 * /api/inventario/stock/indicadores y /alertas), no de un cálculo local sobre
 * datos quemados. La bandera `alertasYaNotificadas` evita repetir el mismo
 * aviso en cada refresco consecutivo y saturar la pila de Toasts.
 *
 * @param {Array}  listaAlertas Productos en o por debajo del stock mínimo.
 * @param {Object} kpi          Indicadores agregados devueltos por MySQL.
 */
const notificarAlertasDeStock = (listaAlertas, kpi) => {
  const totalAgotados = Number(kpi?.total_agotados ?? 0);
  const totalBajo = Number(kpi?.total_stock_bajo ?? 0);
  const totalAlertas = totalAgotados + totalBajo;

  // Sin alertas pendientes: se reinicia la bandera para el próximo ciclo.
  if (totalAlertas === 0) {
    alertasYaNotificadas.value = false;
    return;
  }

  // Ya se avisó en esta carga: no se repite el Toast.
  if (alertasYaNotificadas.value) return;

  const detalleProductos = listaAlertas
    .slice(0, 3)
    .map((producto) => producto.nombre_producto || producto.cod_producto)
    .join(', ');

  const sufijo = listaAlertas.length > 3 ? ` y ${listaAlertas.length - 3} más` : '';

  mostrarToast(
    'Alerta de existencias',
    `${totalAlertas} artículo(s) requieren reposición (${totalAgotados} agotado(s), ${totalBajo} bajo mínimo): ${detalleProductos}${sufijo}.`,
    'warning'
  );

  alertasYaNotificadas.value = true;
};

onMounted(() => {
  cargarModuloInventario();
});

// ==========================================================================
// INDICADORES KPI (valores calculados por MySQL, no en el cliente)
// ==========================================================================
const kpiArticulos = computed(() => indicadores.value?.total_articulos ?? 0);
const kpiUnidades = computed(() => indicadores.value?.total_unidades ?? 0);
const kpiValorCosto = computed(() => Number(indicadores.value?.valor_total_costo ?? 0));
const kpiValorVenta = computed(() => Number(indicadores.value?.valor_total_venta ?? 0));
const kpiAgotados = computed(() => indicadores.value?.total_agotados ?? 0);
const kpiStockBajo = computed(() => indicadores.value?.total_stock_bajo ?? 0);

/** Margen potencial del inventario (venta - costo). */
const kpiMargenPotencial = computed(() => kpiValorVenta.value - kpiValorCosto.value);

/** Porcentaje de artículos que requieren reposición inmediata. */
const porcentajeCritico = computed(() => {
  if (!kpiArticulos.value) return 0;
  return Math.round(((kpiAgotados.value + kpiStockBajo.value) / kpiArticulos.value) * 100);
});

// ==========================================================================
// UTILIDADES DE PRESENTACIÓN
// ==========================================================================
/** Formatea un monto en dólares con separador de miles venezolano. */
const formatearMoneda = (valor) =>
  Number(valor).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Clasifica la situación de stock de un producto (alineada con el backend). */
const obtenerEstadoStock = (producto) => {
  const existencia = Number(producto.existencia || 0);
  const minimo = Number(producto.minimo || producto.stock_minimo || 0);

  if (existencia <= 0) return { clave: 'agotado', etiqueta: 'Agotado', clase: 'badge-out' };
  if (existencia <= minimo) return { clave: 'bajo', etiqueta: 'Stock bajo', clase: 'badge-low' };
  return { clave: 'disponible', etiqueta: 'Disponible', clase: 'badge-ok' };
};

/** Ancho de la barra del medidor de stock, relativo al doble del mínimo. */
const calcularAnchoMedidor = (producto) => {
  const existencia = Number(producto.existencia || 0);
  const minimo = Number(producto.minimo || producto.stock_minimo || 0);
  const referencia = Math.max(minimo * 2, 1);
  return `${Math.min(100, (existencia / referencia) * 100)}%`;
};

/** Color de la barra del medidor según la criticidad. */
const calcularColorMedidor = (producto) => {
  const estado = obtenerEstadoStock(producto).clave;
  if (estado === 'agotado') return 'var(--color-danger)';
  if (estado === 'bajo') return 'var(--color-warning)';
  return 'var(--brand-primary)';
};

// ==========================================================================
// FILTRADO DEL CATÁLOGO (sobre los datos reales ya cargados)
// ==========================================================================
const productosFiltrados = computed(() => {
  const texto = textoBusqueda.value.trim().toLowerCase();

  return productos.value.filter((producto) => {
    const coincideTexto = !texto
      || String(producto.nombre).toLowerCase().includes(texto)
      || String(producto.codigo).toLowerCase().includes(texto)
      || String(producto.marca).toLowerCase().includes(texto);

    const coincideCategoria = !filtroCategoria.value
      || Number(producto.id_categoria) === Number(filtroCategoria.value);

    const coincideSituacion = !filtroSituacion.value
      || obtenerEstadoStock(producto).clave === filtroSituacion.value;

    return coincideTexto && coincideCategoria && coincideSituacion;
  });
});

/** Resumen del filtrado actual, mostrado en la franja informativa. */
const resumenFiltro = computed(() => ({
  mostrados: productosFiltrados.value.length,
  total: productos.value.length,
  unidades: productosFiltrados.value.reduce((suma, p) => suma + Number(p.existencia || 0), 0)
}));

// ==========================================================================
// INTERCONEXIÓN ENTRE LOS 4 CRUDs
// ==========================================================================
/**
 * Refresca el catálogo, los KPI y las alertas.
 * Se invoca después de CUALQUIER operación de alta, edición, baja, ajuste o
 * movimiento para que todos los módulos muestren información consistente.
 */
const refrescarTodo = async () => {
  await cargarModuloInventario();
};

// ---- CRUD 1: alta y edición de la ficha técnica ----
const prepararCreacion = () => {
  productoActual.value = null;
  esEdicion.value = false;
  abrirModal('productModal');
};

/**
 * SOLICITA CONFIRMACIÓN ANTES DE EDITAR LA FICHA TÉCNICA.
 *
 * PROPÓSITO FUNCIONAL: editar modifica la tabla `producto` (nombre, precios,
 * categoría y stock mínimo), por lo que se interpone un modal de confirmación
 * que muestra el producto afectado antes de abrir el formulario.
 *
 * PROPÓSITO TÉCNICO: se guarda el registro en `productoAConfirmarEdicion` y se
 * abre el modal reutilizable; la apertura real del formulario ocurre en
 * `confirmarEdicionProducto()`.
 */
const prepararEdicion = (producto) => {
  productoAConfirmarEdicion.value = { ...producto };

  // Si el registro aún no tiene categoría asignada se avisa de inmediato.
  mostrarConfirmacionEdicion.value = true;
  abrirModal('confirmarEdicionModal');
};

/** Cancela la edición sin modificar la base de datos. */
const cancelarEdicionProducto = () => {
  cerrarModal('confirmarEdicionModal');
  productoAConfirmarEdicion.value = null;
  mostrarConfirmacionEdicion.value = false;
};

/** Confirma la edición y abre el formulario con los datos reales del producto. */
const confirmarEdicionProducto = () => {
  productoActual.value = { ...productoAConfirmarEdicion.value };
  esEdicion.value = true;

  cerrarModal('confirmarEdicionModal');
  mostrarConfirmacionEdicion.value = false;

  abrirModal('productModal');
};

/**
 * GUARDA (ALTA O EDICIÓN) LA FICHA TÉCNICA DEL PRODUCTO.
 *
 * PROPÓSITO TÉCNICO: el objeto que llega desde el modal ya usa los nombres
 * EXACTOS de las columnas de MySQL (cod_producto, nombre_producto, etc.), por
 * lo que la clave primaria viaja en `datosFormulario.cod_producto`. La
 * `existencia` NO viaja: el backend la inicializa en 0 en el alta y la preserva
 * en la edición.
 */
const guardarDatosProducto = async (datosFormulario) => {
  procesandoGuardado.value = true;
  errorBackendProducto.value = '';

  try {
    if (esEdicion.value) {
      const resultado = await ProductoServices.actualizarProducto(
        datosFormulario.cod_producto,
        datosFormulario
      );
      mostrarToast('¡Producto actualizado!', resultado.mensaje, 'success');
    } else {
      const resultado = await ProductoServices.crearProducto(datosFormulario);
      mostrarToast('¡Producto registrado!', resultado.mensaje, 'success');
    }

    // Refresco integral: el producto nuevo aparece de inmediato en la tabla de
    // existencias (CRUD 2) para que el almacenista pueda asignarle stock.
    await refrescarTodo();
    errorBackendProducto.value = '';
    cerrarModal('productModal');
  } catch (error) {
    const descripcion = describirError(error);

    // El mensaje se muestra DENTRO del modal (HTTP 400/404/500) y también como
    // Toast, cumpliendo el estado de Error exigido por la cátedra.
    errorBackendProducto.value = `${descripcion.codigo} · ${descripcion.mensaje}`;
    mostrarToast(`No se pudo guardar (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    procesandoGuardado.value = false;
  }
};

// ---- CRUD 1: baja lógica ----
const prepararEliminacion = (producto) => {
  productoAEliminar.value = producto;
  abrirModal('deleteModal');
};

const confirmarEliminacionProducto = async (producto) => {
  // La clave primaria de la tabla `producto` es `cod_producto`.
  const codigoProducto = producto?.cod_producto ?? producto?.codigo;

  if (!codigoProducto) return;

  procesandoEliminacion.value = true;

  try {
    const resultado = await ProductoServices.eliminarProducto(codigoProducto);
    mostrarToast('Registro dado de baja', resultado.mensaje, 'success');

    await refrescarTodo();
    cerrarModal('deleteModal');
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`No se pudo eliminar (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    procesandoEliminacion.value = false;
    productoAEliminar.value = null;
  }
};

// ---- CRUD 2: ajuste de existencias del almacenista ----
/**
 * ABRE EL MODAL DE AJUSTE DE EXISTENCIAS.
 *
 * PROPÓSITO FUNCIONAL: el ajuste es una modificación importante del inventario.
 * El propio `AjusteStockModal` incorpora su paso de confirmación
 * (`confirmarAjusteModal`), por lo que aquí sólo se pasa el producto y se abre
 * el modal; la escritura en MySQL no ocurre hasta que el almacenista confirma.
 */
const prepararAjuste = (producto) => {
  productoAAjustar.value = { ...producto };
  abrirModal('ajusteStockModal');
};

/**
 * EJECUTA EL AJUSTE DE EXISTENCIA (PATCH).
 *
 * PROPÓSITO TÉCNICO: el backend aplica la validación estricta (el stock mínimo
 * no puede superar la existencia), actualiza la columna `existencia` de la
 * tabla `producto` y registra el asiento de tipo AJUSTE en el kádex dentro de
 * una única transacción SQL (interconexión con el CRUD 3).
 */
const confirmarAjusteStock = async (datosAjuste) => {
  procesandoAjuste.value = true;

  try {
    const resultado = await MovimientoServices.ajustarExistencia(
      datosAjuste.cod_producto,
      datosAjuste
    );

    mostrarToast('Ajuste de existencia aplicado', resultado.mensaje, 'success');

    // Refresco integral: la nueva existencia se refleja en el catálogo (CRUD 1),
    // en los KPI del almacén (CRUD 2) y en el kádex (CRUD 3).
    await refrescarTodo();
    cerrarModal('ajusteStockModal');
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`Ajuste rechazado (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    procesandoAjuste.value = false;
  }
};

// ---- CRUD 3: registro rápido de Entrada / Salida desde el catálogo ----
const prepararMovimiento = (producto) => {
  productoParaMovimiento.value = producto ? { ...producto } : null;
  abrirModal('movimientoModal');
};

const confirmarMovimiento = async (datosMovimiento) => {
  procesandoMovimiento.value = true;

  try {
    const resultado = await MovimientoServices.registrarMovimiento(datosMovimiento);
    mostrarToast('Movimiento registrado en el kádex', resultado.mensaje, 'success');

    await refrescarTodo();
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
        <h2>Inventario de repuestos y accesorios</h2>
        <p>
          Catálogo maestro de productos y existencias de almacén.
          Precios en USD con alertas automáticas de stock mínimo.
        </p>
      </div>
      <!--
        NOTA: el acceso a Entradas/Salidas se eliminó de esta vista porque esa
        navegación pertenece EXCLUSIVAMENTE al menú lateral (Sidebar). El
        registro de movimientos sigue disponible desde el botón de cada fila y
        desde el panel de alertas de reposición.
      -->
      <button class="btn btn-primary" type="button" @click="prepararCreacion">
        <i class="bi bi-plus-lg"></i> Nuevo producto
      </button>
    </div>

    <!-- ================= ESTADO DE CARGA ================= -->
    <LoadingSpinner
      v-if="estadoCarga"
      mensaje="Cargando catálogo y existencias del almacén..."
    />

    <template v-else>
      <!-- ================= ESTADO DE ERROR PERSISTENTE ================= -->
      <div v-if="mensajeErrorCarga" class="readonly-note mb-3" role="alert">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span>
          <strong>{{ codigoErrorCarga }}</strong> · {{ mensajeErrorCarga }}
        </span>
        <button class="btn btn-sm btn-outline-danger ms-auto" type="button" @click="cargarModuloInventario">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button>
      </div>

      <!-- ================= INDICADORES KPI (calculados por MySQL) ================= -->
      <section class="row g-3 mb-3">
        <div class="col-6 col-lg-3">
          <div class="kpi kpi--featured">
            <div class="kpi__top">
              <p class="kpi__label">Valor del inventario (costo)</p>
              <i class="bi bi-cash-stack kpi__icon"></i>
            </div>
            <p class="kpi__value">${{ formatearMoneda(kpiValorCosto) }}</p>
            <p class="kpi__meta">Venta potencial: ${{ formatearMoneda(kpiValorVenta) }}</p>
            <div class="progress-thin"><span style="width:100%"></span></div>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Artículos en catálogo</p>
              <i class="bi bi-box-seam kpi__icon"></i>
            </div>
            <p class="kpi__value">{{ kpiArticulos }}</p>
            <p class="kpi__meta">{{ kpiUnidades }} unidades físicas en almacén</p>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Stock bajo mínimo</p>
              <i class="bi bi-exclamation-triangle kpi__icon" style="color:var(--color-warning)"></i>
            </div>
            <p class="kpi__value">{{ kpiStockBajo }}</p>
            <p class="kpi__meta">
              <span class="kpi__trend down">{{ porcentajeCritico }}%</span> del catálogo requiere reposición
            </p>
          </div>
        </div>

        <div class="col-6 col-lg-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Productos agotados</p>
              <i class="bi bi-x-octagon kpi__icon" style="color:var(--color-danger)"></i>
            </div>
            <p class="kpi__value">{{ kpiAgotados }}</p>
            <p class="kpi__meta">Margen potencial: ${{ formatearMoneda(kpiMargenPotencial) }}</p>
          </div>
        </div>
      </section>

      <!-- ================= PANEL DE ALERTAS DE STOCK MÍNIMO ================= -->
      <section v-if="alertasStock.length > 0" class="card-ts mb-3">
        <div class="card-ts__head">
          <div>
            <h3 class="card-ts__title">
              <i class="bi bi-bell-fill text-warning"></i> Alertas de reposición
            </h3>
            <p class="card-ts__sub">
              {{ alertasStock.length }} producto(s) en o por debajo del stock mínimo configurado.
            </p>
          </div>
        </div>
        <div class="card-ts__body pt-0">
          <div class="table-wrap">
            <table class="table table-ts">
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col" class="text-center">Existencia</th>
                  <th scope="col" class="text-center">Mínimo</th>
                  <th scope="col" class="text-center">Faltante</th>
                  <th scope="col">Estado</th>
                  <th scope="col" class="text-end">Acción</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="alerta in alertasStock" :key="`alerta-${alerta.cod_producto}`">
                  <td>
                    <strong class="fw-semibold d-block">{{ alerta.nombre_producto }}</strong>
                    <span class="code-chip">{{ alerta.cod_producto }}</span>
                  </td>
                  <td class="text-center tabular">{{ alerta.existencia }}</td>
                  <td class="text-center tabular">{{ alerta.stock_minimo }}</td>
                  <td class="text-center tabular">
                    <strong class="text-danger">{{ alerta.faltante_reposicion ?? Math.max(0, alerta.stock_minimo - alerta.existencia) }}</strong>
                  </td>
                  <td>
                    <span class="badge-ts" :class="obtenerEstadoStock(alerta).clase">
                      {{ obtenerEstadoStock(alerta).etiqueta }}
                    </span>
                  </td>
                  <td class="text-end">
                    <button
                      class="btn btn-sm btn-outline-secondary"
                      type="button"
                      @click="prepararMovimiento(alerta)"
                    >
                      <i class="bi bi-box-arrow-in-down"></i> Reponer
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ================= CATÁLOGO MAESTRO (CRUD 1) ================= -->
      <section class="card-ts">
        <div class="toolbar">
          <div class="input-icon">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input
              class="form-control"
              v-model="textoBusqueda"
              type="search"
              placeholder="Buscar por nombre, código o marca"
              aria-label="Buscar producto"
            >
          </div>

          <!-- Filtro de categorías: opciones reales del CRUD 4 -->
          <select class="form-select" v-model="filtroCategoria" aria-label="Filtrar por categoría">
            <option value="">Todas las categorías</option>
            <option
              v-for="categoria in categorias"
              :key="`cat-${categoria.id_categoria}`"
              :value="categoria.id_categoria"
            >
              {{ categoria.nombre_categoria }}
            </option>
          </select>

          <select class="form-select" v-model="filtroSituacion" aria-label="Filtrar por situación de stock">
            <option value="">Todas las situaciones</option>
            <option value="disponible">Disponible</option>
            <option value="bajo">Stock bajo</option>
            <option value="agotado">Agotado</option>
          </select>

          <div class="view-switch" role="group" aria-label="Cambiar vista">
            <button type="button" :class="{ active: vistaActual === 'cards' }" @click="vistaActual = 'cards'">
              <i class="bi bi-grid-3x2-gap"></i> Cards
            </button>
            <button type="button" :class="{ active: vistaActual === 'table' }" @click="vistaActual = 'table'">
              <i class="bi bi-table"></i> Tabla
            </button>
          </div>
        </div>

        <div class="summary-strip px-3 pt-3">
          <span class="chip">
            <i class="bi bi-funnel"></i> Mostrando <strong>{{ resumenFiltro.mostrados }}</strong> de
            <strong>{{ resumenFiltro.total }}</strong> artículos
          </span>
          <span class="chip">
            <i class="bi bi-boxes"></i> Unidades filtradas: <strong>{{ resumenFiltro.unidades }}</strong>
          </span>
          <span class="chip">
            <i class="bi bi-tags"></i> Categorías activas: <strong>{{ categorias.length }}</strong>
          </span>
        </div>

        <!-- Sub-estado: catálogo vacío -->
        <div v-if="productosFiltrados.length === 0" class="empty-state">
          <i class="bi bi-inbox"></i>
          <h3>{{ productos.length === 0 ? 'El catálogo está vacío' : 'Sin resultados para el filtro aplicado' }}</h3>
          <p class="small">
            {{ productos.length === 0
              ? 'Registre el primer producto con el botón "Nuevo producto".'
              : 'Modifique los criterios de búsqueda o limpie los filtros.' }}
          </p>
          <button v-if="productos.length > 0" class="btn btn-outline-secondary" type="button"
                  @click="textoBusqueda = ''; filtroCategoria = ''; filtroSituacion = ''">
            <i class="bi bi-x-circle"></i> Limpiar filtros
          </button>
        </div>

        <!-- Vista de tarjetas -->
        <div v-else-if="vistaActual === 'cards'" class="product-grid">
          <article v-for="producto in productosFiltrados" :key="producto.codigo" class="product-card">
            <div class="product-card__media">
              <img
                :src="`/assets/img/productos/${producto.imagen || 'pantalla.jpg'}`"
                :alt="producto.nombre"
                width="480"
                height="360"
                loading="lazy"
              >
              <span class="badge-ts" :class="obtenerEstadoStock(producto).clase">
                {{ obtenerEstadoStock(producto).etiqueta }}
              </span>
              <span class="cat">{{ producto.nombre_categoria }}</span>
            </div>

            <div class="product-card__body">
              <span class="code-chip">{{ producto.codigo }}</span>
              <h3>{{ producto.nombre }}</h3>
              <span class="brand">{{ producto.marca || 'Sin marca' }}</span>

              <div class="product-card__price">
                <strong>${{ formatearMoneda(producto.precio) }}</strong>
                <span class="text-muted-2 small">
                  Bs. {{ formatearMoneda(producto.precio * 36.5) }}
                </span>
              </div>

              <div class="d-flex justify-content-between mt-2 small text-muted-2">
                <span>Existencia: <strong>{{ producto.existencia }}</strong> u.</span>
                <span>Mín. {{ producto.minimo }}</span>
              </div>
              <div class="stock-meter">
                <span :style="{ width: calcularAnchoMedidor(producto), backgroundColor: calcularColorMedidor(producto) }"></span>
              </div>
            </div>

            <div class="product-card__foot flex-wrap">
              <button class="btn btn-outline-secondary btn-sm" type="button" @click="prepararEdicion(producto)">
                <i class="bi bi-pencil-square"></i> Editar
              </button>
              <button class="btn btn-outline-secondary btn-sm" type="button" @click="prepararAjuste(producto)">
                <i class="bi bi-clipboard-check"></i> Ajustar
              </button>
              <button class="btn btn-outline-danger btn-sm" type="button" @click="prepararEliminacion(producto)" aria-label="Eliminar">
                <i class="bi bi-trash3"></i>
              </button>
            </div>
          </article>
        </div>

        <!-- Vista de tabla -->
        <div v-else class="p-3">
          <div class="table-wrap">
            <table class="table table-ts">
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Categoría</th>
                  <th scope="col" class="text-end">Costo</th>
                  <th scope="col" class="text-end">Precio venta</th>
                  <th scope="col" class="text-center">Existencia / mín.</th>
                  <th scope="col" class="text-center">Valor (costo)</th>
                  <th scope="col">Estado</th>
                  <th scope="col" class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="producto in productosFiltrados" :key="producto.codigo">
                  <td>
                    <div class="cell-product">
                      <img :src="`/assets/img/productos/${producto.imagen || 'pantalla.jpg'}`" :alt="producto.nombre">
                      <div>
                        <strong class="fw-semibold d-block">{{ producto.nombre }}</strong>
                        <span class="code-chip">{{ producto.codigo }}</span>
                        <small class="text-muted-2 d-block">{{ producto.marca || 'Sin marca' }}</small>
                      </div>
                    </div>
                  </td>
                  <td><span class="badge-ts badge-neutral">{{ producto.nombre_categoria }}</span></td>
                  <td class="text-end tabular">${{ formatearMoneda(producto.costo) }}</td>
                  <td class="text-end tabular"><strong>${{ formatearMoneda(producto.precio) }}</strong></td>
                  <td class="text-center tabular">
                    <strong>{{ producto.existencia }}</strong>
                    <span class="text-muted-2"> / {{ producto.minimo }}</span>
                  </td>
                  <td class="text-end tabular">${{ formatearMoneda(producto.valorCosto) }}</td>
                  <td>
                    <span class="badge-ts" :class="obtenerEstadoStock(producto).clase">
                      {{ obtenerEstadoStock(producto).etiqueta }}
                    </span>
                  </td>
                  <td class="text-end">
                    <button class="btn btn-ghost btn-icon" type="button" title="Ajustar existencia" @click="prepararAjuste(producto)">
                      <i class="bi bi-clipboard-check"></i>
                    </button>
                    <button class="btn btn-ghost btn-icon" type="button" title="Editar ficha" @click="prepararEdicion(producto)">
                      <i class="bi bi-pencil-square"></i>
                    </button>
                    <button class="btn btn-ghost btn-icon text-danger" type="button" title="Dar de baja" @click="prepararEliminacion(producto)">
                      <i class="bi bi-trash3"></i>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <!-- ================= MODALES DEL MÓDULO ================= -->
    <ProductoModal
      :producto="productoActual"
      :es-edicion="esEdicion"
      :cargando="procesandoGuardado"
      :error-backend="errorBackendProducto"
      @guardar="guardarDatosProducto"
      @cerrar="cerrarModal('productModal')"
    />

    <EliminarProductoModal
      :producto="productoAEliminar"
      :cargando="procesandoEliminacion"
      @confirmar-eliminacion="confirmarEliminacionProducto"
    />

    <AjusteStockModal
      :producto="productoAAjustar"
      :cargando="procesandoAjuste"
      @guardar="confirmarAjusteStock"
      @cerrar="cerrarModal('ajusteStockModal')"
    />

    <MovimientoModal
      :producto="productoParaMovimiento"
      :cargando="procesandoMovimiento"
      @guardar="confirmarMovimiento"
      @cerrar="cerrarModal('movimientoModal')"
    />

    <!--
      ==========================================================================
      MODAL DE CONFIRMACIÓN PREVIA A LA EDICIÓN DE LA FICHA TÉCNICA
      ==========================================================================
      Editar modifica la tabla `producto` (nombre, precios, categoría y stock
      mínimo). El modal muestra el registro afectado y el stock mínimo que tiene
      configurado antes de habilitar el formulario de edición, evitando cambios
      accidentales sobre el catálogo maestro.
    -->
    <ModalConfirmacion
      id-modal="confirmarEdicionModal"
      titulo="Confirmar edición de ficha técnica"
      :mensaje="`¿Confirma editar la ficha técnica de ${productoAConfirmarEdicion?.nombre_producto || productoAConfirmarEdicion?.nombre || 'este producto'}?`"
      :detalle="productoAConfirmarEdicion
        ? `Código ${productoAConfirmarEdicion.cod_producto || productoAConfirmarEdicion.codigo} · Existencia actual ${productoAConfirmarEdicion.existencia} u. · Mínimo ${productoAConfirmarEdicion.stock_minimo ?? productoAConfirmarEdicion.minimo} u. Se abrirá el formulario para modificar nombre, precios, categoría y stock mínimo. La existencia NO se modifica desde aquí: se gestiona en Almacén y en Entradas y Salidas.`
        : ''"
      texto-confirmar="Sí, editar ficha"
      variante="primary"
      icono="bi-pencil-square"
      :procesando="mostrarConfirmacionEdicion && procesandoGuardado"
      @confirmar="confirmarEdicionProducto"
      @cancelar="cancelarEdicionProducto"
    />
  </main>
</template>
