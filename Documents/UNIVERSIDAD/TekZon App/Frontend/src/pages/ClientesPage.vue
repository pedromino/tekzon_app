<script setup>
/**
 * ==========================================================================
 * PÁGINA DE CLIENTES (ClientesPage.vue) - TEKZON C.A.
 * ==========================================================================
 * Módulo 2 · Recepción y Mostrador · Cartera de clientes
 *
 * PROPÓSITO FUNCIONAL:
 *   Administra la CARTERA DE CLIENTES, que es la entidad compartida por los dos
 *   flujos comerciales del sistema (Servicio Técnico y Venta Directa):
 *
 *     · Listado con buscador por cédula, nombre o apellido.
 *     · Alta de un cliente nuevo (cédula, nombre, apellido, teléfono, dirección).
 *     · Edición de los datos de contacto (la CÉDULA NO se modifica: es la llave
 *       primaria y la referencia de las facturas, los equipos y las órdenes).
 *     · Eliminación con confirmación previa.
 *     · HISTORIAL COMPLETO del cliente en tres pestañas: sus equipos, sus
 *       facturas y sus órdenes de servicio técnico.
 *
 * PROPÓSITO TÉCNICO:
 *   · CERO DATOS SIMULADOS: todo proviene de `ClienteServices`, que consulta las
 *     tablas `cliente`, `dispositivo`, `venta` y `orden_tecnico` de `tekzon_bd`.
 *   · El historial se obtiene con UNA sola petición
 *     (`obtenerHistorial`), porque el backend une las tres colecciones con sus
 *     llaves foráneas.
 *   · 3 ESTADOS DE UI:
 *       CARGANDO -> `LoadingSpinner` y banderas `enviando` en los botones.
 *       ÉXITO    -> `ToastNotificaciones` con el mensaje devuelto por el API.
 *       ERROR    -> Toast y panel persistente con el código HTTP y "Reintentar".
 *   · El ERROR 409 (Conflict) se muestra TAL CUAL lo redacta el backend, porque
 *     explica la causa real: cédula duplicada al crear, o cliente con equipos o
 *     ventas registradas al eliminar.
 *   · Los modales se abren y cierran con el utilitario compartido
 *     `abrirModal` / `cerrarModal` (nunca con `data-bs-toggle`).
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import ModalGenerarReporte from '../components/ModalGenerarReporte.vue';
import ClienteServices from '../services/ClienteServices.js';
// Utilitario compartido de apertura/cierre de modales de Bootstrap 5.
import { abrirModal, cerrarModal } from '../utils/utilidadesModales.js';
// Helpers de formato y presentación compartidos por los módulos nuevos.
import {
  aNumero,
  describirError,
  etiquetaMetodoPago,
  formatearFecha,
  formatearMoneda,
  presentacionEstadoOrden
} from '../services/formato.js';

// ==========================================================================
// ESTADO REACTIVO PRINCIPAL
// ==========================================================================

/** Cartera completa de clientes descargada del API. */
const clientes = ref([]);
/** Texto del buscador (cédula, nombre o apellido). */
const textoBusqueda = ref('');

/** Formulario del modal de alta / edición. */
const formularioCliente = ref({
  cedula: '',
  nombre: '',
  apellido: '',
  telefono: '',
  direccion: ''
});

/** ¿El modal está en modo edición? (en el alta la cédula sí se captura). */
const esEdicionCliente = ref(false);

/** Cliente sobre el que se está operando (edición o eliminación). */
const clienteEnEdicion = ref(null);
const clienteAEliminar = ref(null);

/** Historial del cliente abierto en el modal: equipos, facturas y órdenes. */
const clienteHistorial = ref(null);
const historialCliente = ref({
  dispositivos: [],
  facturas: [],
  ordenes: []
});

/** Pestaña activa del modal de historial: 'equipos' | 'facturas' | 'ordenes'. */
const pestanaHistorial = ref('equipos');

// ==========================================================================
// ESTADOS DE UI (Cargando / Éxito / Error)
// ==========================================================================
const estadoCargando = ref(false);
const cargandoHistorial = ref(false);
const enviandoFormulario = ref(false);
const procesandoEliminacion = ref(false);

const mensajeErrorCarga = ref('');
const codigoErrorCarga = ref('');

