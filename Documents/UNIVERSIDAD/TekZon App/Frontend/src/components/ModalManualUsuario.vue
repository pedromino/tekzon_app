<script setup>
/**
 * ==========================================================================
 * COMPONENTE MANUAL DE USUARIO CONTEXTUAL (ModalManualUsuario.vue)
 * TEKZON C.A. - SISTEMA DE GESTIÓN TÉCNICA E INVENTARIO
 * ==========================================================================
 * PROPÓSITO:
 *   Despliega un manual de usuario interactivo y paso a paso, contextualizado
 *   al módulo principal en el cual se encuentra posicionado el usuario en la
 *   aplicación, permitiendo también explorar los demás módulos del sistema.
 * ==========================================================================
 */
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { cerrarModal } from '../utils/utilidadesModales.js';

const props = defineProps({
  idModal: {
    type: String,
    default: 'modalManualUsuario'
  }
});

const route = useRoute();

/**
 * Diccionario maestro de guías paso a paso de todos los módulos de TekZon C.A.
 */
const manualesModulos = {
  inventario: {
    clave: 'inventario',
    titulo: 'Catálogo de Productos e Inventario',
    modulo: 'Módulo de Inventario',
    icono: 'bi-box-seam',
    color: '#2563eb',
    proposito: 'Administrar el catálogo maestro de artículos, repuestos y accesorios electrónicos, controlando precios de costo, precios de venta, existencia física en almacén y stock mínimo de seguridad.',
    rolesAutorizados: ['Administrador', 'Almacenista'],
    pasos: [
      {
        numero: 1,
        titulo: 'Consultar y Filtrar Artículos',
        descripcion: 'Escribe en el buscador el código, nombre o marca del producto. Puedes filtrar por categoría comercial o por situación de stock (Disponibles, Bajo Mínimo o Agotados) para identificar rápidamente necesidades de reposición.'
      },
      {
        numero: 2,
        titulo: 'Registrar un Nuevo Producto',
        descripcion: 'Haz clic en el botón «Nuevo Producto» en la esquina superior. Ingresa el código único (ej. REP-PANT-IP13), nombre, categoría, marca, precio de costo ($), precio de venta ($), existencia inicial, stock mínimo y selecciona el proveedor mayorista de origen.'
      },
      {
        numero: 3,
        titulo: 'Editar o Actualizar Precios',
        descripcion: 'En la tabla de productos, haz clic en el botón de lápiz (Editar) en la fila correspondiente para actualizar precios de venta, corregir descripciones o reajustar los niveles de stock mínimo.'
      },
      {
        numero: 4,
        titulo: 'Dar de Baja un Producto',
        descripcion: 'Para retirar un producto descontinuado, pulsa el botón de papelera. El sistema realizará una baja lógica protegiendo el histórico de ventas y kárdex asociados.'
      },
      {
        numero: 5,
        titulo: 'Generar Reportes Analíticos',
        descripcion: 'Haz clic en «Generar Reporte» en la cabecera. Selecciona los filtros deseados y pulsa «Ver Reporte» para abrir el PDF corporativo en una nueva pestaña (con márgenes, KPIs y márgenes de rentabilidad) o descarga en Excel.'
      }
    ],
    consejos: [
      'Mantén siempre configurado un "Stock Mínimo" realista (generalmente entre 2 y 5 unidades) para que el sistema active las alertas tempranas de inventario.',
      'El margen de ganancia se calcula automáticamente en base al costo ingresado.'
    ]
  },

  categorias: {
    clave: 'categorias',
    titulo: 'Categorías de Productos',
    modulo: 'Clasificación de Inventario',
    icono: 'bi-tags',
    color: '#0891b2',
    proposito: 'Organizar, clasificar y segmentar los artículos del inventario en familias comerciales (repuestos, accesorios, equipos, herramientas, baterías) para una auditoría y reportes eficientes.',
    rolesAutorizados: ['Administrador', 'Almacenista'],
    pasos: [
      {
        numero: 1,
        titulo: 'Explorar Categorías Existentes',
        descripcion: 'Revisa el listado con el nombre de cada categoría y la cantidad de artículos vinculados actualmente a cada una.'
      },
      {
        numero: 2,
        titulo: 'Crear una Nueva Categoría',
        descripcion: 'Haz clic en «Nueva Categoría». Escribe un nombre claro y representativo (ej. "Conectores y Pines", "Pantallas OLED") y confirma el guardado.'
      },
      {
        numero: 3,
        titulo: 'Modificar o Inactivar',
        descripcion: 'Haz clic en el botón de edición para corregir nombres. Solo podrás eliminar categorías que no tengan artículos asociados para mantener la integridad de datos.'
      },
      {
        numero: 4,
        titulo: 'Generar Reporte de Supervisión',
        descripcion: 'Pulsa «Generar Reporte» para ver la distribución de capital y unidades por categoría en formato PDF o Excel.'
      }
    ],
    consejos: [
      'Evita crear categorías redundantes como "Cables" y "Cableados". Agrupa bajo términos estandarizados para facilitar la búsqueda en el mostrador.'
    ]
  },

  movimientos: {
    clave: 'movimientos',
    titulo: 'Entradas y Salidas (Kárdex)',
    modulo: 'Auditoría Transaccional',
    icono: 'bi-arrow-left-right',
    color: '#d97706',
    proposito: 'Llevar la trazabilidad exacta de cada unidad que entra o sale del almacén (compras a proveedores, ventas en mostrador, consumo en órdenes de servicio técnico y ajustes de inventario).',
    rolesAutorizados: ['Administrador', 'Almacenista'],
    pasos: [
      {
        numero: 1,
        titulo: 'Auditar el Historial de Movimientos',
        descripcion: 'Revisa la tabla cronológica con fecha exacta, producto, tipo de movimiento (Entrada/Salida), origen, cantidad y el balance de existencia previa y posterior.'
      },
      {
        numero: 2,
        titulo: 'Registrar Entrada Manual',
        descripcion: 'Haz clic en «Registrar Entrada», selecciona el producto del catálogo, ingresa la cantidad recibida y escribe el motivo (ej. reposición por factura de compra).'
      },
      {
        numero: 3,
        titulo: 'Registrar Salida Manual (Merma o Ajuste)',
        descripcion: 'Haz clic en «Registrar Salida», busca el artículo y coloca la cantidad a descontar. El sistema impedirá salidas que superen la existencia física actual.'
      },
      {
        numero: 4,
        titulo: 'Generar Reporte Operacional de Kárdex',
        descripcion: 'Pulsa «Generar Reporte» para exportar la auditoría completa de movimientos con filtros por rango de fechas, tipo y origen.'
      }
    ],
    consejos: [
      'Las ventas directas y el consumo de repuestos en el taller descuentan stock automáticamente sin necesidad de registrar salidas manuales.'
    ]
  },

  proveedores: {
    clave: 'proveedores',
    titulo: 'Proveedores Mayoristas',
    modulo: 'Gestión de Compras',
    icono: 'bi-truck',
    color: '#059669',
    proposito: 'Administrar el directorio de empresas proveedoras y distribuidores de repuestos, registrando RIF, teléfonos, dirección fiscal y trazabilidad de compras para negociaciones por volumen.',
    rolesAutorizados: ['Administrador', 'Almacenista'],
    pasos: [
      {
        numero: 1,
        titulo: 'Consultar el Directorio de Proveedores',
        descripcion: 'Visualiza la lista de proveedores registrados con sus números de RIF, teléfonos, dirección y estado comercial.'
      },
      {
        numero: 2,
        titulo: 'Registrar un Proveedor',
        descripcion: 'Haz clic en «Nuevo Proveedor». Escribe el RIF formal (ej. J-40123456-1), razón social de la empresa, teléfono de contacto y dirección fiscal.'
      },
      {
        numero: 3,
        titulo: 'Actualizar Datos de Contacto',
        descripcion: 'Si el proveedor cambia de sede o números de atención, haz clic en el botón de edición para mantener la información al día.'
      },
      {
        numero: 4,
        titulo: 'Generar Reporte Gerencial de Adquisiciones',
        descripcion: 'Usa «Generar Reporte» para ver el volumen acumulado en dólares ($), el promedio por compra y las unidades suministradas por cada proveedor.'
      }
    ],
    consejos: [
      'Al crear nuevos productos en inventario, selecciona siempre el proveedor correspondiente según la factura para consolidar el historial de compras.'
    ]
  },

  recepcion: {
    clave: 'recepcion',
    titulo: 'Recepción de Equipos',
    modulo: 'Servicio Técnico',
    icono: 'bi-clipboard-plus',
    color: '#7c3aed',
    proposito: 'Registrar la admisión formal de smartphones y dispositivos al taller técnico: identificación del cliente, datos del equipo (IMEI/Serial), falla reportada y apertura de la orden de servicio.',
    rolesAutorizados: ['Administrador', 'Cajero', 'Técnico'],
    pasos: [
      {
        numero: 1,
        titulo: 'Identificar al Cliente',
        descripcion: 'Escribe la cédula del cliente. Si ya existe en el sistema, sus datos se cargarán automáticamente. Si es nuevo, escribe su nombre, apellido, teléfono y dirección.'
      },
      {
        numero: 2,
        titulo: 'Registrar o Seleccionar el Dispositivo',
        descripcion: 'Selecciona si es un equipo registrado previamente o ingresa un nuevo dispositivo indicando tipo, marca, modelo y número de serie o código IMEI.'
      },
      {
        numero: 3,
        titulo: 'Detallar Falla y Accesorios',
        descripcion: 'Describe con claridad el problema manifestado por el cliente, los accesorios dejados en custodia (cargador, forro, chip) y el patrón o clave de desbloqueo si es requerido para las pruebas.'
      },
      {
        numero: 4,
        titulo: 'Generar la Orden de Servicio Técnico',
        descripcion: 'Confirma la recepción. El sistema asignará un número correlativo oficial (ej. OS-000101) que pasará a la cola del Panel del Técnico en estado «Recibido».'
      }
    ],
    consejos: [
      'Verifica siempre el encendido físico y el estado de la pantalla antes de recibir el equipo para evitar reclamos posteriores.'
    ]
  },

  ordenes: {
    clave: 'ordenes',
    titulo: 'Panel del Técnico y Reparaciones',
    modulo: 'Taller Técnico Especializado',
    icono: 'bi-tools',
    color: '#ea580c',
    proposito: 'Gestionar el flujo de trabajo del servicio técnico: diagnosticar fallas, presupuestar mano de obra, consumir repuestos de inventario y actualizar el estado de las órdenes hasta su entrega.',
    rolesAutorizados: ['Administrador', 'Técnico'],
    pasos: [
      {
        numero: 1,
        titulo: 'Revisar la Cola de Trabajo',
        descripcion: 'Consulta las órdenes asignadas filtrando por estado: Recibido, Diagnóstico, En Reparación, Finalizado o Entregado.'
      },
      {
        numero: 2,
        titulo: 'Iniciar Diagnóstico y Presupuesto',
        descripcion: 'Abre la orden y cambia su estado a «En Diagnóstico». Define el costo estimado de mano de obra e ingresa las notas técnicas pertinentes.'
      },
      {
        numero: 3,
        titulo: 'Asignar Repuestos de Inventario',
        descripcion: 'En el modal de repuestos, busca las piezas necesarias del catálogo (pantallas, baterías, pines). El sistema calculará el subtotal y descontará el stock al confirmar.'
      },
      {
        numero: 4,
        titulo: 'Finalizar y Entregar',
        descripcion: 'Al culminar la reparación, cambia el estado a «Finalizado» (el cliente puede retirarlo). Cuando el cliente paga en caja, la orden pasa a «Entregado» y se genera su factura.'
      },
      {
        numero: 5,
        titulo: 'Generar Reporte de Rendimiento Técnico',
        descripcion: 'Clic en «Generar Reporte» para auditar la tasa de efectividad (%), ingresos por mano de obra y facturación global del taller.'
      }
    ],
    consejos: [
      'Registra siempre las observaciones detalladas del trabajo realizado (ej. "Reemplazo de módulo OLED y calibración TrueTone").'
    ]
  },

  dispositivos: {
    clave: 'dispositivos',
    titulo: 'Dispositivos y Equipos',
    modulo: 'Inventario de Clientes',
    icono: 'bi-laptop',
    color: '#4f46e5',
    proposito: 'Consultar el inventario de dispositivos móviles registrados en el sistema, historial de reparaciones previas, datos de serie/IMEI y datos del propietario.',
    rolesAutorizados: ['Administrador', 'Técnico', 'Cajero'],
    pasos: [
      {
        numero: 1,
        titulo: 'Búsqueda por Serial / IMEI / Marca',
        descripcion: 'Usa el buscador para ubicar un dispositivo por su IMEI, marca, modelo o nombre del propietario.'
      },
      {
        numero: 2,
        titulo: 'Consultar Historial de Reparaciones',
        descripcion: 'Haz clic en el equipo para ver la lista completa de órdenes de servicio técnico que ha tenido en el taller, fechas de ingreso y fallas resueltas.'
      },
      {
        numero: 3,
        titulo: 'Generar Reporte de Dispositivos',
        descripcion: 'Pulsa «Generar Reporte» para ver los equipos atendidos, visitas al taller y recurrencia de averías por modelo o marca.'
      }
    ],
    consejos: [
      'El número de serie o IMEI es la huella digital del equipo; asegúrate de transcribirlo sin espacios ni guiones.'
    ]
  },

  caja: {
    clave: 'caja',
    titulo: 'Caja y Turnos',
    modulo: 'Control Financiero',
    icono: 'bi-cash-stack',
    color: '#16a34a',
    proposito: 'Controlar la apertura y cierre de turnos de caja, arqueo diario, conciliar la recaudación de ventas y servicios técnicos desglosando entre efectivo en divisas ($) y pagos digitales en bolívares.',
    rolesAutorizados: ['Administrador', 'Cajero'],
    pasos: [
      {
        numero: 1,
        titulo: 'Apertura de Turno de Caja',
        descripcion: 'Al iniciar el turno, verifica si hay una caja abierta. Si no, pulsa «Abrir Caja», escribe el monto base inicial en efectivo ($ USD) y tus observaciones de apertura.'
      },
      {
        numero: 2,
        titulo: 'Monitorear la Recaudación en Tiempo Real',
        descripcion: 'Visualiza la suma acumulada de cobros del turno: cobrado en efectivo ($ USD) y cobrado en medios digitales (Pago Móvil, Transferencias, Puntos).'
      },
      {
        numero: 3,
        titulo: 'Cierre de Caja y Arqueo',
        descripcion: 'Al finalizar la jornada, haz clic en «Cierre de Caja». El sistema sumará las facturas vigentes del turno. Realiza el conteo físico, compara los montos y confirma el cierre.'
      },
      {
        numero: 4,
        titulo: 'Generar Reporte Gerencial de Caja',
        descripcion: 'Pulsa «Generar Reporte» para ver el arqueo consolidado de turnos, ingresos por método de pago y cuadre contable en PDF o Excel.'
      }
    ],
    consejos: [
      'Nunca realices ventas o cobros de servicio sin una caja en estado "ABIERTA", ya que cada factura debe quedar asentada en un turno auditado.'
    ]
  },

  ventas: {
    clave: 'ventas',
    titulo: 'Venta Directa en Mostrador',
    modulo: 'Facturación Comercial',
    icono: 'bi-cart',
    color: '#0284c7',
    proposito: 'Facturar artículos, repuestos y accesorios en el mostrador: agregar productos al carrito, registrar datos del cliente, cobrar en divisas o moneda nacional con tasa BCV y generar factura legal.',
    rolesAutorizados: ['Administrador', 'Cajero'],
    pasos: [
      {
        numero: 1,
        titulo: 'Agregar Artículos al Carrito',
        descripcion: 'Busca los productos en el catálogo de mostrador y haz clic en «Agregar». Ajusta las cantidades deseadas (el sistema respeta las existencias disponibles).'
      },
      {
        numero: 2,
        titulo: 'Identificar al Cliente',
        descripcion: 'Ingresa la cédula del cliente. Si no está registrado, completa su nombre y teléfono para incorporarlo automáticamente a la cartera.'
      },
      {
        numero: 3,
        titulo: 'Seleccionar Método de Pago y Tasa',
        descripcion: 'Elige el método de cobro: Efectivo USD, Divisas, Pago Móvil, Transferencia o Tarjeta. Para métodos en Bolívares se habilitará la tasa oficial BCV del día.'
      },
      {
        numero: 4,
        titulo: 'Emitir Factura',
        descripcion: 'Haz clic en «Emitir Factura». El sistema descontará el inventario en el kárdex, registrará el pago en la sesión de caja activa y mostrará el comprobante para imprimir.'
      },
      {
        numero: 5,
        titulo: 'Generar Reporte Gerencial de Ventas',
        descripcion: 'Pulsa «Generar Reporte» para analizar la facturación total, ticket promedio por cliente y volumen diario en PDF o Excel.'
      }
    ],
    consejos: [
      'Para pagos en Efectivo USD o Divisas no se exige tasa de cambio, facilitando un cobro rápido y directo.'
    ]
  },

  clientes: {
    clave: 'clientes',
    titulo: 'Cartera de Clientes',
    modulo: 'Gestión de Clientes',
    icono: 'bi-people',
    color: '#6366f1',
    proposito: 'Gestionar los datos de contacto de clientes, historial de visitas, dispositivos asociados, compras en mostrador y órdenes de servicio técnico realizadas.',
    rolesAutorizados: ['Administrador', 'Cajero', 'Técnico'],
    pasos: [
      {
        numero: 1,
        titulo: 'Buscar en la Cartera',
        descripcion: 'Localiza clientes rápidamente escribiendo su cédula (clave primaria única), nombre o apellido en el buscador instantáneo.'
      },
      {
        numero: 2,
        titulo: 'Registrar un Nuevo Cliente',
        descripcion: 'Haz clic en «Nuevo Cliente». Escribe su cédula normalizada (ej. V-12345678), nombres, teléfono de contacto y dirección.'
      },
      {
        numero: 3,
        titulo: 'Consultar el Historial Integral',
        descripcion: 'Haz clic en el botón de historial en la fila del cliente para ver sus 3 pestañas: Equipos registrados, Facturas emitidas y Órdenes de servicio técnico.'
      },
      {
        numero: 4,
        titulo: 'Generar Reporte de Clientes',
        descripcion: 'Pulsa «Generar Reporte» para ver el valor económico acumulado aportado a la empresa (LTV) y los clientes más recurrentes.'
      }
    ],
    consejos: [
      'La cédula es el identificador único del cliente en todas las operaciones del sistema; no se duplica ni se modifica para preservar el histórico fiscal.'
    ]
  },

  alertas: {
    clave: 'alertas',
    titulo: 'Alertas de Stock Crítico',
    modulo: 'Monitoreo de Inventario',
    icono: 'bi-exclamation-triangle',
    color: '#dc2626',
    proposito: 'Supervisar automáticamente los productos cuyas existencias han alcanzado o caído por debajo del stock mínimo tras ventas o consumos en taller, permitiendo reabastecer a tiempo.',
    rolesAutorizados: ['Administrador'],
    pasos: [
      {
        numero: 1,
        titulo: 'Revisar la Lista de Alertas Pendientes',
        descripcion: 'Consulta los artículos que requieren reposición urgente, observando su stock actual, su stock mínimo configurado y el documento que detonó la alerta.'
      },
      {
        numero: 2,
        titulo: 'Atender y Marcar como Gestionada',
        descripcion: 'Una vez emitida la orden de compra o ingresado el pedido del proveedor, haz clic en «Marcar como Atendida» para limpiar la alerta de la bandeja.'
      }
    ],
    consejos: [
      'El icono de campana en el navbar te avisa en cualquier momento cuántas alertas de stock requieren tu atención.'
    ]
  },

  configuracion: {
    clave: 'configuracion',
    titulo: 'Configuración y Gestión de Usuarios',
    modulo: 'Administración del Sistema',
    icono: 'bi-gear',
    color: '#334155',
    proposito: 'Administrar cuentas de usuario, aprobar solicitudes de nuevos registros, asignar roles con permisos específicos (Administrador, Cajero, Técnico) y auditar la seguridad.',
    rolesAutorizados: ['Administrador'],
    pasos: [
      {
        numero: 1,
        titulo: 'Aprobar Solicitudes de Nuevos Usuarios',
        descripcion: 'En la pestaña «Solicitudes Pendientes», revisa los usuarios que se han registrado recientemente. Asigna el rol correspondiente y pulsa «Aprobar Acceso».'
      },
      {
        numero: 2,
        titulo: 'Gestionar Cuentas y Roles',
        descripcion: 'En la pestaña «Usuarios del Sistema», cambia roles, edita nombres de usuario o activa/desactiva cuentas según el personal activo de la empresa.'
      },
      {
        numero: 3,
        titulo: 'Restablecer Contraseñas',
        descripcion: 'Si un usuario olvida su clave, pulsa el botón de restablecer contraseña para asignarle una nueva clave de acceso segura con hash criptográfico.'
      }
    ],
    consejos: [
      'El rol de Técnico solo tiene acceso al Panel del Técnico y Dispositivos. El Cajero solo a Dashboard, Caja, Ventas y Recepción. El Administrador tiene acceso total.'
    ]
  },

  resumen: {
    clave: 'resumen',
    titulo: 'Resumen General (Dashboard)',
    modulo: 'Panel de Control',
    icono: 'bi-grid',
    color: '#0f172a',
    proposito: 'Proporcionar una vista panorámica del estado de la empresa en tiempo real: existencias de inventario, equipos en taller, ventas del día y accesos directos a las operaciones frecuentes.',
    rolesAutorizados: ['Administrador', 'Cajero'],
    pasos: [
      {
        numero: 1,
        titulo: 'Consultar Indicadores Clave (KPIs)',
        descripcion: 'Revisa en la parte superior las tarjetas con total de productos, equipos en taller, facturación diaria y alertas activas.'
      },
      {
        numero: 2,
        titulo: 'Navegación Rápida a Módulos',
        descripcion: 'Usa los botones de acción rápida para saltar directamente a emitir una venta, abrir una orden de recepción o iniciar el turno de caja.'
      }
    ],
    consejos: [
      'Usa el panel de resumen al iniciar el día para tener una visión clara de los equipos pendientes de entrega.'
    ]
  }
};

