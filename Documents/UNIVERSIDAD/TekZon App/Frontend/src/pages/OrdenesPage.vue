<script setup>
/**
 * ==========================================================================
 * PANEL DEL TÉCNICO (OrdenesPage.vue) - TEKZON C.A.
 * ==========================================================================
 * Módulo 2 · Servicio Técnico (etapa de PROCESAMIENTO Y COBRO)
 *
 * PROPÓSITO FUNCIONAL:
 *   Es el banco de trabajo del taller. Sobre una misma pantalla el técnico:
 *
 *     1. Ve TODAS las órdenes de servicio con su estado, avance y total.
 *     2. Abre una orden y AVANZA SU ESTADO según la máquina de estados del
 *        negocio (Pendiente -> En Reparación -> Listo),
 *        documentando el diagnóstico y el costo de mano de obra.
 *     3. CONSUME REPUESTOS del inventario: al agregarlos, el sistema descuenta
 *        la existencia, registra la SALIDA en el kádex como "Servicio Técnico" y
 *        dispara la alerta automática de stock mínimo cuando corresponde.
 *     4. COBRA la orden: el sistema suma mano de obra + repuestos, registra el
 *        método de pago en la caja abierta, emite la factura y cierra la orden.
 *
 * PROPÓSITO TÉCNICO:
 *   · CERO DATOS SIMULADOS: todo sale de `OrdenServiceTecnicoServices`,
 *     `ProductoServices` y `CajaServices`, que consultan la base `tekzon_bd`.
 *   · LA LISTA DE ESTADOS VÁLIDOS LA IMPONE EL BACKEND: los botones de cambio de
 *     estado se generan desde `estadosPermitidos`, que el servidor calcula con
 *     el grafo de transiciones. El frontend NO inventa ni filtra esa lista; si
 *     aun así se solicitara un salto inválido, el backend responde 400 y su
 *     mensaje se muestra tal cual llega.
 *   · EL IMPORTE A COBRAR LO CALCULA EL SISTEMA: la pantalla sólo muestra el
 *     `desglose` (mano de obra + repuestos = total) que devuelve el backend y lo
 *     precarga en el formulario de cobro. Si alguien lo modifica a mano, el
 *     backend rechaza la operación con un 400 explicando la diferencia.
 *   · 3 ESTADOS DE UI: CARGANDO (`estadoCargando`, `cargandoDetalle`,
 *     `guardandoEstado`, `agregandoRepuesto`, `cobrando`), ÉXITO (toasts con la
 *     traza real de cada operación) y ERROR (toast + paneles con el código HTTP).
 *   · MODALES: se abren y cierran SIEMPRE con `abrirModal()` / `cerrarModal()`
 *     del utilitario compartido, nunca con atributos `data-bs-toggle`.
 * ==========================================================================
 */
import { ref, computed, watch, onMounted } from 'vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import ModalGenerarReporte from '../components/ModalGenerarReporte.vue';
import OrdenServiceTecnicoServices from '../services/OrdenServiceTecnicoServices.js';
import ProductoServices from '../services/ProductoServices.js';
import CajaServices from '../services/CajaServices.js';
// Logotipo del emisor que encabeza la factura impresa.
import logoTekzon from '../assets/img/logo.svg';
// Helpers compartidos: formato de dinero/fechas, presentación de estados y
// traducción de los errores del API a un mensaje con su código HTTP visible.
import {
  describirError,
  formatearMoneda,
  formatearFecha,
  aNumero,
  aDecimal,
  presentacionEstadoOrden,
  presentacionOrigenMovimiento,
  METODOS_PAGO,
  metodoRequiereTasa,
  etiquetaMetodoPago
} from '../services/formato.js';
// Utilitario compartido de apertura/cierre de modales de Bootstrap 5.
import { abrirModal, cerrarModal } from '../utils/utilidadesModales.js';

// ==========================================================================
// CATÁLOGOS DE LA INTERFAZ
// ==========================================================================
/**
 * OPCIONES DEL FILTRO DE ESTADO.
 * Los valores deben coincidir EXACTAMENTE con los estados del DDL y del backend
 * (`estadosOrdenTecnico.js`), porque el filtro se envía al servidor, que lo
 * valida y responde 400 si no lo reconoce.
 */
const OPCIONES_ESTADO = [
  { valor: '', etiqueta: 'Todas las órdenes' },
  { valor: 'Pendiente', etiqueta: 'Pendiente' },
  { valor: 'En Reparacion', etiqueta: 'En Reparación' },
  { valor: 'Listo', etiqueta: 'Listo' },
  { valor: 'Entregado', etiqueta: 'Entregado' }
];

/**
 * TASA DE CAMBIO SUGERIDA (Bs por USD) EN EL FORMULARIO DE COBRO.
 * Es sólo el valor inicial del campo: se lee de la configuración del entorno
 * (`.env` -> VITE_TASA_CAMBIO) y el cajero puede editarlo antes de confirmar.
 * Si no hay configuración se usa 1, que es el mismo valor por defecto que
 * aplica el backend cuando la tasa no se envía.
 */
const TASA_CAMBIO_POR_DEFECTO = Number(import.meta.env.VITE_TASA_CAMBIO || 1);

// ==========================================================================
// ESTADO REACTIVO PRINCIPAL
// ==========================================================================
/** Órdenes devueltas por el backend (ya filtradas en el servidor). */
const ordenes = ref([]);

/** Indicadores KPI del taller. */
const indicadores = ref(null);

/** Caja abierta del día: sin ella el backend no permite registrar cobros. */
const cajaActiva = ref(null);

/** Catálogo de productos (repuestos) para el modal de consumo de inventario. */
const listaProductos = ref([]);

/** Orden elegida en la tabla (alimenta el encabezado del modal de detalle). */
const ordenSeleccionada = ref(null);

/** Ficha completa de la orden abierta: { orden, repuestos, desglose, estadosPermitidos }. */
const fichaOrden = ref(null);

/** Comprobante/factura que se muestra en el Modal 4. */
const comprobante = ref(null);

// ==========================================================================
// FILTROS DE LA BARRA DE HERRAMIENTAS
// ==========================================================================
const filtroTexto = ref('');
const filtroEstado = ref('');
const soloPendientesDeCobro = ref(false);

// ==========================================================================
// ESTADOS DE UI (Cargando / Éxito / Error)
// ==========================================================================
/** Carga inicial de la página (spinner grande). */
const estadoCargando = ref(false);
/** Refresco de la lista en curso (spinner del botón "Actualizar"). */
const cargandoLista = ref(false);
/** Carga de la ficha de una orden dentro del modal de detalle. */
const cargandoDetalle = ref(false);
/** Envío del cambio de estado. */
const guardandoEstado = ref(false);
/** Carga del catálogo de repuestos. */
const cargandoProductos = ref(false);
/** Envío del consumo de un repuesto. */
const agregandoRepuesto = ref(false);
/** Carga de la caja activa. */
const cargandoCaja = ref(false);
/** Envío del cobro. */
const cobrando = ref(false);
/** Carga del comprobante de una orden ya facturada. */
const cargandoComprobante = ref(false);

/** Error persistente de la carga de la lista (con su código HTTP). */
const mensajeErrorCarga = ref('');
const codigoErrorCarga = ref(null);

/** Error devuelto por el backend dentro del modal de detalle. */
const mensajeErrorDetalle = ref('');

/** Error devuelto por el backend dentro del modal de repuestos. */
const mensajeErrorRepuesto = ref('');

/** Error devuelto por el backend dentro del modal de cobro. */
const mensajeErrorCobro = ref('');

/** Notificaciones flotantes (toasts). */
const notificaciones = ref([]);

// ==========================================================================
// FORMULARIOS DE LOS MODALES
// ==========================================================================
/** Cambio de estado + diagnóstico de la orden abierta. */
const estadoDestino = ref('');
const observacionesDiagnostico = ref('');
const costoManoObra = ref(0);

/** Repuesto a consumir. */
const formularioRepuesto = ref({ codigo: '', cantidad: 1, precioUnitario: 0 });
const erroresRepuesto = ref({});

/** Datos del cobro. */
const formularioCobro = ref({
  metodoPago: METODOS_PAGO[0].valor,
  monto: 0,
  tasaCambio: TASA_CAMBIO_POR_DEFECTO,
  referencia: '',
  observaciones: ''
});
const erroresCobro = ref({});

// ==========================================================================
// SISTEMA DE NOTIFICACIONES TOAST (patrón compartido del proyecto)
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

const manejarNotificacionReporte = ({ titulo, mensaje, tipo }) => {
  mostrarToast(titulo, mensaje, tipo);
};

// ==========================================================================
// CARGA DE DATOS (todo desde el API real)
// ==========================================================================
/**
 * CONSULTA LA LISTA DE ÓRDENES.
 * Los filtros viajan al backend como parámetros de consulta, de modo que la
 * tabla nunca muestra filas que no cumplan el criterio del servidor.
 *
 * @param {boolean} conSpinnerGrande true en la primera carga de la página.
 */
const cargarOrdenes = async (conSpinnerGrande = true) => {
  if (conSpinnerGrande) estadoCargando.value = true;

  cargandoLista.value = true;
  mensajeErrorCarga.value = '';
  codigoErrorCarga.value = null;

  try {
    ordenes.value = await OrdenServiceTecnicoServices.listarOrdenes({
      estado: filtroEstado.value || undefined,
      texto: filtroTexto.value.trim() || undefined,
      // El backend interpreta la cadena 'true' / '1' como filtro activo.
      soloPendientesDeCobro: soloPendientesDeCobro.value ? 'true' : 'false'
    });
  } catch (error) {
    ordenes.value = [];

    const descripcion = describirError(error);
    codigoErrorCarga.value = descripcion.codigo;
    mensajeErrorCarga.value = descripcion.mensaje;

    mostrarToast(
      `Error al consultar las órdenes (${descripcion.codigo})`,
      descripcion.mensaje,
      'error'
    );
  } finally {
    cargandoLista.value = false;
    if (conSpinnerGrande) estadoCargando.value = false;
  }
};

/** CONSULTA LOS INDICADORES KPI DEL TALLER. */
const cargarIndicadores = async () => {
  try {
    indicadores.value = await OrdenServiceTecnicoServices.obtenerIndicadores();
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(
      `Error al cargar los indicadores (${descripcion.codigo})`,
      descripcion.mensaje,
      'error'
    );
  }
};

/** CONSULTA LA CAJA ABIERTA (condición indispensable para poder cobrar). */
const cargarCajaActiva = async () => {
  cargandoCaja.value = true;

  try {
    cajaActiva.value = await CajaServices.obtenerCajaActiva();
  } catch (error) {
    cajaActiva.value = null;

    const descripcion = describirError(error);
    mostrarToast(
      `No se pudo verificar la caja (${descripcion.codigo})`,
      descripcion.mensaje,
      'error'
    );
  } finally {
    cargandoCaja.value = false;
  }
};

/**
 * CARGA EL CATÁLOGO DE REPUESTOS (CRUD 1 · Inventario).
 * Se pide a demanda: sólo cuando el técnico abre el modal de repuestos.
 */
const cargarProductos = async () => {
  cargandoProductos.value = true;

  try {
    listaProductos.value = await ProductoServices.listarProductos(false);
  } catch (error) {
    listaProductos.value = [];

    const descripcion = describirError(error);
    mostrarToast(
      `No se pudo cargar el inventario (${descripcion.codigo})`,
      descripcion.mensaje,
      'error'
    );
  } finally {
    cargandoProductos.value = false;
  }
};

/**
 * CARGA INICIAL DE LA PÁGINA.
 * Se piden en paralelo la lista, los KPI y la caja activa para que la pantalla
 * quede operativa de inmediato.
 */