/** Estado de Error DENTRO del formulario (por ejemplo, el 409 de cédula repetida). */
const mensajeErrorFormulario = ref('');
/** Estado de Error DENTRO del modal de historial. */
const mensajeErrorHistorial = ref('');
/** Errores de validación por campo. */
const erroresValidacion = ref({});

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

// ==========================================================================
// CARGA DE DATOS DESDE EL BACKEND (CERO DATOS SIMULADOS)
// ==========================================================================
/**
 * CARGA LA CARTERA DE CLIENTES.
 * Se descarga la lista completa (ya mapeada por el servicio) y el filtrado por
 * texto se resuelve en memoria para que el buscador responda al instante. El
 * backend también admite `{ texto }` y es quien manda cuando se filtra allí.
 */
const cargarClientes = async () => {
  estadoCargando.value = true;
  mensajeErrorCarga.value = '';
  codigoErrorCarga.value = '';

  try {
    clientes.value = await ClienteServices.listarClientes({});
  } catch (error) {
    clientes.value = [];

    const descripcion = describirError(error);
    codigoErrorCarga.value = descripcion.codigo;
    mensajeErrorCarga.value = descripcion.mensaje;

    mostrarToast(`Error al cargar la cartera (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    estadoCargando.value = false;
  }
};

onMounted(() => {
  cargarClientes();
});

// ==========================================================================
// BUSCADOR Y TABLA
// ==========================================================================
/** Clientes que coinciden con el texto buscado (cédula, nombre o apellido). */
const clientesFiltrados = computed(() => {
  const texto = textoBusqueda.value.trim().toLowerCase();

  if (!texto) return clientes.value;

  return clientes.value.filter((cliente) =>
    String(cliente.cedula).toLowerCase().includes(texto)
    || String(cliente.nombre).toLowerCase().includes(texto)
    || String(cliente.apellido).toLowerCase().includes(texto)
    || String(cliente.nombreCompleto).toLowerCase().includes(texto)
  );
});

/** Totales mostrados en la franja informativa de la tabla. */
const resumenCartera = computed(() => ({
  mostrados: clientesFiltrados.value.length,
  total: clientes.value.length,
  dispositivos: clientesFiltrados.value.reduce((suma, cliente) => suma + aNumero(cliente.totalDispositivos), 0),
  compras: clientesFiltrados.value.reduce((suma, cliente) => suma + aNumero(cliente.totalCompras), 0)
}));

/** Iniciales del cliente para el avatar de la tabla. */
const inicialesCliente = (cliente) => {
  const inicialNombre = String(cliente.nombre || '').trim().charAt(0);
  const inicialApellido = String(cliente.apellido || '').trim().charAt(0);

  return `${inicialNombre}${inicialApellido}`.toUpperCase() || '?';
};

/** Limpia el buscador y vuelve a mostrar la cartera completa. */
const limpiarBusqueda = () => {
  textoBusqueda.value = '';
};

// ==========================================================================
// ALTA Y EDICIÓN (MODAL modalCliente)
// ==========================================================================
/**
 * NORMALIZA UNA CÉDULA.
 * PROPÓSITO TÉCNICO: la cédula es la llave primaria de `cliente`; se quitan
 * puntos, guiones y espacios para que "V-12.345.678" y "v12345678" sean el
 * mismo registro y no se creen duplicados que el backend rechazaría con 409.
 */
const normalizarCedula = (valor) => String(valor || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');

/** Abre el modal en modo ALTA con el formulario en blanco. */
const prepararNuevoCliente = () => {
  esEdicionCliente.value = false;
  clienteEnEdicion.value = null;
  mensajeErrorFormulario.value = '';
  erroresValidacion.value = {};
  formularioCliente.value = { cedula: '', nombre: '', apellido: '', telefono: '', direccion: '' };

  abrirModal('modalCliente');
};

/** Abre el modal en modo EDICIÓN con los datos reales del cliente. */
const prepararEdicionCliente = (cliente) => {
  esEdicionCliente.value = true;
  clienteEnEdicion.value = cliente;
  mensajeErrorFormulario.value = '';
  erroresValidacion.value = {};

  formularioCliente.value = {
    cedula: cliente.cedula,
    nombre: cliente.nombre,
    apellido: cliente.apellido,
    telefono: cliente.telefono,
    direccion: cliente.direccion
  };

  abrirModal('modalCliente');
};

/**
 * VALIDACIÓN LOCAL DEL FORMULARIO.
 * Réplica de las reglas del backend para responder de inmediato; el servidor
 * vuelve a validar y es la autoridad final (400 datos inválidos / 409 duplicado).
 */
const validarFormularioCliente = () => {
  const errores = {};

  if (!normalizarCedula(formularioCliente.value.cedula)) {
    errores.cedula = 'La cédula es obligatoria: identifica al cliente en todo el sistema.';
  }

  if (!String(formularioCliente.value.nombre).trim()) {
    errores.nombre = 'El nombre del cliente es obligatorio.';
  }

  if (!String(formularioCliente.value.apellido).trim()) {
    errores.apellido = 'El apellido del cliente es obligatorio.';
  }

  erroresValidacion.value = errores;
  return Object.keys(errores).length === 0;
};

/**
 * GUARDA EL CLIENTE (ALTA O EDICIÓN).
 *
 * PROPÓSITO TÉCNICO: en la edición NO se envía la cédula al backend (el servicio
 * la usa como parámetro de la ruta) porque es la llave del sistema y no puede
 * cambiar: las facturas, los equipos y las órdenes apuntan a ella.
 */
const guardarCliente = async () => {
  if (enviandoFormulario.value) return;

  if (!validarFormularioCliente()) {
    mostrarToast('Revise el formulario', 'Complete los campos obligatorios del cliente.', 'warning');
    return;
  }

  enviandoFormulario.value = true;
  mensajeErrorFormulario.value = '';

  const datosCliente = {
    cedula: normalizarCedula(formularioCliente.value.cedula),
    nombre: String(formularioCliente.value.nombre).trim(),
    apellido: String(formularioCliente.value.apellido).trim(),
    telefono: String(formularioCliente.value.telefono).trim(),
    direccion: String(formularioCliente.value.direccion).trim()
  };

  try {
    if (esEdicionCliente.value) {
      const resultado = await ClienteServices.actualizarCliente(clienteEnEdicion.value.cedula, datosCliente);
      mostrarToast('Cliente actualizado', resultado.mensaje || 'Los datos de contacto fueron actualizados.', 'success');
    } else {
      const resultado = await ClienteServices.crearCliente(datosCliente);
      mostrarToast('Cliente registrado', resultado.mensaje || 'El cliente fue agregado a la cartera.', 'success');
    }

    // Recarga de la tabla con los datos reales de la base de datos.
    await cargarClientes();
    cerrarModal('modalCliente');
  } catch (error) {
    const descripcion = describirError(error);

    // El 409 explica la causa real (cédula ya registrada): se muestra tal cual.
    mensajeErrorFormulario.value = error?.codigoHttp === 409
      ? error.mensaje
      : descripcion.mensaje;

    mostrarToast(`No se pudo guardar el cliente (${descripcion.codigo})`, mensajeErrorFormulario.value, 'error');
  } finally {
    enviandoFormulario.value = false;
  }
};

// ==========================================================================
// ELIMINACIÓN DE CLIENTES
// ==========================================================================
/**
 * ELIMINA UN CLIENTE CON CONFIRMACIÓN PREVIA.
 *
 * PROPÓSITO FUNCIONAL: la eliminación es irreversible; además el backend la
 * rechaza con 409 cuando el cliente tiene equipos o ventas registradas, para no
 * romper la integridad referencial del histórico.
 */
const eliminarClienteConConfirmacion = async (cliente) => {
  const confirmado = window.confirm(
    `¿Confirma eliminar al cliente ${cliente.nombreCompleto || cliente.cedula} (${cliente.cedula})?\n`
    + 'Esta acción no puede deshacerse.'
  );

  if (!confirmado) return;

  clienteAEliminar.value = cliente;
  procesandoEliminacion.value = true;

  try {
    const resultado = await ClienteServices.eliminarCliente(cliente.cedula);

    mostrarToast(
      'Cliente eliminado',
      resultado?.mensaje || `${cliente.nombreCompleto} fue retirado de la cartera.`,
      'success'
    );

    await cargarClientes();
  } catch (error) {
    const descripcion = describirError(error);

    // El 409 informa que el cliente tiene equipos o ventas: se muestra literal.
    const detalle = error?.codigoHttp === 409 ? error.mensaje : descripcion.mensaje;

    mostrarToast(`No se pudo eliminar el cliente (${descripcion.codigo})`, detalle, 'error');
  } finally {
    procesandoEliminacion.value = false;
    clienteAEliminar.value = null;
  }
};

// ==========================================================================
// HISTORIAL DEL CLIENTE (MODAL modalHistorialCliente)
// ==========================================================================
/**
 * ABRE EL HISTORIAL COMPLETO DEL CLIENTE.
 * `obtenerHistorial` devuelve en una sola respuesta sus equipos, sus facturas y
 * sus órdenes de servicio técnico.
 */
const abrirHistorialCliente = async (cliente) => {
  clienteHistorial.value = cliente;
  historialCliente.value = { dispositivos: [], facturas: [], ordenes: [] };
  pestanaHistorial.value = 'equipos';
  mensajeErrorHistorial.value = '';
  cargandoHistorial.value = true;

  // El modal se abre de inmediato para que el usuario vea el estado de Carga.
  abrirModal('modalHistorialCliente');

  try {
    const historial = await ClienteServices.obtenerHistorial(cliente.cedula);

    clienteHistorial.value = historial.cliente || cliente;
    historialCliente.value = {
      dispositivos: historial.dispositivos,
      facturas: historial.facturas,
      ordenes: historial.ordenes
    };
  } catch (error) {
    const descripcion = describirError(error);
    mensajeErrorHistorial.value = `${descripcion.codigo} · ${descripcion.mensaje}`;

    mostrarToast(`Error al cargar el historial (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    cargandoHistorial.value = false;
  }
};

/** Número de registros de cada pestaña (se muestra en el botón). */
const conteoHistorial = computed(() => ({
  equipos: historialCliente.value.dispositivos.length,
  facturas: historialCliente.value.facturas.length,
  ordenes: historialCliente.value.ordenes.length
}));
</script>

<template>
  <main class="content" id="contenido">
    <!-- ================= ESTADO DE ÉXITO / ERROR (pila de Toasts) ================= -->
    <ToastNotificaciones :notificaciones="notificaciones" @cerrar="cerrarToastPorId" />

    <div class="page-head">
      <div>
        <h2>Cartera de clientes</h2>
        <p>
          Datos de contacto, equipos registrados y facturación. La cédula es la llave del sistema:
          identifica al cliente en la recepción, en las ventas y en las órdenes de servicio.
        </p>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#modalReporteClientes">
          <i class="bi bi-file-earmark-bar-graph"></i> Generar Reporte
        </button>
        <button class="btn btn-outline-secondary" type="button" :disabled="estadoCargando" @click="cargarClientes">
          <span v-if="estadoCargando" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
          <i v-else class="bi bi-arrow-clockwise"></i> Actualizar
        </button>
        <button class="btn btn-primary" type="button" @click="prepararNuevoCliente">
          <i class="bi bi-person-plus"></i> Nuevo cliente
        </button>
      </div>
    </div>

    <!-- ================= ESTADO DE CARGA ================= -->
    <LoadingSpinner
      v-if="estadoCargando && clientes.length === 0"
      mensaje="Cargando la cartera de clientes desde la base de datos..."
    />

    <template v-else>
      <!-- ================= ESTADO DE ERROR PERSISTENTE ================= -->
      <div v-if="mensajeErrorCarga" class="readonly-note" role="alert">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span><strong>{{ codigoErrorCarga }}</strong> · {{ mensajeErrorCarga }}</span>
        <button class="btn btn-sm btn-outline-danger ms-auto" type="button" @click="cargarClientes">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button>
      </div>

      <section class="card-ts">
        <!-- ---------------- TOOLBAR: BUSCADOR Y ACCIONES ---------------- -->
        <div class="toolbar">
          <div class="input-icon">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input
              class="form-control"
              v-model="textoBusqueda"
              type="search"
              placeholder="Buscar por cédula, nombre o apellido"
              aria-label="Buscar clientes"
            >
          </div>

          <button class="btn btn-outline-secondary" type="button" :disabled="!textoBusqueda" @click="limpiarBusqueda">
            <i class="bi bi-x-circle"></i> Limpiar
          </button>

          <button class="btn btn-outline-secondary" type="button" :disabled="estadoCargando" @click="cargarClientes">
            <i class="bi bi-arrow-clockwise"></i> Actualizar
          </button>
        </div>

        <!-- Franja de resumen del filtrado actual -->
        <div class="summary-strip px-3 pt-3">
          <span class="chip"><i class="bi bi-people"></i> Clientes mostrados: <strong>{{ resumenCartera.mostrados }}</strong></span>
          <span class="chip"><i class="bi bi-person-vcard"></i> En la cartera: <strong>{{ resumenCartera.total }}</strong></span>
          <span class="chip"><i class="bi bi-laptop"></i> Equipos: <strong>{{ resumenCartera.dispositivos }}</strong></span>
          <span class="chip"><i class="bi bi-receipt"></i> Compras: <strong>{{ resumenCartera.compras }}</strong></span>
        </div>

        <!-- Sub-estado: cartera vacía o búsqueda sin resultados -->
        <div v-if="clientesFiltrados.length === 0" class="empty-state">
          <i class="bi bi-person-x"></i>
          <h3>No hay clientes que coincidan</h3>
          <p class="small">
            {{ clientes.length === 0
              ? 'La cartera está vacía. Registre el primer cliente para poder facturar y recibir equipos.'
              : 'Pruebe con otra cédula, nombre o apellido.' }}
          </p>
          <button class="btn btn-primary" type="button" @click="prepararNuevoCliente">
            <i class="bi bi-person-plus"></i> Registrar primer cliente
          </button>
        </div>

        <div v-else class="p-3">
          <div class="table-wrap">
            <table class="table table-ts">
              <thead>
                <tr>
                  <th scope="col">Cédula</th>
                  <th scope="col">Nombre completo</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col">Dirección</th>
                  <th scope="col" class="text-center">Dispositivos</th>
                  <th scope="col" class="text-center">Compras</th>
                  <th scope="col" class="text-center">Órdenes</th>
                  <th scope="col" class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="cliente in clientesFiltrados" :key="cliente.cedula">
                  <td><span class="code-chip">{{ cliente.cedula }}</span></td>
                  <td>
                    <div class="d-flex align-items-center gap-2">
                      <span class="avatar avatar--sm">{{ inicialesCliente(cliente) }}</span>
                      <div>
                        <strong class="fw-semibold d-block">{{ cliente.nombreCompleto || 'Sin nombre' }}</strong>
                        <small class="text-muted-2">
                          {{ cliente.totalCompras > 0 ? 'Cliente con compras registradas' : 'Sin compras todavía' }}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td class="tabular">{{ cliente.telefono || '—' }}</td>
                  <td style="max-width:240px;">
                    <span class="d-block text-truncate" :title="cliente.direccion">{{ cliente.direccion || '—' }}</span>
                  </td>
                  <td class="text-center tabular">{{ cliente.totalDispositivos }}</td>
                  <td class="text-center tabular">{{ cliente.totalCompras }}</td>
                  <td class="text-center tabular">{{ cliente.totalOrdenes }}</td>
                  <td class="text-end">
                    <div class="d-inline-flex gap-1">
                      <button
                        class="btn btn-ghost btn-icon"
                        type="button"
                        title="Ver historial del cliente"
                        @click="abrirHistorialCliente(cliente)"
                      >
                        <i class="bi bi-clock-history"></i>
                      </button>
                      <button
                        class="btn btn-ghost btn-icon"
                        type="button"
                        title="Editar datos de contacto"
                        @click="prepararEdicionCliente(cliente)"
                      >
                        <i class="bi bi-pencil-square"></i>
                      </button>
                      <button
                        class="btn btn-ghost btn-icon btn-ghost-danger"
                        type="button"
                        title="Eliminar cliente"
                        :disabled="procesandoEliminacion"
                        @click="eliminarClienteConConfirmacion(cliente)"
                      >
                        <i class="bi bi-trash3"></i>
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
         MODAL DE ALTA / EDICIÓN DE CLIENTE (id: modalCliente)
         ==========================================================================
         En el ALTA la cédula es editable; en la EDICIÓN queda deshabilitada porque
         es la llave del sistema y las facturas, los equipos y las órdenes apuntan
         a ella.
    -->
    <div class="modal fade" id="modalCliente" tabindex="-1" aria-hidden="true" aria-labelledby="modalClienteLabel">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modalClienteLabel">
              <i class="bi" :class="esEdicionCliente ? 'bi-pencil-square' : 'bi-person-plus'"></i>
              {{ esEdicionCliente ? 'Editar cliente' : 'Registrar cliente nuevo' }}
            </h5>
            <button type="button" class="btn-close" aria-label="Cerrar" :disabled="enviandoFormulario" @click="cerrarModal('modalCliente')"></button>
          </div>

          <form @submit.prevent="guardarCliente" novalidate>
            <div class="modal-body">
              <!-- Estado de Error del formulario (por ejemplo, el 409 del backend) -->
              <div v-if="mensajeErrorFormulario" class="readonly-note" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <span>{{ mensajeErrorFormulario }}</span>
              </div>

              <div class="row g-3">
                <div class="col-12">
                  <label class="form-label" for="cliente-cedula">Cédula*</label>
                  <input
                    id="cliente-cedula"
                    class="form-control"
                    :class="{ 'is-invalid': erroresValidacion.cedula }"
                    v-model="formularioCliente.cedula"
                    :disabled="esEdicionCliente || enviandoFormulario"
                    placeholder="V-12345678"
                  >
                  <div v-if="erroresValidacion.cedula" class="invalid-feedback d-block">{{ erroresValidacion.cedula }}</div>
                  <div v-else-if="esEdicionCliente" class="form-text">
                    <i class="bi bi-lock"></i>
                    La cédula es la llave del sistema: no puede modificarse porque identifica al cliente
                    en las facturas, los equipos y las órdenes registradas.
                  </div>
                  <div v-else class="form-text">Se normaliza sin puntos ni guiones (ej.: V12345678).</div>
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="cliente-nombre">Nombre*</label>
                  <input
                    id="cliente-nombre"
                    class="form-control"
                    :class="{ 'is-invalid': erroresValidacion.nombre }"
                    v-model="formularioCliente.nombre"
                    :disabled="enviandoFormulario"
                    placeholder="Nombre"
                  >
                  <div v-if="erroresValidacion.nombre" class="invalid-feedback d-block">{{ erroresValidacion.nombre }}</div>
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="cliente-apellido">Apellido*</label>
                  <input
                    id="cliente-apellido"
                    class="form-control"
                    :class="{ 'is-invalid': erroresValidacion.apellido }"
                    v-model="formularioCliente.apellido"
                    :disabled="enviandoFormulario"
                    placeholder="Apellido"
                  >
                  <div v-if="erroresValidacion.apellido" class="invalid-feedback d-block">{{ erroresValidacion.apellido }}</div>
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="cliente-telefono">Teléfono</label>
                  <input
                    id="cliente-telefono"
                    class="form-control"
                    v-model="formularioCliente.telefono"
                    :disabled="enviandoFormulario"
                    placeholder="0414-0000000"
                  >
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="cliente-direccion">Dirección</label>
                  <input
                    id="cliente-direccion"
                    class="form-control"
                    v-model="formularioCliente.direccion"
                    :disabled="enviandoFormulario"
                    placeholder="Dirección del cliente"
                  >
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" :disabled="enviandoFormulario" @click="cerrarModal('modalCliente')">
                Cancelar
              </button>
              <!-- Botón deshabilitado durante el POST/PUT para impedir duplicados -->
              <button type="submit" class="btn btn-primary" :disabled="enviandoFormulario">
                <span v-if="enviandoFormulario" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                <i v-else class="bi bi-check2-circle"></i>
                {{ enviandoFormulario ? 'Guardando...' : (esEdicionCliente ? 'Guardar cambios' : 'Registrar cliente') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- ==========================================================================
         MODAL DE HISTORIAL DEL CLIENTE (id: modalHistorialCliente)
         ==========================================================================
         Reúne los EQUIPOS, las FACTURAS y las ÓRDENES DE SERVICIO del cliente. La
         información proviene de una sola consulta al backend.
    -->
    <div class="modal fade" id="modalHistorialCliente" tabindex="-1" aria-hidden="true" aria-labelledby="modalHistorialClienteLabel">
      <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modalHistorialClienteLabel">
              <i class="bi bi-clock-history"></i> Historial del cliente
            </h5>
            <button type="button" class="btn-close" aria-label="Cerrar" @click="cerrarModal('modalHistorialCliente')"></button>
          </div>

          <div class="modal-body">
            <!-- Estado de carga del historial -->
            <div v-if="cargandoHistorial" class="empty-state py-4">
              <div class="spinner-border text-primary mb-3" role="status" aria-hidden="true"></div>
              <h3>Consultando el historial...</h3>
              <p class="small">Reuniendo equipos, facturas y órdenes de servicio.</p>
            </div>

            <template v-else>
              <!-- Estado de Error del historial -->
              <div v-if="mensajeErrorHistorial" class="readonly-note" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <span>{{ mensajeErrorHistorial }}</span>
                <button class="btn btn-sm btn-outline-danger ms-auto" type="button" @click="abrirHistorialCliente(clienteHistorial)">
                  <i class="bi bi-arrow-clockwise"></i> Reintentar
                </button>
              </div>

              <!-- Datos del cliente -->
              <div v-if="clienteHistorial" class="d-flex align-items-center gap-3 pb-3 mb-3" style="border-bottom:1px solid var(--border-color);">
                <span class="avatar">{{ inicialesCliente(clienteHistorial) }}</span>
                <div class="flex-grow-1">
                  <strong class="d-block">{{ clienteHistorial.nombreCompleto || 'Sin nombre' }}</strong>
                  <span class="small text-muted-2">
                    <span class="code-chip">{{ clienteHistorial.cedula }}</span>
                    <span v-if="clienteHistorial.telefono"> · <i class="bi bi-telephone"></i> {{ clienteHistorial.telefono }}</span>
                  </span>
                  <p class="small text-muted-2 mb-0">{{ clienteHistorial.direccion || 'Sin dirección registrada' }}</p>
                </div>
                <div class="text-end">
                  <span class="badge-ts badge-info">{{ clienteHistorial.totalDispositivos }} equipo(s)</span>
                  <span class="badge-ts badge-brand ms-1">{{ clienteHistorial.totalCompras }} compra(s)</span>
                </div>
              </div>

              <!-- Pestañas: equipos, facturas y órdenes de servicio -->
              <div class="view-switch mb-3">
                <button type="button" :class="{ active: pestanaHistorial === 'equipos' }" @click="pestanaHistorial = 'equipos'">
                  <i class="bi bi-laptop"></i> Equipos ({{ conteoHistorial.equipos }})
                </button>
                <button type="button" :class="{ active: pestanaHistorial === 'facturas' }" @click="pestanaHistorial = 'facturas'">
                  <i class="bi bi-receipt"></i> Facturas ({{ conteoHistorial.facturas }})
                </button>
                <button type="button" :class="{ active: pestanaHistorial === 'ordenes' }" @click="pestanaHistorial = 'ordenes'">
                  <i class="bi bi-tools"></i> Órdenes de servicio ({{ conteoHistorial.ordenes }})
                </button>
              </div>

              <!-- ---------------- PESTAÑA 1 · EQUIPOS ---------------- -->
              <div v-if="pestanaHistorial === 'equipos'">
                <div v-if="historialCliente.dispositivos.length === 0" class="readonly-note" style="background:var(--surface-soft);color:var(--text-muted);border-color:var(--border-color);">
                  <i class="bi bi-info-circle"></i>
                  <span>Este cliente todavía no tiene equipos registrados en el taller.</span>
                </div>

                <div v-else class="table-wrap">
                  <table class="table table-ts">
                    <thead>
                      <tr>
                        <th scope="col">Tipo</th>
                        <th scope="col">Marca</th>
                        <th scope="col">Modelo</th>
                        <th scope="col">N° de serie</th>
                        <th scope="col" class="text-center">Órdenes</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="dispositivo in historialCliente.dispositivos" :key="dispositivo.id">
                        <td><strong class="fw-semibold">{{ dispositivo.tipo }}</strong></td>
                        <td>{{ dispositivo.marca || '—' }}</td>
                        <td>{{ dispositivo.modelo || '—' }}</td>
                        <td><span class="code-chip">{{ dispositivo.serie || 'Sin serie' }}</span></td>
                        <td class="text-center tabular">{{ dispositivo.totalOrdenes }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- ---------------- PESTAÑA 2 · FACTURAS ---------------- -->
              <div v-else-if="pestanaHistorial === 'facturas'">
                <div v-if="historialCliente.facturas.length === 0" class="readonly-note" style="background:var(--surface-soft);color:var(--text-muted);border-color:var(--border-color);">
                  <i class="bi bi-info-circle"></i>
                  <span>Este cliente todavía no registra compras facturadas.</span>
                </div>

                <div v-else class="table-wrap">
                  <table class="table table-ts">
                    <thead>
                      <tr>
                        <th scope="col">N° factura</th>
                        <th scope="col">Fecha</th>
                        <th scope="col" class="text-center">Líneas</th>
                        <th scope="col">Método de pago</th>
                        <th scope="col" class="text-end">Total</th>
                        <th scope="col">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="factura in historialCliente.facturas" :key="factura.numeroFactura">
                        <td><span class="code-chip">{{ factura.numeroFactura }}</span></td>
                        <td class="tabular">{{ formatearFecha(factura.fecha) }}</td>
                        <td class="text-center tabular">{{ factura.totalLineas }}</td>
                        <td>{{ etiquetaMetodoPago(factura.metodoPago) }}</td>
                        <td class="text-end tabular"><strong>{{ formatearMoneda(factura.total) }}</strong></td>
                        <td>
                          <span class="badge-ts" :class="factura.anulada ? 'badge-out' : 'badge-ok'">
                            {{ factura.anulada ? 'Anulada' : 'Vigente' }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- ---------------- PESTAÑA 3 · ÓRDENES DE SERVICIO ---------------- -->
              <div v-else>
                <div v-if="historialCliente.ordenes.length === 0" class="readonly-note" style="background:var(--surface-soft);color:var(--text-muted);border-color:var(--border-color);">
                  <i class="bi bi-info-circle"></i>
                  <span>Este cliente todavía no tiene órdenes de servicio técnico.</span>
                </div>

                <div v-else class="table-wrap">
                  <table class="table table-ts">
                    <thead>
                      <tr>
                        <th scope="col">N° orden</th>
                        <th scope="col">Ingreso</th>
                        <th scope="col">Equipo</th>
                        <th scope="col">Falla reportada</th>
                        <th scope="col">Estado</th>
                        <th scope="col" class="text-end">Total</th>
                        <th scope="col">Cobro</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="orden in historialCliente.ordenes" :key="orden.id">
                        <td><span class="code-chip">{{ orden.id }}</span></td>
                        <td class="tabular">{{ formatearFecha(orden.fechaIngreso) }}</td>
                        <td>{{ orden.equipo || '—' }}</td>
                        <td style="max-width:220px;">
                          <span class="d-block text-truncate" :title="orden.falla">{{ orden.falla || '—' }}</span>
                        </td>
                        <td>
                          <span class="badge-ts" :class="presentacionEstadoOrden(orden.estado).clase">
                            <i class="bi" :class="presentacionEstadoOrden(orden.estado).icono"></i>
                            {{ presentacionEstadoOrden(orden.estado).etiqueta }}
                          </span>
                        </td>
                        <td class="text-end tabular"><strong>{{ formatearMoneda(orden.total) }}</strong></td>
                        <td>
                          <span class="badge-ts" :class="orden.cobrada ? 'badge-ok' : 'badge-neutral'">
                            {{ orden.cobrada ? (orden.numeroFactura ? `Facturada ${orden.numeroFactura}` : 'Cobrada') : 'Pendiente' }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" @click="cerrarModal('modalHistorialCliente')">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal para la Generación de Reportes de Clientes -->
    <ModalGenerarReporte
      id-modal="modalReporteClientes"
      tipo-reporte="clientes"
      titulo="Reporte Gerencial de Cartera de Clientes"
      subtitulo="Segmentación de valor, frecuencia de compras, órdenes de servicio y antigüedad de clientes"
      clasificacion="GERENCIAL"
      @notificar="manejarNotificacionReporte"
    />
  </main>
</template>