/**
 * Mapeo de rutas a las claves de manual
 */
const mapeoRutas = {
  '/inventario': 'inventario',
  '/categorias': 'categorias',
  '/movimientos': 'movimientos',
  '/proveedores': 'proveedores',
  '/recepcion': 'recepcion',
  '/ordenes': 'ordenes',
  '/dispositivos': 'dispositivos',
  '/caja': 'caja',
  '/ventas': 'ventas',
  '/clientes': 'clientes',
  '/alertas': 'alertas',
  '/configuracion': 'configuracion',
  '/resumen': 'resumen',
  '/': 'resumen'
};

/** Clave del módulo seleccionado actualmente en el modal */
const moduloSeleccionadoClave = ref('inventario');

/**
 * Detecta automáticamente el módulo según la ruta actual en la que está el usuario
 */
const sincronizarModuloSegunRuta = () => {
  const rutaActual = route.path.toLowerCase();
  const claveDetectada = mapeoRutas[rutaActual] || 'inventario';
  moduloSeleccionadoClave.value = claveDetectada;
};

// Sincroniza al montar y al cambiar de ruta
watch(() => route.path, () => {
  sincronizarModuloSegunRuta();
}, { immediate: true });

/** Datos del manual activo */
const manualActivo = computed(() => {
  return manualesModulos[moduloSeleccionadoClave.value] || manualesModulos.inventario;
});