const cargarPanelCompleto = async () => {
  estadoCargando.value = true;

  await Promise.all([cargarOrdenes(false), cargarIndicadores(), cargarCajaActiva()]);

  estadoCargando.value = false;
};

onMounted(() => {
  cargarPanelCompleto();
});

// ==========================================================================
// FILTROS
// ==========================================================================
/** Temporizador del retardo aplicado a la búsqueda por texto. */
let temporizadorBusqueda = null;

/**
 * PROGRAMA LA BÚSQUEDA POR TEXTO CON UN PEQUEÑO RETARDO.
 * PROPÓSITO TÉCNICO: evita lanzar una petición por cada tecla pulsada; sólo se
 * consulta el servidor cuando el usuario deja de escribir (350 ms).
 */
const programarBusquedaPorTexto = () => {
  if (temporizadorBusqueda) clearTimeout(temporizadorBusqueda);

  temporizadorBusqueda = setTimeout(() => {
    cargarOrdenes(false);
  }, 350);
};

/** Aplica los filtros de estado y de "pendientes de cobro". */
const aplicarFiltros = () => {
  cargarOrdenes(false);
};

/** Limpia todos los filtros y consulta de nuevo la lista completa. */
const limpiarFiltros = () => {
  filtroTexto.value = '';
  filtroEstado.value = '';
  soloPendientesDeCobro.value = false;

  cargarOrdenes(false);
};

/** Botón "Actualizar": refresca la lista y los indicadores del taller. */
const actualizarPanel = async () => {
  await Promise.all([cargarOrdenes(false), cargarIndicadores(), cargarCajaActiva()]);

  mostrarToast('Panel actualizado', 'La lista de órdenes y los indicadores están al día.', 'info');
};

// ==========================================================================
// INDICADORES KPI (valores calculados por el backend con COUNT/SUM en MySQL)
// ==========================================================================
const totalOrdenes = computed(() => aNumero(indicadores.value?.totalOrdenes));
const ordenesPendientes = computed(() => aNumero(indicadores.value?.porEstado?.Pendiente));
const ordenesEnReparacion = computed(() => aNumero(indicadores.value?.porEstado?.['En Reparacion']));
const ordenesListas = computed(() => aNumero(indicadores.value?.porEstado?.Listo));
const ordenesEntregadas = computed(() => aNumero(indicadores.value?.porEstado?.Entregado));
const pendientesDeCobro = computed(() => aNumero(indicadores.value?.pendientesCobro));
const ordenesCobradas = computed(() => aNumero(indicadores.value?.ordenesCobradas));
const ingresosServicio = computed(() => aDecimal(indicadores.value?.ingresosServicio));

/** Porcentaje de órdenes ya cerradas (cobradas) sobre el total registrado. */
const porcentajeCobrado = computed(() => {
  if (totalOrdenes.value === 0) return 0;

  return Math.round((ordenesCobradas.value / totalOrdenes.value) * 100);
});

// ==========================================================================
// MODAL 1 · DETALLE Y PROCESAMIENTO DE LA ORDEN
// ==========================================================================
/**
 * ABRE LA FICHA DE UNA ORDEN Y CARGA SU DETALLE DESDE EL API.
 *
 * PROPÓSITO TÉCNICO: el modal se abre de inmediato (con su indicador de carga)
 * y la ficha se pide en segundo plano; así el usuario recibe respuesta visual
 * instantánea y nunca se abre un modal "vacío" con los datos de otra orden.
 */
const abrirDetalleOrden = async (orden) => {
  ordenSeleccionada.value = orden;
  fichaOrden.value = null;
  cargandoDetalle.value = true;

  // Se reinicia el formulario de procesamiento (estado, diagnóstico y mano de obra).
  estadoDestino.value = '';
  observacionesDiagnostico.value = '';
  costoManoObra.value = 0;
  mensajeErrorDetalle.value = '';

  abrirModal('modalDetalleOrden');

  try {
    const ficha = await OrdenServiceTecnicoServices.obtenerOrden(orden.id);

    // El servicio devuelve `null` cuando el backend responde 404.
    if (!ficha) {
      mostrarToast(
        'Orden no encontrada',
        `La orden ${orden.id} ya no existe o fue eliminada del sistema.`,
        'error'
      );
      cerrarModal('modalDetalleOrden');
      return;
    }

    fichaOrden.value = ficha;
    observacionesDiagnostico.value = ficha.orden.observaciones || '';
    costoManoObra.value = ficha.orden.manoObra;
  } catch (error) {
    const descripcion = describirError(error);
    mensajeErrorDetalle.value = `${descripcion.codigo} · ${descripcion.mensaje}`;

    mostrarToast(
      `No se pudo abrir la orden (${descripcion.codigo})`,
      descripcion.mensaje,
      'error'
    );
  } finally {
    cargandoDetalle.value = false;
  }
};

/** Etiqueta e icono del estado elegido en los botones de avance. */
const opcionEstadoDestino = computed(() => {
  if (!fichaOrden.value || !estadoDestino.value) return null;

  return fichaOrden.value.estadosPermitidos.find((opcion) => opcion.valor === estadoDestino.value) || null;
});

/** True cuando la orden puede cobrarse: está "Listo" y aún no está facturada. */
const puedeCobrarOrden = computed(() =>
  Boolean(fichaOrden.value)
  && fichaOrden.value.orden.estado === 'Listo'
  && !fichaOrden.value.orden.cobrada
);

/**
 * APLICA EL CAMBIO DE ESTADO Y/O EL DIAGNÓSTICO DE LA ORDEN.
 *
 * PROPÓSITO FUNCIONAL: avanza la reparación (Pendiente -> En Reparación ->
 * Listo), guarda las observaciones del diagnóstico y fija el
 * costo de mano de obra que luego se sumará al cobro.
 *
 * PROPÓSITO TÉCNICO: los destinos posibles provienen de `estadosPermitidos`;
 * si el servidor rechazara la transición (por ejemplo porque otro usuario ya
 * movió la orden), su mensaje 400 se muestra literalmente, sin reinterpretarlo.
 */
const guardarProcesamiento = async () => {
  if (!fichaOrden.value || guardandoEstado.value) return;

  const idOrden = fichaOrden.value.orden.id;

  // Si no se eligió un nuevo estado, se conserva el actual y sólo se guardan
  // el diagnóstico y la mano de obra (el backend lo permite explícitamente).
  const estadoSolicitado = estadoDestino.value || fichaOrden.value.orden.estado;

  guardandoEstado.value = true;
  mensajeErrorDetalle.value = '';

  try {
    const fichaActualizada = await OrdenServiceTecnicoServices.actualizarEstado(idOrden, {
      estado: estadoSolicitado,
      observaciones: observacionesDiagnostico.value,
      manoObra: aDecimal(costoManoObra.value)
    });

    fichaOrden.value = fichaActualizada;
    estadoDestino.value = '';

    mostrarToast(
      'Orden de servicio actualizada',
      fichaActualizada.mensaje || `Orden ${idOrden} actualizada correctamente.`,
      'success'
    );

    // La lista y los KPI cambian con cada avance de estado.
    await Promise.all([cargarOrdenes(false), cargarIndicadores()]);
  } catch (error) {
    const descripcion = describirError(error);

    // Mensaje del backend TAL CUAL (por ejemplo el 400 de una transición prohibida).
    mensajeErrorDetalle.value = `${descripcion.codigo} · ${descripcion.mensaje}`;

    mostrarToast(
      `Cambio de estado rechazado (${descripcion.codigo})`,
      descripcion.mensaje,
      'error'
    );
  } finally {
    guardandoEstado.value = false;
  }
};

/**
 * RETIRA UN REPUESTO DE LA ORDEN Y DEVUELVE EL STOCK AL INVENTARIO.
 * Se pide confirmación porque la operación revierte un consumo ya registrado en
 * el kádex: el backend audita la devolución como una ENTRADA.
 */
const retirarRepuesto = async (repuesto) => {
  if (!fichaOrden.value || agregandoRepuesto.value) return;

  const idOrden = fichaOrden.value.orden.id;

  const confirmado = window.confirm(
    `¿Retirar "${repuesto.nombre}" (${repuesto.cantidad} u.) de la orden ${idOrden}?\n\n`
    + 'El sistema devolverá esas unidades al inventario y registrará una ENTRADA '
    + 'de auditoría en el historial de movimientos.'
  );

  if (!confirmado) return;

  agregandoRepuesto.value = true;
  mensajeErrorDetalle.value = '';

  try {
    const respuesta = await OrdenServiceTecnicoServices.quitarRepuesto(
      idOrden,
      repuesto.codigo,
      repuesto.cantidad
    );

    fichaOrden.value = {
      orden: respuesta.orden,
      repuestos: respuesta.repuestos,
      desglose: respuesta.desglose,
      estadosPermitidos: respuesta.estadosPermitidos
    };

    mostrarToast('Repuesto retirado de la orden', respuesta.mensaje, 'success');

    await Promise.all([cargarOrdenes(false), cargarIndicadores()]);
  } catch (error) {
    const descripcion = describirError(error);
    mensajeErrorDetalle.value = `${descripcion.codigo} · ${descripcion.mensaje}`;

    mostrarToast(
      `No se pudo retirar el repuesto (${descripcion.codigo})`,
      descripcion.mensaje,
      'error'
    );
  } finally {
    agregandoRepuesto.value = false;
  }
};

/** Recarga la ficha de la orden que está abierta en el modal (sin abrir modales). */
const refrescarFichaAbierta = async () => {
  if (!fichaOrden.value) return;

  try {
    const ficha = await OrdenServiceTecnicoServices.obtenerOrden(fichaOrden.value.orden.id);
    if (ficha) fichaOrden.value = ficha;
  } catch (error) {
    // Un fallo aquí no debe interrumpir la operación principal que lo invocó.
    console.error('No se pudo refrescar la ficha de la orden:', error);
  }
};

// ==========================================================================
// MODAL 2 · AGREGAR REPUESTO (CONSUMO DE INVENTARIO)
// ==========================================================================
/** Producto elegido en el selector de repuestos. */
const productoRepuestoSeleccionado = computed(() =>
  listaProductos.value.find((producto) => producto.codigo === formularioRepuesto.value.codigo) || null
);

/** Existencia disponible en el inventario para el producto elegido. */
const existenciaDisponible = computed(() => aNumero(productoRepuestoSeleccionado.value?.existencia));

/** Stock mínimo configurado (dispara la alerta automática del Módulo 4). */
const stockMinimoRepuesto = computed(() => aNumero(productoRepuestoSeleccionado.value?.minimo));

/** True cuando el producto elegido está agotado. */
const repuestoAgotado = computed(() =>
  Boolean(productoRepuestoSeleccionado.value) && existenciaDisponible.value <= 0
);

/** True cuando la cantidad solicitada supera la existencia disponible. */
const cantidadSuperaExistencia = computed(() =>
  Boolean(productoRepuestoSeleccionado.value)
  && aNumero(formularioRepuesto.value.cantidad) > existenciaDisponible.value
);

/** Existencia que quedaría tras el consumo (vista previa informativa). */
const existenciaResultante = computed(() =>
  existenciaDisponible.value - aNumero(formularioRepuesto.value.cantidad)
);

/**
 * Precarga el precio unitario con el precio de venta del catálogo (editable).
 * El backend acepta un precio distinto porque un repuesto puede facturarse con
 * un ajuste acordado con el cliente.
 */
watch(productoRepuestoSeleccionado, (producto) => {
  formularioRepuesto.value.precioUnitario = producto
    ? aDecimal(producto.precio_venta ?? producto.precio)
    : 0;
});

