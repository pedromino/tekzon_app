/**
 * ==========================================================================
 * UTILIDADES DE FORMATO Y MAPEO (formato.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Utilidades del frontend (compartidas por los módulos nuevos)
 *
 * PROPÓSITO FUNCIONAL:
 *   Centraliza el MAPEO de las columnas de MySQL al modelo de vista de Vue y el
 *   FORMATO de los valores que se muestran al usuario (dinero, fechas, estados).
 *   Al vivir en un único archivo, los módulos de Servicio Técnico, Venta Directa,
 *   Clientes y Alertas presentan la información de forma homogénea.
 *
 * PROPÓSITO TÉCNICO:
 *   · `aNumero` evita el clásico error de concatenar texto: MySQL devuelve los
 *     DECIMAL como cadena ("145.00"), por lo que hay que convertirlos antes de
 *     sumar o comparar.
 *   · `formatearMoneda` usa el formateador nativo del navegador (Intl) para no
 *     escribir utilidades de redondeo a mano.
 * ==========================================================================
 */

/** Convierte cualquier valor a número (0 si no es numérico). */
export const aNumero = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

/** Convierte a número decimal con dos posiciones. */
export const aDecimal = (valor) => Number(aNumero(valor).toFixed(2));

/**
 * FORMATEA UN MONTO EN DÓLARES.
 * Se usa el símbolo "$" y dos decimales, que es como TekZon factura sus equipos.
 */
export const formatearMoneda = (valor, moneda = 'USD') => {
  const numero = aNumero(valor);

  const formateador = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return moneda === 'USD' ? `$${formateador.format(numero)}` : `Bs. ${formateador.format(numero)}`;
};

/** FORMATEA UNA FECHA (y hora opcional) en formato local venezolano. */
export const formatearFecha = (valor, incluirHora = false) => {
  if (!valor) return '—';

  // Si viene en formato MySQL string "YYYY-MM-DD HH:MM:SS" lo normalizamos para Date
  const normalizado = typeof valor === 'string' && valor.includes(' ') && !valor.includes('T')
    ? valor.replace(' ', 'T')
    : valor;

  const fecha = new Date(normalizado);

  // Si el valor no es una fecha válida se devuelve el texto original.
  if (Number.isNaN(fecha.getTime())) return String(valor);

  const opciones = incluirHora
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }
    : { day: '2-digit', month: '2-digit', year: 'numeric' };

  return fecha.toLocaleString('es-VE', opciones);
};

/**
 * Determina si un método de pago requiere aplicar tasa BCV.
 * Para EFECTIVO, DIVISAS y ZELLE no se exige tasa BCV ya que es pago directo en USD/efectivo.
 */
export const metodoRequiereTasa = (metodo) => {
  const m = String(metodo || '').toUpperCase().trim();
  return !['EFECTIVO', 'DIVISAS', 'ZELLE'].includes(m);
};

/** Devuelve la fecha de hoy en formato YYYY-MM-DD (para inputs type="date"). */
export const fechaHoyIso = () => new Date().toISOString().slice(0, 10);

/**
 * MAPEA UNA ORDEN DE SERVICIO TÉCNICO del backend al modelo de vista.
 */
export const mapearOrden = (orden) => ({
  // --- Nomenclatura del frontend ---
  id: orden.id_ordentec,
  estado: orden.estado,
  avance: aNumero(orden.porcentaje_avance),
  cliente: `${orden.nombre_cliente || ''} ${orden.apellido_cliente || ''}`.trim() || 'Sin cliente',
  cedula: orden.cedula_cli,
  telefono: orden.telefono_cliente || '',
  direccion: orden.direccion_cli || '',
  equipo: `${orden.nombre_dis || ''} ${orden.marca || ''} ${orden.modelo || ''}`.trim(),
  tipoEquipo: orden.nombre_dis || '',
  marca: orden.marca || '',
  modelo: orden.modelo || '',
  serie: orden.numero_serie || '',
  falla: orden.falla_reportada || '',
  accesorios: orden.accesorios || '',
  patron: orden.patron_desbloqueo || '',
  observaciones: orden.observaciones || '',
  tecnico: orden.nombre_tecnico || 'Sin asignar',
  manoObra: aDecimal(orden.costo_mano_obra),
  totalRepuestos: aDecimal(orden.total_repuestos),
  total: aDecimal(orden.total),
  cobrada: aNumero(orden.cobrada) === 1,
  numeroFactura: orden.numero_factura || null,
  fechaIngreso: orden.fecha_ingreso,
  fechaEntrega: orden.fecha_entrega,
  fechaCierre: orden.fecha_cierre,
  // --- Nomenclatura original de MySQL ---
  id_ordentec: orden.id_ordentec,
  id_dispositivo: orden.id_dispositivo,
  cedula_cli: orden.cedula_cli,
  nombre_cliente: orden.nombre_cliente,
  apellido_cliente: orden.apellido_cliente,
  nombre_dis: orden.nombre_dis,
  falla_reportada: orden.falla_reportada,
  costo_mano_obra: aDecimal(orden.costo_mano_obra),
  total_repuestos: aDecimal(orden.total_repuestos),
  numero_factura: orden.numero_factura
});

