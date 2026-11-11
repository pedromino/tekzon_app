<script setup>
/**
 * ==========================================================================
 * PÁGINA DE CONFIGURACIÓN DEL SISTEMA (ConfiguracionPage.vue) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Módulo de Administración y Configuración · Control de Usuarios y Roles
 *
 * PROPÓSITO FUNCIONAL:
 *   Provee al Administrador el control total sobre la seguridad y el personal:
 *     1. Visualización y búsqueda de todos los usuarios registrados.
 *     2. Gestión de Solicitudes Pendientes: asignación de rol y activación de
 *        cuentas registradas recientemente.
 *     3. Modificación de información de cuentas (nombre completo, usuario, rol).
 *     4. Deshabilitación y habilitación de usuarios (baja lógica segura).
 *     5. Restablecimiento y actualización de contraseñas de acceso.
 *     6. Creación directa de nuevos colaboradores desde la administración.
 *
 * PROPÓSITO TÉCNICO:
 *   · CERO datos estáticos: sincronización reactiva directa con MySQL mediante
 *     `UsuarioServices.js` y la API REST `/api/usuarios`.
 *   · Apertura y cierre de modales de Bootstrap 5 mediante `abrirModal` y `cerrarModal`.
 *   · Alertas y confirmaciones mediante `ToastNotificaciones.vue` y `ModalConfirmacion.vue`.
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';
import UsuarioServices from '../services/UsuarioServices.js';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ModalConfirmacion from '../components/ModalConfirmacion.vue';
import { abrirModal, cerrarModal } from '../utils/utilidadesModales.js';
import { formatearFecha } from '../services/formato.js';
import { sesion } from '../services/sesion.js';

// ==========================================================================
// ESTADO REACTIVO PRINCIPAL
// ==========================================================================
const cargando = ref(false);
const enviando = ref(false);
const pestanaActiva = ref('usuarios'); // 'usuarios' | 'pendientes'

const usuarios = ref([]);
const pendientes = ref([]);
const roles = ref([]);
const busqueda = ref('');
const filtroRol = ref('');
const filtroEstado = ref('');

const notificaciones = ref([]);

// Modales y formularios
const modalAprobarUsuario = ref({
  id_usuario: null,
  nombre_usuario: '',
  username: '',
  id_rolusuario: ''
});

const formUsuario = ref({
  id_usuario: null,
  nombre_usuario: '',
  username: '',
  contrasenia: '',
  confirmarContrasenia: '',
  id_rolusuario: ''
});

const formPassword = ref({
  id_usuario: null,
  nombre_usuario: '',
  username: '',
  contrasenia: '',
  confirmarContrasenia: ''
});

// Modal de confirmación genérico
const datosConfirmacion = ref({
  titulo: '',
  mensaje: '',
  accion: null,
  textoBoton: 'Confirmar',
  claseBoton: 'btn-danger'
});

// ==========================================================================
// SISTEMA DE TOASTS
// ==========================================================================
const mostrarToast = (titulo, mensaje, tipo = 'success') => {
  const id = Date.now() + Math.random();
  notificaciones.value.push({ id, titulo, mensaje, tipo });
  setTimeout(() => {
    notificaciones.value = notificaciones.value.filter((t) => t.id !== id);
  }, 4000);
};

const cerrarToast = (id) => {
  notificaciones.value = notificaciones.value.filter((t) => t.id !== id);
};

// ==========================================================================
// CARGA DE DATOS DESDE LA BASE DE DATOS
// ==========================================================================
const cargarDatos = async () => {
  cargando.value = true;
  try {
    const [listaUsuarios, dataPendientes, listaRoles] = await Promise.all([
      UsuarioServices.listarUsuarios(),
      UsuarioServices.obtenerPendientes(),
      UsuarioServices.listarRoles()
    ]);

    usuarios.value = listaUsuarios;
    pendientes.value = dataPendientes.pendientes || [];
    roles.value = listaRoles;
  } catch (error) {
    mostrarToast('Error de conexión', error.mensaje || 'No se pudieron cargar los datos de usuarios.', 'danger');
  } finally {
    cargando.value = false;
  }
};

onMounted(() => {
  cargarDatos();
});

// ==========================================================================
// FILTRADO Y BÚSQUEDA COMPUTADA
// ==========================================================================
const usuariosFiltrados = computed(() => {
  return usuarios.value.filter((u) => {
    // Si está pendiente de aprobación, se gestiona en la pestaña de pendientes
    if (Number(u.pendiente_aprobacion) === 1) return false;

    const texto = busqueda.value.toLowerCase().trim();
    const coincideTexto =
      !texto ||
      (u.nombre_usuario && u.nombre_usuario.toLowerCase().includes(texto)) ||
      (u.username && u.username.toLowerCase().includes(texto));

    const coincideRol = !filtroRol.value || String(u.id_rolusuario) === String(filtroRol.value);
    const coincideEstado = filtroEstado.value === '' || String(u.estado) === String(filtroEstado.value);

    return coincideTexto && coincideRol && coincideEstado;
  });
});

const totalPendientes = computed(() => pendientes.value.length);

// ==========================================================================
// MÉTODOS Y ACCIONES DE NEGOCIO
// ==========================================================================

// Color del badge según el rol
const badgeRol = (rol) => {
  const r = String(rol || '').toLowerCase();
  switch (r) {
    case 'administrador':
      return 'badge bg-danger';
    case 'tecnico':
      return 'badge bg-primary';
    case 'almacenista':
      return 'badge bg-warning text-dark';
    case 'cajero':
      return 'badge bg-success';
    default:
      return 'badge bg-secondary';
  }
};

/**
 * Abre el modal para crear un usuario nuevo directamente.
 */