/**
 * ABRE EL MODAL PARA CONSUMIR UN REPUESTO DEL INVENTARIO.
 * El catálogo se pide al servidor la primera vez y se refresca en cada apertura
 * para mostrar existencias actualizadas.
 */
const prepararAgregarRepuesto = async () => {
  formularioRepuesto.value = { codigo: '', cantidad: 1, precioUnitario: 0 };
  erroresRepuesto.value = {};
  mensajeErrorRepuesto.value = '';

  abrirModal('modalAgregarRepuesto');

  await cargarProductos();
};

/**
 * CONFIRMA EL CONSUMO DEL REPUESTO.
 *
 * PROPÓSITO TÉCNICO: la operación es transaccional en el backend: descuenta
 * `producto.existencia`, inserta el asiento del kádex con origen
 * "Servicio Técnico" y evalúa la alerta de stock mínimo. La respuesta trae la
 * traza real del movimiento (existencia previa -> posterior) y, si procede, la
 * alerta que se notifica aparte con un Toast de advertencia.
 */
const confirmarAgregarRepuesto = async () => {
  if (!fichaOrden.value || agregandoRepuesto.value) return;

  const idOrden = fichaOrden.value.orden.id;
  const errores = {};

  // ---- 1. Validación local (el backend vuelve a validar y responde 400/404) ----
  if (!formularioRepuesto.value.codigo) {
    errores.codigo = 'Seleccione el repuesto que se consume del inventario.';
  }

  const cantidad = Number(formularioRepuesto.value.cantidad);

  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    errores.cantidad = 'La cantidad debe ser un número entero mayor que cero.';
  } else if (repuestoAgotado.value) {
    errores.cantidad = 'El producto está agotado: registre una Entrada de mercancía antes de consumirlo.';
  } else if (cantidadSuperaExistencia.value) {
    errores.cantidad = `Stock insuficiente: sólo hay ${existenciaDisponible.value} unidad(es) disponibles.`;
  }

  const precioUnitario = Number(formularioRepuesto.value.precioUnitario);

  if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
    errores.precioUnitario = 'El precio unitario debe ser un número mayor o igual a cero.';
  }

  erroresRepuesto.value = errores;

  if (Object.keys(errores).length > 0) return;

  agregandoRepuesto.value = true;
  mensajeErrorRepuesto.value = '';

  try {
    const respuesta = await OrdenServiceTecnicoServices.agregarRepuesto(idOrden, {
      codigo: formularioRepuesto.value.codigo,
      cantidad,
      precioUnitario
    });

    // La respuesta es la ficha completa y actualizada de la orden.
    fichaOrden.value = {
      orden: respuesta.orden,
      repuestos: respuesta.repuestos,
      desglose: respuesta.desglose,
      estadosPermitidos: respuesta.estadosPermitidos
    };

    cerrarModal('modalAgregarRepuesto');

    // ---- ESTADO DE ÉXITO: traza del movimiento de inventario ----
    const movimiento = respuesta.movimiento;

    mostrarToast(
      'Repuesto agregado a la orden',
      movimiento
        ? `${movimiento.nombre_producto}: ${movimiento.cantidad} u. · existencia `
          + `${movimiento.existencia_previa} → ${movimiento.existencia_posterior}. `
          + 'Movimiento registrado como SALIDA de origen "Servicio Técnico".'
        : respuesta.mensaje,
      'success'
    );

    // ---- ALERTA AUTOMÁTICA DE STOCK MÍNIMO (Módulo 4) ----
    if (respuesta.alerta) {
      mostrarToast(
        'Alerta automática de stock mínimo',
        respuesta.alerta.mensaje,
        'warning'
      );
    }

    // Se refrescan la lista, los KPI y el catálogo (existencias ya descontadas).
    await Promise.all([cargarOrdenes(false), cargarIndicadores(), cargarProductos()]);
  } catch (error) {
    const descripcion = describirError(error);
    mensajeErrorRepuesto.value = `${descripcion.codigo} · ${descripcion.mensaje}`;

    mostrarToast(
      `No se pudo agregar el repuesto (${descripcion.codigo})`,
      descripcion.mensaje,
      'error'
    );
  } finally {
    agregandoRepuesto.value = false;
  }
};

// ==========================================================================
// MODAL 3 · COBRO DE LA ORDEN
// ==========================================================================
/** Método de pago elegido. */
const metodoPagoSeleccionado = computed(() =>
  METODOS_PAGO.find((metodo) => metodo.valor === formularioCobro.value.metodoPago) || null
);

/** True cuando el método elegido obliga a registrar una referencia bancaria. */
const exigeReferencia = computed(() => Boolean(metodoPagoSeleccionado.value?.exigeReferencia));

/** True cuando el método de pago exige tasa BCV (solo transferencias, pago móvil, etc.). */
const exigeTasaBcv = computed(() => metodoRequiereTasa(formularioCobro.value.metodoPago));

/** Total en bolívares según la tasa indicada (cálculo informativo en pantalla). */
const totalEnBolivares = computed(() =>
  aDecimal(aNumero(formularioCobro.value.monto) * aNumero(formularioCobro.value.tasaCambio))
);

/** True cuando el monto tecleado no coincide con el total que calculó el sistema. */
const montoNoCoincide = computed(() => {
  if (!fichaOrden.value) return false;

  return Math.abs(aNumero(formularioCobro.value.monto) - aNumero(fichaOrden.value.desglose.total)) > 0.01;
});

/**
 * PREPARA EL COBRO.
 * El monto se precarga con el total calculado por el SISTEMA (nunca a mano) y
 * la tasa de cambio arranca con el valor configurado, editable por el cajero.
 */
const prepararCobro = async () => {
  if (!fichaOrden.value) return;

  erroresCobro.value = {};
  mensajeErrorCobro.value = '';

  formularioCobro.value = {
    metodoPago: METODOS_PAGO[0].valor,
    monto: fichaOrden.value.desglose.total,
    tasaCambio: TASA_CAMBIO_POR_DEFECTO,
    referencia: '',
    observaciones: ''
  };

  abrirModal('modalCobrarOrden');

  // La caja se revalida al abrir el modal: pudo cerrarse desde otra pantalla.
  await cargarCajaActiva();
};

/**
 * CONFIRMA EL COBRO DE LA ORDEN.
 *
 * PROPÓSITO TÉCNICO: el backend suma mano de obra + repuestos, valida que el
 * monto coincida con el total del sistema, registra el pago en la caja abierta,
 * emite la factura y marca la orden como "Entregado". El comprobante se muestra
 * automáticamente al terminar.
 */
const confirmarCobro = async () => {
  if (!fichaOrden.value || cobrando.value) return;

  const idOrden = fichaOrden.value.orden.id;
  const errores = {};

  // ---- 1. Validación local ----
  if (!formularioCobro.value.metodoPago) {
    errores.metodoPago = 'Seleccione el método de pago con el que cancela el cliente.';
  }

  const monto = Number(formularioCobro.value.monto);

  if (!Number.isFinite(monto) || monto <= 0) {
    errores.monto = 'El monto cobrado debe ser un valor numérico mayor que cero.';
  }

  const tasaCambio = Number(formularioCobro.value.tasaCambio);

  if (exigeTasaBcv.value && (!Number.isFinite(tasaCambio) || tasaCambio <= 0)) {
    errores.tasaCambio = 'La tasa de cambio debe ser mayor que cero.';
  }

  if (exigeReferencia.value && !String(formularioCobro.value.referencia).trim()) {
    errores.referencia = `El método "${metodoPagoSeleccionado.value.etiqueta}" exige el número de referencia o comprobante.`;
  }

  if (!cajaActiva.value) {
    errores.caja = 'No hay una caja abierta: el cobro no puede registrarse en la contabilidad del día.';
  }

  erroresCobro.value = errores;

  if (Object.keys(errores).length > 0) return;

  cobrando.value = true;
  mensajeErrorCobro.value = '';

  try {
    const respuesta = await OrdenServiceTecnicoServices.cobrarOrden(idOrden, {
      metodoPago: formularioCobro.value.metodoPago,
      monto,
      tasaCambio: exigeTasaBcv.value ? tasaCambio : 1.00,
      referencia: String(formularioCobro.value.referencia).trim(),
      idCaja: cajaActiva.value?.id,
      observaciones: String(formularioCobro.value.observaciones).trim()
    });

    cerrarModal('modalCobrarOrden');

    // ---- ESTADO DE ÉXITO: mensaje real del backend (factura, total, método) ----
    mostrarToast(
      'Orden cobrada y facturada',
      respuesta.mensaje || `Orden ${idOrden} cobrada correctamente.`,
      'success'
    );

    // ---- Se abre AUTOMÁTICAMENTE el comprobante de la factura emitida ----
    comprobante.value = {
      factura: respuesta.factura,
      orden: respuesta.orden,
      repuestos: respuesta.repuestos,
      pago: respuesta.pago
    };

    abrirModal('modalComprobante');

    // La orden pasa a "Entregado": se refresca la ficha abierta, la lista y los KPI.
    await Promise.all([cargarOrdenes(false), cargarIndicadores(), refrescarFichaAbierta()]);
  } catch (error) {
    // El backend rechaza un monto distinto al total del sistema con un 400:
    // su mensaje se muestra literalmente, con la diferencia en dólares.
    const descripcion = describirError(error);
    mensajeErrorCobro.value = `${descripcion.codigo} · ${descripcion.mensaje}`;

    mostrarToast(
      `Cobro rechazado (${descripcion.codigo})`,
      descripcion.mensaje,
      'error'
    );
  } finally {
    cobrando.value = false;
  }
};

// ==========================================================================
// MODAL 4 · COMPROBANTE / FACTURA DE SERVICIO TÉCNICO
// ==========================================================================
/**
 * ABRE EL COMPROBANTE DE UNA ORDEN YA COBRADA.
 * Se consulta la factura al backend (`obtenerFactura`) para reimprimirla.
 */
const verComprobante = async (orden) => {
  cargandoComprobante.value = true;

  try {
    const documento = await OrdenServiceTecnicoServices.obtenerFactura(orden.id);

    comprobante.value = {
      // El endpoint de comprobante no devuelve el objeto `factura` del cobro,
      // pero sí la orden facturada y su pago; el cálculo los unifica abajo.
      factura: null,
      orden: documento.orden,
      repuestos: documento.repuestos,
      pago: documento.pago
    };

    abrirModal('modalComprobante');
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(
      `No se pudo abrir el comprobante (${descripcion.codigo})`,
      descripcion.mensaje,
      'error'
    );
  } finally {
    cargandoComprobante.value = false;
  }
};

/**
 * UNIFICA LOS DATOS DEL COMPROBANTE.
 * PROPÓSITO TÉCNICO: el comprobante llega por dos caminos distintos —
 *  · recién cobrado: trae el objeto `factura` completo del cobro;
 *  · reimpresión: trae la orden facturada y el pago registrado.
 * Este cálculo arma una única estructura para la vista, sin recalcular nada que
 * el backend ya haya decidido (el total siempre viene del servidor).
 */
