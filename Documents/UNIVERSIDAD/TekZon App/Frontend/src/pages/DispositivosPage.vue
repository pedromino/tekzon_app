<script setup>
/**
 * ==========================================================================
 * PÁGINA DE DISPOSITIVOS (DispositivosPage.vue) - TEKZON C.A.
 * ==========================================================================
 * Módulo 2 · Recepción · Equipos de los clientes
 *
 * PROPÓSITO FUNCIONAL:
 *   Administra los EQUIPOS que los clientes dejan en el taller. Cada registro
 *   guarda el tipo de equipo, la marca, el modelo y el número de serie, junto
 *   con su PROPIETARIO (cédula del cliente). Permite:
 *
 *     · Listar y buscar equipos por tipo, marca, modelo o número de serie.
 *     · Filtrar por la cédula del propietario.
 *     · Registrar un equipo nuevo asociado a un cliente existente.
 *     · Editar las características del equipo.
 *     · TRANSFERIR la propiedad del equipo a otro cliente (cambio de titular).
 *     · Eliminar un equipo (el backend responde 409 si tiene órdenes de servicio).
 *
 * PROPÓSITO TÉCNICO:
 *   · CERO DATOS SIMULADOS: la tabla se alimenta exclusivamente de
 *     `DispositivoServices.listarDispositivos()`, que consulta la tabla
 *     `dispositivo` de `tekzon_bd` uniéndola con `cliente` para traer el nombre
 *     del propietario y con `orden_tecnico` para contar sus reparaciones.
 *   · Los filtros de texto y de cédula viajan como parámetros de consulta al
 *     backend, de modo que el filtrado se hace sobre la base de datos.
 *   · La TRANSFERENCIA usa `transferirPropietario` (PATCH), porque cambiar el
 *     titular es una operación distinta a editar las características del equipo.
 *   · 3 ESTADOS DE UI:
 *       CARGANDO -> `LoadingSpinner` y banderas `enviando` en los botones.
 *       ÉXITO    -> `ToastNotificaciones` con el mensaje devuelto por el API.
 *       ERROR    -> Toast y panel persistente con el código HTTP y "Reintentar".
 *   · El 409 se muestra TAL CUAL lo redacta el backend, porque explica la causa
 *     real: el equipo tiene órdenes de servicio asociadas.
 *   · Los modales se abren y cierran con el utilitario compartido
 *     `abrirModal` / `cerrarModal` (nunca con `data-bs-toggle`).
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import ModalGenerarReporte from '../components/ModalGenerarReporte.vue';
import DispositivoServices from '../services/DispositivoServices.js';
// Utilitario compartido de apertura/cierre de modales de Bootstrap 5.
import { abrirModal, cerrarModal } from '../utils/utilidadesModales.js';
// Helpers de formato compartidos por los módulos nuevos.
import { describirError } from '../services/formato.js';

// ==========================================================================
// CONSTANTES DEL MÓDULO
// ==========================================================================
/**
 * TIPOS DE EQUIPO ADMITIDOS EN LA RECEPCIÓN.
 * Se ofrecen como lista cerrada para que la tabla `dispositivo` guarde siempre
 * el mismo vocabulario (`nombre_dis`) y las búsquedas sean fiables.
 */
const TIPOS_DISPOSITIVO = [
  'Laptop',
  'Computadora de escritorio',
  'Teléfono',
  'Tablet',
  'Impresora',
  'Monitor',
  'Consola',
  'Otro'
];

// ==========================================================================
// ESTADO REACTIVO PRINCIPAL
// ==========================================================================

/** Equipos descargados del API (ya mapeados por el servicio). */
const dispositivos = ref([]);

/** Filtros de la consulta: texto libre y cédula del propietario. */
const filtroTexto = ref('');
const filtroCedula = ref('');

/** Formulario del modal de alta / edición. */
const formularioDispositivo = ref({
  cedula: '',
  tipo: 'Laptop',
  marca: '',
  modelo: '',
  serie: ''
});

/** ¿El modal está en modo edición? (la cédula del propietario sólo se captura al crear). */
const esEdicionDispositivo = ref(false);

/** Equipo sobre el que se está operando. */
const dispositivoEnEdicion = ref(null);
const dispositivoAEliminar = ref(null);

