<script setup>
/**
 * ==========================================================================
 * PÁGINA DE RECEPCIÓN DE EQUIPOS (RecepcionPage.vue) - TEKZON C.A.
 * ==========================================================================
 * Módulo 2 · Servicio Técnico (etapa de RECEPCIÓN)
 *
 * PROPÓSITO FUNCIONAL:
 *   Es el mostrador del taller. En una sola pantalla se registran las tres cosas
 *   que el requisito exige para abrir un trabajo:
 *
 *     1. DATOS DEL CLIENTE        -> cédula, nombre, apellido, teléfono, dirección.
 *     2. CARACTERÍSTICAS DEL EQUIPO -> tipo, marca, modelo y número de serie.
 *     3. MOTIVO DEL INGRESO       -> falla reportada, accesorios entregados y
 *                                    patrón/clave de desbloqueo.
 *
 *   Al enviar el formulario, el sistema crea la ORDEN DE SERVICIO TÉCNICO con su
 *   estado por defecto "Pendiente" y muestra un panel de resultado con el número
 *   de orden generado para que el recepcionista lo anote o lo entregue al cliente.
 *
 * PROPÓSITO TÉCNICO:
 *   · CERO DATOS SIMULADOS: la única escritura de la pantalla es la llamada real
 *     `OrdenServiceTecnicoServices.crearOrdenDesdeRecepcion()`, que en el backend
 *     abre una transacción SQL y da de alta (o reutiliza) el cliente, el
 *     dispositivo y la orden.
 *   · AUTOCOMPLETADO DE CLIENTE: al salir del campo cédula (o al pulsar
 *     "Buscar") se consulta `ClienteServices.buscarCliente()`. Si el cliente ya
 *     existe se reutiliza su ficha y se avisa en verde; si no existe se avisa en
 *     azul y se registrará al abrir la orden.
 *   · VALIDACIÓN EN EL CLIENTE CAMPO POR CAMPO: `erroresFormulario` es un objeto
 *     cuyas claves coinciden con los campos del formulario y alimentan las clases
 *     `is-invalid` / `invalid-feedback d-block`. El backend vuelve a validar y es
 *     la autoridad final (responde 400 con el detalle exacto).
 *   · 3 ESTADOS DE UI:
 *       CARGANDO -> `buscandoCliente` (consulta de la cédula) y `enviando` (POST
 *                   de la recepción, con spinner en el botón).
 *       ÉXITO    -> Toast + panel de resultado con el resumen de la orden creada.
 *       ERROR    -> Toast con el código HTTP y panel rojo persistente con el
 *                   `codigo` y el `mensaje` que devuelve `describirError()`.
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import ClienteServices from '../services/ClienteServices.js';
import OrdenServiceTecnicoServices from '../services/OrdenServiceTecnicoServices.js';
import { sesion } from '../services/sesion.js';
// Helpers compartidos por todos los módulos nuevos (formato y presentación).
import {
  describirError,
  presentacionEstadoOrden,
  formatearMoneda,
  formatearFecha
} from '../services/formato.js';

// ==========================================================================
// CATÁLOGOS DE LA INTERFAZ
// ==========================================================================
/**
 * TIPOS DE DISPOSITIVO QUE ATIENDE EL TALLER.
 * Es la lista de opciones del selector; el texto elegido se envía en el campo
 * `nombre_dis` de la tabla `dispositivo`.
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

/**
 * Devuelve un formulario de recepción en blanco.
 * Se usa una función (y no un objeto compartido) para que "Limpiar formulario"
 * entregue SIEMPRE una instancia nueva y limpia a la reactividad de Vue.
 */
const crearFormularioVacio = () => ({
  // ---- 1. Datos del cliente ----
  cedula: '',
  nombre: '',
  apellido: '',
  telefono: '',
  direccion: '',
  // ---- 2. Características del dispositivo ----
  tipoDispositivo: '',
  marca: '',
  modelo: '',
  serie: '',
  // ---- 3. Motivo del ingreso ----
  falla: '',
  accesorios: '',
  patron: '',
  // ---- 4. Técnico responsable asignado ----
  idTecnico: ''
});

// ==========================================================================
// ESTADO REACTIVO PRINCIPAL
// ==========================================================================
/** Datos capturados en el formulario de recepción. */
const formularioRecepcion = ref(crearFormularioVacio());

/** Errores de validación por campo (clave = nombre del campo). */
const erroresFormulario = ref({});

/** Cliente devuelto por el API cuando la cédula ya está registrada. */
const clienteEncontrado = ref(null);

/** Bandera que indica que ya se consultó la cédula (para el aviso "cliente nuevo"). */
const busquedaRealizada = ref(false);