/** MAPEA UNA LÍNEA DE REPUESTO CONSUMIDO EN UNA ORDEN. */
export const mapearRepuestoOrden = (repuesto) => ({
  codigo: repuesto.cod_producto,
  nombre: repuesto.nombre_producto,
  imagen: repuesto.imagen || 'pantalla.jpg',
  marca: repuesto.marca || '',
  cantidad: aNumero(repuesto.cantidad),
  precioUnitario: aDecimal(repuesto.precio_unitario),
  subtotal: aDecimal(repuesto.subtotal),
  existenciaActual: aNumero(repuesto.existencia_actual),
  stockMinimo: aNumero(repuesto.stock_minimo),
  origen: repuesto.origen,
  idMovimiento: repuesto.id_movimiento,
  fechaMovimiento: repuesto.fecha_movimiento,
  // --- Nomenclatura original ---
  cod_producto: repuesto.cod_producto,
  nombre_producto: repuesto.nombre_producto,
  precio_unitario: aDecimal(repuesto.precio_unitario),
  existencia_actual: aNumero(repuesto.existencia_actual)
});

/** MAPEA UNA VENTA DIRECTA del backend al modelo de vista. */
export const mapearVenta = (venta) => ({
  // --- Nomenclatura del frontend ---
  numeroFactura: venta.num_factura,
  cliente: `${venta.nombre_cliente || ''} ${venta.apellido_cliente || ''}`.trim() || 'Consumidor final',
  cedula: venta.cedula_cli,
  telefono: venta.telefono_cliente || '',
  total: aDecimal(venta.monto_total),
  fecha: venta.fecha_venta,
  tipoVenta: venta.tipo_venta,
  anulada: aNumero(venta.estado) === 0,
  cajero: venta.nombre_cajero || 'Sin asignar',
  metodoPago: venta.metodo_pago || '',
  totalLineas: aNumero(venta.total_lineas),
  totalUnidades: aNumero(venta.total_unidades),
  // --- Nomenclatura original de MySQL ---
  num_factura: venta.num_factura,
  cedula_cli: venta.cedula_cli,
  monto_total: aDecimal(venta.monto_total),
  fecha_venta: venta.fecha_venta,
  estado: aNumero(venta.estado),
  metodo_pago: venta.metodo_pago
});

/** MAPEA UNA LÍNEA DEL DETALLE DE UNA FACTURA DE VENTA. */
export const mapearDetalleFactura = (linea) => ({
  codigo: linea.cod_producto,
  nombre: linea.nombre_producto,
  imagen: linea.imagen || 'pantalla.jpg',
  marca: linea.marca || '',
  cantidad: aNumero(linea.cantidad),
  precioUnitario: aDecimal(linea.precio_unitario),
  subtotal: aDecimal(linea.subtotal),
  existenciaActual: aNumero(linea.existencia_actual),
  origen: linea.origen,
  idMovimiento: linea.id_movimiento,
  // --- Nomenclatura original ---
  cod_producto: linea.cod_producto,
  nombre_producto: linea.nombre_producto,
  precio_unitario: aDecimal(linea.precio_unitario),
  existencia_actual: aNumero(linea.existencia_actual)
});