/** Lista de todos los módulos disponibles para el selector */
const listaModulos = computed(() => Object.values(manualesModulos));

const seleccionarModulo = (clave) => {
  moduloSeleccionadoClave.value = clave;
};
</script>

<template>
  <Teleport to="body">
    <div
      class="modal fade"
      :id="idModal"
      tabindex="-1"
      aria-hidden="true"
      style="z-index: 1060;"
    >
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
        <div class="modal-content shadow-lg border-0 manual-modal-content">
          <!-- ================= ENCABEZADO DEL MODAL ================= -->
          <div class="modal-header bg-dark text-white p-3 d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-primary px-2.5 py-1.5 d-flex align-items-center gap-1.5 text-uppercase fw-bold" style="font-size: 0.72rem;">
                <i class="bi bi-book-half"></i> Manual de Usuario
              </span>
              <h5 class="modal-title fw-bold mb-0 text-white d-flex align-items-center gap-2">
                <span>Guía Paso a Paso del Sistema TekZon C.A.</span>
              </h5>
            </div>
            <button
              type="button"
              class="btn-close btn-close-white"
              aria-label="Cerrar manual"
              @click="cerrarModal(idModal)"
            ></button>
          </div>

          <!-- ================= CUERPO DEL MODAL ================= -->
          <div class="modal-body p-0">
            <div class="row g-0">
              <!-- BARRA LATERAL: SELECTOR DE MÓDULOS -->
              <div class="col-12 col-md-4 col-lg-3 bg-light border-end manual-sidebar p-3">
                <div class="small fw-bold text-muted text-uppercase mb-2" style="font-size: 0.7rem; letter-spacing: 0.5px;">
                  Módulos del Sistema
                </div>
                <div class="list-group list-group-flush manual-nav">
                  <button
                    v-for="mod in listaModulos"
                    :key="mod.clave"
                    type="button"
                    class="list-group-item list-group-item-action d-flex align-items-center justify-content-between py-2.5 px-3 rounded-2 mb-1 border-0 transition"
                    :class="{ 'active text-white fw-bold shadow-sm': moduloSeleccionadoClave === mod.clave }"
                    :style="moduloSeleccionadoClave === mod.clave ? { backgroundColor: mod.color } : {}"
                    @click="seleccionarModulo(mod.clave)"
                  >
                    <div class="d-flex align-items-center gap-2 text-truncate">
                      <i :class="['bi', mod.icono, 'fs-6']"></i>
                      <span class="small text-truncate">{{ mod.titulo }}</span>
                    </div>
                    <span
                      v-if="moduloSeleccionadoClave === mod.clave"
                      class="badge bg-white text-dark rounded-pill px-1.5 py-0.5"
                      style="font-size: 0.65rem;"
                    >
                      Activo
                    </span>
                  </button>
                </div>
              </div>

              <!-- CONTENIDO PRINCIPAL: GUÍA PASO A PASO DEL MÓDULO -->
              <div class="col-12 col-md-8 col-lg-9 p-4 bg-white manual-main">
                <!-- CABECERA DEL MÓDULO SELECCIONADO -->
                <div class="d-flex flex-wrap align-items-start justify-content-between gap-3 pb-3 mb-3 border-bottom">
                  <div>
                    <div class="d-flex align-items-center gap-2 mb-1">
                      <div
                        class="d-inline-flex align-items-center justify-content-center text-white rounded-3 p-2"
                        :style="{ backgroundColor: manualActivo.color }"
                      >
                        <i :class="['bi', manualActivo.icono, 'fs-4']"></i>
                      </div>
                      <div>
                        <h4 class="fw-bold mb-0 text-dark">{{ manualActivo.titulo }}</h4>
                        <span class="text-muted small">{{ manualActivo.modulo }}</span>
                      </div>
                    </div>
                    <p class="text-secondary small mt-2 mb-0" style="line-height: 1.5;">
                      {{ manualActivo.proposito }}
                    </p>
                  </div>

                  <!-- Roles permitidos -->
                  <div class="d-flex flex-column align-items-end">
                    <span class="small text-muted mb-1" style="font-size: 0.72rem;">Roles con acceso:</span>
                    <div class="d-flex flex-wrap gap-1 justify-content-end">
                      <span
                        v-for="rol in manualActivo.rolesAutorizados"
                        :key="rol"
                        class="badge bg-secondary-subtle text-secondary border px-2 py-1"
                        style="font-size: 0.7rem;"
                      >
                        {{ rol }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- PASOS NUMERADOS -->
                <div class="mb-4">
                  <h6 class="fw-bold text-dark text-uppercase small mb-3 d-flex align-items-center gap-2" style="letter-spacing: 0.5px;">
                    <i class="bi bi-list-ol text-primary fs-5"></i>
                    Procedimiento Paso a Paso:
                  </h6>

                  <div class="d-flex flex-column gap-3">
                    <div
                      v-for="paso in manualActivo.pasos"
                      :key="paso.numero"
                      class="step-card d-flex align-items-start gap-3 p-3 rounded-3 border bg-light transition"
                    >
                      <div
                        class="step-badge rounded-circle text-white fw-bold d-flex align-items-center justify-content-center flex-shrink-0"
                        :style="{ backgroundColor: manualActivo.color }"
                      >
                        {{ paso.numero }}
                      </div>
                      <div class="flex-grow-1">
                        <div class="fw-bold text-dark mb-1" style="font-size: 0.92rem;">
                          {{ paso.titulo }}
                        </div>
                        <p class="text-secondary small mb-0" style="line-height: 1.55;">
                          {{ paso.descripcion }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- CONSEJOS Y RECOMENDACIONES -->
                <div v-if="manualActivo.consejos && manualActivo.consejos.length > 0" class="alert alert-primary bg-primary-subtle border-0 rounded-3 p-3 mb-0">
                  <div class="d-flex align-items-center gap-2 fw-bold text-primary mb-2 small">
                    <i class="bi bi-lightbulb-fill"></i>
                    <span>Consejos y Buenas Prácticas del Módulo:</span>
                  </div>
                  <ul class="mb-0 ps-3 small text-secondary">
                    <li v-for="(consejo, idx) in manualActivo.consejos" :key="idx" class="mb-1">
                      {{ consejo }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- ================= PIE DEL MODAL ================= -->
          <div class="modal-footer bg-light p-3 d-flex align-items-center justify-content-between">
            <span class="small text-muted d-flex align-items-center gap-1.5" style="font-size: 0.75rem;">
              <i class="bi bi-shield-check text-success"></i>
              TekZon C.A. · Documentación de Usuario y Ayuda en Línea
            </span>
            <button type="button" class="btn btn-secondary btn-sm px-4 fw-semibold" @click="cerrarModal(idModal)">
              Entendido / Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.manual-modal-content {
  border-radius: 12px;
  overflow: hidden;
}

.manual-sidebar {
  max-height: 75vh;
  overflow-y: auto;
}

.manual-nav .list-group-item {
  color: #334155;
  cursor: pointer;
}

.manual-nav .list-group-item:hover:not(.active) {
  background-color: #e2e8f0;
}

.manual-main {
  max-height: 75vh;
  overflow-y: auto;
}

.step-card {
  transition: all 0.2s ease;
  border-color: #e2e8f0 !important;
}

.step-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border-color: #cbd5e1 !important;
}

.step-badge {
  width: 32px;
  height: 32px;
  font-size: 0.9rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.transition {
  transition: all 0.2s ease;
}
</style>
