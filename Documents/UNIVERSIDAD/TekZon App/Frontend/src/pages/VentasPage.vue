<script setup>
/**
 * ==========================================================================
 * PÁGINA DE VENTA DIRECTA (VentasPage.vue) - TEKZON C.A.
 * ==========================================================================
 * Módulo 3 · Venta Directa (mostrador)
 *
 * PROPÓSITO FUNCIONAL:
 *   Es el punto de venta rápido de artículos electrónicos. Reúne en una sola
 *   pantalla las cuatro operaciones del mostrador:
 *
 *     1. SELECCIÓN DE PRODUCTOS: buscador + tarjetas del catálogo real, con la
 *        existencia disponible y el aviso de stock mínimo.
 *     2. IDENTIFICACIÓN DEL CLIENTE: se busca por cédula; si existe se
 *        autocompletan sus datos y, si no existe, se registrará como cliente
 *        nuevo en la misma facturación.
 *     3. COBRO: método de pago (con referencia cuando el método la exige),
 *        monto recibido en USD y tasa de cambio, siempre dentro de un TURNO DE
 *        CAJA abierto.
 *     4. FACTURA: comprobante con sus líneas y la evidencia de que la salida de
 *        inventario quedó marcada con el origen "Venta".
 *
 *   Además lista el histórico de facturas (filtros por texto, cédula y rango de
 *   fechas) y permite consultarlas y anularlas. La anulación devuelve el stock
 *   automáticamente porque ese cálculo vive en el backend.
 *
 * PROPÓSITO TÉCNICO:
 *   · CERO DATOS SIMULADOS: productos, clientes, ventas, indicadores y la caja
 *     activa provienen de la base `tekzon_bd` mediante los servicios
 *     `ProductoServices`, `ClienteServices`, `VentaServices` y `CajaServices`.
 *   · EL TOTAL LO CALCULA EL SERVIDOR: el frontend sólo envía el carrito con
 *     `{ codigo, cantidad }`. El total que se ve en el carrito es una REFERENCIA
 *     para el cajero y así se advierte en pantalla. Si el monto cobrado no
 *     coincide con el total del catálogo, el backend responde 400 (control
 *     contable) y el error se muestra con su código HTTP.
 *   · 3 ESTADOS DE UI:
 *       CARGANDO -> `LoadingSpinner` y banderas `enviando...` en los botones.
 *       ÉXITO    -> `ToastNotificaciones` con el número de factura y el total.
 *       ERROR    -> Toast + panel persistente con el código HTTP y "Reintentar".
 *   · Los modales se abren y cierran SIEMPRE con el utilitario compartido
 *     `abrirModal` / `cerrarModal` (nunca con `data-bs-toggle`), para que no
 *     compitan dos manejadores sobre el mismo botón.
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import ModalGenerarReporte from '../components/ModalGenerarReporte.vue';
import ProductoServices from '../services/ProductoServices.js';
import VentaServices from '../services/VentaServices.js';
import ClienteServices from '../services/ClienteServices.js';
import CajaServices from '../services/CajaServices.js';
// Utilitario compartido de apertura/cierre de modales de Bootstrap 5.
import { abrirModal, cerrarModal } from '../utils/utilidadesModales.js';
// Helpers de formato, mapeo y presentación compartidos por los módulos nuevos.
import {
  aDecimal,
  aNumero,
  describirError,
  etiquetaMetodoPago,
  formatearFecha,
  formatearMoneda,
  METODOS_PAGO,
  metodoRequiereTasa,
  presentacionOrigenMovimiento
} from '../services/formato.js';

// ==========================================================================
// ESTADO REACTIVO PRINCIPAL
// ==========================================================================

/** Catálogo de productos activos (CRUD 1) que alimenta la vitrina del mostrador. */
const productosCatalogo = ref([]);
/** Texto del buscador de la vitrina. */
const textoBusquedaProducto = ref('');

/** Líneas del carrito: { codigo, nombre, imagen, marca, precio, existencia, cantidad }. */
const carritoVenta = ref([]);

/** Datos del cliente que se facturará (registrado o nuevo). */
const datosCliente = ref({
  cedula: '',
  nombre: '',
  apellido: '',
  telefono: '',
  direccion: ''
});

/** Cliente encontrado en la base de datos (null = no existe todavía). */
const clienteRegistrado = ref(null);
/** ¿Ya se intentó buscar la cédula escrita? (para poder afirmar "cliente nuevo"). */
const clienteBuscado = ref(false);

/** Indicadores KPI del mostrador calculados por MySQL. */
const indicadoresVenta = ref(null);

/** Histórico de facturas y sus filtros (se envían al backend). */
const ventasHistorial = ref([]);
const filtroTextoVenta = ref('');
const filtroCedulaVenta = ref('');
const filtroFechaDesdeVenta = ref('');
const filtroFechaHastaVenta = ref('');

/** Turno de caja abierto: condición obligatoria para poder cobrar. */
const cajaActiva = ref(null);

/** Datos capturados en el modal de cobro. */
const cobroVenta = ref({
  metodoPago: 'EFECTIVO',
  montoRecibido: 0,
  tasaCambio: '',
  referencia: ''
});

/** Factura que se muestra en el comprobante (venta recién emitida o consultada). */
const facturaActual = ref(null);

// ==========================================================================
// ESTADOS DE UI (Cargando / Éxito / Error)
// ==========================================================================
const estadoCargando = ref(false);
const cargandoHistorial = ref(false);
const cargandoFactura = ref(false);
const buscandoCliente = ref(false);
const enviandoVenta = ref(false);
const procesandoAnulacion = ref(false);

const mensajeErrorCarga = ref('');
const codigoErrorCarga = ref('');

/** Errores de validación del formulario de cobro. */
const erroresCobro = ref({});
/** Errores de validación de la identificación del cliente. */
const erroresCliente = ref({});

const notificaciones = ref([]);

// ==========================================================================
// SISTEMA DE NOTIFICACIONES TOAST
// ==========================================================================
const mostrarToast = (titulo, mensaje, tipo = 'success') => {
  const id = Date.now() + Math.random();

  notificaciones.value.push({ id, titulo, mensaje, tipo });

  // Autocierre a los 4 segundos para no saturar la pantalla del cajero.
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
// CONSULTAS AL API (todas con try/catch/finally)
// ==========================================================================

/**
 * CARGA LOS INDICADORES DEL MOSTRADOR (tarjetas KPI).
 * Los cálculos los hace MySQL (SUM, COUNT, AVG); aquí sólo se pintan.
 */
const cargarIndicadoresVenta = async () => {
  try {
    indicadoresVenta.value = await VentaServices.obtenerIndicadores();
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`Error al cargar los indicadores (${descripcion.codigo})`, descripcion.mensaje, 'error');
  }
};

/**
 * CARGA EL CATÁLOGO DE PRODUCTOS DE LA VITRINA.
 * Se piden sólo los activos: un artículo dado de baja no puede venderse.
 */
const cargarCatalogoProductos = async () => {
  try {
    productosCatalogo.value = await ProductoServices.listarProductos(false);
  } catch (error) {
    productosCatalogo.value = [];
    const descripcion = describirError(error);
    mostrarToast(`Error al cargar el catálogo (${descripcion.codigo})`, descripcion.mensaje, 'error');
  }
};

/**
 * CARGA EL HISTÓRICO DE FACTURAS.
 * Los filtros viajan como parámetros de consulta, de modo que el backend es
 * quien filtra sobre la base y no la memoria del navegador.
 */