/** MAPEA UN CLIENTE del backend al modelo de vista. */
export const mapearCliente = (cliente) => ({
  // --- Nomenclatura del frontend ---
  cedula: cliente.cedula_cli,
  nombre: cliente.nombre_cliente || '',
  apellido: cliente.apellido_cliente || '',
  nombreCompleto: `${cliente.nombre_cliente || ''} ${cliente.apellido_cliente || ''}`.trim(),
  telefono: cliente.telefono_cliente || '',
  direccion: cliente.direccion_cli || '',
  totalDispositivos: aNumero(cliente.total_dispositivos),
  totalCompras: aNumero(cliente.total_compras),
  totalOrdenes: aNumero(cliente.total_ordenes),
  // --- Nomenclatura original de MySQL ---
  cedula_cli: cliente.cedula_cli,
  nombre_cliente: cliente.nombre_cliente,
  apellido_cliente: cliente.apellido_cliente,
  telefono_cliente: cliente.telefono_cliente,
  direccion_cli: cliente.direccion_cli
});

/** MAPEA UN DISPOSITIVO del backend al modelo de vista. */
export const mapearDispositivo = (dispositivo) => ({
  // --- Nomenclatura del frontend ---
  id: dispositivo.id_dispositivo,
  tipo: dispositivo.nombre_dis || '',
  marca: dispositivo.marca || '',
  modelo: dispositivo.modelo || '',
  serie: dispositivo.numero_serie || '',
  cedula: dispositivo.cedula_cli,
  propietario: dispositivo.nombre_propietario || '',
  telefono: dispositivo.telefono_cliente || '',
  totalOrdenes: aNumero(dispositivo.total_ordenes),
  descripcion: `${dispositivo.nombre_dis || ''} ${dispositivo.marca || ''} ${dispositivo.modelo || ''}`.trim(),
  // --- Nomenclatura original de MySQL ---
  id_dispositivo: dispositivo.id_dispositivo,
  nombre_dis: dispositivo.nombre_dis,
  numero_serie: dispositivo.numero_serie,
  cedula_cli: dispositivo.cedula_cli
});

/** MAPEA UNA ALERTA DE STOCK del backend al modelo de vista. */
export const mapearAlerta = (alerta) => ({
  // --- Nomenclatura del frontend ---
  id: alerta.id_alerta,
  codigo: alerta.cod_producto,
  producto: alerta.nombre_producto,
  imagen: alerta.imagen || 'pantalla.jpg',
  existencia: aNumero(alerta.existencia),
  existenciaActual: aNumero(alerta.existencia_actual),
  stockMinimo: aNumero(alerta.stock_minimo),
  origen: alerta.origen,
  documento: alerta.documento,
  mensaje: alerta.mensaje,
  atendida: aNumero(alerta.atendida) === 1,
  fecha: alerta.fecha_alerta,
  // --- Nomenclatura original de MySQL ---
  id_alerta: alerta.id_alerta,
  cod_producto: alerta.cod_producto,
  nombre_producto: alerta.nombre_producto,
  stock_minimo: aNumero(alerta.stock_minimo),
  fecha_alerta: alerta.fecha_alerta
});

/** MAPEA UN MOVIMIENTO DEL KÁRDEX (incluye la columna `origen`). */
export const mapearMovimiento = (movimiento) => ({
  id: movimiento.id_movimiento,
  codigo: movimiento.cod_producto,
  producto: movimiento.nombre_producto,
  tipo: movimiento.tipo_movimiento,
  origen: movimiento.origen,
  cantidad: aNumero(movimiento.cantidad),
  existenciaPrevia: aNumero(movimiento.existencia_previa),
  existenciaPosterior: aNumero(movimiento.existencia_posterior),
  motivo: movimiento.motivo,
  usuario: movimiento.nombre_usuario || 'Sistema',
  fecha: movimiento.fecha_movimiento
});

/**
 * ETIQUETAS Y COLORES DE LOS ESTADOS DE UNA ORDEN DE SERVICIO TÉCNICO.
 * Es el ESPEJO de `Backend/src/utils/estadosOrdenTecnico.js`: el backend es la
 * autoridad de la máquina de estados y aquí sólo se define cómo se pinta.
 */
export const ESTADOS_ORDEN_UI = Object.freeze({
  'Pendiente': { etiqueta: 'Pendiente', clase: 'badge-out', icono: 'bi-hourglass-split' },
  'En Reparacion': { etiqueta: 'En Reparación', clase: 'badge-low', icono: 'bi-tools' },
  'Listo': { etiqueta: 'Listo', clase: 'badge-info', icono: 'bi-check-circle' },
  'Entregado': { etiqueta: 'Entregado', clase: 'badge-ok', icono: 'bi-bag-check' }
});

