<script setup>
/**
 * ==========================================================================
 * PÁGINA DE PROVEEDORES (ProveedoresPage.vue) - TEKZON C.A.
 * ==========================================================================
 * Módulo de Proveedores y Compras
 *
 * PROPÓSITO FUNCIONAL:
 *   Permite registrar y administrar la cartera de proveedores comerciales de la
 *   empresa: Nombre / Razón Social, RIF, Teléfono, Dirección y Status (Activo/Inactivo).
 *   Soporta alta, edición, búsqueda y cambio de estado.
 * ==========================================================================
 */
import { ref, computed, onMounted } from 'vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ToastNotificaciones from '../components/ToastNotificaciones.vue';
import ModalConfirmacion from '../components/ModalConfirmacion.vue';
import ModalGenerarReporte from '../components/ModalGenerarReporte.vue';
import ProveedorServices from '../services/ProveedorServices.js';
import { abrirModal, cerrarModal } from '../utils/utilidadesModales.js';

// ==========================================================================
// ESTADO REACTIVO PRINCIPAL
// ==========================================================================
const proveedores = ref([]);
const textoBusqueda = ref('');
const filtroEstado = ref(''); // '' | 'activos' | 'inactivos'

// Estados de UI
const estadoCarga = ref(false);
const mensajeErrorCarga = ref('');
const procesandoGuardado = ref(false);
const esEdicion = ref(false);

// Formulario Modal
const formulario = ref({
  rif: '',
  nombre: '',
  telefono: '',
  direccion: '',
  estado: 1
});
const erroresValidacion = ref({});

// Confirmación de Estado
const proveedorAConfirmar = ref(null);
const procesandoCambioEstado = ref(false);

// Notificaciones Toast
const notificaciones = ref([]);

const mostrarToast = (titulo, mensaje, tipo = 'success') => {
  const id = Date.now() + Math.random();
  notificaciones.value.push({ id, titulo, mensaje, tipo });
  setTimeout(() => {
    notificaciones.value = notificaciones.value.filter((t) => t.id !== id);
  }, 4000);
};

const cerrarToastPorId = (id) => {
  notificaciones.value = notificaciones.value.filter((t) => t.id !== id);
};

// ==========================================================================
// CARGA DE DATOS
// ==========================================================================
const cargarProveedores = async () => {
  estadoCarga.value = true;
  mensajeErrorCarga.value = '';

  try {
    proveedores.value = await ProveedorServices.listarProveedores();
  } catch (error) {
    mensajeErrorCarga.value = error?.mensaje || 'No se pudo cargar la lista de proveedores.';
    mostrarToast('Error al consultar proveedores', mensajeErrorCarga.value, 'error');
  } finally {
    estadoCarga.value = false;
  }
};

onMounted(() => {
  cargarProveedores();
});

// ==========================================================================
// FILTRADO Y MÉTRICAS
// ==========================================================================
const totalProveedores = computed(() => proveedores.value.length);
const totalActivos = computed(() => proveedores.value.filter((p) => p.estado === 1).length);
const totalInactivos = computed(() => proveedores.value.filter((p) => p.estado === 0).length);

const proveedoresFiltrados = computed(() => {
  const busqueda = textoBusqueda.value.trim().toLowerCase();

  return proveedores.value.filter((p) => {
    const coincideTexto = !busqueda
      || p.rif.toLowerCase().includes(busqueda)
      || p.nombre.toLowerCase().includes(busqueda)
      || p.telefono.toLowerCase().includes(busqueda)
      || p.direccion.toLowerCase().includes(busqueda);

    const coincideEstado = !filtroEstado.value
      || (filtroEstado.value === 'activos' && p.estado === 1)
      || (filtroEstado.value === 'inactivos' && p.estado === 0);

    return coincideTexto && coincideEstado;
  });
});

// ==========================================================================
// ACCIONES DEL FORMULARIO
// ==========================================================================
const prepararCreacion = () => {
  esEdicion.value = false;
  erroresValidacion.value = {};
  formulario.value = {
    rif: '',
    nombre: '',
    telefono: '',
    direccion: '',
    estado: 1
  };
  abrirModal('modalProveedor');
};