/** Última cédula consultada: evita repetir la misma petición al servidor. */
const ultimaCedulaConsultada = ref('');

/** Orden creada con éxito: alimenta el panel de resultado. */
const ordenCreada = ref(null);

/** Lista de técnicos activos disponibles para asignación. */
const tecnicos = ref([]);
const cargandoTecnicos = ref(false);

onMounted(async () => {
  try {
    cargandoTecnicos.value = true;
    tecnicos.value = await OrdenServiceTecnicoServices.listarTecnicos();

    // Si el usuario autenticado es técnico o administrador, pre-seleccionarlo
    if (sesion.usuario?.id_usuario && tecnicos.value.some(t => t.id_usuario === sesion.usuario.id_usuario)) {
      formularioRecepcion.value.idTecnico = sesion.usuario.id_usuario;
    } else if (tecnicos.value.length === 1) {
      formularioRecepcion.value.idTecnico = tecnicos.value[0].id_usuario;
    }
  } catch (error) {
    console.error('Error al cargar lista de técnicos:', error);
  } finally {
    cargandoTecnicos.value = false;
  }
});

// ==========================================================================
// ESTADOS DE UI (Cargando / Éxito / Error)
// ==========================================================================
/** Estado de CARGA de la búsqueda del cliente por cédula. */
const buscandoCliente = ref(false);

/** Estado de CARGA del envío del formulario (POST de recepción). */
const enviando = ref(false);

/** Estado de ERROR persistente de la creación de la orden. */
const mensajeErrorEnvio = ref('');
const codigoErrorEnvio = ref(null);

/** Notificaciones flotantes (toasts). */
const notificaciones = ref([]);

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

// ==========================================================================
// CONSULTA DEL CLIENTE (AUTOCOMPLETADO DE LA FICHA)
// ==========================================================================
/**
 * BUSCA AL CLIENTE POR SU CÉDULA Y AUTOCOMPLETA SUS DATOS.
 *
 * PROPÓSITO FUNCIONAL: evita duplicar fichas. Si la cédula ya existe, el
 * recepcionista no vuelve a teclear el nombre, el teléfono ni la dirección.
 *
 * PROPÓSITO TÉCNICO: `ClienteServices.buscarCliente()` devuelve `null` ante un
 * 404 (situación válida del negocio: "el cliente es nuevo"), por lo que ese caso
 * NO se trata como error; sólo un fallo real (servidor caído, 500) dispara el
 * Toast de error.
 */
const buscarClientePorCedula = async () => {
  const cedula = String(formularioRecepcion.value.cedula || '').trim();

  // Sin cédula no hay nada que consultar: se limpia el aviso anterior.
  if (!cedula) {
    clienteEncontrado.value = null;
    busquedaRealizada.value = false;
    ultimaCedulaConsultada.value = '';
    return;
  }

  // Se evita repetir la petición cuando el evento `blur` y el botón "Buscar"
  // se disparan seguidos, o cuando la cédula consultada no ha cambiado.
  if (buscandoCliente.value) return;
  if (busquedaRealizada.value && cedula === ultimaCedulaConsultada.value) return;

  ultimaCedulaConsultada.value = cedula;
  buscandoCliente.value = true;

  try {
    const cliente = await ClienteServices.buscarCliente(cedula);

    busquedaRealizada.value = true;

    if (cliente) {
      clienteEncontrado.value = cliente;

      // Se autocompletan los campos con la ficha del API; si algún dato viniera
      // vacío se conserva lo que el recepcionista ya había escrito.
      formularioRecepcion.value.nombre = cliente.nombre || formularioRecepcion.value.nombre;
      formularioRecepcion.value.apellido = cliente.apellido || formularioRecepcion.value.apellido;
      formularioRecepcion.value.telefono = cliente.telefono || formularioRecepcion.value.telefono;
      formularioRecepcion.value.direccion = cliente.direccion || formularioRecepcion.value.direccion;

      mostrarToast(
        'Cliente encontrado en el sistema',
        `Se reutilizará la ficha de ${cliente.nombreCompleto}. Pedidos anteriores: ${cliente.totalOrdenes}.`,
        'info'
      );
    } else {
      // 404 del API: el cliente todavía no existe en la cartera.
      clienteEncontrado.value = null;
    }
  } catch (error) {
    clienteEncontrado.value = null;
    busquedaRealizada.value = false;

    const descripcion = describirError(error);
    mostrarToast(
      `No se pudo consultar la cédula (${descripcion.codigo})`,
      descripcion.mensaje,
      'error'
    );
  } finally {
    buscandoCliente.value = false;
  }
};