/** Devuelve la presentación (etiqueta, clase, icono) de un estado de orden. */
export const presentacionEstadoOrden = (estado) => ESTADOS_ORDEN_UI[estado] || {
  etiqueta: estado || 'Desconocido',
  clase: 'badge-neutral',
  icono: 'bi-question-circle'
};

/**
 * ETIQUETAS Y COLORES DEL ORIGEN DE UN MOVIMIENTO DEL KÁRDEX.
 * PROPÓSITO FUNCIONAL: permite demostrar de un vistazo en la interfaz que una
 * salida se produjo por "Venta" o por "Servicio Técnico".
 */
export const ORIGENES_MOVIMIENTO_UI = Object.freeze({
  ALMACEN: { etiqueta: 'Almacén', clase: 'badge-neutral', icono: 'bi-box-seam' },
  VENTA: { etiqueta: 'Venta', clase: 'badge-ok', icono: 'bi-cart-check' },
  SERVICIO_TECNICO: { etiqueta: 'Servicio Técnico', clase: 'badge-review', icono: 'bi-tools' },
  AJUSTE: { etiqueta: 'Ajuste', clase: 'badge-info', icono: 'bi-sliders' }
});

/** Devuelve la presentación de un origen de movimiento. */
export const presentacionOrigenMovimiento = (origen) => ORIGENES_MOVIMIENTO_UI[origen] || {
  etiqueta: origen || '—',
  clase: 'badge-neutral',
  icono: 'bi-question-circle'
};

/** ETIQUETAS LEGIBLES DE LOS MÉTODOS DE PAGO del backend. */
export const ETIQUETAS_METODO_PAGO = Object.freeze({
  EFECTIVO: 'Efectivo',
  PAGO_MOVIL: 'Pago Móvil',
  PUNTO_DEBITO: 'Punto de Débito',
  TRANSFERENCIA: 'Transferencia',
  ZELLE: 'Zelle',
  DIVISAS: 'Divisas'
});

/** Devuelve el texto legible de un método de pago. */
export const etiquetaMetodoPago = (metodo) => ETIQUETAS_METODO_PAGO[metodo] || metodo || '—';

/**
 * MÉTODOS DE PAGO ADMITIDOS POR EL SISTEMA.
 * Es el ESPEJO de `Backend/src/services/ordenServiceTecnicoService.js`; el
 * backend vuelve a validar la lista, por lo que no puede eludirse manipulando
 * el formulario.
 */
export const METODOS_PAGO = Object.freeze([
  { valor: 'EFECTIVO', etiqueta: 'Efectivo', icono: 'bi-cash-coin', exigeReferencia: false, exigeTasaBcv: false },
  { valor: 'PAGO_MOVIL', etiqueta: 'Pago Móvil', icono: 'bi-phone', exigeReferencia: true, exigeTasaBcv: true },
  { valor: 'PUNTO_DEBITO', etiqueta: 'Punto de Débito', icono: 'bi-credit-card', exigeReferencia: true, exigeTasaBcv: true },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia', icono: 'bi-bank', exigeReferencia: true, exigeTasaBcv: true },
  { valor: 'ZELLE', etiqueta: 'Zelle', icono: 'bi-send', exigeReferencia: true, exigeTasaBcv: false },
  { valor: 'DIVISAS', etiqueta: 'Divisas (efectivo $)', icono: 'bi-currency-dollar', exigeReferencia: false, exigeTasaBcv: false }
]);

/**
 * TRADUCE UN ERROR DEL API A UN OBJETO MOSTRABLE EN LA INTERFAZ.
 * Devuelve { codigo, mensaje } con el código HTTP visible, tal como exige la
 * cátedra para los estados de Error.
 */
export const describirError = (error) => {
  const codigo = error?.codigoHttp ?? 500;
  const detalle = error?.mensaje || 'Ocurrió un error inesperado.';

  if (error?.esErrorConexion) {
    return { codigo: 'SIN CONEXIÓN', mensaje: detalle };
  }

  const etiquetas = {
    400: 'Datos inválidos',
    401: 'Sesión no válida',
    403: 'Acceso denegado',
    404: 'Recurso no encontrado',
    409: 'Conflicto de integridad',
    500: 'Error interno del servidor'
  };

  return {
    codigo: `HTTP ${codigo}`,
    mensaje: `${etiquetas[codigo] ? `${etiquetas[codigo]}: ` : ''}${detalle}`
  };
};