const prepararEdicion = (p) => {
  esEdicion.value = true;
  erroresValidacion.value = {};
  formulario.value = {
    rif: p.rif,
    nombre: p.nombre,
    telefono: p.telefono,
    direccion: p.direccion,
    estado: p.estado
  };
  abrirModal('modalProveedor');
};

const validarFormulario = () => {
  const errores = {};
  const rif = String(formulario.value.rif || '').trim();
  const nombre = String(formulario.value.nombre || '').trim();

  if (!rif) {
    errores.rif = 'El RIF del proveedor es obligatorio.';
  } else if (rif.length > 20) {
    errores.rif = 'El RIF no puede superar los 20 caracteres.';
  }

  if (!nombre) {
    errores.nombre = 'El nombre o razón social es obligatorio.';
  } else if (nombre.length > 150) {
    errores.nombre = 'El nombre no puede superar los 150 caracteres.';
  }

  erroresValidacion.value = errores;
  return Object.keys(errores).length === 0;
};

const guardarProveedor = async () => {
  if (procesandoGuardado.value) return;
  if (!validarFormulario()) return;

  procesandoGuardado.value = true;

  try {
    if (esEdicion.value) {
      const res = await ProveedorServices.actualizarProveedor(formulario.value.rif, {
        nombre: formulario.value.nombre,
        telefono: formulario.value.telefono,
        direccion: formulario.value.direccion,
        estado: formulario.value.estado
      });
      mostrarToast('Proveedor actualizado', res.mensaje, 'success');
    } else {
      const res = await ProveedorServices.crearProveedor(formulario.value);
      mostrarToast('Proveedor registrado', res.mensaje, 'success');
    }

    cerrarModal('modalProveedor');
    await cargarProveedores();
  } catch (error) {
    const msg = error?.mensaje || 'Error al guardar el proveedor.';
    mostrarToast('Error al guardar', msg, 'error');
  } finally {
    procesandoGuardado.value = false;
  }
};

// ==========================================================================
// CAMBIO DE ESTADO (HABILITAR / DESHABILITAR)
// ==========================================================================
const solicitarCambioEstado = (p) => {
  proveedorAConfirmar.value = p;
  abrirModal('modalConfirmarEstadoProveedor');
};

const confirmarCambioEstado = async () => {
  if (!proveedorAConfirmar.value || procesandoCambioEstado.value) return;

  procesandoCambioEstado.value = true;
  const p = proveedorAConfirmar.value;
  const nuevoEstado = p.estado === 1 ? 0 : 1;

  try {
    const res = await ProveedorServices.cambiarEstadoProveedor(p.rif, nuevoEstado);
    mostrarToast('Estado actualizado', res.mensaje, 'success');
    cerrarModal('modalConfirmarEstadoProveedor');
    await cargarProveedores();
  } catch (error) {
    mostrarToast('Error', error?.mensaje || 'No se pudo cambiar el estado del proveedor.', 'error');
  } finally {
    procesandoCambioEstado.value = false;
    proveedorAConfirmar.value = null;
  }
};

const manejarNotificacionReporte = ({ titulo, mensaje, tipo }) => {
  mostrarToast(titulo, mensaje, tipo);
};
</script>