const abrirModalCrear = () => {
  formUsuario.value = {
    id_usuario: null,
    nombre_usuario: '',
    username: '',
    contrasenia: '',
    confirmarContrasenia: '',
    id_rolusuario: roles.value[0]?.id_rolusuario || ''
  };
  abrirModal('modalFormUsuario');
};

/**
 * Abre el modal para editar datos de un usuario existente.
 */
const abrirModalEditar = (u) => {
  formUsuario.value = {
    id_usuario: u.id_usuario,
    nombre_usuario: u.nombre_usuario,
    username: u.username,
    contrasenia: '',
    confirmarContrasenia: '',
    id_rolusuario: u.id_rolusuario
  };
  abrirModal('modalFormUsuario');
};

/**
 * Guarda el formulario de creación o edición de usuario.
 */
const guardarUsuario = async () => {
  if (!formUsuario.value.nombre_usuario.trim()) {
    mostrarToast('Validación', 'El nombre completo es obligatorio.', 'warning');
    return;
  }
  if (!formUsuario.value.username.trim()) {
    mostrarToast('Validación', 'El nombre de usuario (login) es obligatorio.', 'warning');
    return;
  }
  if (!formUsuario.value.id_rolusuario) {
    mostrarToast('Validación', 'Debe seleccionar un rol para el usuario.', 'warning');
    return;
  }

  // Si es creación, validar contraseña
  if (!formUsuario.value.id_usuario) {
    if (!formUsuario.value.contrasenia || formUsuario.value.contrasenia.length < 6) {
      mostrarToast('Validación', 'La contraseña debe tener mínimo 6 caracteres.', 'warning');
      return;
    }
    if (formUsuario.value.contrasenia !== formUsuario.value.confirmarContrasenia) {
      mostrarToast('Validación', 'Las contraseñas no coinciden.', 'warning');
      return;
    }
  }

  enviando.value = true;
  try {
    if (formUsuario.value.id_usuario) {
      // Actualización
      await UsuarioServices.actualizarUsuario(formUsuario.value.id_usuario, {
        nombre_usuario: formUsuario.value.nombre_usuario,
        username: formUsuario.value.username,
        id_rolusuario: formUsuario.value.id_rolusuario
      });
      mostrarToast('Usuario Actualizado', 'Los datos del usuario fueron actualizados correctamente.', 'success');
    } else {
      // Creación
      await UsuarioServices.crearUsuario({
        nombre_usuario: formUsuario.value.nombre_usuario,
        username: formUsuario.value.username,
        contrasenia: formUsuario.value.contrasenia,
        id_rolusuario: formUsuario.value.id_rolusuario
      });
      mostrarToast('Usuario Creado', 'El nuevo usuario fue registrado con éxito en el sistema.', 'success');
    }
    cerrarModal('modalFormUsuario');
    await cargarDatos();
  } catch (error) {
    mostrarToast('Error al guardar', error.mensaje || 'No se pudo guardar la información.', 'danger');
  } finally {
    enviando.value = false;
  }
};