const facturaVisible = computed(() => {
  const datos = comprobante.value;
  if (!datos) return null;

  const factura = datos.factura || {};
  const pago = datos.pago || {};
  const orden = datos.orden || {};

  const total = aDecimal(factura.total_usd ?? orden.total);
  const tasaCambio = aNumero(factura.tasa_cambio ?? pago.tasa_cambio);
  const idCaja = factura.id_caja ?? pago.id_caja ?? null;

  return {
    numeroFactura: factura.numero_factura || orden.numeroFactura || '—',
    fecha: factura.fecha || pago.fecha_pago || orden.fechaCierre || orden.fechaIngreso,
    cliente: orden.cliente || '—',
    cedula: orden.cedula || '',
    telefono: orden.telefono || '',
    equipo: orden.equipo || '',
    serie: orden.serie || '',
    manoObra: aDecimal(factura.mano_obra ?? orden.manoObra),
    totalRepuestos: aDecimal(factura.repuestos ?? orden.totalRepuestos),
    total,
    tasaCambio,
    totalBolivares: aDecimal(factura.total_bolivares ?? (total * tasaCambio)),
    metodoPago: factura.metodo_pago || pago.metodo_pago || '',
    monto: aDecimal(factura.monto_usd ?? pago.monto_usd),
    referencia: factura.referencia || pago.referencia || '',
    idCaja,
    // Caja mostrada: la del cobro; si no viene en la factura se usa la caja abierta.
    cajaTexto: idCaja ? `Caja #${idCaja}` : (cajaActiva.value ? `Caja #${cajaActiva.value.id}` : 'Sin caja')
  };
});

/** IMPRIME EL COMPROBANTE con el diálogo del navegador. */
const imprimirComprobante = () => {
  window.print();
};
</script>