<template>
  <main class="page-body">
    <!-- Notificaciones flotantes -->
    <ToastNotificaciones :notificaciones="notificaciones" @cerrar="cerrarToastPorId" />

    <!-- Encabezado de página -->
    <header class="page-header d-flex flex-wrap justify-content-between align-items-center gap-3">
      <div>
        <h1 class="page-title"><i class="bi bi-truck me-2 text-primary"></i>Proveedores</h1>
        <p class="page-subtitle">Registro y administración de proveedores y compras de mercancía</p>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-outline-primary d-flex align-items-center gap-2" type="button" @click="abrirModal('modalReporteProveedores')">
          <i class="bi bi-file-earmark-bar-graph"></i>
          <span>Generar Reporte</span>
        </button>
        <button class="btn btn-primary d-flex align-items-center gap-2" type="button" @click="prepararCreacion">
          <i class="bi bi-plus-lg"></i>
          <span>Nuevo Proveedor</span>
        </button>
      </div>
    </header>

    <!-- ESTADO DE CARGA -->
    <div v-if="estadoCarga" class="py-5">
      <LoadingSpinner texto="Cargando cartera de proveedores..." />
    </div>

    <!-- ESTADO DE ERROR DE CARGA -->
    <div v-else-if="mensajeErrorCarga" class="alert alert-danger d-flex align-items-center justify-content-between p-4 rounded shadow-sm">
      <div class="d-flex align-items-center gap-3">
        <i class="bi bi-exclamation-triangle-fill fs-2"></i>
        <div>
          <h5 class="fw-bold mb-1">Error al conectar con la base de datos</h5>
          <p class="mb-0">{{ mensajeErrorCarga }}</p>
        </div>
      </div>
      <button class="btn btn-outline-danger" type="button" @click="cargarProveedores">
        <i class="bi bi-arrow-clockwise me-1"></i> Reintentar
      </button>
    </div>

    <!-- CONTENIDO PRINCIPAL -->
    <div v-else class="page-content">
      <!-- Tarjetas KPI -->
      <section class="kpi-grid mb-4">
        <div class="kpi-card">
          <div class="kpi-card__icon bg-primary bg-opacity-10 text-primary">
            <i class="bi bi-building"></i>
          </div>
          <div>
            <span class="kpi-card__label">Total Proveedores</span>
            <strong class="kpi-card__value tabular">{{ totalProveedores }}</strong>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-card__icon bg-success bg-opacity-10 text-success">
            <i class="bi bi-check-circle"></i>
          </div>
          <div>
            <span class="kpi-card__label">Proveedores Activos</span>
            <strong class="kpi-card__value tabular text-success">{{ totalActivos }}</strong>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-card__icon bg-danger bg-opacity-10 text-danger">
            <i class="bi bi-x-circle"></i>
          </div>
          <div>
            <span class="kpi-card__label">Proveedores Inactivos</span>
            <strong class="kpi-card__value tabular text-danger">{{ totalInactivos }}</strong>
          </div>
        </div>
      </section>

      <!-- Tabla y Filtros -->
      <section class="card-ts shadow-sm">
        <div class="toolbar p-3 border-bottom">
          <div class="input-icon flex-grow-1">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input
              class="form-control"
              v-model="textoBusqueda"
              type="search"
              placeholder="Buscar por RIF, nombre o teléfono..."
              aria-label="Buscar proveedor"
            />
          </div>

          <select class="form-select" v-model="filtroEstado" style="max-width: 200px;" aria-label="Filtrar por status">
            <option value="">Todos los status</option>
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
          </select>
        </div>

        <!-- Franja de resumen -->
        <div class="summary-strip px-3 py-2 bg-light border-bottom d-flex flex-wrap gap-2 align-items-center">
          <span class="chip">
            <i class="bi bi-funnel"></i> Mostrando <strong>{{ proveedoresFiltrados.length }}</strong> de <strong>{{ totalProveedores }}</strong> proveedores
          </span>
          <span class="chip"><i class="bi bi-check-circle text-success"></i> Activos: <strong>{{ totalActivos }}</strong></span>
          <span class="chip"><i class="bi bi-x-circle text-danger"></i> Inactivos: <strong>{{ totalInactivos }}</strong></span>
        </div>

        <!-- Sin resultados -->
        <div v-if="proveedoresFiltrados.length === 0" class="empty-state py-5 text-center">
          <i class="bi bi-truck display-4 text-muted mb-3 d-block"></i>
          <h4>{{ totalProveedores === 0 ? 'No hay proveedores registrados' : 'No se encontraron proveedores' }}</h4>
          <p class="text-muted small">
            {{ totalProveedores === 0 ? 'Registre el primer proveedor de la empresa con el botón "Nuevo Proveedor".' : 'Intente cambiando los términos de búsqueda o el filtro de status.' }}
          </p>
          <button v-if="totalProveedores === 0" class="btn btn-primary btn-sm mt-2" type="button" @click="prepararCreacion">
            <i class="bi bi-plus-lg me-1"></i> Registrar Primer Proveedor
          </button>
        </div>

        <!-- Listado de Proveedores -->
        <div v-else class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th scope="col" style="min-width: 130px;">RIF</th>
                <th scope="col" style="min-width: 220px;">Nombre / Razón Social</th>
                <th scope="col" style="min-width: 140px;">Teléfono</th>
                <th scope="col" style="min-width: 220px;">Dirección</th>
                <th scope="col" class="text-center" style="min-width: 100px;">Facturas</th>
                <th scope="col" class="text-center" style="min-width: 110px;">Status</th>
                <th scope="col" class="text-end" style="min-width: 110px;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in proveedoresFiltrados" :key="p.rif">
                <td class="tabular fw-bold text-dark font-monospace">
                  <i class="bi bi-file-earmark-text text-muted me-1"></i>{{ p.rif }}
                </td>
                <td>
                  <strong class="d-block text-dark">{{ p.nombre }}</strong>
                </td>
                <td class="tabular">
                  <span v-if="p.telefono"><i class="bi bi-telephone text-muted me-1"></i>{{ p.telefono }}</span>
                  <span v-else class="text-muted">—</span>
                </td>
                <td>
                  <span v-if="p.direccion" class="small text-secondary">{{ p.direccion }}</span>
                  <span v-else class="text-muted">—</span>
                </td>
                <td class="text-center tabular">
                  <span class="badge bg-light text-dark border">
                    <i class="bi bi-receipt me-1"></i>{{ p.totalCompras }}
                  </span>
                </td>
                <td class="text-center">
                  <span class="badge" :class="p.estado === 1 ? 'bg-success' : 'bg-secondary'">
                    {{ p.estado === 1 ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
                <td class="text-end">
                  <div class="d-flex justify-content-end gap-1">
                    <button
                      class="btn btn-sm btn-outline-primary"
                      type="button"
                      title="Editar proveedor"
                      @click="prepararEdicion(p)"
                    >
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button
                      class="btn btn-sm"
                      :class="p.estado === 1 ? 'btn-outline-danger' : 'btn-outline-success'"
                      type="button"
                      :title="p.estado === 1 ? 'Deshabilitar proveedor' : 'Habilitar proveedor'"
                      @click="solicitarCambioEstado(p)"
                    >
                      <i :class="p.estado === 1 ? 'bi bi-slash-circle' : 'bi bi-check-circle'"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- ======================================================================
         MODAL CREAR / EDITAR PROVEEDOR
         ====================================================================== -->
    <div class="modal fade" id="modalProveedor" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content shadow border-0">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title fw-bold">
              <i class="bi" :class="esEdicion ? 'bi-pencil-square' : 'bi-plus-circle'"></i>
              {{ esEdicion ? 'Editar Proveedor' : 'Registrar Nuevo Proveedor' }}
            </h5>
            <button type="button" class="btn-close btn-close-white" @click="cerrarModal('modalProveedor')"></button>
          </div>

          <form @submit.prevent="guardarProveedor" novalidate>
            <div class="modal-body p-4">
              <!-- RIF -->
              <div class="mb-3">
                <label class="form-label fw-semibold" for="prov-rif">
                  RIF del Proveedor <span class="text-danger">*</span>
                </label>
                <input
                  id="prov-rif"
                  type="text"
                  class="form-control font-monospace"
                  :class="{ 'is-invalid': erroresValidacion.rif }"
                  v-model="formulario.rif"
                  :disabled="esEdicion || procesandoGuardado"
                  placeholder="Ej.: J-12345678-9"
                  maxlength="20"
                />
                <div v-if="erroresValidacion.rif" class="invalid-feedback">{{ erroresValidacion.rif }}</div>
                <small v-else-if="esEdicion" class="text-muted">El RIF es la identificación primaria y no puede modificarse.</small>
              </div>

              <!-- Nombre / Razón Social -->
              <div class="mb-3">
                <label class="form-label fw-semibold" for="prov-nombre">
                  Nombre / Razón Social <span class="text-danger">*</span>
                </label>
                <input
                  id="prov-nombre"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': erroresValidacion.nombre }"
                  v-model="formulario.nombre"
                  :disabled="procesandoGuardado"
                  placeholder="Ej.: Distribuidora Electrónica C.A."
                  maxlength="150"
                />
                <div v-if="erroresValidacion.nombre" class="invalid-feedback">{{ erroresValidacion.nombre }}</div>
              </div>

              <!-- Teléfono -->
              <div class="mb-3">
                <label class="form-label fw-semibold" for="prov-telefono">Teléfono de Contacto</label>
                <input
                  id="prov-telefono"
                  type="text"
                  class="form-control"
                  v-model="formulario.telefono"
                  :disabled="procesandoGuardado"
                  placeholder="Ej.: 0251-2345678 / 0414-1234567"
                  maxlength="30"
                />
              </div>

              <!-- Dirección -->
              <div class="mb-3">
                <label class="form-label fw-semibold" for="prov-direccion">Dirección Comercial</label>
                <textarea
                  id="prov-direccion"
                  class="form-control"
                  v-model="formulario.direccion"
                  :disabled="procesandoGuardado"
                  rows="2"
                  placeholder="Ej.: Av. Venezuela con calle 30, Barquisimeto"
                  maxlength="150"
                ></textarea>
              </div>

              <!-- Status -->
              <div class="mb-3">
                <label class="form-label fw-semibold" for="prov-estado">Status del Proveedor</label>
                <select id="prov-estado" class="form-select" v-model.number="formulario.estado" :disabled="procesandoGuardado">
                  <option :value="1">Activo (habilitado para compras)</option>
                  <option :value="0">Inactivo (deshabilitado)</option>
                </select>
              </div>
            </div>

            <div class="modal-footer bg-light">
              <button class="btn btn-outline-secondary" type="button" :disabled="procesandoGuardado" @click="cerrarModal('modalProveedor')">
                Cancelar
              </button>
              <button class="btn btn-primary d-flex align-items-center gap-2" type="submit" :disabled="procesandoGuardado">
                <span v-if="procesandoGuardado" class="spinner-border spinner-border-sm"></span>
                <i v-else class="bi bi-save"></i>
                {{ esEdicion ? 'Actualizar Proveedor' : 'Guardar Proveedor' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- ======================================================================
         MODAL CONFIRMACIÓN CAMBIO DE ESTADO
         ====================================================================== -->
    <ModalConfirmacion
      id-modal="modalConfirmarEstadoProveedor"
      :titulo="proveedorAConfirmar?.estado === 1 ? '¿Deshabilitar Proveedor?' : '¿Habilitar Proveedor?'"
      :mensaje="proveedorAConfirmar?.estado === 1
        ? `El proveedor &quot;${proveedorAConfirmar?.nombre}&quot; (@${proveedorAConfirmar?.rif}) quedará inactivo y no aparecerá en las opciones de compras de nuevos productos.`
        : `El proveedor &quot;${proveedorAConfirmar?.nombre}&quot; será reactivado y estará disponible para compras.`"
      :texto-boton-confirmar="proveedorAConfirmar?.estado === 1 ? 'Deshabilitar' : 'Habilitar'"
      :clase-boton-confirmar="proveedorAConfirmar?.estado === 1 ? 'btn-danger' : 'btn-success'"
      :cargando="procesandoCambioEstado"
      @confirmar="confirmarCambioEstado"
      @cancelar="proveedorAConfirmar = null"
    />

    <!-- MODAL DE GENERACIÓN DE REPORTES (PDF / EXCEL / CORREO) -->
    <ModalGenerarReporte
      id-modal="modalReporteProveedores"
      tipo-reporte="proveedores"
      titulo="Reporte Gerencial de Proveedores y Compras Acumuladas"
      subtitulo="Análisis de volumen de compras, facturas recibidas y concentración de compras por proveedor."
      clasificacion="GERENCIAL"
      @notificar="manejarNotificacionReporte"
    />
  </main>
</template>

<style scoped>
.page-body {
  padding: 1.5rem;
  background-color: #f8fafc;
  min-height: calc(100vh - 60px);
}

.page-header {
  margin-bottom: 1.5rem;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.page-subtitle {
  font-size: 0.85rem;
  color: #64748b;
  margin: 0;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.kpi-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.kpi-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.35rem;
}

.kpi-card__label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.kpi-card__value {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.1;
  color: #0f172a;
}

.card-ts {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.toolbar {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.input-icon {
  position: relative;
}

.input-icon i {
  position: absolute;
  top: 50%;
  left: 0.75rem;
  transform: translateY(-50%);
  color: #94a3b8;
}

.input-icon input {
  padding-left: 2.25rem;
}

.summary-strip {
  font-size: 0.8rem;
  color: #475569;
}

.chip {
  background: #f1f5f9;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.empty-state {
  color: #64748b;
}

.empty-state i {
  color: #cbd5e1;
}
</style>