/**
 * Abre el modal para configurar el rol y aprobar una solicitud pendiente.
 */
const abrirModalAprobacion = (p) => {
  modalAprobarUsuario.value = {
    id_usuario: p.id_usuario,
    nombre_usuario: p.nombre_usuario,
    username: p.username,
    id_rolusuario: roles.value.find((r) => r.tipo_usuario === 'tecnico')?.id_rolusuario || roles.value[0]?.id_rolusuario || ''
  };
  abrirModal('modalAprobarRol');
};

/**
 * Confirma la aprobación y asignación de rol del usuario nuevo.
 */
const confirmarAprobacion = async () => {
  if (!modalAprobarUsuario.value.id_rolusuario) {
    mostrarToast('Validación', 'Debe seleccionar el rol a asignar.', 'warning');
    return;
  }

  enviando.value = true;
  try {
    await UsuarioServices.aprobarUsuario(
      modalAprobarUsuario.value.id_usuario,
      modalAprobarUsuario.value.id_rolusuario
    );
    mostrarToast(
      'Usuario Aprobado',
      `Se asignó el rol al usuario "${modalAprobarUsuario.value.username}" y ha sido activado.`,
      'success'
    );
    cerrarModal('modalAprobarRol');
    await cargarDatos();
  } catch (error) {
    mostrarToast('Error al aprobar', error.mensaje || 'No se pudo aprobar la solicitud.', 'danger');
  } finally {
    enviando.value = false;
  }
};

/**
 * Solicita confirmación para rechazar una solicitud pendiente.
 */
const solicitarRechazo = (p) => {
  datosConfirmacion.value = {
    titulo: '¿Rechazar solicitud de registro?',
    mensaje: `Se descartará la solicitud del usuario "${p.nombre_usuario}" (@${p.username}) y se removerá su preregistro.`,
    textoBoton: 'Rechazar Solicitud',
    claseBoton: 'btn-danger',
    accion: async () => {
      try {
        await UsuarioServices.rechazarUsuario(p.id_usuario);
        mostrarToast('Solicitud rechazada', 'La solicitud fue descartada exitosamente.', 'info');
        await cargarDatos();
      } catch (error) {
        mostrarToast('Error al rechazar', error.mensaje || 'No se pudo rechazar la solicitud.', 'danger');
      }
    }
  };
  abrirModal('modalConfirmacionUsuario');
};

/**
 * Cambia el estado (habilitar / deshabilitar) de un usuario con confirmación.
 */
const alternarEstadoUsuario = (u) => {
  const esDeshabilitar = Number(u.estado) === 1;
  const nuevoEstado = esDeshabilitar ? 0 : 1;
  const accionTexto = esDeshabilitar ? 'deshabilitar' : 'habilitar';

  datosConfirmacion.value = {
    titulo: `¿Desea ${accionTexto} al usuario?`,
    mensaje: esDeshabilitar
      ? `El usuario "${u.nombre_usuario}" (@${u.username}) no podrá iniciar sesión en el sistema mientras esté deshabilitado.`
      : `El usuario "${u.nombre_usuario}" (@${u.username}) recuperará el acceso a la plataforma con su rol asignado.`,
    textoBoton: esDeshabilitar ? 'Deshabilitar Usuario' : 'Habilitar Usuario',
    claseBoton: esDeshabilitar ? 'btn-warning text-dark' : 'btn-success',
    accion: async () => {
      try {
        await UsuarioServices.cambiarEstado(u.id_usuario, nuevoEstado);
        mostrarToast(
          'Estado Actualizado',
          `Usuario ${esDeshabilitar ? 'deshabilitado' : 'habilitado'} con éxito.`,
          'success'
        );
        await cargarDatos();
      } catch (error) {
        mostrarToast('Error al cambiar estado', error.mensaje || 'No se pudo actualizar el estado.', 'danger');
      }
    }
  };
  abrirModal('modalConfirmacionUsuario');
};