/** True cuando ya se consultó la cédula y el cliente NO existe (se dará de alta). */
const clienteEsNuevo = computed(() => busquedaRealizada.value && !clienteEncontrado.value);

/**
 * REACCIONA A LA EDICIÓN DE LA CÉDULA.
 * PROPÓSITO FUNCIONAL: si el recepcionista cambia la cédula después de una
 * búsqueda, los avisos anteriores dejan de ser válidos y se ocultan; así nunca
 * se muestra la ficha de un cliente que ya no corresponde al número en pantalla.
 */
const alCambiarCedula = () => {
  clienteEncontrado.value = null;
  busquedaRealizada.value = false;
  ultimaCedulaConsultada.value = '';
  limpiarErrorDeCampo('cedula');
};

// ==========================================================================
// VALIDACIÓN DEL FORMULARIO (CAMPO POR CAMPO)
// ==========================================================================
/**
 * VALIDA EL FORMULARIO DE RECEPCIÓN.
 *
 * PROPÓSITO FUNCIONAL: da respuesta inmediata al recepcionista marcando en rojo
 * cada campo obligatorio que falte, sin tener que esperar al servidor.
 *
 * PROPÓSITO TÉCNICO: replica EXACTAMENTE las reglas obligatorias del backend
 * (`registrarRecepcion`), pero el servidor sigue siendo la autoridad final: si
 * algo se le escapa al cliente, el POST responde 400 y su mensaje se muestra.
 *
 * @returns {boolean} true cuando el formulario puede enviarse.
 */
const validarFormulario = () => {
  const datos = formularioRecepcion.value;
  const errores = {};

  if (!String(datos.cedula).trim()) {
    errores.cedula = 'La cédula del cliente es obligatoria.';
  }

  if (!String(datos.nombre).trim()) {
    errores.nombre = 'El nombre del cliente es obligatorio.';
  }

  if (!String(datos.apellido).trim()) {
    errores.apellido = 'El apellido del cliente es obligatorio.';
  }

  if (!String(datos.tipoDispositivo).trim()) {
    errores.tipoDispositivo = 'Seleccione qué tipo de dispositivo trae el cliente.';
  }

  if (!String(datos.marca).trim()) {
    errores.marca = 'La marca del dispositivo es obligatoria.';
  }

  if (!String(datos.falla).trim()) {
    errores.falla = 'Describa la falla que reporta el cliente: es la base del diagnóstico.';
  }

  if (!datos.idTecnico) {
    errores.idTecnico = 'Debe seleccionar el técnico responsable del equipo.';
  }

  erroresFormulario.value = errores;

  return Object.keys(errores).length === 0;
};

/** Limpia el mensaje de error de un campo en cuanto el usuario lo corrige. */
const limpiarErrorDeCampo = (campo) => {
  if (erroresFormulario.value[campo]) {
    const copia = { ...erroresFormulario.value };
    delete copia[campo];
    erroresFormulario.value = copia;
  }
};

// ==========================================================================
// ENVÍO DE LA RECEPCIÓN (CREA LA ORDEN "Pendiente")
// ==========================================================================
/**
 * REGISTRA LA RECEPCIÓN Y ABRE LA ORDEN DE SERVICIO TÉCNICO.
 *
 * PROPÓSITO FUNCIONAL (requisito): "Al registrarlo, se crea una Orden de Servicio
 * Técnico asociada, cuyo estado por defecto debe ser 'Pendiente'".
 *
 * PROPÓSITO TÉCNICO: el payload se envía con la nomenclatura que espera el
 * servicio (`cedula`, `tipoDispositivo`, `falla`, ...) y el backend se encarga de
 * traducirla a las columnas de MySQL dentro de su transacción. El botón queda
 * `:disabled` mientras `enviando` es true para impedir órdenes duplicadas.
 */