/** Transferencia de propiedad: equipo afectado y cédula del nuevo titular. */
const dispositivoATransferir = ref(null);
const nuevaCedulaPropietario = ref('');

// ==========================================================================
// ESTADOS DE UI (Cargando / Éxito / Error)
// ==========================================================================
const estadoCargando = ref(false);
const cargandoTabla = ref(false);
const enviandoFormulario = ref(false);
const enviandoTransferencia = ref(false);
const procesandoEliminacion = ref(false);

const mensajeErrorCarga = ref('');
const codigoErrorCarga = ref('');

/** Estado de Error DENTRO del formulario (por ejemplo, el 400 o el 404 del backend). */
const mensajeErrorFormulario = ref('');
/** Estado de Error DENTRO del modal de transferencia. */
const mensajeErrorTransferencia = ref('');
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
 * CONSULTA LOS EQUIPOS APLICANDO LOS FILTROS EN EL SERVIDOR.
 * Los parámetros viajan al backend (`texto`, `cedula`), por lo que la tabla
 * siempre refleja lo que hay almacenado y no un filtrado sobre datos viejos.
 */
const cargarDispositivos = async () => {
  cargandoTabla.value = true;
  mensajeErrorCarga.value = '';
  codigoErrorCarga.value = '';

  try {
    dispositivos.value = await DispositivoServices.listarDispositivos({
      texto: filtroTexto.value.trim(),
      cedula: filtroCedula.value.trim()
    });
  } catch (error) {
    dispositivos.value = [];

    const descripcion = describirError(error);
    codigoErrorCarga.value = descripcion.codigo;
    mensajeErrorCarga.value = descripcion.mensaje;

    mostrarToast(`Error al cargar los equipos (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    cargandoTabla.value = false;
  }
};

/** Carga inicial de la página. */
const cargarPaginaDispositivos = async () => {
  estadoCargando.value = true;

  await cargarDispositivos();

  estadoCargando.value = false;
};

onMounted(() => {
  cargarPaginaDispositivos();
});

/** Limpia ambos filtros y vuelve a consultar todos los equipos. */
const limpiarFiltros = async () => {
  filtroTexto.value = '';
  filtroCedula.value = '';

  await cargarDispositivos();
};

/** Total de equipos mostrados (se muestra en el encabezado de la tarjeta). */
const totalEquipos = computed(() => dispositivos.value.length);

/** Equipos con órdenes de servicio registradas (dato informativo del resumen). */
const equiposConOrdenes = computed(() =>
  dispositivos.value.filter((dispositivo) => Number(dispositivo.totalOrdenes) > 0).length
);

// ==========================================================================
// ALTA Y EDICIÓN (MODAL modalDispositivo)
// ==========================================================================
/**
 * NORMALIZA UNA CÉDULA.
 * PROPÓSITO TÉCNICO: es la llave foránea hacia `cliente`; se eliminan puntos,
 * guiones y espacios para no enviar al backend una cédula que no encontraría.
 */
const normalizarCedula = (valor) => String(valor || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');

/** Abre el modal en modo ALTA con el formulario en blanco. */
const prepararNuevoDispositivo = () => {
  esEdicionDispositivo.value = false;
  dispositivoEnEdicion.value = null;
  mensajeErrorFormulario.value = '';
  erroresValidacion.value = {};
  formularioDispositivo.value = { cedula: '', tipo: 'Laptop', marca: '', modelo: '', serie: '' };

  abrirModal('modalDispositivo');
};

/** Abre el modal en modo EDICIÓN con los datos reales del equipo. */
const prepararEdicionDispositivo = (dispositivo) => {
  esEdicionDispositivo.value = true;
  dispositivoEnEdicion.value = dispositivo;
  mensajeErrorFormulario.value = '';
  erroresValidacion.value = {};

  formularioDispositivo.value = {
    cedula: dispositivo.cedula,
    tipo: dispositivo.tipo || 'Otro',
    marca: dispositivo.marca,
    modelo: dispositivo.modelo,
    serie: dispositivo.serie
  };

  abrirModal('modalDispositivo');
};

/**
 * VALIDACIÓN LOCAL DEL FORMULARIO.
 * Réplica de las reglas del backend para responder de inmediato; el servidor
 * vuelve a validar y es la autoridad final (400 datos inválidos, 404 cliente
 * inexistente).
 */
const validarFormularioDispositivo = () => {
  const errores = {};

  if (!esEdicionDispositivo.value && !normalizarCedula(formularioDispositivo.value.cedula)) {
    errores.cedula = 'La cédula del propietario es obligatoria para registrar el equipo.';
  }

  if (!String(formularioDispositivo.value.tipo).trim()) {
    errores.tipo = 'Seleccione el tipo de equipo.';
  }

  if (!String(formularioDispositivo.value.marca).trim()) {
    errores.marca = 'La marca del equipo es obligatoria.';
  }

  erroresValidacion.value = errores;
  return Object.keys(errores).length === 0;
};

/**
 * GUARDA EL EQUIPO (ALTA O EDICIÓN).
 *
 * PROPÓSITO TÉCNICO: en la EDICIÓN no se envía la cédula, porque el propietario
 * sólo cambia con la operación de TRANSFERENCIA (PATCH), que deja rastro de la
 * nueva titularidad. Editar características y cambiar de dueño son operaciones
 * distintas y así se mantienen separadas.
 */
const guardarDispositivo = async () => {
  if (enviandoFormulario.value) return;

  if (!validarFormularioDispositivo()) {
    mostrarToast('Revise el formulario', 'Complete los campos obligatorios del equipo.', 'warning');
    return;
  }

  enviandoFormulario.value = true;
  mensajeErrorFormulario.value = '';

  const datosDispositivo = {
    cedula: normalizarCedula(formularioDispositivo.value.cedula),
    tipo: String(formularioDispositivo.value.tipo).trim(),
    marca: String(formularioDispositivo.value.marca).trim(),
    modelo: String(formularioDispositivo.value.modelo).trim(),
    serie: String(formularioDispositivo.value.serie).trim()
  };

  try {
    if (esEdicionDispositivo.value) {
      const resultado = await DispositivoServices.actualizarDispositivo(
        dispositivoEnEdicion.value.id,
        datosDispositivo
      );
      mostrarToast('Equipo actualizado', resultado.mensaje || 'Las características del equipo fueron actualizadas.', 'success');
    } else {
      const resultado = await DispositivoServices.crearDispositivo(datosDispositivo);
      mostrarToast('Equipo registrado', resultado.mensaje || 'El equipo quedó asociado al cliente.', 'success');
    }

    await cargarDispositivos();
    cerrarModal('modalDispositivo');
  } catch (error) {
    const descripcion = describirError(error);

    // El backend explica la causa real (por ejemplo, "cliente no existe").
    mensajeErrorFormulario.value = descripcion.mensaje;

    mostrarToast(`No se pudo guardar el equipo (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    enviandoFormulario.value = false;
  }
};

// ==========================================================================
// TRANSFERENCIA DE PROPIEDAD (MODAL modalTransferirDispositivo)
// ==========================================================================
/** Abre el modal de transferencia para el equipo seleccionado. */
const abrirTransferencia = (dispositivo) => {
  dispositivoATransferir.value = dispositivo;
  nuevaCedulaPropietario.value = '';
  mensajeErrorTransferencia.value = '';

  abrirModal('modalTransferirDispositivo');
};

/**
 * CONFIRMA LA TRANSFERENCIA DEL EQUIPO A OTRO CLIENTE.
 * El backend valida que la nueva cédula exista en la cartera; si no, responde
 * con un error que se muestra tal cual.
 */
const confirmarTransferencia = async () => {
  if (enviandoTransferencia.value) return;

  const cedulaNueva = normalizarCedula(nuevaCedulaPropietario.value);

  if (!cedulaNueva) {
    mensajeErrorTransferencia.value = 'Indique la cédula del nuevo propietario.';
    mostrarToast('Cédula requerida', 'Escriba la cédula del nuevo propietario del equipo.', 'warning');
    return;
  }

  enviandoTransferencia.value = true;
  mensajeErrorTransferencia.value = '';

  try {
    const resultado = await DispositivoServices.transferirPropietario(
      dispositivoATransferir.value.id,
      cedulaNueva
    );

    mostrarToast(
      'Propiedad transferida',
      resultado.mensaje || `El equipo ahora pertenece al cliente ${cedulaNueva}.`,
      'success'
    );

    await cargarDispositivos();
    cerrarModal('modalTransferirDispositivo');
  } catch (error) {
    const descripcion = describirError(error);
    mensajeErrorTransferencia.value = descripcion.mensaje;

    mostrarToast(`No se pudo transferir el equipo (${descripcion.codigo})`, descripcion.mensaje, 'error');
  } finally {
    enviandoTransferencia.value = false;
  }
};

// ==========================================================================
// ELIMINACIÓN DE EQUIPOS
// ==========================================================================
/**
 * ELIMINA UN EQUIPO CON CONFIRMACIÓN PREVIA.
 *
 * PROPÓSITO FUNCIONAL: la eliminación es irreversible; además el backend la
 * rechaza con 409 cuando el equipo tiene órdenes de servicio técnico, para no
 * romper el histórico de reparaciones.
 */
const eliminarDispositivoConConfirmacion = async (dispositivo) => {
  const confirmado = window.confirm(
    `¿Confirma eliminar el equipo ${dispositivo.descripcion || dispositivo.tipo} `
    + `(N° de serie ${dispositivo.serie || 'sin serie'}) del cliente ${dispositivo.propietario || dispositivo.cedula}?\n`
    + 'Esta acción no puede deshacerse.'
  );

  if (!confirmado) return;

  dispositivoAEliminar.value = dispositivo;
  procesandoEliminacion.value = true;

  try {
    const resultado = await DispositivoServices.eliminarDispositivo(dispositivo.id);

    mostrarToast(
      'Equipo eliminado',
      resultado?.mensaje || 'El equipo fue retirado del registro de dispositivos.',
      'success'
    );

    await cargarDispositivos();
  } catch (error) {
    const descripcion = describirError(error);

    // El 409 informa que el equipo tiene órdenes de servicio: se muestra literal.
    const detalle = error?.codigoHttp === 409 ? error.mensaje : descripcion.mensaje;

    mostrarToast(`No se pudo eliminar el equipo (${descripcion.codigo})`, detalle, 'error');
  } finally {
    procesandoEliminacion.value = false;
    dispositivoAEliminar.value = null;
  }
};

/** Icono representativo de cada tipo de equipo (apoyo visual de la tabla). */
const iconoTipoDispositivo = (tipo) => {
  const iconos = {
    Laptop: 'bi-laptop',
    'Computadora de escritorio': 'bi-pc-display',
    'Teléfono': 'bi-phone',
    Tablet: 'bi-tablet',
    Impresora: 'bi-printer',
    Monitor: 'bi-display',
    Consola: 'bi-controller',
    Otro: 'bi-cpu'
  };

  return iconos[tipo] || 'bi-cpu';
};
</script>

<template>
  <main class="content" id="contenido">
    <!-- ================= ESTADO DE ÉXITO / ERROR (pila de Toasts) ================= -->
    <ToastNotificaciones :notificaciones="notificaciones" @cerrar="cerrarToastPorId" />

    <div class="page-head">
      <div>
        <h2>Equipos de los clientes</h2>
        <p>
          Dispositivos registrados en la recepción del taller, su propietario y el número de
          órdenes de servicio asociadas. La propiedad puede transferirse a otro cliente.
        </p>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-primary d-flex align-items-center gap-2" type="button" @click="abrirModal('modalReporteDispositivos')">
          <i class="bi bi-file-earmark-bar-graph"></i>
          <span>Generar Reporte</span>
        </button>
        <button class="btn btn-outline-secondary" type="button" :disabled="cargandoTabla" @click="cargarDispositivos">
          <span v-if="cargandoTabla" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
          <i v-else class="bi bi-arrow-clockwise"></i> Actualizar
        </button>
        <button class="btn btn-primary d-flex align-items-center gap-2" type="button" @click="prepararNuevoDispositivo">
          <i class="bi bi-plus-lg"></i>
          <span>Nuevo dispositivo</span>
        </button>
      </div>
    </div>

    <!-- ================= ESTADO DE CARGA ================= -->
    <LoadingSpinner
      v-if="estadoCargando && dispositivos.length === 0"
      mensaje="Cargando los equipos registrados desde la base de datos..."
    />

    <template v-else>
      <!-- ================= ESTADO DE ERROR PERSISTENTE ================= -->
      <div v-if="mensajeErrorCarga" class="readonly-note" role="alert">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span><strong>{{ codigoErrorCarga }}</strong> · {{ mensajeErrorCarga }}</span>
        <button class="btn btn-sm btn-outline-danger ms-auto" type="button" @click="cargarDispositivos">
          <i class="bi bi-arrow-clockwise"></i> Reintentar
        </button>
      </div>

      <section class="card-ts">
        <!-- ---------------- TOOLBAR: FILTROS ---------------- -->
        <div class="toolbar">
          <div class="input-icon">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input
              class="form-control"
              v-model="filtroTexto"
              type="search"
              placeholder="Buscar por tipo, marca, modelo o número de serie"
              aria-label="Buscar equipos"
              @keyup.enter="cargarDispositivos"
            >
          </div>

          <input
            class="form-control"
            v-model="filtroCedula"
            placeholder="Cédula del propietario"
            aria-label="Filtrar por cédula del propietario"
            style="max-width:220px;"
            @keyup.enter="cargarDispositivos"
          >

          <button class="btn btn-primary" type="button" :disabled="cargandoTabla" @click="cargarDispositivos">
            <span v-if="cargandoTabla" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            <i v-else class="bi bi-funnel"></i> Filtrar
          </button>

          <button class="btn btn-outline-secondary" type="button" :disabled="cargandoTabla" @click="limpiarFiltros">
            <i class="bi bi-x-circle"></i> Limpiar
          </button>
        </div>

        <!-- Franja de resumen: total de equipos mostrados -->
        <div class="summary-strip px-3 pt-3">
          <span class="chip"><i class="bi bi-laptop"></i> Total: <strong>{{ totalEquipos }} equipo(s)</strong></span>
          <span class="chip"><i class="bi bi-tools"></i> Con órdenes de servicio: <strong>{{ equiposConOrdenes }}</strong></span>
        </div>

        <!-- Sub-estado: sin registros -->
        <div v-if="dispositivos.length === 0" class="empty-state">
          <i class="bi bi-laptop"></i>
          <h3>No hay equipos que mostrar</h3>
          <p class="small">
            {{ filtroTexto || filtroCedula
              ? 'Ningún equipo coincide con los filtros aplicados. Ajuste la búsqueda o límpiela.'
              : 'Todavía no se ha registrado ningún equipo de cliente. Use "Nuevo dispositivo" para comenzar.' }}
          </p>
          <button class="btn btn-primary" type="button" @click="prepararNuevoDispositivo">
            <i class="bi bi-plus-lg"></i> Registrar primer equipo
          </button>
        </div>

        <div v-else class="p-3">
          <div class="table-wrap">
            <table class="table table-ts">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Marca</th>
                  <th scope="col">Modelo</th>
                  <th scope="col">N° de serie</th>
                  <th scope="col">Propietario</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col" class="text-center">Órdenes</th>
                  <th scope="col" class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="dispositivo in dispositivos" :key="dispositivo.id">
                  <td><span class="code-chip">{{ dispositivo.id }}</span></td>
                  <td>
                    <strong class="fw-semibold">
                      <i class="bi" :class="iconoTipoDispositivo(dispositivo.tipo)"></i>
                      {{ dispositivo.tipo }}
                    </strong>
                  </td>
                  <td>{{ dispositivo.marca || '—' }}</td>
                  <td>{{ dispositivo.modelo || '—' }}</td>
                  <td><span class="code-chip">{{ dispositivo.serie || 'Sin serie' }}</span></td>
                  <td>
                    <strong class="fw-semibold d-block">{{ dispositivo.propietario || 'Sin propietario' }}</strong>
                    <small class="text-muted-2">{{ dispositivo.cedula }}</small>
                  </td>
                  <td class="tabular">{{ dispositivo.telefono || '—' }}</td>
                  <td class="text-center tabular">
                    <span class="badge-ts" :class="Number(dispositivo.totalOrdenes) > 0 ? 'badge-info' : 'badge-neutral'">
                      {{ dispositivo.totalOrdenes }}
                    </span>
                  </td>
                  <td class="text-end">
                    <div class="d-inline-flex gap-1">
                      <button
                        class="btn btn-ghost btn-icon"
                        type="button"
                        title="Editar características del equipo"
                        @click="prepararEdicionDispositivo(dispositivo)"
                      >
                        <i class="bi bi-pencil-square"></i>
                      </button>
                      <button
                        class="btn btn-ghost btn-icon"
                        type="button"
                        title="Transferir a otro propietario"
                        @click="abrirTransferencia(dispositivo)"
                      >
                        <i class="bi bi-arrow-left-right"></i>
                      </button>
                      <button
                        class="btn btn-ghost btn-icon btn-ghost-danger"
                        type="button"
                        title="Eliminar equipo"
                        :disabled="procesandoEliminacion"
                        @click="eliminarDispositivoConConfirmacion(dispositivo)"
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
         MODAL DE ALTA / EDICIÓN DE EQUIPO (id: modalDispositivo)
         ==========================================================================
         En el ALTA se captura la cédula del propietario; en la EDICIÓN queda
         deshabilitada porque el cambio de dueño se hace con la TRANSFERENCIA.
    -->
    <div class="modal fade" id="modalDispositivo" tabindex="-1" aria-hidden="true" aria-labelledby="modalDispositivoLabel">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modalDispositivoLabel">
              <i class="bi" :class="esEdicionDispositivo ? 'bi-pencil-square' : 'bi-plus-circle'"></i>
              {{ esEdicionDispositivo ? 'Editar equipo' : 'Registrar equipo nuevo' }}
            </h5>
            <button type="button" class="btn-close" aria-label="Cerrar" :disabled="enviandoFormulario" @click="cerrarModal('modalDispositivo')"></button>
          </div>

          <form @submit.prevent="guardarDispositivo" novalidate>
            <div class="modal-body">
              <!-- Estado de Error del formulario (400 datos inválidos / 404 cliente) -->
              <div v-if="mensajeErrorFormulario" class="readonly-note" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <span>{{ mensajeErrorFormulario }}</span>
              </div>

              <div class="row g-3">
                <div class="col-12">
                  <label class="form-label" for="dispositivo-cedula">Cédula del propietario*</label>
                  <input
                    id="dispositivo-cedula"
                    class="form-control"
                    :class="{ 'is-invalid': erroresValidacion.cedula }"
                    v-model="formularioDispositivo.cedula"
                    :disabled="esEdicionDispositivo || enviandoFormulario"
                    placeholder="V-12345678"
                  >
                  <div v-if="erroresValidacion.cedula" class="invalid-feedback d-block">{{ erroresValidacion.cedula }}</div>
                  <div v-else-if="esEdicionDispositivo" class="form-text">
                    <i class="bi bi-lock"></i>
                    El propietario sólo cambia con la acción <strong>Transferir</strong>, que deja
                    registrada la nueva titularidad del equipo.
                  </div>
                  <div v-else class="form-text">
                    El cliente debe existir en la cartera; regístrelo en el módulo
                    <router-link to="/clientes">Clientes</router-link> si aún no está.
                  </div>
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="dispositivo-tipo">Tipo de equipo*</label>
                  <select
                    id="dispositivo-tipo"
                    class="form-select"
                    :class="{ 'is-invalid': erroresValidacion.tipo }"
                    v-model="formularioDispositivo.tipo"
                    :disabled="enviandoFormulario"
                  >
                    <option v-for="tipo in TIPOS_DISPOSITIVO" :key="tipo" :value="tipo">{{ tipo }}</option>
                  </select>
                  <div v-if="erroresValidacion.tipo" class="invalid-feedback d-block">{{ erroresValidacion.tipo }}</div>
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="dispositivo-marca">Marca*</label>
                  <input
                    id="dispositivo-marca"
                    class="form-control"
                    :class="{ 'is-invalid': erroresValidacion.marca }"
                    v-model="formularioDispositivo.marca"
                    :disabled="enviandoFormulario"
                    placeholder="HP, Lenovo, Samsung..."
                  >
                  <div v-if="erroresValidacion.marca" class="invalid-feedback d-block">{{ erroresValidacion.marca }}</div>
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="dispositivo-modelo">Modelo</label>
                  <input
                    id="dispositivo-modelo"
                    class="form-control"
                    v-model="formularioDispositivo.modelo"
                    :disabled="enviandoFormulario"
                    placeholder="Modelo del equipo"
                  >
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="dispositivo-serie">Número de serie</label>
                  <input
                    id="dispositivo-serie"
                    class="form-control"
                    v-model="formularioDispositivo.serie"
                    :disabled="enviandoFormulario"
                    placeholder="Serie del fabricante"
                  >
                  <div class="form-text">Identifica físicamente el equipo en el taller.</div>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" :disabled="enviandoFormulario" @click="cerrarModal('modalDispositivo')">
                Cancelar
              </button>
              <!-- Botón deshabilitado durante el POST/PUT para impedir duplicados -->
              <button type="submit" class="btn btn-primary" :disabled="enviandoFormulario">
                <span v-if="enviandoFormulario" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                <i v-else class="bi bi-check2-circle"></i>
                {{ enviandoFormulario ? 'Guardando...' : (esEdicionDispositivo ? 'Guardar cambios' : 'Registrar equipo') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- ==========================================================================
         MODAL DE TRANSFERENCIA DE PROPIEDAD (id: modalTransferirDispositivo)
         ==========================================================================
         Cambia el titular del equipo. Es una operación distinta a la edición de
         características, por eso se pide únicamente la cédula del nuevo dueño.
    -->
    <div class="modal fade" id="modalTransferirDispositivo" tabindex="-1" aria-hidden="true" aria-labelledby="modalTransferirDispositivoLabel">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="modalTransferirDispositivoLabel">
              <i class="bi bi-arrow-left-right"></i> Transferir propiedad del equipo
            </h5>
            <button type="button" class="btn-close" aria-label="Cerrar" :disabled="enviandoTransferencia" @click="cerrarModal('modalTransferirDispositivo')"></button>
          </div>

          <form @submit.prevent="confirmarTransferencia" novalidate>
            <div class="modal-body">
              <!-- Estado de Error de la transferencia (cliente inexistente, etc.) -->
              <div v-if="mensajeErrorTransferencia" class="readonly-note" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <span>{{ mensajeErrorTransferencia }}</span>
              </div>

              <!-- Resumen del equipo afectado -->
              <div v-if="dispositivoATransferir" class="p-3 mb-3" style="background:var(--surface-soft);border-radius:var(--radius-md);">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <i class="bi" :class="iconoTipoDispositivo(dispositivoATransferir.tipo)"></i>
                  <strong>{{ dispositivoATransferir.descripcion || dispositivoATransferir.tipo }}</strong>
                  <span class="code-chip ms-auto">{{ dispositivoATransferir.serie || 'Sin serie' }}</span>
                </div>
                <p class="small mb-0">
                  Propietario actual:
                  <strong>{{ dispositivoATransferir.propietario || 'Sin propietario' }}</strong>
                  <span class="code-chip ms-2">{{ dispositivoATransferir.cedula }}</span>
                </p>
              </div>

              <p class="small text-muted-2">
                <i class="bi bi-info-circle"></i>
                El titular del equipo cambiará al cliente que indique a continuación. El historial de
                órdenes de servicio ya registradas se conserva.
              </p>

              <label class="form-label" for="transferir-cedula">Cédula del nuevo propietario*</label>
              <input
                id="transferir-cedula"
                class="form-control"
                v-model="nuevaCedulaPropietario"
                :disabled="enviandoTransferencia"
                placeholder="V-12345678"
              >
              <div class="form-text">El cliente debe existir en la cartera registrada en el sistema.</div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" :disabled="enviandoTransferencia" @click="cerrarModal('modalTransferirDispositivo')">
                Cancelar
              </button>
              <button type="submit" class="btn btn-primary" :disabled="enviandoTransferencia">
                <span v-if="enviandoTransferencia" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                <i v-else class="bi bi-arrow-left-right"></i>
                {{ enviandoTransferencia ? 'Transfiriendo...' : 'Transferir propiedad' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- MODAL DE GENERACIÓN DE REPORTES (PDF / EXCEL / CORREO) -->
    <ModalGenerarReporte
      id-modal="modalReporteDispositivos"
      tipo-reporte="dispositivos"
      titulo="Reporte Operacional de Dispositivos y Frecuencia de Reparación"
      subtitulo="Inventario de equipos atendidos en taller, recurrencia de reparaciones e identificación de propietarios."
      clasificacion="OPERACIONAL"
      @notificar="manejarNotificacionReporte"
    />
  </main>
</template>