<template>
  <main class="content" id="contenido">
    <!-- ============ ESTADO DE ÉXITO / ERROR: pila de notificaciones ============ -->
    <ToastNotificaciones :notificaciones="notificaciones" @cerrar="cerrarToastPorId" />

    <!-- ================== CABECERA DE LA PÁGINA ================== -->
    <div class="page-head">
      <div>
        <h2>Panel del Técnico</h2>
        <p>
          Órdenes de servicio técnico: diagnóstico, cambio de estado, consumo de repuestos
          con descuento de inventario y cobro con emisión de factura.
        </p>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-outline-primary d-flex align-items-center gap-2" type="button" @click="abrirModal('modalReporteOrdenes')">
          <i class="bi bi-file-earmark-bar-graph"></i>
          <span>Generar Reporte</span>
        </button>
        <span class="badge-ts no-dot" :class="cajaActiva ? 'badge-ok' : 'badge-out'">
          <i class="bi" :class="cajaActiva ? 'bi-cash-stack' : 'bi-exclamation-triangle'"></i>
          {{ cajaActiva ? `Caja abierta #${cajaActiva.id}` : 'Sin caja abierta' }}
        </span>
      </div>
    </div>

    <!-- ================== ESTADO DE CARGA INICIAL ================== -->
    <LoadingSpinner
      v-if="estadoCargando && ordenes.length === 0"
      mensaje="Cargando las órdenes de servicio técnico..."
    />

    <template v-else>
      <!-- ================== ESTADO DE ERROR PERSISTENTE ================== -->
      <div v-if="mensajeErrorCarga" class="readonly-note mb-3" role="alert">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span><strong>{{ codigoErrorCarga }}</strong> · {{ mensajeErrorCarga }}</span>
        <button class="btn btn-sm btn-outline-danger ms-auto" type="button" @click="cargarPanelCompleto">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button>
      </div>

      <!-- ================== INDICADORES KPI DEL TALLER ================== -->
      <section class="row g-3 mb-3">
        <div class="col-6 col-md-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Total de órdenes</p>
              <i class="bi bi-clipboard-data kpi__icon"></i>
            </div>
            <p class="kpi__value">{{ totalOrdenes }}</p>
            <p class="kpi__meta">{{ ordenesCobradas }} ya cobrada(s) y facturada(s)</p>
            <div class="progress-thin"><span :style="{ width: porcentajeCobrado + '%' }"></span></div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Pendientes</p>
              <i class="bi bi-hourglass-split kpi__icon" style="color:var(--text-muted)"></i>
            </div>
            <p class="kpi__value">{{ ordenesPendientes }}</p>
            <p class="kpi__meta">Equipos recibidos sin diagnosticar</p>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">En reparación</p>
              <i class="bi bi-tools kpi__icon" style="color:var(--color-warning)"></i>
            </div>
            <p class="kpi__value">{{ ordenesEnReparacion }}</p>
            <p class="kpi__meta">{{ pendientesDeCobro }} pendiente(s) de cobro en total</p>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Listas para entregar</p>
              <i class="bi bi-check-circle kpi__icon" style="color:var(--color-success)"></i>
            </div>
            <p class="kpi__value">{{ ordenesListas }}</p>
            <p class="kpi__meta">Reparación terminada, pendientes de cobro</p>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Entregadas</p>
              <i class="bi bi-bag-check kpi__icon" style="color:var(--brand-primary)"></i>
            </div>
            <p class="kpi__value">{{ ordenesEntregadas }}</p>
            <p class="kpi__meta">Cobradas y devueltas al cliente</p>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Pendientes de cobro</p>
              <i class="bi bi-cash-coin kpi__icon" style="color:var(--color-danger)"></i>
            </div>
            <p class="kpi__value">{{ pendientesDeCobro }}</p>
            <p class="kpi__meta">Órdenes sin factura emitida</p>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="kpi kpi--featured">
            <div class="kpi__top">
              <p class="kpi__label">Ingresos por servicio técnico</p>
              <i class="bi bi-graph-up-arrow kpi__icon"></i>
            </div>
            <p class="kpi__value">{{ formatearMoneda(ingresosServicio) }}</p>
            <p class="kpi__meta">Suma facturada de las órdenes cobradas</p>
            <div class="progress-thin"><span style="width:100%"></span></div>
          </div>
        </div>
      </section>

      <!-- ================== LISTA DE ÓRDENES ================== -->
      <section class="card-ts">
        <!-- ---------- BARRA DE FILTROS ---------- -->
        <div class="toolbar">
          <div class="input-icon">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input
              class="form-control"
              type="search"
              v-model="filtroTexto"
              placeholder="Buscar por orden, cliente, equipo o serie"
              aria-label="Buscar órdenes de servicio técnico"
              @input="programarBusquedaPorTexto"
            >
          </div>

          <!-- Filtro por estado (los valores son los del backend) -->
          <select
            class="form-select"
            v-model="filtroEstado"
            aria-label="Filtrar por estado de la orden"
            @change="aplicarFiltros"
          >
            <option v-for="opcion in OPCIONES_ESTADO" :key="`estado-${opcion.valor}`" :value="opcion.valor">
              {{ opcion.etiqueta }}
            </option>
          </select>

          <!-- Filtro por órdenes que aún no se han cobrado -->
          <div class="form-check d-flex align-items-center gap-2 mb-0">
            <input
              id="filtro-pendientes-cobro"
              class="form-check-input"
              type="checkbox"
              v-model="soloPendientesDeCobro"
              @change="aplicarFiltros"
            >
            <label class="form-check-label" for="filtro-pendientes-cobro">
              Sólo pendientes de cobro
            </label>
          </div>

          <button class="btn btn-outline-secondary" type="button" :disabled="cargandoLista" @click="limpiarFiltros">
            <i class="bi bi-x-circle"></i> Limpiar
          </button>

          <button class="btn btn-outline-secondary" type="button" :disabled="cargandoLista" @click="actualizarPanel">
            <span v-if="cargandoLista" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            <i v-else class="bi bi-arrow-clockwise"></i> Actualizar
          </button>

          <router-link class="btn btn-primary ms-auto" to="/recepcion">
            <i class="bi bi-clipboard-plus"></i> Nueva recepción
          </router-link>
        </div>

        <!-- ---------- CONTADOR DE RESULTADOS ---------- -->
        <div class="summary-strip px-3 pt-3">
          <span class="chip">
            <i class="bi bi-list-check"></i> Resultados: <strong>{{ ordenes.length }}</strong> orden(es)
          </span>
          <span class="chip">
            <i class="bi bi-hourglass-split"></i> Pendientes: <strong>{{ ordenesPendientes }}</strong>
          </span>
          <span class="chip">
            <i class="bi bi-check-circle"></i> Listas: <strong>{{ ordenesListas }}</strong>
          </span>
          <span class="chip">
            <i class="bi bi-cash-coin"></i> Por cobrar: <strong>{{ pendientesDeCobro }}</strong>
          </span>
        </div>

        <!-- ---------- SUB-ESTADO: SIN RESULTADOS ---------- -->
        <div v-if="ordenes.length === 0" class="empty-state">
          <i class="bi bi-tools"></i>
          <h3>No hay órdenes de servicio técnico registradas</h3>
          <p class="small">
            {{ filtroEstado || filtroTexto || soloPendientesDeCobro
              ? 'Ajuste o limpie los filtros para ver otras órdenes del taller.'
              : 'Registre la primera recepción de un equipo para abrir una orden de servicio técnico.' }}
          </p>
          <router-link class="btn btn-primary" to="/recepcion">
            <i class="bi bi-clipboard-plus"></i> Registrar recepción
          </router-link>
        </div>

        <!-- ---------- TABLA DE ÓRDENES ---------- -->
        <div v-else class="p-3">
          <div class="table-wrap">
            <table class="table table-ts">
              <thead>
                <tr>
                  <th scope="col">N° de orden</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Equipo</th>
                  <th scope="col">Falla reportada</th>
                  <th scope="col">Estado</th>
                  <th scope="col" style="min-width:130px;">Avance</th>
                  <th scope="col" class="text-end">Total</th>
                  <th scope="col">Cobrada</th>
                  <th scope="col">Fecha de ingreso</th>
                  <th scope="col" class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="orden in ordenes" :key="orden.id">
                  <td><span class="code-chip">{{ orden.id }}</span></td>

                  <td>
                    <strong class="fw-semibold d-block">{{ orden.cliente }}</strong>
                    <small class="text-muted-2">C.I. {{ orden.cedula }}</small>
                  </td>

                  <td>
                    <span class="d-block">{{ orden.equipo || '—' }}</span>
                    <small v-if="orden.serie" class="text-muted-2 d-block">Serie {{ orden.serie }}</small>
                    <small class="text-muted-2 d-block"><i class="bi bi-person-gear"></i> {{ orden.tecnico }}</small>
                  </td>

                  <td style="max-width:240px;">
                    <span class="d-block text-truncate" :title="orden.falla">{{ orden.falla || '—' }}</span>
                  </td>

                  <!-- Estado: color y etiqueta desde el helper compartido -->
                  <td>
                    <span class="badge-ts" :class="presentacionEstadoOrden(orden.estado).clase">
                      <i class="bi" :class="presentacionEstadoOrden(orden.estado).icono"></i>
                      {{ presentacionEstadoOrden(orden.estado).etiqueta }}
                    </span>
                  </td>

                  <!-- Avance del proceso (porcentaje calculado por el backend) -->
                  <td>
                    <div class="d-flex align-items-center gap-2">
                      <span class="tabular small">{{ orden.avance }}%</span>
                      <div class="progress-thin flex-grow-1" style="margin-top:0;">
                        <span :style="{ width: orden.avance + '%' }"></span>
                      </div>
                    </div>
                  </td>

                  <td class="text-end tabular"><strong>{{ formatearMoneda(orden.total) }}</strong></td>

                  <td>
                    <span class="badge-ts no-dot" :class="orden.cobrada ? 'badge-ok' : 'badge-neutral'">
                      <i class="bi" :class="orden.cobrada ? 'bi-receipt' : 'bi-hourglass'"></i>
                      {{ orden.cobrada ? 'Sí' : 'No' }}
                    </span>
                    <small v-if="orden.numeroFactura" class="d-block text-muted-2 mt-1">
                      {{ orden.numeroFactura }}
                    </small>
                  </td>

                  <td class="tabular">{{ formatearFecha(orden.fechaIngreso) }}</td>

                  <td class="text-end">
                    <button
                      class="btn btn-sm btn-outline-secondary"
                      type="button"
                      title="Ver la ficha y procesar la orden"
                      @click="abrirDetalleOrden(orden)"
                    >
                      <i class="bi bi-eye"></i> Ver / Procesar
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <!-- ======================================================================
         MODAL 1 · DETALLE Y PROCESAMIENTO DE LA ORDEN
         ====================================================================== -->
    <div class="modal fade" id="modalDetalleOrden" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-tools"></i>
              Orden de servicio técnico
              <span v-if="ordenSeleccionada" class="code-chip ms-2">{{ ordenSeleccionada.id }}</span>
            </h5>
            <button type="button" class="btn-close" aria-label="Cerrar" @click="cerrarModal('modalDetalleOrden')"></button>
          </div>

          <div class="modal-body">
            <!-- ---------- ESTADO DE CARGA DE LA FICHA ---------- -->
            <div v-if="cargandoDetalle" class="empty-state py-4">
              <div class="spinner-border text-primary mb-3" role="status" aria-hidden="true"></div>
              <h3>Consultando la orden en la base de datos...</h3>
              <p class="small">Cliente, equipo, repuestos y desglose económico.</p>
            </div>

            <template v-else-if="fichaOrden">
              <!-- ---------- ESTADO DE ERROR DEVUELTO POR EL BACKEND ---------- -->
              <div v-if="mensajeErrorDetalle" class="readonly-note" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <span>{{ mensajeErrorDetalle }}</span>
              </div>

              <!-- ---------- DATOS DEL CLIENTE Y DEL EQUIPO ---------- -->
              <div class="row g-3">
                <div class="col-lg-6">
                  <div class="card-ts h-100">
                    <div class="card-ts__head">
                      <h3 class="card-ts__title"><i class="bi bi-person-vcard"></i> Cliente</h3>
                      <span class="badge-ts no-dot" :class="presentacionEstadoOrden(fichaOrden.orden.estado).clase">
                        <i class="bi" :class="presentacionEstadoOrden(fichaOrden.orden.estado).icono"></i>
                        {{ presentacionEstadoOrden(fichaOrden.orden.estado).etiqueta }}
                      </span>
                    </div>
                    <div class="card-ts__body">
                      <dl class="row mb-0 small">
                        <dt class="col-5 text-muted-2">Nombre</dt>
                        <dd class="col-7">{{ fichaOrden.orden.cliente }}</dd>

                        <dt class="col-5 text-muted-2">Cédula</dt>
                        <dd class="col-7">{{ fichaOrden.orden.cedula }}</dd>

                        <dt class="col-5 text-muted-2">Teléfono</dt>
                        <dd class="col-7">{{ fichaOrden.orden.telefono || '—' }}</dd>

                        <dt class="col-5 text-muted-2">Dirección</dt>
                        <dd class="col-7">{{ fichaOrden.orden.direccion || '—' }}</dd>

                        <dt class="col-5 text-muted-2">Técnico responsable</dt>
                        <dd class="col-7">{{ fichaOrden.orden.tecnico }}</dd>
                      </dl>
                    </div>
                  </div>
                </div>

                <div class="col-lg-6">
                  <div class="card-ts h-100">
                    <div class="card-ts__head">
                      <h3 class="card-ts__title"><i class="bi bi-laptop"></i> Equipo recibido</h3>
                    </div>
                    <div class="card-ts__body">
                      <dl class="row mb-0 small">
                        <dt class="col-5 text-muted-2">Tipo</dt>
                        <dd class="col-7">{{ fichaOrden.orden.tipoEquipo || '—' }}</dd>

                        <dt class="col-5 text-muted-2">Marca y modelo</dt>
                        <dd class="col-7">{{ fichaOrden.orden.marca }} {{ fichaOrden.orden.modelo }}</dd>

                        <dt class="col-5 text-muted-2">N° de serie</dt>
                        <dd class="col-7">
                          <span v-if="fichaOrden.orden.serie" class="code-chip">{{ fichaOrden.orden.serie }}</span>
                          <span v-else>—</span>
                        </dd>

                        <dt class="col-5 text-muted-2">Accesorios entregados</dt>
                        <dd class="col-7">{{ fichaOrden.orden.accesorios || 'Ninguno' }}</dd>

                        <dt class="col-5 text-muted-2">Patrón / clave</dt>
                        <dd class="col-7">{{ fichaOrden.orden.patron || 'No indicado' }}</dd>
                      </dl>
                    </div>
                  </div>
                </div>

                <!-- ---------- MOTIVO DEL INGRESO Y FECHAS ---------- -->
                <div class="col-12">
                  <div class="card-ts">
                    <div class="card-ts__head">
                      <h3 class="card-ts__title"><i class="bi bi-clipboard-pulse"></i> Motivo del ingreso y trazabilidad</h3>
                    </div>
                    <div class="card-ts__body">
                      <p class="mb-2"><strong>Falla reportada:</strong> {{ fichaOrden.orden.falla || '—' }}</p>
                      <p class="mb-3">
                        <strong>Observaciones del técnico:</strong>
                        {{ fichaOrden.orden.observaciones || 'Todavía no se ha registrado el diagnóstico.' }}
                      </p>

                      <div class="summary-strip">
                        <span class="chip">
                          <i class="bi bi-box-arrow-in-right"></i> Ingreso:
                          <strong>{{ formatearFecha(fichaOrden.orden.fechaIngreso, true) }}</strong>
                        </span>
                        <span class="chip">
                          <i class="bi bi-calendar-check"></i> Disponible desde:
                          <strong>{{ formatearFecha(fichaOrden.orden.fechaEntrega) }}</strong>
                        </span>
                        <span class="chip">
                          <i class="bi bi-door-closed"></i> Cierre:
                          <strong>{{ formatearFecha(fichaOrden.orden.fechaCierre, true) }}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ---------- CAMBIO DE ESTADO (opciones dadas por el backend) ---------- -->
              <div class="card-ts mt-3">
                <div class="card-ts__head">
                  <div>
                    <h3 class="card-ts__title"><i class="bi bi-arrow-repeat"></i> Procesar la orden</h3>
                    <p class="card-ts__sub">
                      Los estados disponibles los calcula el servidor según la máquina de estados
                      (Pendiente → En Reparación → Listo).
                    </p>
                  </div>
                </div>

                <div class="card-ts__body">
                  <!-- Sin estados disponibles: la orden ya está entregada y cobrada -->
                  <div v-if="fichaOrden.estadosPermitidos.length === 0" class="aviso-panel aviso-panel--espera">
                    <i class="bi bi-lock-fill"></i>
                    <span>La orden ya fue entregada y cobrada: no admite más cambios de estado.</span>
                  </div>

                  <template v-else>
                    <label class="form-label">Nuevo estado de la reparación</label>
                    <!-- Los cuatro estados se muestran siempre, cada uno con su color:
                         Pendiente (rojo), En Reparación (amarillo), Listo (azul), Entregado (verde). -->
                    <div class="d-flex flex-wrap gap-2 mb-3">
                      <button
                        type="button"
                        class="btn btn-sm"
                        :class="estadoDestino === 'Pendiente' ? 'btn-danger' : 'btn-outline-danger'"
                        :disabled="guardandoEstado"
                        title="Equipo ingresado, pendiente de diagnóstico o de reparación."
                        @click="estadoDestino = 'Pendiente'"
                      >
                        <i class="bi bi-hourglass-split"></i> Pendiente
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm"
                        :class="estadoDestino === 'En Reparacion' ? 'btn-warning' : 'btn-outline-warning'"
                        :disabled="guardandoEstado"
                        title="La reparación del equipo está en curso."
                        @click="estadoDestino = 'En Reparacion'"
                      >
                        <i class="bi bi-tools"></i> En Reparación
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm"
                        :class="estadoDestino === 'Listo' ? 'btn-primary' : 'btn-outline-primary'"
                        :disabled="guardandoEstado"
                        title="Reparación terminada, lista para el cobro y la entrega."
                        @click="estadoDestino = 'Listo'"
                      >
                        <i class="bi bi-check-circle"></i> Listo
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm"
                        :class="estadoDestino === 'Entregado' ? 'btn-success' : 'btn-outline-success'"
                        :disabled="guardandoEstado"
                        title="Equipo entregado al cliente."
                        @click="estadoDestino = 'Entregado'"
                      >
                        <i class="bi bi-bag-check"></i> Entregado
                      </button>
                    </div>

                    <div class="row g-3">
                      <div class="col-lg-8">
                        <label class="form-label" for="orden-observaciones">Observaciones del diagnóstico</label>
                        <textarea
                          id="orden-observaciones"
                          class="form-control"
                          rows="3"
                          v-model="observacionesDiagnostico"
                          :disabled="guardandoEstado"
                          placeholder="Ej.: Se detectó daño en la tarjeta de carga; se reemplazó el conector y se probó el encendido."
                        ></textarea>
                        <div class="form-text">
                          Queda registrado en la orden, tanto para el cobro como para el historial del equipo.
                        </div>
                      </div>

                      <div class="col-lg-4">
                        <label class="form-label" for="orden-mano-obra">Costo de mano de obra (USD)</label>
                        <input
                          id="orden-mano-obra"
                          type="number"
                          step="0.01"
                          min="0"
                          class="form-control tabular"
                          v-model.number="costoManoObra"
                          :disabled="guardandoEstado"
                        >
                        <div class="form-text">
                          Se sumará automáticamente al total de los repuestos al momento del cobro.
                        </div>
                      </div>
                    </div>

                  </template>
                </div>
              </div>

              <!-- ---------- REPUESTOS CONSUMIDOS ---------- -->
              <div class="card-ts mt-3">
                <div class="card-ts__head">
                  <div>
                    <h3 class="card-ts__title"><i class="bi bi-box-seam"></i> Repuestos consumidos</h3>
                    <p class="card-ts__sub">
                      Cada repuesto agregado descontó la existencia del inventario y dejó un
                      movimiento de SALIDA marcado como «Servicio Técnico».
                    </p>
                  </div>
                  <button
                    class="btn btn-sm btn-primary"
                    type="button"
                    :disabled="fichaOrden.orden.cobrada || agregandoRepuesto"
                    :title="fichaOrden.orden.cobrada
                      ? 'La orden ya fue cobrada: no admite nuevos repuestos.'
                      : 'Consumir un repuesto del inventario'"
                    @click="prepararAgregarRepuesto"
                  >
                    <span v-if="agregandoRepuesto" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                    <i v-else class="bi bi-plus-lg"></i> Agregar repuesto
                  </button>
                </div>

                <div class="card-ts__body">
                  <div v-if="fichaOrden.orden.cobrada" class="aviso-panel aviso-panel--exito">
                    <i class="bi bi-lock-fill"></i>
                    <span>
                      La orden está cobrada y facturada: los repuestos quedaron congelados para
                      mantener la coherencia de la factura <strong>{{ fichaOrden.orden.numeroFactura }}</strong>.
                    </span>
                  </div>

                  <div v-if="fichaOrden.repuestos.length === 0" class="empty-state py-4">
                    <i class="bi bi-box"></i>
                    <h3>Sin repuestos en esta orden</h3>
                    <p class="small">
                      Si la reparación requiere un repuesto, agréguelo para que el sistema descuente
                      el inventario automáticamente.
                    </p>
                  </div>

                  <div v-else class="table-wrap">
                    <table class="table table-ts">
                      <thead>
                        <tr>
                          <th scope="col">Producto</th>
                          <th scope="col" class="text-center">Cantidad</th>
                          <th scope="col" class="text-end">Precio unitario</th>
                          <th scope="col" class="text-end">Subtotal</th>
                          <th scope="col">Origen del movimiento</th>
                          <th scope="col" class="text-end">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="repuesto in fichaOrden.repuestos" :key="repuesto.codigo">
                          <td>
                            <strong class="fw-semibold d-block">{{ repuesto.nombre }}</strong>
                            <span class="code-chip">{{ repuesto.codigo }}</span>
                            <small class="text-muted-2 d-block">
                              Existencia actual: {{ repuesto.existenciaActual }} u.
                              (mínimo {{ repuesto.stockMinimo }})
                            </small>
                          </td>
                          <td class="text-center tabular">{{ repuesto.cantidad }}</td>
                          <td class="text-end tabular">{{ formatearMoneda(repuesto.precioUnitario) }}</td>
                          <td class="text-end tabular"><strong>{{ formatearMoneda(repuesto.subtotal) }}</strong></td>
                          <td>
                            <span class="badge-ts" :class="presentacionOrigenMovimiento(repuesto.origen).clase">
                              <i class="bi" :class="presentacionOrigenMovimiento(repuesto.origen).icono"></i>
                              {{ presentacionOrigenMovimiento(repuesto.origen).etiqueta }}
                            </span>
                            <small class="d-block text-muted-2 mt-1">
                              Movimiento #{{ repuesto.idMovimiento }} · {{ formatearFecha(repuesto.fechaMovimiento, true) }}
                            </small>
                          </td>
                          <td class="text-end">
                            <button
                              class="btn btn-ghost btn-icon btn-ghost-danger"
                              type="button"
                              :disabled="fichaOrden.orden.cobrada || agregandoRepuesto"
                              :title="fichaOrden.orden.cobrada
                                ? 'No se pueden retirar repuestos de una orden facturada.'
                                : 'Retirar el repuesto y devolverlo al inventario'"
                              @click="retirarRepuesto(repuesto)"
                            >
                              <i class="bi bi-trash"></i>
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <!-- ---------- DESGLOSE ECONÓMICO Y COBRO ---------- -->
              <div class="card-ts mt-3">
                <div class="card-ts__head">
                  <div>
                    <h3 class="card-ts__title"><i class="bi bi-calculator"></i> Desglose económico</h3>
                    <p class="card-ts__sub">
                      El total lo calcula el sistema: mano de obra + repuestos. No se edita a mano.
                    </p>
                  </div>
                </div>

                <div class="card-ts__body">
                  <dl class="row mb-3">
                    <dt class="col-6 col-sm-4 text-muted-2">Mano de obra</dt>
                    <dd class="col-6 col-sm-8 tabular">{{ formatearMoneda(fichaOrden.desglose.manoObra) }}</dd>

                    <dt class="col-6 col-sm-4 text-muted-2">
                      Repuestos ({{ fichaOrden.desglose.cantidadRepuestos }} línea/s)
                    </dt>
                    <dd class="col-6 col-sm-8 tabular">{{ formatearMoneda(fichaOrden.desglose.repuestos) }}</dd>

                    <dt class="col-6 col-sm-4"><strong>Total a cobrar</strong></dt>
                    <dd class="col-6 col-sm-8">
                      <strong class="tabular fs-5">{{ formatearMoneda(fichaOrden.desglose.total) }}</strong>
                    </dd>
                  </dl>

                  <!-- La orden ya está cobrada: se muestra la factura emitida -->
                  <div v-if="fichaOrden.orden.cobrada" class="aviso-panel aviso-panel--exito">
                    <i class="bi bi-receipt-cutoff"></i>
                    <div class="flex-grow-1">
                      <strong>Orden cobrada y facturada.</strong>
                      <p class="mb-0">
                        Factura: <span class="code-chip">{{ fichaOrden.orden.numeroFactura }}</span>
                        · cerrada el {{ formatearFecha(fichaOrden.orden.fechaCierre, true) }}.
                      </p>
                    </div>
                    <button
                      class="btn btn-sm btn-outline-secondary"
                      type="button"
                      :disabled="cargandoComprobante"
                      @click="verComprobante(fichaOrden.orden)"
                    >
                      <span v-if="cargandoComprobante" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                      <i v-else class="bi bi-printer"></i> Ver comprobante
                    </button>
                  </div>

                  <!-- La orden no está Listo: primero hay que terminar la reparación -->
                  <div v-else-if="fichaOrden.orden.estado !== 'Listo'" class="aviso-panel aviso-panel--espera">
                    <i class="bi bi-hourglass-split"></i>
                    <span>
                      La orden está en estado <strong>{{ fichaOrden.orden.estado }}</strong>. Sólo se
                      puede cobrar cuando el técnico la declare <strong>Listo</strong>: finalice la
                      reparación y cambie el estado antes de facturar.
                    </span>
                  </div>

                  <!-- La orden está Listo y sin cobrar: se puede cobrar -->
                  <div v-else class="aviso-panel aviso-panel--listo">
                    <i class="bi bi-check2-circle"></i>
                    <span>
                      Reparación terminada. Puede registrar el cobro con el botón
                      <strong>Cobrar orden</strong> ubicado al pie de esta ventana.
                    </span>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div class="modal-footer">
            <button class="btn btn-outline-secondary" type="button" @click="cerrarModal('modalDetalleOrden')">
              <i class="bi bi-x-lg"></i> Cerrar
            </button>

            <!-- Guardado del diagnóstico y del cambio de estado -->
            <button
              v-if="fichaOrden && fichaOrden.estadosPermitidos.length > 0"
              class="btn btn-primary"
              type="button"
              :disabled="guardandoEstado"
              @click="guardarProcesamiento"
            >
              <span v-if="guardandoEstado" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
              <i v-else class="bi bi-save"></i>
              {{ opcionEstadoDestino
                ? `Cambiar a "${opcionEstadoDestino.etiqueta}"`
                : 'Guardar diagnóstico y mano de obra' }}
            </button>

            <!-- Cobro: sólo disponible con la orden "Listo" y sin facturar -->
            <button
              v-if="puedeCobrarOrden"
              class="btn btn-success"
              type="button"
              :disabled="guardandoEstado"
              @click="prepararCobro"
            >
              <i class="bi bi-cash-coin"></i> Cobrar orden
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ======================================================================
         MODAL 2 · AGREGAR REPUESTO (CONSUMO DE INVENTARIO)
         ====================================================================== -->
    <div class="modal fade" id="modalAgregarRepuesto" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-box-seam"></i> Agregar repuesto a la orden</h5>
            <button type="button" class="btn-close" aria-label="Cerrar" :disabled="agregandoRepuesto" @click="cerrarModal('modalAgregarRepuesto')"></button>
          </div>

          <form @submit.prevent="confirmarAgregarRepuesto" novalidate>
            <div class="modal-body">
              <!-- ---------- ESTADO DE ERROR DEL BACKEND (400/404) ---------- -->
              <div v-if="mensajeErrorRepuesto" class="readonly-note" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <span>{{ mensajeErrorRepuesto }}</span>
              </div>

              <!-- ---------- AVISO DESTACADO DEL EFECTO EN EL INVENTARIO ---------- -->
              <div class="aviso-panel aviso-panel--info mb-3">
                <i class="bi bi-info-circle-fill"></i>
                <span>
                  Al agregar el repuesto el sistema restará la cantidad de la existencia del inventario
                  y registrará un movimiento de <strong>SALIDA</strong> marcado como
                  «Servicio Técnico». Si el producto llega a su stock mínimo se disparará una
                  alerta automática.
                </span>
              </div>

              <!-- ---------- ESTADO DE CARGA DEL CATÁLOGO ---------- -->
              <div v-if="cargandoProductos" class="empty-state py-4">
                <div class="spinner-border text-primary mb-3" role="status" aria-hidden="true"></div>
                <h3>Cargando el inventario...</h3>
                <p class="small">Consultando las existencias reales del almacén.</p>
              </div>

              <div v-else class="row g-3">
                <!-- Producto del catálogo (datos reales del CRUD 1) -->
                <div class="col-12">
                  <label class="form-label" for="repuesto-producto">Repuesto del inventario*</label>
                  <select
                    id="repuesto-producto"
                    class="form-select"
                    :class="{ 'is-invalid': erroresRepuesto.codigo }"
                    v-model="formularioRepuesto.codigo"
                    :disabled="agregandoRepuesto"
                  >
                    <option value="" disabled>Seleccione el producto...</option>
                    <option
                      v-for="producto in listaProductos"
                      :key="producto.codigo"
                      :value="producto.codigo"
                      :disabled="producto.existencia <= 0"
                    >
                      {{ producto.nombre }} — existencia {{ producto.existencia }} u.
                      {{ producto.existencia <= 0 ? '(AGOTADO)' : '' }}
                    </option>
                  </select>
                  <div v-if="erroresRepuesto.codigo" class="invalid-feedback d-block">
                    {{ erroresRepuesto.codigo }}
                  </div>
                  <div v-else-if="listaProductos.length === 0" class="form-text text-danger">
                    No hay productos activos en el catálogo. Regístrelos en el módulo de Inventario.
                  </div>
                </div>

                <!-- Cantidad -->
                <div class="col-md-4">
                  <label class="form-label" for="repuesto-cantidad">Cantidad*</label>
                  <input
                    id="repuesto-cantidad"
                    type="number"
                    step="1"
                    min="1"
                    class="form-control tabular"
                    :class="{ 'is-invalid': erroresRepuesto.cantidad }"
                    v-model.number="formularioRepuesto.cantidad"
                    :disabled="agregandoRepuesto"
                  >
                  <div v-if="erroresRepuesto.cantidad" class="invalid-feedback d-block">
                    {{ erroresRepuesto.cantidad }}
                  </div>
                </div>

                <!-- Precio unitario (precargado con el precio de venta, editable) -->
                <div class="col-md-4">
                  <label class="form-label" for="repuesto-precio">Precio unitario (USD)</label>
                  <input
                    id="repuesto-precio"
                    type="number"
                    step="0.01"
                    min="0"
                    class="form-control tabular"
                    :class="{ 'is-invalid': erroresRepuesto.precioUnitario }"
                    v-model.number="formularioRepuesto.precioUnitario"
                    :disabled="agregandoRepuesto"
                  >
                  <div v-if="erroresRepuesto.precioUnitario" class="invalid-feedback d-block">
                    {{ erroresRepuesto.precioUnitario }}
                  </div>
                </div>

                <!-- Existencia disponible y vista previa del descuento -->
                <div class="col-md-4">
                  <label class="form-label">Existencia disponible</label>
                  <div class="d-flex align-items-center gap-2 flex-wrap" style="min-height:46px;">
                    <template v-if="productoRepuestoSeleccionado">
                      <span class="badge-ts no-dot" :class="repuestoAgotado ? 'badge-out' : 'badge-info'">
                        <i class="bi bi-box-seam"></i> {{ existenciaDisponible }} u.
                      </span>
                      <small class="text-muted-2">Mínimo {{ stockMinimoRepuesto }} u.</small>
                    </template>
                    <small v-else class="text-muted-2">Seleccione un producto.</small>
                  </div>
                </div>

                <!-- Previsualización del efecto sobre el stock -->
                <div v-if="productoRepuestoSeleccionado" class="col-12">
                  <div class="summary-strip">
                    <template v-if="repuestoAgotado">
                      <span class="badge-ts badge-out">Stock insuficiente (producto agotado)</span>
                    </template>
                    <template v-else-if="cantidadSuperaExistencia || existenciaResultante < 0">
                      <span class="badge-ts badge-out">Stock insuficiente</span>
                    </template>
                    <template v-else>
                      <span class="chip">
                        <i class="bi bi-arrow-down-up"></i> Existencia resultante:
                        <strong class="tabular">{{ existenciaDisponible }} → {{ existenciaResultante }} u.</strong>
                      </span>
                      <span v-if="existenciaResultante <= stockMinimoRepuesto" class="badge-ts badge-low">
                        Quedará en el stock mínimo: se generará una alerta
                      </span>
                      <span v-else class="badge-ts badge-ok">Descuento viable</span>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-outline-secondary" type="button" :disabled="agregandoRepuesto" @click="cerrarModal('modalAgregarRepuesto')">
                Cancelar
              </button>
              <button
                class="btn btn-primary"
                type="submit"
                :disabled="agregandoRepuesto || cargandoProductos || repuestoAgotado || cantidadSuperaExistencia"
              >
                <span v-if="agregandoRepuesto" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                <i v-else class="bi bi-plus-lg"></i>
                {{ agregandoRepuesto ? 'Descontando del inventario...' : 'Agregar y descontar del inventario' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- ======================================================================
         MODAL 3 · COBRO DE LA ORDEN
         ====================================================================== -->
    <div class="modal fade" id="modalCobrarOrden" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-cash-coin"></i> Cobrar orden
              <span v-if="fichaOrden" class="code-chip ms-2">{{ fichaOrden.orden.id }}</span>
            </h5>
            <button type="button" class="btn-close" aria-label="Cerrar" :disabled="cobrando" @click="cerrarModal('modalCobrarOrden')"></button>
          </div>

          <form @submit.prevent="confirmarCobro" novalidate>
            <div class="modal-body">
              <!-- ---------- ESTADO DE ERROR DEL BACKEND (monto distinto, sin caja, etc.) ---------- -->
              <div v-if="mensajeErrorCobro" class="readonly-note" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <span>{{ mensajeErrorCobro }}</span>
              </div>

              <template v-if="fichaOrden">
                <!-- ---------- DESGLOSE CALCULADO POR EL SISTEMA ---------- -->
                <div class="card-ts mb-3">
                  <div class="card-ts__body">
                    <dl class="row mb-0 small">
                      <dt class="col-6 text-muted-2">Mano de obra</dt>
                      <dd class="col-6 text-end tabular">{{ formatearMoneda(fichaOrden.desglose.manoObra) }}</dd>

                      <dt class="col-6 text-muted-2">Repuestos</dt>
                      <dd class="col-6 text-end tabular">{{ formatearMoneda(fichaOrden.desglose.repuestos) }}</dd>

                      <dt class="col-6"><strong>Total calculado por el sistema</strong></dt>
                      <dd class="col-6 text-end">
                        <strong class="tabular fs-5">{{ formatearMoneda(fichaOrden.desglose.total) }}</strong>
                      </dd>
                    </dl>
                    <p class="text-muted-2 small mb-0 mt-2">
                      <i class="bi bi-shield-lock"></i>
                      El total no se edita a mano: lo calcula el servidor sumando la mano de obra y los
                      repuestos consumidos. Un monto distinto será rechazado.
                    </p>
                  </div>
                </div>

                <div class="row g-3">
                  <!-- Monto cobrado (precargado con el total del sistema) -->
                  <div class="col-md-6">
                    <label class="form-label" for="cobro-monto">Monto cobrado (USD)*</label>
                    <input
                      id="cobro-monto"
                      type="number"
                      step="0.01"
                      min="0.01"
                      class="form-control tabular"
                      :class="{ 'is-invalid': erroresCobro.monto }"
                      v-model.number="formularioCobro.monto"
                      :disabled="cobrando"
                    >
                    <div v-if="erroresCobro.monto" class="invalid-feedback d-block">
                      {{ erroresCobro.monto }}
                    </div>
                    <div v-else-if="montoNoCoincide" class="form-text text-danger">
                      El monto no coincide con el total del sistema
                      ({{ formatearMoneda(fichaOrden.desglose.total) }}). El servidor rechazará el cobro.
                    </div>
                    <div v-else class="form-text">Precargado con el total exacto de la orden.</div>
                  </div>

                  <!-- Tasa de cambio aplicada -->
                  <div class="col-md-6">
                    <label class="form-label" for="cobro-tasa">
                      Tasa de cambio BCV (Bs/USD){{ exigeTasaBcv ? '*' : ' (No requerida)' }}
                    </label>
                    <input
                      id="cobro-tasa"
                      type="number"
                      step="0.01"
                      min="0.01"
                      class="form-control tabular"
                      :class="{ 'is-invalid': erroresCobro.tasaCambio }"
                      v-model.number="formularioCobro.tasaCambio"
                      :disabled="cobrando || !exigeTasaBcv"
                      :placeholder="!exigeTasaBcv ? 'No requerida para efectivo / divisas' : 'Ingrese tasa BCV'"
                    >
                    <div v-if="erroresCobro.tasaCambio" class="invalid-feedback d-block">
                      {{ erroresCobro.tasaCambio }}
                    </div>
                    <div v-else-if="!exigeTasaBcv" class="form-text text-muted">
                      El pago se cobra en divisas / efectivo directo; no requiere conversión a bolívares.
                    </div>
                    <div v-else class="form-text">
                      Monto equivalente: <strong class="tabular">{{ formatearMoneda(totalEnBolivares, 'BS') }}</strong>
                    </div>
                  </div>

                  <!-- Método de pago -->
                  <div class="col-md-6">
                    <label class="form-label" for="cobro-metodo">Método de pago*</label>
                    <select
                      id="cobro-metodo"
                      class="form-select"
                      :class="{ 'is-invalid': erroresCobro.metodoPago }"
                      v-model="formularioCobro.metodoPago"
                      :disabled="cobrando"
                    >
                      <option v-for="metodo in METODOS_PAGO" :key="metodo.valor" :value="metodo.valor">
                        {{ metodo.etiqueta }}{{ metodo.exigeReferencia ? ' (exige referencia)' : '' }}
                      </option>
                    </select>
                    <div v-if="erroresCobro.metodoPago" class="invalid-feedback d-block">
                      {{ erroresCobro.metodoPago }}
                    </div>
                    <div v-else class="form-text">
                      <i class="bi" :class="metodoPagoSeleccionado?.icono"></i>
                      {{ metodoPagoSeleccionado?.etiqueta }}
                    </div>
                  </div>

                  <!-- Referencia (obligatoria en pagos electrónicos) -->
                  <div class="col-md-6">
                    <label class="form-label" for="cobro-referencia">
                      Referencia / comprobante{{ exigeReferencia ? '*' : '' }}
                    </label>
                    <input
                      id="cobro-referencia"
                      type="text"
                      class="form-control"
                      :class="{ 'is-invalid': erroresCobro.referencia }"
                      v-model="formularioCobro.referencia"
                      :disabled="cobrando || !exigeReferencia"
                      :placeholder="exigeReferencia ? 'Ej.: 123456789' : 'No requerida para este método'"
                    >
                    <div v-if="erroresCobro.referencia" class="invalid-feedback d-block">
                      {{ erroresCobro.referencia }}
                    </div>
                    <div v-else class="form-text">
                      {{ exigeReferencia
                        ? 'El backend valida que la referencia no venga vacía.'
                        : 'Este método de pago no exige referencia.' }}
                    </div>
                  </div>

                  <!-- Caja activa: sin turno abierto no se puede cobrar -->
                  <div class="col-12">
                    <div v-if="cargandoCaja" class="readonly-note aviso-caja">
                      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      <span>Verificando el turno de caja...</span>
                    </div>

                    <div v-else-if="cajaActiva" class="aviso-panel aviso-panel--exito">
                      <i class="bi bi-safe"></i>
                      <span>
                        Caja abierta <strong>#{{ cajaActiva.id }}</strong> · apertura
                        {{ formatearMoneda(cajaActiva.montoApertura) }} ·
                        recaudado {{ formatearMoneda(cajaActiva.totalRecaudado) }}.
                        El cobro se registrará en este turno.
                      </span>
                    </div>

                    <div v-else class="aviso-panel aviso-panel--alerta">
                      <i class="bi bi-exclamation-triangle-fill"></i>
                      <div class="flex-grow-1">
                        <strong>No hay una caja abierta.</strong>
                        <p class="mb-0">
                          El sistema exige un turno de caja para registrar el ingreso. Ábrala en el
                          módulo de Caja y vuelva a intentar el cobro.
                        </p>
                      </div>
                      <router-link class="btn btn-sm btn-outline-secondary" to="/caja">
                        <i class="bi bi-safe"></i> Ir a Caja
                      </router-link>
                    </div>

                    <div v-if="erroresCobro.caja" class="invalid-feedback d-block">{{ erroresCobro.caja }}</div>
                  </div>

                  <!-- Observaciones del cobro -->
                  <div class="col-12">
                    <label class="form-label" for="cobro-observaciones">Observaciones (opcional)</label>
                    <textarea
                      id="cobro-observaciones"
                      class="form-control"
                      rows="2"
                      v-model="formularioCobro.observaciones"
                      :disabled="cobrando"
                      placeholder="Ej.: El cliente canceló el 50% en efectivo y el resto por Pago Móvil."
                    ></textarea>
                  </div>
                </div>
              </template>
            </div>

            <div class="modal-footer">
              <button class="btn btn-outline-secondary" type="button" :disabled="cobrando" @click="cerrarModal('modalCobrarOrden')">
                Cancelar
              </button>
              <!-- Se bloquea si no hay caja abierta; el backend también lo valida -->
              <button class="btn btn-success" type="submit" :disabled="cobrando || !cajaActiva">
                <span v-if="cobrando" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                <i v-else class="bi bi-receipt"></i>
                {{ cobrando ? 'Emitiendo la factura...' : 'Confirmar cobro y emitir factura' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- ======================================================================
         MODAL 4 · COMPROBANTE / FACTURA DE SERVICIO TÉCNICO
         ====================================================================== -->
    <div class="modal fade" id="modalComprobante" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-receipt-cutoff"></i> Comprobante de servicio técnico</h5>
            <button type="button" class="btn-close" aria-label="Cerrar" @click="cerrarModal('modalComprobante')"></button>
          </div>

          <div class="modal-body">
            <template v-if="facturaVisible">
              <!-- ==================================================================
                   HOJA DE FACTURA (formato imprimible tipo factura clásica):
                   emisor + cliente arriba, tabla de conceptos numerada al centro,
                   totales a la derecha, condiciones de pago y pie de tres columnas.
                   ================================================================== -->
              <article class="factura-print">

                <!-- ---------- ENCABEZADO: CLIENTE (IZQUIERDA) · EMISOR (DERECHA) ---------- -->
                <header class="factura-print__head">
                  <div class="factura-print__bloque">
                    <p class="factura-print__rotulo">Cliente</p>
                    <p class="factura-print__fuerte">{{ facturaVisible.cliente }}</p>
                    <p>Cédula / RIF: {{ facturaVisible.cedula || '—' }}</p>
                    <p>Teléfono: {{ facturaVisible.telefono || '—' }}</p>
                  </div>

                  <div class="factura-print__bloque text-end">
                    <img :src="logoTekzon" alt="Logo TekZon" class="factura-print__logo">
                    <p class="factura-print__fuerte">TekZon C.A.</p>
                    <p>Gestión técnica · Inventario · Facturación</p>
                  </div>
                </header>

                <!-- ---------- IDENTIFICACIÓN DE LA FACTURA (ALINEADA A LA DERECHA) ---------- -->
                <div class="factura-print__meta">
                  <dl class="mb-0">
                    <div>
                      <dt>Orden de servicio n°</dt>
                      <dd>{{ comprobante?.orden?.id || '—' }}</dd>
                    </div>
                    <div>
                      <dt>Factura n°</dt>
                      <dd>{{ facturaVisible.numeroFactura }}</dd>
                    </div>
                    <div>
                      <dt>Fecha de factura</dt>
                      <dd>{{ formatearFecha(facturaVisible.fecha, true) }}</dd>
                    </div>
                  </dl>
                </div>

                <h2 class="factura-print__titulo">FACTURA</h2>

                <!-- ---------- CONCEPTOS FACTURADOS (TABLA NUMERADA) ---------- -->
                <table class="factura-print__tabla">
                  <thead>
                    <tr>
                      <th scope="col">Descripción del servicio</th>
                      <th scope="col" class="text-end">Costo</th>
                      <th scope="col" class="text-center">Ud.</th>
                      <th scope="col" class="text-center">Cant.</th>
                      <th scope="col" class="text-end">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(repuesto, indice) in comprobante.repuestos" :key="`factura-${repuesto.codigo}`">
                      <td>
                        <p class="factura-print__concepto">{{ indice + 1 }}. Repuesto: {{ repuesto.nombre }}</p>
                        <p class="factura-print__detalle">
                          Código {{ repuesto.codigo }} · repuesto consumido durante la reparación del equipo.
                        </p>
                      </td>
                      <td class="text-end tabular">{{ formatearMoneda(repuesto.precioUnitario) }}</td>
                      <td class="text-center">und.</td>
                      <td class="text-center tabular">{{ repuesto.cantidad }}</td>
                      <td class="text-end tabular">{{ formatearMoneda(repuesto.subtotal) }}</td>
                    </tr>

                    <!-- La mano de obra es el concepto fijo de toda factura de servicio -->
                    <tr>
                      <td>
                        <p class="factura-print__concepto">{{ comprobante.repuestos.length + 1 }}. Mano de obra</p>
                        <p class="factura-print__detalle">
                          Servicio técnico al equipo {{ facturaVisible.equipo || '—' }}
                          (serie {{ facturaVisible.serie || '—' }}), según la orden de servicio
                          {{ comprobante?.orden?.id || '—' }}.
                        </p>
                      </td>
                      <td class="text-end tabular">{{ formatearMoneda(facturaVisible.manoObra) }}</td>
                      <td class="text-center">serv.</td>
                      <td class="text-center tabular">1</td>
                      <td class="text-end tabular">{{ formatearMoneda(facturaVisible.manoObra) }}</td>
                    </tr>

                    <tr v-if="comprobante.repuestos.length === 0">
                      <td colspan="5" class="text-center factura-print__detalle">
                        Esta orden no consumió repuestos del inventario.
                      </td>
                    </tr>
                  </tbody>
                </table>

                <!-- ---------- TOTALES (ALINEADOS A LA DERECHA) ---------- -->
                <div class="factura-print__totales">
                  <dl class="mb-0">
                    <div>
                      <dt>Subtotal repuestos</dt>
                      <dd class="tabular">{{ formatearMoneda(facturaVisible.totalRepuestos) }}</dd>
                    </div>
                    <div>
                      <dt>Mano de obra</dt>
                      <dd class="tabular">{{ formatearMoneda(facturaVisible.manoObra) }}</dd>
                    </div>
                    <div class="factura-print__total">
                      <dt>Total a pagar</dt>
                      <dd class="tabular">{{ formatearMoneda(facturaVisible.total) }}</dd>
                    </div>
                    <div v-if="facturaVisible.tasaCambio">
                      <dt>Equivalente en bolívares (tasa {{ facturaVisible.tasaCambio }} Bs/USD)</dt>
                      <dd class="tabular">{{ formatearMoneda(facturaVisible.totalBolivares, 'BS') }}</dd>
                    </div>
                  </dl>
                </div>

                <!-- ---------- CONDICIONES DE PAGO ---------- -->
                <section class="factura-print__seccion">
                  <h3>Condiciones de pago</h3>
                  <p>
                    Por favor, pague el total al retirar el equipo o dentro de los 14 días
                    siguientes a la recepción de esta factura.
                  </p>
                </section>

                <!-- ---------- INSTRUCCIONES DE PAGO ---------- -->
                <section class="factura-print__seccion">
                  <h3>Para realizar el pago</h3>
                  <p>
                    <strong>Método de pago:</strong> {{ etiquetaMetodoPago(facturaVisible.metodoPago) }}<br>
                    <strong>Referencia:</strong> {{ facturaVisible.referencia || 'No aplica' }}<br>
                    <strong>Monto cobrado:</strong> <span class="tabular">{{ formatearMoneda(facturaVisible.monto) }}</span><br>
                    <strong>Caja:</strong> {{ facturaVisible.cajaTexto }}
                  </p>
                </section>

                <!-- ---------- PIE: EMISOR · CONTACTO · INFORMACIÓN DE PAGO ---------- -->
                <footer class="factura-print__pie">
                  <div>
                    <p class="factura-print__fuerte">TekZon C.A.</p>
                    <p>Dirección de la empresa, n°</p>
                    <p>C.P. / Ciudad, Estado</p>
                    <p>RIF: J-XXXXXX-X</p>
                  </div>
                  <div>
                    <p class="factura-print__fuerte">Contacto</p>
                    <p>Teléfono: +58 0000-000000</p>
                    <p>Email: contacto@tekzon.com</p>
                    <p>Web: www.tekzon.com</p>
                  </div>
                  <div>
                    <p class="factura-print__fuerte">Información de pago</p>
                    <p>Método: {{ etiquetaMetodoPago(facturaVisible.metodoPago) }}</p>
                    <p>Referencia: {{ facturaVisible.referencia || 'No aplica' }}</p>
                    <p>Factura n°: {{ facturaVisible.numeroFactura }}</p>
                  </div>
                </footer>
              </article>
            </template>

            <!-- Sin datos cargados (por ejemplo, mientras se consulta el comprobante) -->
            <div v-else class="empty-state py-4">
              <div class="spinner-border text-primary mb-3" role="status" aria-hidden="true"></div>
              <h3>Consultando el comprobante...</h3>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-outline-secondary" type="button" @click="cerrarModal('modalComprobante')">
              Cerrar
            </button>
            <button class="btn btn-primary" type="button" :disabled="!facturaVisible" @click="imprimirComprobante">
              <i class="bi bi-printer"></i> Imprimir
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL DE GENERACIÓN DE REPORTES (PDF / EXCEL / CORREO) -->
    <ModalGenerarReporte
      id-modal="modalReporteOrdenes"
      tipo-reporte="ordenes"
      titulo="Reporte Gerencial y de Supervisión del Taller Técnico"
      subtitulo="Productividad del personal técnico, facturación de servicios y consumo de repuestos en reparaciones."
      clasificacion="GERENCIAL"
      @notificar="manejarNotificacionReporte"
    />
  </main>
</template>

<style scoped>
/*
 * Paneles de aviso del taller (informativos y de advertencia).
 * El design system sólo trae la variante roja `readonly-note`, pensada para
 * errores; estos avisos explican el estado del proceso y no son fallos.
 */
.aviso-panel {
  display: flex;
  align-items: center;
  gap: .6rem;
  font-size: .82rem;
  padding: .7rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
}

.aviso-panel > i {
  font-size: 1.05rem;
  line-height: 1.2;
}

.aviso-panel p {
  font-size: .78rem;
  margin: .1rem 0 0;
}

/* Azul: información sobre el efecto de una operación. */
.aviso-panel--info {
  background: #e3f4f7;
  color: var(--color-info);
  border-color: #bae6fd;
}

/* Verde: operación concretada correctamente. */
.aviso-panel--exito {
  background: #e8f6ee;
  color: #15803d;
  border-color: #bbf7d0;
}

/* Ámbar: la orden todavía no está en condiciones de continuar. */
.aviso-panel--espera {
  background: var(--surface-soft);
  color: var(--text-muted);
  border-color: var(--border-color);
}

/* Verde intenso: la orden está Listo y puede cobrarse. */
.aviso-panel--listo {
  background: #e8f6ee;
  color: #15803d;
  border-color: #86efac;
}

/* Rojo: falta un requisito obligatorio (por ejemplo, la caja abierta). */
.aviso-panel--alerta {
  background: #fde8e8;
  color: var(--color-danger);
  border-color: #fecaca;
}

/* Aviso de carga de la caja: se reutiliza el estilo rojo sólo por el layout. */
.aviso-caja {
  background: var(--surface-soft);
  color: var(--text-muted);
  border-color: var(--border-color);
}

/* ==========================================================================
   HOJA DE FACTURA (vista previa en pantalla e impresión)
   Formato de factura clásica: negro sobre blanco, sin tarjetas ni chips.
   ========================================================================== */
.factura-print {
  background: #fff;
  color: #111827;
  font-size: .875rem;
  line-height: 1.45;
}

.factura-print p {
  margin: 0 0 .15rem;
}

.factura-print__fuerte {
  font-weight: 700;
}

.factura-print__rotulo {
  font-weight: 600;
  text-transform: uppercase;
  font-size: .72rem;
  letter-spacing: .04em;
  margin-bottom: .35rem;
}

/* Encabezado: cliente a la izquierda, emisor a la derecha. */
.factura-print__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.factura-print__logo {
  width: 130px;
  height: auto;
  margin-bottom: .4rem;
}

/* Identificación de la factura, alineada a la derecha como en el modelo. */
.factura-print__meta {
  display: flex;
  justify-content: flex-end;
  margin-top: 1.25rem;
}

.factura-print__meta dl > div {
  display: flex;
  justify-content: space-between;
  gap: 2rem;
  min-width: 320px;
  padding: .1rem .25rem;
}

.factura-print__meta dt {
  font-weight: 600;
  color: #374151;
}

.factura-print__meta dd {
  margin: 0;
  font-weight: 700;
  text-align: right;
}

.factura-print__titulo {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.6rem;
  letter-spacing: .02em;
  margin: 1.25rem 0 .75rem;
}

/* Tabla de conceptos: línea gruesa arriba, filas separadas por filetes claros. */
.factura-print__tabla {
  width: 100%;
  border-collapse: collapse;
}

.factura-print__tabla thead th {
  padding: .45rem .5rem;
  border-top: 2px solid #111827;
  border-bottom: 2px solid #111827;
  font-size: .8rem;
  font-weight: 700;
  white-space: nowrap;
}

.factura-print__tabla td {
  padding: .55rem .5rem;
  border-bottom: 1px solid #d1d5db;
  vertical-align: top;
}

/* Los montos y cantidades nunca se parten en dos líneas. */
.factura-print__tabla td.tabular {
  white-space: nowrap;
}

.factura-print__concepto {
  font-weight: 600;
  margin-bottom: .2rem;
}

.factura-print__detalle {
  font-size: .78rem;
  color: #4b5563;
  margin: 0;
}

/* Totales: bloque alineado a la derecha con línea doble sobre el total. */
.factura-print__totales {
  display: flex;
  justify-content: flex-end;
  margin-top: .75rem;
}

.factura-print__totales dl {
  min-width: min(420px, 100%);
}

.factura-print__totales dl > div {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 2rem;
  padding: .25rem .5rem;
}

.factura-print__totales dt {
  margin: 0;
}

.factura-print__totales dd {
  margin: 0;
  text-align: right;
}

.factura-print__total {
  border-top: 2px solid #111827;
  font-weight: 800;
  font-size: 1.05rem;
  padding-top: .4rem !important;
}

/* Secciones de texto: condiciones e instrucciones de pago. */
.factura-print__seccion {
  margin-top: 1.25rem;
}

.factura-print__seccion h3 {
  font-size: .85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .03em;
  margin: 0 0 .35rem;
}

.factura-print__seccion p {
  margin: 0;
  color: #1f2937;
}

/* Pie de tres columnas: emisor · contacto · información de pago. */
.factura-print__pie {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  margin-top: 2rem;
  padding-top: .75rem;
  border-top: 1px solid #9ca3af;
  font-size: .75rem;
  color: #4b5563;
}
</style>