const cargarHistorialVentas = async () => {
  cargandoHistorial.value = true;

  try {
    ventasHistorial.value = await VentaServices.listarVentas({
      texto: filtroTextoVenta.value.trim(),
      cedula: filtroCedulaVenta.value.trim(),
      fechaDesde: filtroFechaDesdeVenta.value,
      fechaHasta: filtroFechaHastaVenta.value
    });
  } catch (error) {
    ventasHistorial.value = [];
    const descripcion = describirError(error);
    mostrarToast(`Error al consultar las ventas (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    cargandoHistorial.value = false;
  }
};

/**
 * CONSULTA LA CAJA ACTIVA.
 * `null` NO es un error: significa que no hay turno abierto, en cuyo caso no se
 * permite cobrar (el backend rechazaría el pago con un 409/400).
 */
const cargarCajaActiva = async () => {
  try {
    cajaActiva.value = await CajaServices.obtenerCajaActiva();
  } catch (error) {
    cajaActiva.value = null;
    const descripcion = describirError(error);
    mostrarToast(`Error al consultar la caja (${descripcion.codigo})`, descripcion.mensaje, 'error');
  }
};

/**
 * CARGA INICIAL DE LA PÁGINA.
 * Las peticiones se lanzan EN PARALELO; si alguna falla se activa el panel de
 * Error persistente con su código HTTP y el botón "Reintentar".
 */
const cargarPaginaVentas = async () => {
  estadoCargando.value = true;
  mensajeErrorCarga.value = '';
  codigoErrorCarga.value = '';

  try {
    const [listaProductos, indicadores, listaVentas, caja] = await Promise.all([
      ProductoServices.listarProductos(false),
      VentaServices.obtenerIndicadores(),
      VentaServices.listarVentas({}),
      CajaServices.obtenerCajaActiva()
    ]);

    productosCatalogo.value = listaProductos;
    indicadoresVenta.value = indicadores;
    ventasHistorial.value = listaVentas;
    cajaActiva.value = caja;
  } catch (error) {
    const descripcion = describirError(error);

    codigoErrorCarga.value = descripcion.codigo;
    mensajeErrorCarga.value = descripcion.mensaje;

    mostrarToast(`Error al cargar el punto de venta (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    estadoCargando.value = false;
  }
};

onMounted(() => {
  cargarPaginaVentas();
});

/** Refresca TODO el módulo (se usa tras cada mutación). */
const refrescarModuloVentas = async () => {
  await Promise.all([
    cargarIndicadoresVenta(),
    cargarCatalogoProductos(),
    cargarHistorialVentas(),
    cargarCajaActiva()
  ]);
};

// ==========================================================================
// INDICADORES KPI DEL MOSTRADOR
// ==========================================================================
const montoVendidoHoy = computed(() => aDecimal(indicadoresVenta.value?.montoHoy));
const facturasDeHoy = computed(() => aNumero(indicadoresVenta.value?.facturasHoy));
const montoDelMes = computed(() => aDecimal(indicadoresVenta.value?.montoMes));
const montoHistorico = computed(() => aDecimal(indicadoresVenta.value?.montoHistorico));
const ticketPromedio = computed(() => aDecimal(indicadoresVenta.value?.ticketPromedio));
const totalFacturas = computed(() => aNumero(indicadoresVenta.value?.totalFacturas));
const totalUnidadesVendidas = computed(() => aNumero(indicadoresVenta.value?.totalUnidades));

// ==========================================================================
// VITRINA DE PRODUCTOS
// ==========================================================================
/** Productos que coinciden con el texto buscado (código, nombre o marca). */
const productosFiltrados = computed(() => {
  const texto = textoBusquedaProducto.value.trim().toLowerCase();

  if (!texto) return productosCatalogo.value;

  return productosCatalogo.value.filter((producto) =>
    String(producto.codigo).toLowerCase().includes(texto)
    || String(producto.nombre).toLowerCase().includes(texto)
    || String(producto.marca).toLowerCase().includes(texto)
    || String(producto.nombre_categoria).toLowerCase().includes(texto)
  );
});

/**
 * CLASIFICA LA SITUACIÓN DE STOCK DE UN PRODUCTO.
 * Los umbrales son los mismos que usa el backend: agotado (0 unidades) y bajo
 * mínimo (existencia por debajo o igual al stock mínimo configurado).
 */
const estadoStockProducto = (producto) => {
  const existencia = aNumero(producto.existencia);
  const minimo = aNumero(producto.minimo);

  if (existencia <= 0) return { clave: 'agotado', etiqueta: 'Agotado', clase: 'badge-out' };
  if (existencia <= minimo) return { clave: 'bajo', etiqueta: 'Bajo mínimo', clase: 'badge-low' };

  return { clave: 'disponible', etiqueta: 'Disponible', clase: 'badge-ok' };
};

/** Ancho de la barra del medidor de stock (referencia: el doble del mínimo). */
const anchoMedidorStock = (producto) => {
  const referencia = Math.max(aNumero(producto.minimo) * 2, 1);
  return `${Math.min(100, (aNumero(producto.existencia) / referencia) * 100)}%`;
};

/** Color de la barra del medidor según la criticidad del stock. */
const colorMedidorStock = (producto) => {
  const clave = estadoStockProducto(producto).clave;

  if (clave === 'agotado') return 'var(--color-danger)';
  if (clave === 'bajo') return 'var(--color-warning)';

  return 'var(--brand-primary)';
};

/** Ruta pública de la imagen del producto (carpeta `public/assets/img/productos`). */
const rutaImagenProducto = (imagen) => `/assets/img/productos/${imagen || 'pantalla.jpg'}`;

// ==========================================================================
// CARRITO DE VENTA
// ==========================================================================
/** Unidades totales del carrito. */
const unidadesCarrito = computed(() =>
  carritoVenta.value.reduce((suma, linea) => suma + aNumero(linea.cantidad), 0)
);

/**
 * TOTAL DEL CARRITO (REFERENCIA).
 * PROPÓSITO TÉCNICO: es una multiplicación local precio x cantidad sobre el
 * precio de venta del catálogo. El importe DEFINITIVO lo recalcula el servidor
 * con el precio almacenado en la base de datos al confirmar el cobro.
 */
const totalCarrito = computed(() =>
  aDecimal(carritoVenta.value.reduce(
    (suma, linea) => suma + aDecimal(linea.precio) * aNumero(linea.cantidad),
    0
  ))
);

/** Equivalente en bolívares con la tasa escrita por el cajero. */
const totalCarritoBolivares = computed(() => aDecimal(totalCarrito.value * aNumero(cobroVenta.value.tasaCambio)));

/** Busca una línea del carrito por el código del producto. */
const buscarLineaCarrito = (codigo) => carritoVenta.value.find((linea) => linea.codigo === codigo) || null;

/**
 * AGREGA UN PRODUCTO AL CARRITO.
 * Si el artículo ya está en el carrito se suma una unidad, respetando siempre la
 * existencia disponible (el backend volvería a rechazar la venta sin stock).
 */
const agregarAlCarrito = (producto) => {
  const existencia = aNumero(producto.existencia);

  if (existencia <= 0) {
    mostrarToast('Producto agotado', `${producto.nombre} no tiene existencia disponible en el almacén.`, 'warning');
    return;
  }

  const lineaExistente = buscarLineaCarrito(producto.codigo);

  if (lineaExistente) {
    if (aNumero(lineaExistente.cantidad) >= existencia) {
      mostrarToast(
        'Existencia insuficiente',
        `Sólo hay ${existencia} unidad(es) de ${producto.nombre} en el almacén.`,
        'warning'
      );
      return;
    }

    lineaExistente.cantidad = aNumero(lineaExistente.cantidad) + 1;
    return;
  }

  carritoVenta.value.push({
    codigo: producto.codigo,
    nombre: producto.nombre,
    imagen: producto.imagen,
    marca: producto.marca,
    precio: aDecimal(producto.precio),
    existencia,
    cantidad: 1
  });
};

/** Suma una unidad a la línea, avisando si se alcanzó el tope de existencia. */
const incrementarCantidad = (linea) => {
  if (aNumero(linea.cantidad) >= aNumero(linea.existencia)) {
    mostrarToast(
      'Existencia insuficiente',
      `No puede vender más de ${linea.existencia} unidad(es) de ${linea.nombre}.`,
      'warning'
    );
    return;
  }

  linea.cantidad = aNumero(linea.cantidad) + 1;
};

/** Resta una unidad a la línea (la línea desaparece al llegar a cero). */
const disminuirCantidad = (linea) => {
  if (aNumero(linea.cantidad) <= 1) {
    quitarLineaCarrito(linea.codigo);
    return;
  }

  linea.cantidad = aNumero(linea.cantidad) - 1;
};

/**
 * FIJA LA CANTIDAD ESCRITA A MANO EN EL INPUT.
 * Se valida contra la existencia disponible y se avisa cuando el cajero intenta
 * superarla; el valor se recorta al máximo permitido.
 */
const fijarCantidad = (linea, valorNuevo) => {
  const cantidad = Math.trunc(aNumero(valorNuevo));
  const existencia = aNumero(linea.existencia);

  if (cantidad > existencia) {
    mostrarToast(
      'Cantidad ajustada al stock',
      `${linea.nombre}: sólo hay ${existencia} unidad(es) disponibles.`,
      'warning'
    );
    linea.cantidad = existencia;
    return;
  }

  if (cantidad <= 0) {
    quitarLineaCarrito(linea.codigo);
    return;
  }

  linea.cantidad = cantidad;
};

/** Quita una línea completa del carrito. */
const quitarLineaCarrito = (codigo) => {
  carritoVenta.value = carritoVenta.value.filter((linea) => linea.codigo !== codigo);
};

/** Vacía el carrito completo (se usa al facturar o con el botón "Vaciar"). */
const vaciarCarrito = () => {
  carritoVenta.value = [];
};

// ==========================================================================
// IDENTIFICACIÓN DEL CLIENTE
// ==========================================================================
/**
 * NORMALIZA UNA CÉDULA.
 * PROPÓSITO TÉCNICO: la cédula es la llave primaria del cliente en MySQL. Se
 * eliminan puntos, guiones y espacios, y se pasa a mayúsculas, para que
 * "V-12.345.678" y "v12345678" consulten el mismo registro.
 */
const normalizarCedula = (valor) => String(valor || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');

/** Al escribir una cédula distinta se descarta el cliente antes encontrado. */
const alCambiarCedula = () => {
  clienteRegistrado.value = null;
  clienteBuscado.value = false;
  erroresCliente.value = {};
};

/**
 * BUSCA EL CLIENTE POR SU CÉDULA.
 * Si existe se autocompletan sus datos; si no existe se avisa de que se
 * registrará como cliente nuevo al confirmar la venta.
 */
const buscarClientePorCedula = async () => {
  const cedula = normalizarCedula(datosCliente.value.cedula);

  if (!cedula) {
    erroresCliente.value = { cedula: 'Escriba la cédula del cliente para buscarlo.' };
    mostrarToast('Cédula requerida', 'Escriba la cédula del cliente antes de buscarlo.', 'warning');
    return;
  }

  erroresCliente.value = {};
  buscandoCliente.value = true;

  try {
    const cliente = await ClienteServices.buscarCliente(cedula);

    clienteBuscado.value = true;
    datosCliente.value.cedula = cedula;

    if (cliente) {
      clienteRegistrado.value = cliente;
      datosCliente.value = {
        cedula: cliente.cedula,
        nombre: cliente.nombre,
        apellido: cliente.apellido,
        telefono: cliente.telefono,
        direccion: cliente.direccion
      };

      mostrarToast(
        'Cliente registrado',
        `${cliente.nombreCompleto} · ${cliente.totalCompras} compra(s) y ${cliente.totalDispositivos} equipo(s) registrados.`,
        'info'
      );
      return;
    }

    // El servicio devuelve null (no lanza) cuando el backend responde 404.
    clienteRegistrado.value = null;
    mostrarToast(
      'Cliente nuevo',
      'No existe un cliente con esa cédula. Complete nombre y apellido: se registrará al facturar.',
      'warning'
    );
  } catch (error) {
    clienteRegistrado.value = null;
    const descripcion = describirError(error);
    mostrarToast(`Error al buscar el cliente (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    buscandoCliente.value = false;
  }
};

/** Estado visual de la identificación del cliente (badge informativo). */
const estadoIdentificacionCliente = computed(() => {
  if (!String(datosCliente.value.cedula).trim()) {
    return {
      clase: 'badge-neutral',
      icono: 'bi-person-dash',
      etiqueta: 'Sin identificar',
      detalle: 'Escriba la cédula y pulse "Buscar" para consultar la cartera de clientes.'
    };
  }

  if (clienteRegistrado.value) {
    return {
      clase: 'badge-ok',
      icono: 'bi-person-check',
      etiqueta: 'Cliente registrado',
      detalle: `Facturando a ${clienteRegistrado.value.nombreCompleto}.`
    };
  }

  if (clienteBuscado.value) {
    return {
      clase: 'badge-review',
      icono: 'bi-person-plus',
      etiqueta: 'Se registrará como cliente nuevo',
      detalle: 'La cédula no existe en la cartera: el backend creará el cliente con estos datos.'
    };
  }

  return {
    clase: 'badge-info',
    icono: 'bi-person-lines-fill',
    etiqueta: 'Cédula por consultar',
    detalle: 'Pulse "Buscar" para saber si el cliente ya está registrado.'
  };
});

/** Limpia el formulario del cliente para atender al siguiente comprador. */
const limpiarCliente = () => {
  datosCliente.value = { cedula: '', nombre: '', apellido: '', telefono: '', direccion: '' };
  clienteRegistrado.value = null;
  clienteBuscado.value = false;
  erroresCliente.value = {};
};

// ==========================================================================
// MODAL DE COBRO
// ==========================================================================
/** Método de pago elegido (objeto completo de METODOS_PAGO). */
const metodoPagoElegido = computed(() =>
  METODOS_PAGO.find((metodo) => metodo.valor === cobroVenta.value.metodoPago) || METODOS_PAGO[0]
);

/** ¿El método elegido exige un número de referencia? (pago móvil, punto, etc.) */
const referenciaObligatoria = computed(() => Boolean(metodoPagoElegido.value?.exigeReferencia));

/** ¿El método de pago exige tasa BCV? Solo pago móvil, transferencias, punto, etc. Efectivo y divisas no la exigen. */
const exigeTasaBcv = computed(() => metodoRequiereTasa(cobroVenta.value.metodoPago));

/**
 * ABRE EL MODAL DE COBRO.
 * Antes de abrirlo se comprueba que exista un turno de caja abierto: sin caja
 * el cobro no puede registrarse, porque el pago debe quedar asociado al turno.
 */
const abrirModalCobro = () => {
  if (carritoVenta.value.length === 0) {
    mostrarToast('Carrito vacío', 'Agregue al menos un producto antes de procesar el cobro.', 'warning');
    return;
  }

  erroresCobro.value = {};

  // El monto se precarga con el total del carrito; el backend rechaza (400) si
  // el monto cobrado no coincide con el total calculado del catálogo.
  cobroVenta.value = {
    metodoPago: 'EFECTIVO',
    montoRecibido: totalCarrito.value,
    tasaCambio: cobroVenta.value.tasaCambio || '',
    referencia: ''
  };

  abrirModal('modalCobroVenta');
};

/**
 * VALIDA EL FORMULARIO DE COBRO EN EL CLIENTE.
 * Es una réplica de las reglas del backend para dar respuesta inmediata; el
 * servidor vuelve a validar y es la autoridad final.
 */
const validarCobro = () => {
  const errores = {};

  const cedula = normalizarCedula(datosCliente.value.cedula);

  if (!cedula) {
    errores.cedula = 'La cédula del cliente es obligatoria para emitir la factura.';
  }

  if (!String(datosCliente.value.nombre).trim()) {
    errores.nombre = 'El nombre del cliente es obligatorio.';
  }

  if (!String(datosCliente.value.apellido).trim()) {
    errores.apellido = 'El apellido del cliente es obligatorio.';
  }

  if (!metodoPagoElegido.value) {
    errores.metodoPago = 'Seleccione un método de pago admitido.';
  }

  if (aNumero(cobroVenta.value.montoRecibido) <= 0) {
    errores.montoRecibido = 'Indique el monto cobrado en dólares (mayor que cero).';
  }

  if (exigeTasaBcv.value && aNumero(cobroVenta.value.tasaCambio) <= 0) {
    errores.tasaCambio = 'Indique la tasa de cambio aplicada (Bs por USD).';
  }

  if (referenciaObligatoria.value && !String(cobroVenta.value.referencia).trim()) {
    errores.referencia = `El método ${metodoPagoElegido.value.etiqueta} exige el número de referencia.`;
  }

  erroresCobro.value = errores;
  return Object.keys(errores).length === 0;
};

/** Mensaje de error acumulado del cliente (para el panel del modal de cobro). */
const mensajeErrorCobro = computed(() => Object.values(erroresCobro.value)[0] || '');

/**
 * CONFIRMA LA VENTA.
 *
 * PROPÓSITO FUNCIONAL: envía al backend el cliente, el carrito, el pago y la
 * caja activa. El backend, dentro de una transacción SQL, descuenta el stock,
 * registra la salida con origen "VENTA", guarda el pago, emite la factura y
 * dispara las alertas de stock mínimo cuando corresponde.
 */
const confirmarCobroVenta = async () => {
  if (enviandoVenta.value) return;

  if (!validarCobro()) {
    mostrarToast('Revise el formulario de cobro', mensajeErrorCobro.value, 'warning');
    return;
  }

  if (!cajaActiva.value) {
    mostrarToast(
      'No hay caja abierta',
      'Debe abrir un turno de caja en el módulo Caja antes de poder cobrar.',
      'error'
    );
    return;
  }

  // Se congelan los valores del carrito antes de vaciarlo, para poder construir
  // el comprobante aunque el carrito ya esté limpio.
  const totalConfirmado = totalCarrito.value;
  const lineasConfirmadas = carritoVenta.value.map((linea) => ({ ...linea }));
  const clienteConfirmado = { ...datosCliente.value };

  enviandoVenta.value = true;

  try {
    const resultado = await VentaServices.registrarVenta({
      cedula: normalizarCedula(clienteConfirmado.cedula),
      nombre: String(clienteConfirmado.nombre).trim(),
      apellido: String(clienteConfirmado.apellido).trim(),
      telefono: String(clienteConfirmado.telefono).trim(),
      direccion: String(clienteConfirmado.direccion).trim(),
      carrito: carritoVenta.value.map((linea) => ({ codigo: linea.codigo, cantidad: aNumero(linea.cantidad) })),
      metodoPago: cobroVenta.value.metodoPago,
      monto: aNumero(cobroVenta.value.montoRecibido),
      tasaCambio: exigeTasaBcv.value ? aNumero(cobroVenta.value.tasaCambio) : 1.00,
      referencia: String(cobroVenta.value.referencia).trim(),
      idCaja: cajaActiva.value.id
    });

    // ---- ESTADO DE ÉXITO: se cierra el cobro y se vacía el carrito ----
    cerrarModal('modalCobroVenta');
    vaciarCarrito();

    const facturaEmitida = resultado.factura || {};

    mostrarToast(
      `Venta registrada · Factura N° ${facturaEmitida.numero_factura || '—'}`,
      `${resultado.esClienteNuevo ? 'Cliente nuevo registrado. ' : ''}`
        + `Total ${formatearMoneda(facturaEmitida.monto_total ?? totalConfirmado)} `
        + `pagado con ${etiquetaMetodoPago(cobroVenta.value.metodoPago)}.`,
      'success'
    );

    // ---- ALERTA AUTOMÁTICA DE STOCK MÍNIMO ----
    // El backend devuelve las alertas que disparó el propio descuento de stock.
    if (Array.isArray(resultado.alertas) && resultado.alertas.length > 0) {
      const primeraAlerta = resultado.alertas[0];
      const hayProductoAgotado = resultado.alertas.some((alerta) => aNumero(alerta.existencia) <= 0);
      // El aviso se pinta en rojo si algún artículo se agotó y en ámbar si sólo
      // quedó por debajo del mínimo configurado.
      const tipoAvisoStock = hayProductoAgotado ? 'error' : 'warning';

      mostrarToast(
        hayProductoAgotado ? 'Producto agotado tras la venta' : 'Alerta de stock mínimo',
        `${primeraAlerta.mensaje} `
          + `(${resultado.alertas.length} alerta(s) registrada(s) automáticamente en el sistema.)`,
        tipoAvisoStock
      );
    }

    // ---- Se arma el comprobante con los datos reales de la respuesta ----
    facturaActual.value = {
      numero: facturaEmitida.numero_factura,
      fecha: facturaEmitida.fecha,
      cliente: facturaEmitida.nombre_cliente
        || `${clienteConfirmado.nombre} ${clienteConfirmado.apellido}`.trim(),
      cedula: facturaEmitida.cedula_cli || normalizarCedula(clienteConfirmado.cedula),
      telefono: clienteConfirmado.telefono,
      total: aDecimal(facturaEmitida.monto_total ?? totalConfirmado),
      tasaCambio: aDecimal(facturaEmitida.tasa_cambio ?? cobroVenta.value.tasaCambio),
      totalBolivares: aDecimal(facturaEmitida.total_bolivares),
      metodoPago: facturaEmitida.metodo_pago || cobroVenta.value.metodoPago,
      referencia: facturaEmitida.referencia || cobroVenta.value.referencia,
      idCaja: facturaEmitida.id_caja || cajaActiva.value.id,
      lineas: resultado.detalle || [],
      movimientos: resultado.movimientos || [],
      clienteNuevo: resultado.esClienteNuevo
    };

    // Se limpia la identificación del cliente para el siguiente comprador y se
    // refresca el módulo completo (stock, KPI e histórico).
    limpiarCliente();
    await refrescarModuloVentas();

    // El comprobante se abre al final, cuando la página ya está actualizada.
    abrirModal('modalFacturaVenta');
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`Venta rechazada (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    enviandoVenta.value = false;
  }
};

// ==========================================================================
// FACTURA (consulta del histórico y consulta del comprobante)
// ==========================================================================
/**
 * ABRE LA FACTURA DE UNA VENTA DEL HISTÓRICO.
 * `obtenerVenta` devuelve null ante un 404, por lo que se avisa sin romper la UI.
 */
const abrirFacturaDeVenta = async (venta) => {
  cargandoFactura.value = true;

  try {
    const consulta = await VentaServices.obtenerVenta(venta.numeroFactura);

    if (!consulta) {
      mostrarToast(
        'Factura no encontrada',
        `El servidor no devolvió la factura N° ${venta.numeroFactura}.`,
        'warning'
      );
      return;
    }

    const pago = consulta.pago || {};

    facturaActual.value = {
      numero: consulta.venta.numeroFactura,
      fecha: consulta.venta.fecha,
      cliente: consulta.venta.cliente,
      cedula: consulta.venta.cedula,
      telefono: consulta.venta.telefono,
      total: consulta.venta.total,
      tasaCambio: aDecimal(pago.tasa_cambio),
      // El equivalente en bolívares se deriva del pago real (USD x tasa).
      totalBolivares: aDecimal(aNumero(pago.monto_usd) * aNumero(pago.tasa_cambio)),
      metodoPago: pago.metodo_pago || consulta.venta.metodoPago,
      referencia: pago.referencia || '',
      idCaja: pago.id_caja || null,
      lineas: consulta.detalle,
      movimientos: [],
      anulada: consulta.venta.anulada
    };

    abrirModal('modalFacturaVenta');
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`Error al consultar la factura (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    cargandoFactura.value = false;
  }
};

/** Total en bolívares del comprobante abierto. */
const totalFacturaBolivares = computed(() => {
  if (!facturaActual.value) return 0;

  return aDecimal(facturaActual.value.totalBolivares
    || aNumero(facturaActual.value.total) * aNumero(facturaActual.value.tasaCambio));
});

/** Totales del comprobante calculados a partir de sus líneas. */
const resumenFactura = computed(() => {
  const lineas = facturaActual.value?.lineas || [];

  return {
    cantidadLineas: lineas.length,
    totalUnidades: lineas.reduce((suma, linea) => suma + aNumero(linea.cantidad), 0),
    montoLineas: aDecimal(lineas.reduce((suma, linea) => suma + aDecimal(linea.subtotal), 0))
  };
});

// ==========================================================================
// ANULACIÓN DE FACTURAS
// ==========================================================================
/**
 * ANULA UNA FACTURA CON SU MOTIVO.
 *
 * PROPÓSITO FUNCIONAL: la anulación es irreversible y devuelve los productos al
 * inventario, por lo que se exige un motivo (auditoría) y una confirmación
 * explícita antes de enviar la petición.
 */
const anularVentaConMotivo = async (venta) => {
  if (venta.anulada) {
    mostrarToast('Factura ya anulada', `La factura N° ${venta.numeroFactura} figura como anulada.`, 'info');
    return;
  }

  const motivo = window.prompt(
    `Motivo de la anulación de la factura N° ${venta.numeroFactura} (obligatorio):`,
    ''
  );

  // El usuario canceló el cuadro de diálogo.
  if (motivo === null) return;

  if (!String(motivo).trim()) {
    mostrarToast('Motivo obligatorio', 'La anulación exige un motivo para quedar auditada.', 'warning');
    return;
  }

  const confirmado = window.confirm(
    `¿Confirma anular la factura N° ${venta.numeroFactura} por ${formatearMoneda(venta.total)}?\n`
    + 'Los productos volverán al inventario y la operación no puede deshacerse.'
  );

  if (!confirmado) return;

  procesandoAnulacion.value = true;

  try {
    const resultado = await VentaServices.anularVenta(venta.numeroFactura, String(motivo).trim());

    mostrarToast(
      `Factura N° ${resultado.numFactura || venta.numeroFactura} anulada`,
      `${resultado.mensaje || 'La venta fue anulada.'} Monto anulado: ${formatearMoneda(resultado.montoAnulado)}.`,
      'success'
    );

    await refrescarModuloVentas();
  } catch (error) {
    const descripcion = describirError(error);
    mostrarToast(`No se pudo anular la factura (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    procesandoAnulacion.value = false;
  }
};

// ==========================================================================
// FILTROS DEL HISTÓRICO
// ==========================================================================
/** Limpia todos los filtros y vuelve a consultar el histórico completo. */
const limpiarFiltrosVentas = async () => {
  filtroTextoVenta.value = '';
  filtroCedulaVenta.value = '';
  filtroFechaDesdeVenta.value = '';
  filtroFechaHastaVenta.value = '';

  await cargarHistorialVentas();
};

/** Imprime el comprobante de la factura abierta. */
const imprimirFactura = () => {
  window.print();
};
</script>

<template>
  <main class="content" id="contenido">
    <!-- ================= ESTADO DE ÉXITO / ERROR (pila de Toasts) ================= -->
    <ToastNotificaciones :notificaciones="notificaciones" @cerrar="cerrarToastPorId" />

    <div class="page-head">
      <div>
        <h2>Venta directa de mostrador</h2>
        <p>
          Carrito, identificación del cliente, cobro con turno de caja abierto y emisión de la factura.
          La salida de inventario se registra automáticamente con el origen «Venta».
        </p>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-outline-primary d-flex align-items-center gap-2" type="button" @click="abrirModal('modalReporteVentas')">
          <i class="bi bi-file-earmark-bar-graph"></i>
          <span>Generar Reporte</span>
        </button>
        <button class="btn btn-outline-secondary" type="button" :disabled="estadoCargando" @click="refrescarModuloVentas">
          <span v-if="estadoCargando" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
          <i v-else class="bi bi-arrow-clockwise"></i> Actualizar
        </button>
      </div>
    </div>

    <!-- ================= ESTADO DE CARGA ================= -->
    <LoadingSpinner
      v-if="estadoCargando && productosCatalogo.length === 0 && ventasHistorial.length === 0"
      mensaje="Cargando el punto de venta desde la base de datos..."
    />

    <template v-else>
      <!-- ================= ESTADO DE ERROR PERSISTENTE ================= -->
      <div v-if="mensajeErrorCarga" class="readonly-note" role="alert">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span><strong>{{ codigoErrorCarga }}</strong> · {{ mensajeErrorCarga }}</span>
        <button class="btn btn-sm btn-outline-danger ms-auto" type="button" @click="cargarPaginaVentas">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button>
      </div>

      <!-- ================= INDICADORES KPI DEL MOSTRADOR ================= -->
      <section class="row g-3 mb-3">
        <div class="col-6 col-lg-4 col-xl">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Ventas de hoy</p>
              <i class="bi bi-cash-stack kpi__icon" style="color:var(--color-success)"></i>
            </div>
            <p class="kpi__value">{{ formatearMoneda(montoVendidoHoy) }}</p>
            <p class="kpi__meta">{{ facturasDeHoy }} factura(s) emitida(s) en el día</p>
          </div>
        </div>

        <div class="col-6 col-lg-4 col-xl">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Facturación del mes</p>
              <i class="bi bi-graph-up-arrow kpi__icon"></i>
            </div>
            <p class="kpi__value">{{ formatearMoneda(montoDelMes) }}</p>
            <p class="kpi__meta">Histórico acumulado: {{ formatearMoneda(montoHistorico) }}</p>
          </div>
        </div>

        <div class="col-6 col-lg-4 col-xl">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Ticket promedio</p>
              <i class="bi bi-receipt-cutoff kpi__icon"></i>
            </div>
            <p class="kpi__value">{{ formatearMoneda(ticketPromedio) }}</p>
            <p class="kpi__meta">Promedio por factura de todo el histórico</p>
          </div>
        </div>

        <div class="col-6 col-lg-4 col-xl">
          <div class="kpi">
            <div class="kpi__top">
              <p class="kpi__label">Total de facturas</p>
              <i class="bi bi-journal-text kpi__icon"></i>
            </div>
            <p class="kpi__value">{{ totalFacturas }}</p>
            <p class="kpi__meta">Comprobantes emitidos por el mostrador</p>
          </div>
        </div>

        <div class="col-12 col-lg-4 col-xl">
          <div class="kpi kpi--featured">
            <div class="kpi__top">
              <p class="kpi__label">Unidades vendidas</p>
              <i class="bi bi-box-seam kpi__icon"></i>
            </div>
            <p class="kpi__value">{{ totalUnidadesVendidas }}</p>
            <p class="kpi__meta">Artículos descontados del inventario por venta directa</p>
            <div class="progress-thin"><span style="width:100%"></span></div>
          </div>
        </div>
      </section>

      <!-- ================= MOSTRADOR: VITRINA + CARRITO ================= -->
      <section class="row g-3 mb-3">
        <!-- ---------------- COLUMNA IZQUIERDA · CATÁLOGO ---------------- -->
        <div class="col-lg-7">
          <div class="card-ts h-100">
            <div class="card-ts__head">
              <div>
                <h3 class="card-ts__title">Catálogo de productos</h3>
                <p class="card-ts__sub">{{ productosFiltrados.length }} artículo(s) disponible(s) para la venta</p>
              </div>
            </div>

            <div class="toolbar">
              <div class="input-icon">
                <i class="bi bi-search" aria-hidden="true"></i>
                <input
                  class="form-control"
                  v-model="textoBusquedaProducto"
                  type="search"
                  placeholder="Buscar por nombre, código, marca o categoría"
                  aria-label="Buscar productos del catálogo"
                >
              </div>
              <button class="btn btn-ghost btn-sm" type="button" @click="textoBusquedaProducto = ''">
                <i class="bi bi-x-circle"></i> Limpiar
              </button>
            </div>

            <!-- Sub-estado: el buscador no encontró coincidencias -->
            <div v-if="productosFiltrados.length === 0" class="empty-state">
              <i class="bi bi-box2"></i>
              <h3>No hay productos que coincidan</h3>
              <p class="small">
                {{ productosCatalogo.length === 0
                  ? 'El catálogo no tiene artículos activos. Regístrelos en el módulo de Inventario.'
                  : 'Pruebe con otro nombre, código o marca.' }}
              </p>
            </div>

            <div v-else class="product-grid">
              <article v-for="producto in productosFiltrados" :key="producto.codigo" class="product-card">
                <div class="product-card__media">
                  <img :src="rutaImagenProducto(producto.imagen)" :alt="producto.nombre">
                  <span class="badge-ts" :class="estadoStockProducto(producto).clase">
                    {{ estadoStockProducto(producto).etiqueta }}
                  </span>
                  <span class="cat">{{ producto.nombre_categoria }}</span>
                </div>

                <div class="product-card__body">
                  <span class="brand">{{ producto.marca || 'Sin marca' }}</span>
                  <h3>{{ producto.nombre }}</h3>
                  <span class="code-chip">{{ producto.codigo }}</span>

                  <div class="product-card__price">
                    <strong>{{ formatearMoneda(producto.precio) }}</strong>
                    <span>{{ producto.existencia }} u. en almacén</span>
                  </div>

                  <div class="stock-meter">
                    <span
                      :style="{ width: anchoMedidorStock(producto), background: colorMedidorStock(producto) }"
                    ></span>
                  </div>
                  <p class="form-text mb-0">Mínimo {{ producto.minimo }} u.</p>
                </div>

                <div class="product-card__foot">
                  <button
                    class="btn btn-primary btn-sm"
                    type="button"
                    :disabled="Number(producto.existencia) <= 0"
                    @click="agregarAlCarrito(producto)"
                  >
                    <i class="bi bi-cart-plus"></i>
                    {{ Number(producto.existencia) <= 0 ? 'Agotado' : 'Agregar' }}
                  </button>
                </div>
              </article>
            </div>
          </div>
        </div>

        <!-- ---------------- COLUMNA DERECHA · CLIENTE + CARRITO ---------------- -->
        <div class="col-lg-5">
          <div class="d-flex flex-column gap-3 h-100">
            <!-- ---- SECCIÓN DE CLIENTE ---- -->
            <div class="card-ts">
              <div class="card-ts__head">
                <div>
                  <h3 class="card-ts__title">Cliente</h3>
                  <p class="card-ts__sub">Identifíquelo por su cédula antes de cobrar</p>
                </div>
                <span class="badge-ts" :class="estadoIdentificacionCliente.clase">
                  <i class="bi" :class="estadoIdentificacionCliente.icono"></i>
                  {{ estadoIdentificacionCliente.etiqueta }}
                </span>
              </div>

              <div class="card-ts__body">
                <div class="row g-3">
                  <div class="col-12">
                    <label class="form-label" for="venta-cliente-cedula">Cédula*</label>
                    <div class="d-flex gap-2">
                      <input
                        id="venta-cliente-cedula"
                        class="form-control"
                        :class="{ 'is-invalid': erroresCliente.cedula }"
                        v-model="datosCliente.cedula"
                        placeholder="V-12345678"
                        @input="alCambiarCedula"
                        @keyup.enter="buscarClientePorCedula"
                      >
                      <button
                        class="btn btn-outline-secondary"
                        type="button"
                        :disabled="buscandoCliente"
                        @click="buscarClientePorCedula"
                      >
                        <span v-if="buscandoCliente" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        <i v-else class="bi bi-search"></i>
                        Buscar
                      </button>
                    </div>
                    <div v-if="erroresCliente.cedula" class="invalid-feedback d-block">{{ erroresCliente.cedula }}</div>
                    <div v-else class="form-text">{{ estadoIdentificacionCliente.detalle }}</div>
                  </div>

                  <div class="col-md-6">
                    <label class="form-label" for="venta-cliente-nombre">Nombre*</label>
                    <input id="venta-cliente-nombre" class="form-control" v-model="datosCliente.nombre" placeholder="Nombre">
                  </div>

                  <div class="col-md-6">
                    <label class="form-label" for="venta-cliente-apellido">Apellido*</label>
                    <input id="venta-cliente-apellido" class="form-control" v-model="datosCliente.apellido" placeholder="Apellido">
                  </div>

                  <div class="col-md-6">
                    <label class="form-label" for="venta-cliente-telefono">Teléfono</label>
                    <input id="venta-cliente-telefono" class="form-control" v-model="datosCliente.telefono" placeholder="0414-0000000">
                  </div>

                  <div class="col-md-6">
                    <label class="form-label" for="venta-cliente-direccion">Dirección</label>
                    <input id="venta-cliente-direccion" class="form-control" v-model="datosCliente.direccion" placeholder="Dirección del cliente">
                  </div>
                </div>
              </div>
            </div>

            <!-- ---- CARRITO DE VENTA ---- -->
            <div class="card-ts flex-grow-1 d-flex flex-column">
              <div class="card-ts__head">
                <div>
                  <h3 class="card-ts__title">Carrito de venta</h3>
                  <p class="card-ts__sub">
                    {{ unidadesCarrito }} unidad(es) en {{ carritoVenta.length }} línea(s)
                  </p>
                </div>
                <button
                  class="btn btn-ghost btn-sm"
                  type="button"
                  :disabled="carritoVenta.length === 0"
                  @click="vaciarCarrito"
                >
                  <i class="bi bi-trash3"></i> Vaciar
                </button>
              </div>

              <div class="card-ts__body flex-grow-1 d-flex flex-column">
                <!-- Sub-estado: carrito vacío -->
                <div v-if="carritoVenta.length === 0" class="empty-state py-4">
                  <i class="bi bi-cart"></i>
                  <h3>El carrito está vacío</h3>
                  <p class="small">Agregue productos del catálogo para iniciar la venta.</p>
                </div>

                <template v-else>
                  <div>
                    <div
                      v-for="linea in carritoVenta"
                      :key="linea.codigo"
                      class="d-flex align-items-center gap-2 py-2"
                      style="border-bottom:1px solid var(--border-color);"
                    >
                      <img
                        :src="rutaImagenProducto(linea.imagen)"
                        :alt="linea.nombre"
                        style="width:42px;height:42px;border-radius:8px;object-fit:cover;flex-shrink:0;"
                      >

                      <div class="flex-grow-1" style="min-width:0;">
                        <strong class="d-block small text-truncate" :title="linea.nombre">{{ linea.nombre }}</strong>
                        <small class="text-muted-2">
                          {{ formatearMoneda(linea.precio) }} · disp. {{ linea.existencia }} u.
                        </small>
                      </div>

                      <!-- Control de cantidad: nunca supera la existencia disponible -->
                      <div class="d-flex align-items-center gap-1">
                        <button class="btn btn-ghost btn-icon btn-sm" type="button" title="Quitar una unidad" @click="disminuirCantidad(linea)">
                          <i class="bi bi-dash-lg"></i>
                        </button>
                        <input
                          class="form-control form-control-sm text-center tabular"
                          type="number"
                          min="1"
                          :max="linea.existencia"
                          style="width:72px;"
                          :value="linea.cantidad"
                          aria-label="Cantidad a vender"
                          @change="fijarCantidad(linea, $event.target.value)"
                        >
                        <button class="btn btn-ghost btn-icon btn-sm" type="button" title="Agregar una unidad" @click="incrementarCantidad(linea)">
                          <i class="bi bi-plus-lg"></i>
                        </button>
                      </div>

                      <div class="text-end" style="min-width:84px;">
                        <strong class="tabular d-block">{{ formatearMoneda(linea.precio * linea.cantidad) }}</strong>
                        <button
                          class="btn btn-ghost btn-icon btn-sm btn-ghost-danger"
                          type="button"
                          title="Quitar del carrito"
                          @click="quitarLineaCarrito(linea.codigo)"
                        >
                          <i class="bi bi-x-lg"></i>
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- ---- TOTAL DE REFERENCIA Y COBRO ---- -->
                  <div class="mt-auto pt-3">
                    <div class="p-3" style="background:var(--surface-soft);border-radius:var(--radius-md);">
                      <div class="d-flex justify-content-between align-items-center">
                        <span class="fw-semibold">TOTAL del carrito</span>
                        <strong class="tabular fs-5">{{ formatearMoneda(totalCarrito) }}</strong>
                      </div>
                      <p class="form-text mb-0 mt-1">
                        <i class="bi bi-info-circle"></i>
                        Total de referencia: el <strong>total definitivo lo calcula el servidor</strong>
                        con el precio del catálogo al confirmar el cobro.
                      </p>
                    </div>

                    <!-- Aviso de turno de caja: sin caja abierta no se puede cobrar -->
                    <div v-if="!cajaActiva" class="readonly-note mt-3 mb-0" role="alert">
                      <i class="bi bi-exclamation-triangle-fill"></i>
                      <span>
                        No hay ningún turno de caja abierto. Ábralo en el módulo
                        <router-link to="/caja">Caja</router-link> para poder cobrar.
                      </span>
                    </div>

                    <button
                      class="btn btn-primary w-100 mt-3"
                      type="button"
                      :disabled="carritoVenta.length === 0 || enviandoVenta || !cajaActiva"
                      @click="abrirModalCobro"
                    >
                      <i class="bi bi-cash-coin"></i> Procesar cobro
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ================= HISTÓRICO DE VENTAS ================= -->
      <section class="card-ts">
        <div class="card-ts__head">
          <div>
            <h3 class="card-ts__title">Historial de ventas</h3>
            <p class="card-ts__sub">
              Facturas emitidas por el mostrador · {{ ventasHistorial.length }} registro(s) mostrado(s)
            </p>
          </div>
        </div>

        <div class="toolbar">
          <div class="input-icon">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input
              class="form-control"
              v-model="filtroTextoVenta"
              type="search"
              placeholder="Buscar por número de factura o cliente"
              aria-label="Buscar en el historial de ventas"
              @keyup.enter="cargarHistorialVentas"
            >
          </div>

          <input
            class="form-control"
            v-model="filtroCedulaVenta"
            placeholder="Cédula del cliente"
            aria-label="Filtrar por cédula"
            style="max-width:200px;"
            @keyup.enter="cargarHistorialVentas"
          >

          <div class="d-flex align-items-center gap-2">
            <input class="form-control" type="date" v-model="filtroFechaDesdeVenta" aria-label="Fecha desde" @change="cargarHistorialVentas">
            <span class="text-muted-2 small">a</span>
            <input class="form-control" type="date" v-model="filtroFechaHastaVenta" aria-label="Fecha hasta" @change="cargarHistorialVentas">
          </div>

          <button class="btn btn-primary" type="button" :disabled="cargandoHistorial" @click="cargarHistorialVentas">
            <span v-if="cargandoHistorial" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            <i v-else class="bi bi-funnel"></i> Filtrar
          </button>

          <button class="btn btn-outline-secondary" type="button" :disabled="cargandoHistorial" @click="limpiarFiltrosVentas">
            <i class="bi bi-x-circle"></i> Limpiar
          </button>
        </div>

        <!-- Sub-estado: historial vacío -->
        <div v-if="ventasHistorial.length === 0" class="empty-state">
          <i class="bi bi-receipt"></i>
          <h3>No hay facturas que mostrar</h3>
          <p class="small">
            Aún no se ha registrado ninguna venta directa, o los filtros aplicados no arrojan resultados.
          </p>
        </div>

        <div v-else class="p-3">
          <div class="table-wrap">
            <table class="table table-ts">
              <thead>
                <tr>
                  <th scope="col">N° factura</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Cédula</th>
                  <th scope="col" class="text-center">Unidades</th>
                  <th scope="col">Método de pago</th>
                  <th scope="col" class="text-end">Total</th>
                  <th scope="col">Estado</th>
                  <th scope="col" class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="venta in ventasHistorial" :key="venta.numeroFactura">
                  <td><span class="code-chip">{{ venta.numeroFactura }}</span></td>
                  <td class="tabular">{{ formatearFecha(venta.fecha, true) }}</td>
                  <td>{{ venta.cliente }}</td>
                  <td class="tabular text-muted-2">{{ venta.cedula }}</td>
                  <td class="text-center tabular">{{ venta.totalUnidades }}</td>
                  <td>
                    <i class="bi bi-credit-card-2-front text-muted-2"></i>
                    {{ etiquetaMetodoPago(venta.metodoPago) }}
                  </td>
                  <td class="text-end tabular"><strong>{{ formatearMoneda(venta.total) }}</strong></td>
                  <td>
                    <span class="badge-ts" :class="venta.anulada ? 'badge-out' : 'badge-ok'">
                      {{ venta.anulada ? 'Anulada' : 'Vigente' }}
                    </span>
                  </td>
                  <td class="text-end">
                    <div class="d-inline-flex gap-1">
                      <button
                        class="btn btn-ghost btn-icon"
                        type="button"
                        title="Ver factura"
                        :disabled="cargandoFactura"
                        @click="abrirFacturaDeVenta(venta)"
                      >
                        <i class="bi bi-eye"></i>
                      </button>
                      <button
                        class="btn btn-ghost btn-icon btn-ghost-danger"
                        type="button"
                        title="Anular factura"
                        :disabled="venta.anulada || procesandoAnulacion"
                        @click="anularVentaConMotivo(venta)"
                      >
                        <i class="bi bi-x-octagon"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <!-- ==========================================================================
         MODAL DE COBRO (id: modalCobroVenta)
         ==========================================================================
         Resumen del carrito, método de pago, monto cobrado, tasa de cambio y
         referencia. El cobro sólo se habilita si existe un turno de caja abierto.
    -->
    <div class="modal fade" id="modalCobroVenta" tabindex="-1" aria-hidden="true" aria-labelledby="modalCobroVentaLabel">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modalCobroVentaLabel">
              <i class="bi bi-cash-coin"></i> Procesar cobro de la venta
            </h5>
            <button type="button" class="btn-close" aria-label="Cerrar" :disabled="enviandoVenta" @click="cerrarModal('modalCobroVenta')"></button>
          </div>

          <form @submit.prevent="confirmarCobroVenta" novalidate>
            <div class="modal-body">
              <!-- Turno de caja: condición obligatoria del cobro -->
              <div v-if="cajaActiva" class="summary-strip mb-3">
                <span class="chip">
                  <i class="bi bi-safe2"></i> Caja N° <strong>{{ cajaActiva.id }}</strong>
                </span>
                <span class="chip">
                  <i class="bi bi-person-badge"></i> {{ cajaActiva.usuario }}
                </span>
                <span class="chip">
                  <i class="bi bi-calendar-check"></i> Apertura: <strong>{{ formatearFecha(cajaActiva.fechaApertura, true) }}</strong>
                </span>
                <span class="chip">
                  <i class="bi bi-cash"></i> Recaudado: <strong>{{ formatearMoneda(cajaActiva.totalRecaudado) }}</strong>
                </span>
              </div>

              <div v-else class="readonly-note" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <span>
                  No hay ningún turno de caja abierto. Debe <strong>abrir la caja</strong> en el módulo
                  Caja antes de registrar el cobro: el pago queda asociado al turno.
                </span>
              </div>

              <div v-if="mensajeErrorCobro" class="readonly-note" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <span>{{ mensajeErrorCobro }}</span>
              </div>

              <div class="row g-3">
                <!-- ---- Resumen del carrito (sólo lectura) ---- -->
                <div class="col-12">
                  <label class="form-label">Resumen del carrito</label>
                  <div class="table-wrap" style="border:1px solid var(--border-color);border-radius:var(--radius-sm);">
                    <table class="table table-ts mb-0" style="min-width:0;">
                      <thead>
                        <tr>
                          <th scope="col">Producto</th>
                          <th scope="col" class="text-center">Cantidad</th>
                          <th scope="col" class="text-end">Precio</th>
                          <th scope="col" class="text-end">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="linea in carritoVenta" :key="`cobro-${linea.codigo}`">
                          <td>
                            <strong class="fw-semibold d-block">{{ linea.nombre }}</strong>
                            <span class="code-chip">{{ linea.codigo }}</span>
                          </td>
                          <td class="text-center tabular">{{ linea.cantidad }}</td>
                          <td class="text-end tabular">{{ formatearMoneda(linea.precio) }}</td>
                          <td class="text-end tabular">{{ formatearMoneda(linea.precio * linea.cantidad) }}</td>
                        </tr>
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colspan="3" class="text-end fw-semibold">TOTAL referencial (USD)</td>
                          <td class="text-end tabular"><strong>{{ formatearMoneda(totalCarrito) }}</strong></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <!-- ---- Método de pago ---- -->
                <div class="col-md-6">
                  <label class="form-label" for="cobro-metodo-pago">Método de pago*</label>
                  <select
                    id="cobro-metodo-pago"
                    class="form-select"
                    :class="{ 'is-invalid': erroresCobro.metodoPago }"
                    v-model="cobroVenta.metodoPago"
                    :disabled="enviandoVenta"
                  >
                    <option v-for="metodo in METODOS_PAGO" :key="metodo.valor" :value="metodo.valor">
                      {{ metodo.etiqueta }}
                    </option>
                  </select>
                  <div v-if="erroresCobro.metodoPago" class="invalid-feedback d-block">{{ erroresCobro.metodoPago }}</div>
                  <div v-else class="form-text">
                    <i class="bi" :class="metodoPagoElegido.icono"></i>
                    {{ metodoPagoElegido.etiqueta }}
                    <span v-if="referenciaObligatoria">· exige número de referencia</span>
                  </div>
                </div>

                <!-- ---- Monto cobrado ---- -->
                <div class="col-md-6">
                  <label class="form-label" for="cobro-monto">Monto recibido / cobrado (USD)*</label>
                  <input
                    id="cobro-monto"
                    type="number"
                    step="0.01"
                    min="0"
                    class="form-control tabular"
                    :class="{ 'is-invalid': erroresCobro.montoRecibido }"
                    v-model.number="cobroVenta.montoRecibido"
                    :disabled="enviandoVenta"
                  >
                  <div v-if="erroresCobro.montoRecibido" class="invalid-feedback d-block">{{ erroresCobro.montoRecibido }}</div>
                  <div v-else class="form-text">
                    Debe coincidir con el total del catálogo calculado por el servidor
                    ({{ formatearMoneda(totalCarrito) }}); de lo contrario la venta se rechaza con HTTP 400.
                  </div>
                </div>

                <!-- ---- Tasa de cambio ---- -->
                <div class="col-md-6">
                  <label class="form-label" for="cobro-tasa">
                    Tasa de cambio BCV (Bs/USD){{ exigeTasaBcv ? '*' : ' (No requerida)' }}
                  </label>
                  <input
                    id="cobro-tasa"
                    type="number"
                    step="0.01"
                    min="0"
                    class="form-control tabular"
                    :class="{ 'is-invalid': erroresCobro.tasaCambio }"
                    v-model.number="cobroVenta.tasaCambio"
                    :disabled="enviandoVenta || !exigeTasaBcv"
                    :placeholder="!exigeTasaBcv ? 'No aplica para efectivo / divisas' : 'Ej: 36.50'"
                  >
                  <div v-if="erroresCobro.tasaCambio" class="invalid-feedback d-block">{{ erroresCobro.tasaCambio }}</div>
                  <div v-else class="form-text">
                    <span v-if="!exigeTasaBcv" class="text-muted-2">
                      <i class="bi bi-info-circle"></i> Pago en efectivo/divisas: no requiere tasa BCV.
                    </span>
                    <span v-else>
                      Equivalente del carrito: <strong>{{ formatearMoneda(totalCarritoBolivares, 'BS') }}</strong>
                    </span>
                  </div>
                </div>

                <!-- ---- Referencia (obligatoria según el método) ---- -->
                <div class="col-md-6">
                  <label class="form-label" for="cobro-referencia">
                    Referencia {{ referenciaObligatoria ? '*' : '(opcional)' }}
                  </label>
                  <input
                    id="cobro-referencia"
                    class="form-control"
                    :class="{ 'is-invalid': erroresCobro.referencia }"
                    v-model="cobroVenta.referencia"
                    :disabled="enviandoVenta"
                    placeholder="N° de confirmación del pago electrónico"
                  >
                  <div v-if="erroresCobro.referencia" class="invalid-feedback d-block">{{ erroresCobro.referencia }}</div>
                  <div v-else class="form-text">
                    {{ referenciaObligatoria
                      ? 'Este método de pago exige la referencia para poder auditar la operación.'
                      : 'Opcional para los pagos en efectivo.' }}
                  </div>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" :disabled="enviandoVenta" @click="cerrarModal('modalCobroVenta')">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary" :disabled="enviandoVenta || !cajaActiva">
                <span v-if="enviandoVenta" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                <i v-else class="bi bi-check2-circle"></i>
                {{ enviandoVenta ? 'Registrando la venta...' : 'Confirmar venta y facturar' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- ==========================================================================
         MODAL DE FACTURA (id: modalFacturaVenta)
         ==========================================================================
         Comprobante de la venta: cabecera corporativa, líneas, totales, pago y la
         lista de movimientos de inventario generados con el origen "Venta".
    -->
    <div class="modal fade" id="modalFacturaVenta" tabindex="-1" aria-hidden="true" aria-labelledby="modalFacturaVentaLabel">
      <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modalFacturaVentaLabel">
              <i class="bi bi-receipt"></i> Factura de venta directa
            </h5>
            <button type="button" class="btn-close" aria-label="Cerrar" @click="cerrarModal('modalFacturaVenta')"></button>
          </div>

          <div class="modal-body">
            <div v-if="!facturaActual" class="empty-state">
              <i class="bi bi-receipt"></i>
              <h3>No hay ninguna factura abierta</h3>
            </div>

            <template v-else>
              <!-- ---- Encabezado del comprobante ---- -->
              <div class="d-flex justify-content-between align-items-start flex-wrap gap-3 pb-3 mb-3" style="border-bottom:1px solid var(--border-color);">
                <div>
                  <div class="brand-word fs-4">
                    TekZon C.A.
                    <small>RIF J-000000000 · Barquisimeto, Venezuela</small>
                  </div>
                  <p class="small text-muted-2 mb-0 mt-2">Comprobante de venta directa de mostrador</p>
                </div>
                <div class="text-end">
                  <span class="badge-ts badge-brand">Factura N° {{ facturaActual.numero }}</span>
                  <p class="small text-muted-2 mb-0 mt-2">
                    <i class="bi bi-calendar3"></i> {{ formatearFecha(facturaActual.fecha, true) }}
                  </p>
                  <p v-if="facturaActual.anulada" class="mb-0 mt-2">
                    <span class="badge-ts badge-out">Factura anulada</span>
                  </p>
                </div>
              </div>

              <!-- ---- Datos del cliente ---- -->
              <div class="row g-3 mb-3">
                <div class="col-md-6">
                  <label class="form-label">Cliente</label>
                  <p class="mb-0">
                    <strong>{{ facturaActual.cliente }}</strong>
                    <span v-if="facturaActual.clienteNuevo" class="badge-ts badge-review ms-2">Cliente nuevo</span>
                  </p>
                  <p class="small text-muted-2 mb-0">
                    <span class="code-chip">{{ facturaActual.cedula }}</span>
                    <span v-if="facturaActual.telefono"> · {{ facturaActual.telefono }}</span>
                  </p>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Cobro</label>
                  <p class="mb-0">
                    <i class="bi bi-credit-card-2-front"></i> {{ etiquetaMetodoPago(facturaActual.metodoPago) }}
                  </p>
                  <p class="small text-muted-2 mb-0">
                    Caja N° {{ facturaActual.idCaja || '—' }}
                    <span v-if="facturaActual.referencia"> · Referencia: {{ facturaActual.referencia }}</span>
                  </p>
                </div>
              </div>

              <!-- ---- Líneas de la factura ---- -->
              <div class="table-wrap" style="border:1px solid var(--border-color);border-radius:var(--radius-sm);">
                <table class="table table-ts mb-0" style="min-width:0;">
                  <thead>
                    <tr>
                      <th scope="col">Producto</th>
                      <th scope="col" class="text-center">Cantidad</th>
                      <th scope="col" class="text-end">Precio unitario</th>
                      <th scope="col" class="text-end">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="linea in facturaActual.lineas" :key="`factura-${linea.codigo}`">
                      <td>
                        <div class="cell-product">
                          <img :src="rutaImagenProducto(linea.imagen)" :alt="linea.nombre">
                          <div>
                            <strong class="fw-semibold d-block">{{ linea.nombre }}</strong>
                            <span class="code-chip">{{ linea.codigo }}</span>
                          </div>
                        </div>
                      </td>
                      <td class="text-center tabular">{{ linea.cantidad }}</td>
                      <td class="text-end tabular">{{ formatearMoneda(linea.precioUnitario) }}</td>
                      <td class="text-end tabular">{{ formatearMoneda(linea.subtotal) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- ---- Totales ---- -->
              <div class="mt-3 p-3" style="background:var(--surface-soft);border-radius:var(--radius-md);">
                <div class="d-flex justify-content-between">
                  <span class="text-muted-2">{{ resumenFactura.cantidadLineas }} línea(s) · {{ resumenFactura.totalUnidades }} unidad(es)</span>
                  <span class="tabular text-muted-2">Subtotal líneas {{ formatearMoneda(resumenFactura.montoLineas) }}</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-2">
                  <span class="fw-semibold">TOTAL (USD)</span>
                  <strong class="tabular fs-4">{{ formatearMoneda(facturaActual.total) }}</strong>
                </div>
                <div class="d-flex justify-content-between mt-1">
                  <span class="small text-muted-2">Tasa de cambio aplicada</span>
                  <span class="tabular small">{{ facturaActual.tasaCambio ? facturaActual.tasaCambio.toFixed(2) : '—' }} Bs/USD</span>
                </div>
                <div class="d-flex justify-content-between">
                  <span class="small text-muted-2">TOTAL en bolívares</span>
                  <span class="tabular small">{{ formatearMoneda(totalFacturaBolivares, 'BS') }}</span>
                </div>
              </div>

              <!-- ---- Evidencia de la salida de inventario ---- -->
              <div class="mt-3">
                <h6 class="mb-1">
                  <i class="bi bi-arrow-left-right"></i> Movimientos de inventario generados
                </h6>
                <p class="form-text">
                  Cada línea descontó la existencia del almacén y quedó registrada en el kádex
                  con el origen «Venta».
                </p>

                <div v-if="facturaActual.movimientos.length === 0" class="readonly-note mb-0" style="background:var(--surface-soft);color:var(--text-muted);border-color:var(--border-color);">
                  <i class="bi bi-info-circle"></i>
                  <span>
                    Esta consulta no incluye los asientos del kádex. Puede verlos en el módulo
                    <router-link to="/movimientos">Entradas y Salidas</router-link>.
                  </span>
                </div>

                <ul v-else class="list-unstyled mb-0">
                  <li
                    v-for="movimiento in facturaActual.movimientos"
                    :key="`mov-${movimiento.id_movimiento || movimiento.cod_producto}`"
                    class="d-flex justify-content-between align-items-center gap-2 py-2"
                    style="border-bottom:1px solid var(--border-color);"
                  >
                    <div>
                      <strong class="d-block small">{{ movimiento.nombre_producto }}</strong>
                      <span class="code-chip">{{ movimiento.cod_producto }}</span>
                      <small class="text-muted-2 ms-2">
                        {{ movimiento.cantidad }} u. · existencia
                        {{ movimiento.existencia_previa }} → {{ movimiento.existencia_posterior }}
                      </small>
                    </div>
                    <span class="badge-ts" :class="presentacionOrigenMovimiento(movimiento.origen || 'VENTA').clase">
                      <i class="bi" :class="presentacionOrigenMovimiento(movimiento.origen || 'VENTA').icono"></i>
                      {{ presentacionOrigenMovimiento(movimiento.origen || 'VENTA').etiqueta }}
                    </span>
                  </li>
                </ul>
              </div>
            </template>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" @click="cerrarModal('modalFacturaVenta')">
              Cerrar
            </button>
            <button type="button" class="btn btn-primary" :disabled="!facturaActual" @click="imprimirFactura">
              <i class="bi bi-printer"></i> Imprimir
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal para la Generación de Reportes de Ventas -->
    <ModalGenerarReporte
      id-modal="modalReporteVentas"
      tipo-reporte="ventas"
      titulo="Reporte Gerencial de Ventas Directas"
      subtitulo="Análisis de facturación, ticket promedio, distribución por método de pago y volumen diario"
      clasificacion="GERENCIAL"
      @notificar="manejarNotificacionReporte"
    />
  </main>
</template>