const enviarRecepcion = async () => {
  if (enviando.value) return;

  mensajeErrorEnvio.value = '';
  codigoErrorEnvio.value = null;

  // ---- 1. Validación local ----
  if (!validarFormulario()) {
    mostrarToast(
      'Revise el formulario',
      'Faltan datos obligatorios para abrir la orden de servicio técnico.',
      'warning'
    );
    return;
  }

  enviando.value = true;

  try {
    // ---- 2. POST real al backend: /api/ordenes-tecnicas/recepcion ----
    const datos = formularioRecepcion.value;

    const resultado = await OrdenServiceTecnicoServices.crearOrdenDesdeRecepcion({
      cedula: String(datos.cedula).trim(),
      nombre: String(datos.nombre).trim(),
      apellido: String(datos.apellido).trim(),
      telefono: String(datos.telefono).trim(),
      direccion: String(datos.direccion).trim(),
      tipoDispositivo: datos.tipoDispositivo,
      marca: String(datos.marca).trim(),
      modelo: String(datos.modelo).trim(),
      serie: String(datos.serie).trim(),
      idTecnico: datos.idTecnico,
      falla: String(datos.falla).trim(),
      accesorios: String(datos.accesorios).trim(),
      patron: String(datos.patron).trim()
    });

    // ---- 3. ESTADO DE ÉXITO: panel de resultado + Toast ----
    ordenCreada.value = resultado;

    mostrarToast(
      `Orden ${resultado.orden.id} creada`,
      `Estado inicial: "${resultado.orden.estado}". ${resultado.mensaje || ''}`.trim(),
      'success'
    );
  } catch (error) {
    // ---- 4. ESTADO DE ERROR: se muestra el código HTTP y el mensaje tal cual ----
    const descripcion = describirError(error);

    codigoErrorEnvio.value = descripcion.codigo;
    mensajeErrorEnvio.value = descripcion.mensaje;

    mostrarToast(
      `No se pudo crear la orden (${descripcion.codigo})`,
      descripcion.mensaje,
      'error'
    );
  } finally {
    enviando.value = false;
  }
};

// ==========================================================================
// LIMPIEZA DEL FORMULARIO Y NUEVA RECEPCIÓN
// ==========================================================================
/** Deja el formulario listo para recibir el siguiente equipo. */
const limpiarFormulario = () => {
  formularioRecepcion.value = crearFormularioVacio();
  erroresFormulario.value = {};
  clienteEncontrado.value = null;
  busquedaRealizada.value = false;
  ultimaCedulaConsultada.value = '';
  mensajeErrorEnvio.value = '';
  codigoErrorEnvio.value = null;
};

/** Cierra el panel de resultado y habilita una recepción nueva. */
const registrarOtraRecepcion = () => {
  ordenCreada.value = null;
  limpiarFormulario();
};
</script>