/**
 * Abre el modal para cambiar la contraseña de un usuario.
 */
const abrirModalPassword = (u) => {
  formPassword.value = {
    id_usuario: u.id_usuario,
    nombre_usuario: u.nombre_usuario,
    username: u.username,
    contrasenia: '',
    confirmarContrasenia: ''
  };
  abrirModal('modalCambiarPassword');
};

/**
 * Guarda la nueva contraseña del usuario.
 */
const guardarPassword = async () => {
  if (!formPassword.value.contrasenia || formPassword.value.contrasenia.length < 6) {
    mostrarToast('Validación', 'La contraseña debe contener al menos 6 caracteres.', 'warning');
    return;
  }
  if (formPassword.value.contrasenia !== formPassword.value.confirmarContrasenia) {
    mostrarToast('Validación', 'Las contraseñas no coinciden.', 'warning');
    return;
  }

  enviando.value = true;
  try {
    await UsuarioServices.cambiarContrasenia(formPassword.value.id_usuario, {
      contrasenia: formPassword.value.contrasenia,
      confirmarContrasenia: formPassword.value.confirmarContrasenia
    });
    mostrarToast('Contraseña Actualizada', 'La clave de acceso ha sido cambiada satisfactoriamente.', 'success');
    cerrarModal('modalCambiarPassword');
  } catch (error) {
    mostrarToast('Error al cambiar clave', error.mensaje || 'No se pudo cambiar la contraseña.', 'danger');
  } finally {
    enviando.value = false;
  }
};

/**
 * Solicita confirmación para eliminar a un usuario.
 */
const solicitarEliminarUsuario = (u) => {
  datosConfirmacion.value = {
    titulo: '¿Eliminar usuario definitivamente?',
    mensaje: `Se intentará eliminar a "${u.nombre_usuario}" (@${u.username}). Nota: Si el usuario tiene ventas, kárdex u órdenes asociadas, la base de datos impedirá el borrado para conservar la auditoría; en tal caso puede deshabilitarlo.`,
    textoBoton: 'Eliminar Usuario',
    claseBoton: 'btn-danger',
    accion: async () => {
      try {
        await UsuarioServices.eliminarUsuario(u.id_usuario);
        mostrarToast('Usuario Eliminado', 'El usuario fue eliminado permanentemente.', 'success');
        await cargarDatos();
      } catch (error) {
        mostrarToast('No se pudo eliminar', error.mensaje || 'Error al eliminar el usuario.', 'danger');
      }
    }
  };
  abrirModal('modalConfirmacionUsuario');
};

/**
 * Ejecuta la acción confirmada en el modal de confirmación.
 */
const ejecutarAccionConfirmada = async () => {
  if (typeof datosConfirmacion.value.accion === 'function') {
    await datosConfirmacion.value.accion();
  }
  cerrarModal('modalConfirmacionUsuario');
};
</script>

<template>
  <div class="configuracion-page container-fluid py-4">
    <ToastNotificaciones :notificaciones="notificaciones" @cerrar="cerrarToast" />

    <!-- ==================================================================
         ENCABEZADO DE LA PÁGINA
         ================================================================== -->
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1 text-dark d-flex align-items-center gap-2">
          <i class="bi bi-gear-fill text-primary"></i> Configuración del Sistema
        </h1>
        <p class="text-muted mb-0">
          Administración de usuarios, asignación de roles, aprobaciones y control de accesos.
        </p>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-secondary" type="button" @click="cargarDatos" :disabled="cargando">
          <i class="bi bi-arrow-clockwise me-1" :class="{ 'spin': cargando }"></i> Refrescar
        </button>
        <button class="btn btn-primary" type="button" @click="abrirModalCrear">
          <i class="bi bi-person-plus-fill me-1"></i> Nuevo Usuario
        </button>
      </div>
    </div>

    <!-- ==================================================================
         PESTAÑAS DE NAVEGACIÓN (USUARIOS / SOLICITUDES PENDIENTES)
         ================================================================== -->
    <ul class="nav nav-pills mb-4 gap-2 bg-light p-2 rounded-3 border">
      <li class="nav-item">
        <button
          class="nav-link d-flex align-items-center gap-2"
          :class="{ active: pestanaActiva === 'usuarios' }"
          type="button"
          @click="pestanaActiva = 'usuarios'"
        >
          <i class="bi bi-people-fill"></i>
          <span>Usuarios del Sistema</span>
          <span class="badge bg-secondary rounded-pill">{{ usuariosFiltrados.length }}</span>
        </button>
      </li>
      <li class="nav-item">
        <button
          class="nav-link d-flex align-items-center gap-2"
          :class="{ active: pestanaActiva === 'pendientes', 'text-warning-emphasis': totalPendientes > 0 }"
          type="button"
          @click="pestanaActiva = 'pendientes'"
        >
          <i class="bi bi-bell-fill"></i>
          <span>Solicitudes Pendientes</span>
          <span
            v-if="totalPendientes > 0"
            class="badge bg-warning text-dark rounded-pill fw-bold animate-pulse"
          >
            {{ totalPendientes }}
          </span>
          <span v-else class="badge bg-secondary rounded-pill">0</span>
        </button>
      </li>
    </ul>

    <!-- ==================================================================
         PESTAÑA 1: GESTIÓN DE USUARIOS DEL SISTEMA
         ================================================================== -->
    <div v-if="pestanaActiva === 'usuarios'" class="card shadow-sm border-0">
      <div class="card-body">
        <!-- Barra de filtros -->
        <div class="row g-3 mb-4">
          <div class="col-md-5">
            <div class="input-group">
              <span class="input-group-text bg-white"><i class="bi bi-search text-muted"></i></span>
              <input
                v-model="busqueda"
                type="text"
                class="form-control"
                placeholder="Buscar por nombre o usuario..."
              />
            </div>
          </div>
          <div class="col-md-3">
            <select v-model="filtroRol" class="form-select">
              <option value="">Todos los roles</option>
              <option v-for="r in roles" :key="r.id_rolusuario" :value="r.id_rolusuario">
                {{ r.tipo_usuario }}
              </option>
            </select>
          </div>
          <div class="col-md-3">
            <select v-model="filtroEstado" class="form-select">
              <option value="">Todos los estados</option>
              <option value="1">Activos</option>
              <option value="0">Deshabilitados</option>
            </select>
          </div>
          <div class="col-md-1 d-flex justify-content-end">
            <button
              class="btn btn-outline-secondary w-100"
              type="button"
              title="Limpiar filtros"
              @click="busqueda = ''; filtroRol = ''; filtroEstado = '';"
            >
              <i class="bi bi-x-circle"></i>
            </button>
          </div>
        </div>

        <!-- Spinner mientras carga -->
        <div v-if="cargando" class="text-center py-5">
          <LoadingSpinner texto="Cargando usuarios desde la base de datos..." />
        </div>

        <!-- Tabla de usuarios -->
        <div v-else-if="usuariosFiltrados.length > 0" class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th style="width: 60px;">ID</th>
                <th>Nombre del Colaborador</th>
                <th>Nombre de Usuario</th>
                <th>Rol Asignado</th>
                <th>Estado</th>
                <th>Último Acceso</th>
                <th class="text-end" style="width: 200px;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in usuariosFiltrados" :key="u.id_usuario">
                <td class="text-muted fw-semibold">#{{ u.id_usuario }}</td>
                <td>
                  <div class="d-flex align-items-center gap-2">
                    <span class="avatar-circulo">{{ u.nombre_usuario ? u.nombre_usuario.charAt(0).toUpperCase() : 'U' }}</span>
                    <div>
                      <div class="fw-semibold text-dark">{{ u.nombre_usuario }}</div>
                      <small v-if="u.id_usuario === sesion.usuario?.id_usuario" class="badge bg-info text-dark" style="font-size: 0.65rem;">
                        Mi Cuenta
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="badge bg-light text-dark border font-monospace">@{{ u.username }}</span>
                </td>
                <td>
                  <span :class="badgeRol(u.tipo_usuario)">
                    {{ u.tipo_usuario || 'Sin asignar' }}
                  </span>
                </td>
                <td>
                  <span v-if="Number(u.estado) === 1" class="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1">
                    <i class="bi bi-check-circle-fill"></i> Activo
                  </span>
                  <span v-else class="badge bg-danger-subtle text-danger border border-danger-subtle d-inline-flex align-items-center gap-1">
                    <i class="bi bi-slash-circle-fill"></i> Deshabilitado
                  </span>
                </td>
                <td class="text-muted" style="font-size: 0.85rem;">
                  {{ u.ultimo_acceso ? formatearFecha(u.ultimo_acceso) : 'Sin ingresos registrados' }}
                </td>
                <td class="text-end">
                  <div class="btn-group btn-group-sm">
                    <!-- Modificar datos -->
                    <button
                      class="btn btn-outline-primary"
                      type="button"
                      title="Editar usuario"
                      @click="abrirModalEditar(u)"
                    >
                      <i class="bi bi-pencil-square"></i>
                    </button>

                    <!-- Habilitar / Deshabilitar -->
                    <button
                      class="btn"
                      :class="Number(u.estado) === 1 ? 'btn-outline-warning' : 'btn-outline-success'"
                      type="button"
                      :title="Number(u.estado) === 1 ? 'Deshabilitar cuenta' : 'Habilitar cuenta'"
                      :disabled="u.id_usuario === sesion.usuario?.id_usuario && Number(u.estado) === 1"
                      @click="alternarEstadoUsuario(u)"
                    >
                      <i :class="Number(u.estado) === 1 ? 'bi bi-slash-circle' : 'bi bi-check2-circle'"></i>
                    </button>

                    <!-- Cambiar contraseña -->
                    <button
                      class="btn btn-outline-secondary"
                      type="button"
                      title="Cambiar contraseña"
                      @click="abrirModalPassword(u)"
                    >
                      <i class="bi bi-key-fill"></i>
                    </button>

                    <!-- Eliminar -->
                    <button
                      class="btn btn-outline-danger"
                      type="button"
                      title="Eliminar usuario"
                      :disabled="u.id_usuario === sesion.usuario?.id_usuario"
                      @click="solicitarEliminarUsuario(u)"
                    >
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Estado vacío si no hay coincidencias -->
        <div v-else class="text-center py-5">
          <i class="bi bi-people display-4 text-muted mb-2"></i>
          <h5 class="text-secondary">No se encontraron usuarios</h5>
          <p class="text-muted mb-0">Intente modificando los filtros de búsqueda.</p>
        </div>
      </div>
    </div>

    <!-- ==================================================================
         PESTAÑA 2: SOLICITUDES DE REGISTRO PENDIENTES
         ================================================================== -->
    <div v-if="pestanaActiva === 'pendientes'" class="card shadow-sm border-0">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h5 class="card-title fw-bold text-dark mb-1 d-flex align-items-center gap-2">
              <i class="bi bi-person-check-fill text-warning"></i>
              Nuevos Usuarios Pendientes de Asignación de Rol
            </h5>
            <p class="text-muted mb-0">
              Cuando un nuevo usuario se registra en la plataforma, queda en espera de que el Administrador configure su rol antes de poder operar.
            </p>
          </div>
          <span class="badge bg-warning text-dark px-3 py-2 fs-6">
            {{ totalPendientes }} solicitud(es)
          </span>
        </div>

        <!-- Spinner -->
        <div v-if="cargando" class="text-center py-5">
          <LoadingSpinner texto="Consultando solicitudes pendientes..." />
        </div>

        <!-- Lista de pendientes -->
        <div v-else-if="pendientes.length > 0" class="row g-3">
          <div v-for="p in pendientes" :key="p.id_usuario" class="col-md-6 col-lg-4">
            <div class="card border border-warning-subtle shadow-sm h-100">
              <div class="card-body d-flex flex-column justify-content-between">
                <div>
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="badge bg-warning text-dark">Pendiente de Aprobación</span>
                    <small class="text-muted">ID: #{{ p.id_usuario }}</small>
                  </div>
                  <h6 class="fw-bold text-dark mb-1">{{ p.nombre_usuario }}</h6>
                  <p class="text-muted mb-2 font-monospace" style="font-size: 0.9rem;">
                    <i class="bi bi-person-badge me-1"></i> @{{ p.username }}
                  </p>
                  <p class="small text-secondary mb-3">
                    Este colaborador se registró públicamente y requiere que se le otorgue un rol para iniciar sesión.
                  </p>
                </div>
                <div class="d-flex gap-2 pt-2 border-top">
                  <button
                    class="btn btn-sm btn-primary flex-grow-1 d-flex align-items-center justify-content-center gap-1"
                    type="button"
                    @click="abrirModalAprobacion(p)"
                  >
                    <i class="bi bi-shield-check"></i> Asignar Rol y Aprobar
                  </button>
                  <button
                    class="btn btn-sm btn-outline-danger"
                    type="button"
                    title="Rechazar solicitud"
                    @click="solicitarRechazo(p)"
                  >
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sin pendientes -->
        <div v-else class="text-center py-5">
          <div class="display-4 text-success mb-2"><i class="bi bi-check-circle"></i></div>
          <h5 class="text-dark">¡Todo al día!</h5>
          <p class="text-muted mb-0">No hay nuevas solicitudes de registro en espera de configuración.</p>
        </div>
      </div>
    </div>

    <!-- ==================================================================
         MODAL 1: ASIGNAR ROL Y APROBAR USUARIO NUEVO
         ================================================================== -->
    <div class="modal fade" id="modalAprobarRol" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title fw-bold">
              <i class="bi bi-shield-lock-fill me-2"></i> Configurar Rol y Activar Usuario
            </h5>
            <button type="button" class="btn-close btn-close-white" @click="cerrarModal('modalAprobarRol')"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info py-2 px-3 mb-3 d-flex align-items-center gap-2">
              <i class="bi bi-info-circle-fill fs-5"></i>
              <div style="font-size: 0.85rem;">
                Seleccione el rol correspondiente para <strong>{{ modalAprobarUsuario.nombre_usuario }}</strong> (@{{ modalAprobarUsuario.username }}). La cuenta quedará activa inmediatamente.
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label fw-bold">Rol a Desempeñar <span class="text-danger">*</span></label>
              <select v-model="modalAprobarUsuario.id_rolusuario" class="form-select form-select-lg">
                <option v-for="r in roles" :key="r.id_rolusuario" :value="r.id_rolusuario">
                  {{ r.tipo_usuario.toUpperCase() }}
                </option>
              </select>
              <small class="text-muted mt-1 d-block">
                • <strong>Administrador:</strong> Acceso total al sistema.<br>
                • <strong>Técnico:</strong> Diagnósticos, consumo de repuestos y órdenes.<br>
                • <strong>Almacenista:</strong> Inventario, kárdex y ajustes.<br>
                • <strong>Cajero:</strong> Cobros, facturación y caja.
              </small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" @click="cerrarModal('modalAprobarRol')">
              Cancelar
            </button>
            <button
              type="button"
              class="btn btn-primary d-flex align-items-center gap-2"
              :disabled="enviando"
              @click="confirmarAprobacion"
            >
              <span v-if="enviando" class="spinner-border spinner-border-sm"></span>
              <i v-else class="bi bi-check-lg"></i>
              Aprobar y Asignar Rol
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================================================================
         MODAL 2: CREAR / MODIFICAR DATOS DEL USUARIO
         ================================================================== -->
    <div class="modal fade" id="modalFormUsuario" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-dark text-white">
            <h5 class="modal-title fw-bold">
              <i class="bi bi-person-gear me-2"></i>
              {{ formUsuario.id_usuario ? 'Modificar Usuario' : 'Nuevo Usuario' }}
            </h5>
            <button type="button" class="btn-close btn-close-white" @click="cerrarModal('modalFormUsuario')"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label fw-semibold">Nombre Completo <span class="text-danger">*</span></label>
              <input
                v-model="formUsuario.nombre_usuario"
                type="text"
                class="form-control"
                placeholder="Ej. Juan Pérez"
              />
            </div>

            <div class="mb-3">
              <label class="form-label fw-semibold">Nombre de Usuario (Login) <span class="text-danger">*</span></label>
              <div class="input-group">
                <span class="input-group-text">@</span>
                <input
                  v-model="formUsuario.username"
                  type="text"
                  class="form-control"
                  placeholder="ej. juanperez"
                />
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label fw-semibold">Rol del Sistema <span class="text-danger">*</span></label>
              <select v-model="formUsuario.id_rolusuario" class="form-select">
                <option value="" disabled>Seleccione un rol...</option>
                <option v-for="r in roles" :key="r.id_rolusuario" :value="r.id_rolusuario">
                  {{ r.tipo_usuario }}
                </option>
              </select>
            </div>

            <!-- Campos de contraseña solo si es creación -->
            <div v-if="!formUsuario.id_usuario">
              <div class="mb-3">
                <label class="form-label fw-semibold">Contraseña <span class="text-danger">*</span></label>
                <input
                  v-model="formUsuario.contrasenia"
                  type="password"
                  class="form-control"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div class="mb-3">
                <label class="form-label fw-semibold">Confirmar Contraseña <span class="text-danger">*</span></label>
                <input
                  v-model="formUsuario.confirmarContrasenia"
                  type="password"
                  class="form-control"
                  placeholder="Repita la contraseña"
                />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" @click="cerrarModal('modalFormUsuario')">
              Cancelar
            </button>
            <button
              type="button"
              class="btn btn-primary d-flex align-items-center gap-2"
              :disabled="enviando"
              @click="guardarUsuario"
            >
              <span v-if="enviando" class="spinner-border spinner-border-sm"></span>
              <i v-else class="bi bi-save"></i>
              Guardar Usuario
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================================================================
         MODAL 3: CAMBIAR CONTRASEÑA
         ================================================================== -->
    <div class="modal fade" id="modalCambiarPassword" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-secondary text-white">
            <h5 class="modal-title fw-bold">
              <i class="bi bi-key-fill me-2"></i> Cambiar Contraseña de Acceso
            </h5>
            <button type="button" class="btn-close btn-close-white" @click="cerrarModal('modalCambiarPassword')"></button>
          </div>
          <div class="modal-body">
            <p class="text-muted small mb-3">
              Actualizando la contraseña para el usuario <strong>{{ formPassword.nombre_usuario }}</strong> (@{{ formPassword.username }}).
            </p>

            <div class="mb-3">
              <label class="form-label fw-semibold">Nueva Contraseña <span class="text-danger">*</span></label>
              <input
                v-model="formPassword.contrasenia"
                type="password"
                class="form-control"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div class="mb-3">
              <label class="form-label fw-semibold">Confirmar Nueva Contraseña <span class="text-danger">*</span></label>
              <input
                v-model="formPassword.confirmarContrasenia"
                type="password"
                class="form-control"
                placeholder="Repita la nueva contraseña"
              />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" @click="cerrarModal('modalCambiarPassword')">
              Cancelar
            </button>
            <button
              type="button"
              class="btn btn-primary d-flex align-items-center gap-2"
              :disabled="enviando"
              @click="guardarPassword"
            >
              <span v-if="enviando" class="spinner-border spinner-border-sm"></span>
              <i v-else class="bi bi-check2"></i>
              Actualizar Contraseña
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================================================================
         MODAL 4: CONFIRMACIÓN GENÉRICA
         ================================================================== -->
    <div class="modal fade" id="modalConfirmacionUsuario" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title fw-bold text-dark">{{ datosConfirmacion.titulo }}</h5>
            <button type="button" class="btn-close" @click="cerrarModal('modalConfirmacionUsuario')"></button>
          </div>
          <div class="modal-body">
            <p class="mb-0 text-secondary">{{ datosConfirmacion.mensaje }}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" @click="cerrarModal('modalConfirmacionUsuario')">
              Cancelar
            </button>
            <button
              type="button"
              class="btn"
              :class="datosConfirmacion.claseBoton"
              @click="ejecutarAccionConfirmada"
            >
              {{ datosConfirmacion.textoBoton }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.avatar-circulo {
  width: 32px;
  height: 32px;
  background-color: #e2e8f0;
  color: #334155;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
}

.spin {
  display: inline-block;
  animation: girar 1s linear infinite;
}

@keyframes girar {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-pulse {
  animation: pulso 1.5s infinite;
}

@keyframes pulso {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}
</style>