<template>
  <main class="content" id="contenido">
    <!-- ============ ESTADO DE ÉXITO / ERROR: pila de notificaciones ============ -->
    <ToastNotificaciones :notificaciones="notificaciones" @cerrar="cerrarToastPorId" />

    <!-- ================== CABECERA DE LA PÁGINA ================== -->
    <div class="page-head">
      <div>
        <h2>Recepción de Equipos</h2>
        <p>
          Registre al cliente, las características del dispositivo y el motivo del ingreso.
          Al guardar, el sistema abre la Orden de Servicio Técnico en estado <strong>Pendiente</strong>.
        </p>
      </div>
      <router-link class="btn btn-outline-secondary" to="/ordenes">
        <i class="bi bi-tools"></i> Ir al Panel del Técnico
      </router-link>
    </div>

    <!-- ================== ESTADO DE ERROR PERSISTENTE ================== -->
    <div v-if="mensajeErrorEnvio" class="readonly-note" role="alert">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <span><strong>{{ codigoErrorEnvio }}</strong> · {{ mensajeErrorEnvio }}</span>
      <button class="btn btn-sm btn-outline-danger ms-auto" type="button" @click="enviarRecepcion">
        <i class="bi bi-arrow-clockwise"></i> Reintentar
      </button>
    </div>

    <!-- ================== INSTRUCCIONES DEL FLUJO ================== -->
    <section class="card-ts mb-3">
      <div class="card-ts__head">
        <div>
          <h3 class="card-ts__title"><i class="bi bi-signpost-split"></i> ¿Cómo funciona la recepción?</h3>
          <p class="card-ts__sub">Cuatro pasos: del mostrador al banco de trabajo del técnico.</p>
        </div>
      </div>
      <div class="card-ts__body">
        <div class="row g-3">
          <div class="col-md-6 col-xl-3">
            <div class="d-flex align-items-start gap-2">
              <span class="badge-ts badge-brand no-dot">1</span>
              <p class="mb-0 small">
                <strong class="d-block">Registre al cliente</strong>
                Escriba la cédula y pulse «Buscar»: si ya existe, sus datos se completan solos.
              </p>
            </div>
          </div>
          <div class="col-md-6 col-xl-3">
            <div class="d-flex align-items-start gap-2">
              <span class="badge-ts badge-brand no-dot">2</span>
              <p class="mb-0 small">
                <strong class="d-block">Describa el equipo</strong>
                Tipo, marca, modelo y número de serie: identifican el dispositivo en el taller.
              </p>
            </div>
          </div>
          <div class="col-md-6 col-xl-3">
            <div class="d-flex align-items-start gap-2">
              <span class="badge-ts badge-brand no-dot">3</span>
              <p class="mb-0 small">
                <strong class="d-block">Indique la falla</strong>
                El sistema crea la orden en estado «Pendiente» con su número correlativo.
              </p>
            </div>
          </div>
          <div class="col-md-6 col-xl-3">
            <div class="d-flex align-items-start gap-2">
              <span class="badge-ts badge-brand no-dot">4</span>
              <p class="mb-0 small">
                <strong class="d-block">El técnico la procesa</strong>
                Desde el Panel del Técnico avanza estados, consume repuestos y cobra.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================== PANEL DE RESULTADO (ESTADO DE ÉXITO) ================== -->
    <section v-if="ordenCreada" class="card-ts mb-3">
      <div class="card-ts__head">
        <div>
          <h3 class="card-ts__title">
            <i class="bi bi-check-circle-fill text-success"></i> Orden de servicio técnico creada
          </h3>
          <p class="card-ts__sub">
            {{ ordenCreada.mensaje || 'La orden quedó registrada en el sistema.' }}
          </p>
        </div>
        <span class="badge-ts no-dot" :class="presentacionEstadoOrden(ordenCreada.orden.estado).clase">
          <i class="bi" :class="presentacionEstadoOrden(ordenCreada.orden.estado).icono"></i>
          {{ presentacionEstadoOrden(ordenCreada.orden.estado).etiqueta }}
        </span>
      </div>
      <div class="card-ts__body">
        <!-- Resumen de lo que quedó guardado en la base de datos -->
        <dl class="row mb-3 small">
          <dt class="col-sm-3 text-muted-2">Número de orden</dt>
          <dd class="col-sm-9"><span class="code-chip">{{ ordenCreada.orden.id }}</span></dd>

          <dt class="col-sm-3 text-muted-2">Cliente</dt>
          <dd class="col-sm-9">
            <strong>{{ ordenCreada.orden.cliente }}</strong>
            <span class="text-muted-2"> · C.I. {{ ordenCreada.orden.cedula }}</span>
          </dd>

          <dt class="col-sm-3 text-muted-2">Equipo</dt>
          <dd class="col-sm-9">
            {{ ordenCreada.orden.equipo || '—' }}
            <span v-if="ordenCreada.orden.serie" class="code-chip ms-1">{{ ordenCreada.orden.serie }}</span>
          </dd>

          <dt class="col-sm-3 text-muted-2">Falla reportada</dt>
          <dd class="col-sm-9">{{ ordenCreada.orden.falla || '—' }}</dd>

          <dt class="col-sm-3 text-muted-2">Estado inicial</dt>
          <dd class="col-sm-9">
            <strong>{{ presentacionEstadoOrden(ordenCreada.orden.estado).etiqueta }}</strong>
            · avance {{ ordenCreada.orden.avance }}%
          </dd>

          <dt class="col-sm-3 text-muted-2">Técnico responsable</dt>
          <dd class="col-sm-9">
            <span class="badge-ts badge-info">
              <i class="bi bi-person-gear"></i> {{ ordenCreada.orden.tecnico }}
            </span>
          </dd>

          <dt class="col-sm-3 text-muted-2">Ingreso</dt>
          <dd class="col-sm-9">{{ formatearFecha(ordenCreada.orden.fechaIngreso, true) }}</dd>

          <dt class="col-sm-3 text-muted-2">Total estimado</dt>
          <dd class="col-sm-9">
            <strong>{{ formatearMoneda(ordenCreada.desglose.total) }}</strong>
            <span class="text-muted-2">
              (mano de obra {{ formatearMoneda(ordenCreada.desglose.manoObra) }}
              + repuestos {{ formatearMoneda(ordenCreada.desglose.repuestos) }})
            </span>
          </dd>
        </dl>

        <!-- Avisos de reutilización o alta de fichas en la base de datos -->
        <div class="summary-strip mb-3">
          <span class="chip">
            <i class="bi" :class="ordenCreada.esClienteNuevo ? 'bi-person-plus' : 'bi-person-check'"></i>
            Cliente:
            <strong>{{ ordenCreada.esClienteNuevo ? 'registrado por primera vez' : 'ficha existente reutilizada' }}</strong>
          </span>
          <span class="chip">
            <i class="bi" :class="ordenCreada.esDispositivoNuevo ? 'bi-plus-square' : 'bi-laptop'"></i>
            Dispositivo:
            <strong>{{ ordenCreada.esDispositivoNuevo ? 'registrado por primera vez' : 'equipo ya registrado' }}</strong>
          </span>
        </div>

        <div class="d-flex flex-wrap gap-2">
          <router-link class="btn btn-primary" to="/ordenes">
            <i class="bi bi-tools"></i> Ver en el Panel del Técnico
          </router-link>
          <button class="btn btn-outline-secondary" type="button" @click="registrarOtraRecepcion">
            <i class="bi bi-plus-lg"></i> Registrar otra recepción
          </button>
        </div>
      </div>
    </section>

    <!-- ================== FORMULARIO DE RECEPCIÓN ================== -->
    <form class="card-ts" novalidate @submit.prevent="enviarRecepcion">
      <div class="card-ts__head">
        <div>
          <h3 class="card-ts__title"><i class="bi bi-clipboard-plus"></i> Formulario de recepción</h3>
          <p class="card-ts__sub">
            Los campos marcados con <strong>*</strong> son obligatorios y coinciden con las
            validaciones del servidor.
          </p>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" :disabled="enviando" @click="limpiarFormulario">
          <i class="bi bi-eraser"></i> Limpiar formulario
        </button>
      </div>

      <div class="card-ts__body">
        <!-- ==================================================================
             SECCIÓN 1 · DATOS DEL CLIENTE
             ================================================================== -->
        <h4 class="card-ts__title mb-3"><i class="bi bi-person-vcard"></i> 1. Datos del cliente</h4>

        <div class="row g-3">
          <!-- Cédula: dispara la búsqueda del cliente al salir del campo -->
          <div class="col-md-6 col-xl-4">
            <label class="form-label" for="recepcion-cedula">Cédula del cliente*</label>
            <div class="d-flex gap-2">
              <div class="input-icon flex-grow-1">
                <i class="bi bi-person-badge" aria-hidden="true"></i>
                <input
                  id="recepcion-cedula"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': erroresFormulario.cedula }"
                  v-model="formularioRecepcion.cedula"
                  :disabled="enviando"
                  placeholder="Ej.: V-12345678"
                  @blur="buscarClientePorCedula"
                  @input="alCambiarCedula"
                >
              </div>
              <button
                class="btn btn-outline-secondary"
                type="button"
                :disabled="enviando || buscandoCliente"
                @click="buscarClientePorCedula"
              >
                <span v-if="buscandoCliente" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                <i v-else class="bi bi-search"></i> Buscar
              </button>
            </div>
            <div v-if="erroresFormulario.cedula" class="invalid-feedback d-block">
              {{ erroresFormulario.cedula }}
            </div>
            <div v-else class="form-text">
              Al salir del campo se consulta la cartera de clientes del sistema.
            </div>
          </div>

          <!-- Nombre -->
          <div class="col-md-6 col-xl-4">
            <label class="form-label" for="recepcion-nombre">Nombre*</label>
            <input
              id="recepcion-nombre"
              type="text"
              class="form-control"
              :class="{ 'is-invalid': erroresFormulario.nombre }"
              v-model="formularioRecepcion.nombre"
              :disabled="enviando"
              placeholder="Ej.: María"
              @input="limpiarErrorDeCampo('nombre')"
            >
            <div v-if="erroresFormulario.nombre" class="invalid-feedback d-block">
              {{ erroresFormulario.nombre }}
            </div>
          </div>

          <!-- Apellido -->
          <div class="col-md-6 col-xl-4">
            <label class="form-label" for="recepcion-apellido">Apellido*</label>
            <input
              id="recepcion-apellido"
              type="text"
              class="form-control"
              :class="{ 'is-invalid': erroresFormulario.apellido }"
              v-model="formularioRecepcion.apellido"
              :disabled="enviando"
              placeholder="Ej.: Rodríguez"
              @input="limpiarErrorDeCampo('apellido')"
            >
            <div v-if="erroresFormulario.apellido" class="invalid-feedback d-block">
              {{ erroresFormulario.apellido }}
            </div>
          </div>

          <!-- Teléfono -->
          <div class="col-md-6 col-xl-4">
            <label class="form-label" for="recepcion-telefono">Teléfono de contacto</label>
            <input
              id="recepcion-telefono"
              type="tel"
              class="form-control"
              v-model="formularioRecepcion.telefono"
              :disabled="enviando"
              placeholder="Ej.: 0414-1234567"
            >
            <div class="form-text">Se usa para avisar al cliente cuando el equipo esté listo.</div>
          </div>

          <!-- Dirección -->
          <div class="col-md-6 col-xl-8">
            <label class="form-label" for="recepcion-direccion">Dirección</label>
            <input
              id="recepcion-direccion"
              type="text"
              class="form-control"
              v-model="formularioRecepcion.direccion"
              :disabled="enviando"
              placeholder="Ej.: Av. Bolívar, Local 4, Maracay"
            >
          </div>

          <!-- Avisos del resultado de la búsqueda del cliente -->
          <div class="col-12">
            <!-- Aviso VERDE: el cliente ya existe y su ficha se reutiliza -->
            <div v-if="clienteEncontrado" class="aviso-cliente aviso-cliente--exito">
              <i class="bi bi-patch-check-fill"></i>
              <div>
                <strong>Cliente encontrado en el sistema: se reutilizará su ficha.</strong>
                <p class="mb-0">
                  {{ clienteEncontrado.nombreCompleto }} · al equipo asociado
                  {{ clienteEncontrado.totalDispositivos }} dispositivo(s),
                  {{ clienteEncontrado.totalOrdenes }} orden(es) y
                  {{ clienteEncontrado.totalCompras }} compra(s) registradas.
                </p>
              </div>
            </div>

            <!-- Aviso AZUL: la cédula no está registrada y se dará de alta -->
            <div v-else-if="clienteEsNuevo" class="aviso-cliente aviso-cliente--nuevo">
              <i class="bi bi-person-plus-fill"></i>
              <div>
                <strong>Cliente nuevo: se registrará al abrir la orden.</strong>
                <p class="mb-0">
                  La cédula {{ formularioRecepcion.cedula }} no aparece en la cartera; complete sus datos.
                </p>
              </div>
            </div>
          </div>
        </div>

        <hr class="my-4">

        <!-- ==================================================================
             SECCIÓN 2 · CARACTERÍSTICAS DEL DISPOSITIVO
             ================================================================== -->
        <h4 class="card-ts__title mb-3"><i class="bi bi-laptop"></i> 2. Características del dispositivo</h4>

        <div class="row g-3">
          <!-- Tipo de dispositivo (columna `nombre_dis`) -->
          <div class="col-md-6 col-xl-3">
            <label class="form-label" for="recepcion-tipo">Tipo de dispositivo*</label>
            <select
              id="recepcion-tipo"
              class="form-select"
              :class="{ 'is-invalid': erroresFormulario.tipoDispositivo }"
              v-model="formularioRecepcion.tipoDispositivo"
              :disabled="enviando"
              @change="limpiarErrorDeCampo('tipoDispositivo')"
            >
              <option value="" disabled>Seleccione el tipo...</option>
              <option v-for="tipo in TIPOS_DISPOSITIVO" :key="tipo" :value="tipo">{{ tipo }}</option>
            </select>
            <div v-if="erroresFormulario.tipoDispositivo" class="invalid-feedback d-block">
              {{ erroresFormulario.tipoDispositivo }}
            </div>
          </div>

          <!-- Marca -->
          <div class="col-md-6 col-xl-3">
            <label class="form-label" for="recepcion-marca">Marca*</label>
            <input
              id="recepcion-marca"
              type="text"
              class="form-control"
              :class="{ 'is-invalid': erroresFormulario.marca }"
              v-model="formularioRecepcion.marca"
              :disabled="enviando"
              placeholder="Ej.: HP, Samsung, Lenovo"
              @input="limpiarErrorDeCampo('marca')"
            >
            <div v-if="erroresFormulario.marca" class="invalid-feedback d-block">
              {{ erroresFormulario.marca }}
            </div>
          </div>

          <!-- Modelo -->
          <div class="col-md-6 col-xl-3">
            <label class="form-label" for="recepcion-modelo">Modelo</label>
            <input
              id="recepcion-modelo"
              type="text"
              class="form-control"
              v-model="formularioRecepcion.modelo"
              :disabled="enviando"
              placeholder="Ej.: Pavilion 15"
            >
          </div>

          <!-- Número de serie -->
          <div class="col-md-6 col-xl-3">
            <label class="form-label" for="recepcion-serie">Número de serie</label>
            <input
              id="recepcion-serie"
              type="text"
              class="form-control"
              v-model="formularioRecepcion.serie"
              :disabled="enviando"
              maxlength="100"
              placeholder="Ej.: 5CD1234ABC"
            >
            <div class="form-text">
              El sistema reconoce el equipo por su serie y reutiliza su historial de reparaciones.
            </div>
          </div>
        </div>

        <hr class="my-4">

        <!-- ==================================================================
             SECCIÓN 3 · MOTIVO DEL INGRESO
             ================================================================== -->
        <h4 class="card-ts__title mb-3"><i class="bi bi-clipboard-pulse"></i> 3. Motivo del ingreso</h4>

        <div class="row g-3">
          <!-- Falla reportada (obligatoria) -->
          <div class="col-12">
            <label class="form-label" for="recepcion-falla">Falla reportada por el cliente*</label>
            <textarea
              id="recepcion-falla"
              class="form-control"
              :class="{ 'is-invalid': erroresFormulario.falla }"
              v-model="formularioRecepcion.falla"
              :disabled="enviando"
              rows="3"
              placeholder="Ej.: El equipo enciende pero la pantalla se queda en negro y no carga el sistema."
              @input="limpiarErrorDeCampo('falla')"
            ></textarea>
            <div v-if="erroresFormulario.falla" class="invalid-feedback d-block">
              {{ erroresFormulario.falla }}
            </div>
            <div v-else class="form-text">
              Describa los síntomas con el mayor detalle posible: es la base del diagnóstico técnico.
            </div>
          </div>

          <!-- Accesorios entregados -->
          <div class="col-md-6">
            <label class="form-label" for="recepcion-accesorios">Accesorios entregados</label>
            <input
              id="recepcion-accesorios"
              type="text"
              class="form-control"
              v-model="formularioRecepcion.accesorios"
              :disabled="enviando"
              maxlength="255"
              placeholder="Ej.: Cargador, funda"
            >
            <div class="form-text">
              Queda registrado para evitar reclamos al momento de la entrega.
            </div>
          </div>

          <!-- Patrón o clave de desbloqueo -->
          <div class="col-md-6">
            <label class="form-label" for="recepcion-patron">Patrón o clave de desbloqueo</label>
            <input
              id="recepcion-patron"
              type="text"
              class="form-control"
              v-model="formularioRecepcion.patron"
              :disabled="enviando"
              maxlength="120"
              placeholder="Ej.: 1234 o patrón en L"
            >
            <div class="form-text">
              Necesario para que el técnico pueda probar el equipo durante la reparación.
            </div>
          </div>

          <!-- Técnico responsable asignado -->
          <div class="col-md-6">
            <label class="form-label" for="recepcion-tecnico">Técnico responsable*</label>
            <div class="input-icon">
              <i class="bi bi-person-gear" aria-hidden="true"></i>
              <select
                id="recepcion-tecnico"
                class="form-select"
                :class="{ 'is-invalid': erroresFormulario.idTecnico }"
                v-model="formularioRecepcion.idTecnico"
                :disabled="enviando || cargandoTecnicos"
                @change="limpiarErrorDeCampo('idTecnico')"
              >
                <option value="" disabled>Seleccione el técnico asignado...</option>
                <option v-for="t in tecnicos" :key="t.id_usuario" :value="t.id_usuario">
                  {{ t.nombre_usuario }} ({{ t.rol || 'Técnico' }})
                </option>
              </select>
            </div>
            <div v-if="erroresFormulario.idTecnico" class="invalid-feedback d-block">
              {{ erroresFormulario.idTecnico }}
            </div>
            <div v-else class="form-text">
              Especialista encargado del diagnóstico y reparación de este equipo.
            </div>
          </div>
        </div>
      </div>

      <!-- ================== PIE DEL FORMULARIO (ESTADO CARGANDO) ================== -->
      <div class="modal-footer justify-content-between">
        <p class="mb-0 small text-muted-2">
          <i class="bi bi-info-circle"></i>
          La orden se guarda directamente en la base de datos <strong>tekzon_bd</strong>; no hay datos de prueba.
        </p>
        <div class="d-flex flex-wrap gap-2">
          <button class="btn btn-outline-secondary" type="button" :disabled="enviando" @click="limpiarFormulario">
            <i class="bi bi-eraser"></i> Limpiar formulario
          </button>
          <button class="btn btn-primary" type="submit" :disabled="enviando">
            <span v-if="enviando" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            <i v-else class="bi bi-save"></i>
            {{ enviando ? 'Creando la orden de servicio...' : 'Registrar recepción y crear orden' }}
          </button>
        </div>
      </div>
    </form>
  </main>
</template>

<style scoped>
/*
 * Avisos del resultado de la búsqueda del cliente.
 * Se define aquí, de forma mínima, porque el design system sólo trae la
 * variante roja (`readonly-note`) y estos dos avisos son informativos
 * (verde = cliente reutilizado, azul = cliente nuevo), no errores.
 */
.aviso-cliente {
  display: flex;
  align-items: flex-start;
  gap: .6rem;
  font-size: .82rem;
  padding: .7rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
}

.aviso-cliente > i {
  font-size: 1.05rem;
  line-height: 1.2;
}

.aviso-cliente p {
  color: inherit;
  opacity: .85;
  font-size: .78rem;
}

.aviso-cliente--exito {
  background: #e8f6ee;
  color: #15803d;
  border-color: #bbf7d0;
}

.aviso-cliente--nuevo {
  background: #e3f4f7;
  color: var(--color-info);
  border-color: #bae6fd;
}
</style>
