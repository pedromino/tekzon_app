<script setup>
/**
 * ==========================================================================
 * COMPONENTE MODAL DE GENERACIÓN DE REPORTES (ModalGenerarReporte.vue)
 * TEKZON C.A. - SISTEMA DE GESTIÓN TÉCNICA E INVENTARIO
 * ==========================================================================
 * Permite filtrar, seleccionar formato (PDF o Excel) y opcionalmente
 * remitir el informe por correo electrónico en vivo.
 * ==========================================================================
 */
import { ref, computed } from 'vue';
import ReporteServices from '../services/ReporteServices.js';
import { cerrarModal } from '../utils/utilidadesModales.js';

const props = defineProps({
  idModal: { type: String, required: true },
  tipoReporte: { type: String, required: true },
  titulo: { type: String, default: 'Generar Reporte' },
  subtitulo: { type: String, default: 'Seleccione los criterios de filtrado y el formato deseado.' },
  clasificacion: { type: String, default: 'GERENCIAL' }, // 'GERENCIAL' | 'OPERACIONAL' | 'SUPERVISION'
  categorias: { type: Array, default: () => [] },
  tecnicos: { type: Array, default: () => [] }
});

const emit = defineEmits(['notificar']);

// Estado de los filtros
const filtros = ref({
  fecha_desde: '',
  fecha_hasta: '',
  id_categoria: '',
  situacion: '',
  tipo_movimiento: '',
  estado: '',
  tipo_equipo: '',
  metodo_pago: '',
  texto: ''
});

// Formato y Envío
const formato = ref('pdf'); // 'pdf' | 'excel'
const enviarPorEmail = ref(false);
const correoDestino = ref('');
const procesando = ref(false);
const errorValidacion = ref('');

const esGerencial = computed(() => props.clasificacion.toUpperCase() === 'GERENCIAL');
const esSupervision = computed(() => props.clasificacion.toUpperCase() === 'SUPERVISION' || props.clasificacion.toUpperCase() === 'SUPERVISIÓN');

const reiniciarFormulario = () => {
  filtros.value = {
    fecha_desde: '',
    fecha_hasta: '',
    id_categoria: '',
    situacion: '',
    tipo_movimiento: '',
    estado: '',
    tipo_equipo: '',
    metodo_pago: '',
    texto: ''
  };
  formato.value = 'pdf';
  enviarPorEmail.value = false;
  correoDestino.value = '';
  errorValidacion.value = '';
};

const validar = () => {
  errorValidacion.value = '';

  if (enviarPorEmail.value) {
    const email = String(correoDestino.value).trim();
    if (!email) {
      errorValidacion.value = 'Ingrese el correo electrónico al cual desea enviar el reporte.';
      return false;
    }
    const patronEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!patronEmail.test(email)) {
      errorValidacion.value = 'El formato del correo electrónico no es válido.';
      return false;
    }
  }

  if (filtros.value.fecha_desde && filtros.value.fecha_hasta) {
    if (filtros.value.fecha_desde > filtros.value.fecha_hasta) {
      errorValidacion.value = 'La fecha inicial no puede ser posterior a la fecha final.';
      return false;
    }
  }

  return true;
};

const procesarReporte = async () => {
  if (procesando.value) return;
  if (!validar()) return;

  procesando.value = true;
  errorValidacion.value = '';

  try {
    const filtrosActivos = {};
    Object.keys(filtros.value).forEach((key) => {
      if (filtros.value[key] !== '' && filtros.value[key] !== null) {
        filtrosActivos[key] = filtros.value[key];
      }
    });

    if (enviarPorEmail.value) {
      // Caso 1: Envío por correo
      const resultado = await ReporteServices.enviarReportePorEmail({
        tipo: props.tipoReporte,
        formato: formato.value,
        correoDestino: String(correoDestino.value).trim(),
        filtros: filtrosActivos
      });

      cerrarModal(props.idModal);
      emit('notificar', {
        titulo: '¡Reporte Enviado!',
        mensaje: resultado.mensaje || `El reporte fue enviado exitosamente a ${correoDestino.value}.`,
        tipo: 'success'
      });
    } else {
      // Caso 2: Visualización inline en nueva pestaña (PDF) o descarga de archivo (Excel)
      const resultado = await ReporteServices.descargarReporte({
        tipo: props.tipoReporte,
        formato: formato.value,
        filtros: filtrosActivos
      });

      cerrarModal(props.idModal);
      if (resultado?.accion === 'visualizado') {
        emit('notificar', {
          titulo: '¡Reporte Visualizado!',
          mensaje: `El reporte "${resultado.nombreArchivo}" se abrió en una nueva pestaña.`,
          tipo: 'success'
        });
      } else {
        emit('notificar', {
          titulo: '¡Reporte Descargado!',
          mensaje: `Archivo "${resultado?.nombreArchivo || 'reporte.xlsx'}" descargado correctamente.`,
          tipo: 'success'
        });
      }
    }

    reiniciarFormulario();
  } catch (error) {
    const msg = error?.response?.data?.mensaje || error?.mensaje || 'Error al generar el reporte.';
    errorValidacion.value = msg;
    emit('notificar', {
      titulo: 'Error al generar reporte',
      mensaje: msg,
      tipo: 'error'
    });
  } finally {
    procesando.value = false;
  }
};
</script>

<template>
  <div class="modal fade" :id="idModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content shadow-lg border-0">
        <!-- Encabezado del modal -->
        <div class="modal-header bg-dark text-white p-3">
          <div class="d-flex align-items-center gap-2">
            <span
              class="badge"
              :class="esGerencial ? 'bg-primary' : (esSupervision ? 'bg-warning text-dark' : 'bg-info text-dark')"
            >
              {{ clasificacion.toUpperCase() }}
            </span>
            <h5 class="modal-title fw-bold mb-0">
              <i class="bi bi-file-earmark-bar-graph me-1"></i>
              {{ titulo }}
            </h5>
          </div>
          <button type="button" class="btn-close btn-close-white" :disabled="procesando" @click="cerrarModal(idModal)"></button>
        </div>

        <form @submit.prevent="procesarReporte" novalidate>
          <div class="modal-body p-4">
            <p class="text-secondary small mb-3">
              {{ subtitulo }}
            </p>

            <!-- Alerta de validación o error -->
            <div v-if="errorValidacion" class="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
              <i class="bi bi-exclamation-triangle-fill"></i>
              <span>{{ errorValidacion }}</span>
            </div>

            <!-- ==========================================================
                 SECCIÓN 1: CRITERIOS DE FILTRADO ESPECÍFICOS
                 ========================================================== -->
            <div class="card p-3 bg-light border-0 mb-3">
              <h6 class="fw-bold text-dark mb-2" style="font-size: 0.85rem;">
                <i class="bi bi-funnel me-1 text-primary"></i> 1. Criterios de Filtrado
              </h6>

              <div class="row g-2">
                <!-- Filtros para PRODUCTOS -->
                <template v-if="tipoReporte === 'productos'">
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Categoría</label>
                    <select class="form-select form-select-sm" v-model="filtros.id_categoria">
                      <option value="">Todas las categorías</option>
                      <option v-for="c in categorias" :key="c.id_categoria" :value="c.id_categoria">
                        {{ c.nombre_categoria }}
                      </option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Situación de Stock</label>
                    <select class="form-select form-select-sm" v-model="filtros.situacion">
                      <option value="">Todos los artículos</option>
                      <option value="bajo">Bajo el mínimo (alerta)</option>
                      <option value="agotado">Agotados (stock 0)</option>
                      <option value="disponible">Disponibles con stock</option>
                    </select>
                  </div>
                </template>

                <!-- Filtros para CATEGORÍAS -->
                <template v-else-if="tipoReporte === 'categorias'">
                  <div class="col-md-12">
                    <label class="form-label small fw-semibold">Estado de la Categoría</label>
                    <select class="form-select form-select-sm" v-model="filtros.estado">
                      <option value="">Todas (activas e inactivas)</option>
                      <option value="activas">Solo categorías activas</option>
                      <option value="inactivas">Solo categorías inactivas</option>
                    </select>
                  </div>
                </template>

                <!-- Filtros para MOVIMIENTOS -->
                <template v-else-if="tipoReporte === 'movimientos'">
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Tipo de Movimiento</label>
                    <select class="form-select form-select-sm" v-model="filtros.tipo_movimiento">
                      <option value="">Todos (Entradas, Salidas, Ajustes)</option>
                      <option value="ENTRADA">Entradas de mercancía</option>
                      <option value="SALIDA">Salidas de almacén</option>
                      <option value="AJUSTE">Ajustes manuales</option>
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Desde (Fecha)</label>
                    <input type="date" class="form-control form-control-sm" v-model="filtros.fecha_desde" />
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Hasta (Fecha)</label>
                    <input type="date" class="form-control form-control-sm" v-model="filtros.fecha_hasta" />
                  </div>
                </template>

                <!-- Filtros para PROVEEDORES -->
                <template v-else-if="tipoReporte === 'proveedores'">
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Status del Proveedor</label>
                    <select class="form-select form-select-sm" v-model="filtros.estado">
                      <option value="">Todos los proveedores</option>
                      <option value="activos">Solo activos</option>
                      <option value="inactivos">Solo inactivos</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Búsqueda rápida</label>
                    <input type="text" class="form-control form-control-sm" v-model="filtros.texto" placeholder="Buscar por RIF o nombre..." />
                  </div>
                </template>

                <!-- Filtros para ÓRDENES -->
                <template v-else-if="tipoReporte === 'ordenes'">
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Estado de la Orden</label>
                    <select class="form-select form-select-sm" v-model="filtros.estado">
                      <option value="">Todos los estados</option>
                      <option value="Recibido">Recibido</option>
                      <option value="En Diagnóstico">En Diagnóstico</option>
                      <option value="En Reparación">En Reparación</option>
                      <option value="Listo">Listo</option>
                      <option value="Entregado">Entregado (facturado)</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Fecha Desde</label>
                    <input type="date" class="form-control form-control-sm" v-model="filtros.fecha_desde" />
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Fecha Hasta</label>
                    <input type="date" class="form-control form-control-sm" v-model="filtros.fecha_hasta" />
                  </div>
                </template>

                <!-- Filtros para DISPOSITIVOS -->
                <template v-else-if="tipoReporte === 'dispositivos'">
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Tipo de Equipo</label>
                    <select class="form-select form-select-sm" v-model="filtros.tipo_equipo">
                      <option value="">Todos los tipos</option>
                      <option value="Smartphone">Smartphone</option>
                      <option value="Tablet">Tablet</option>
                      <option value="Laptop">Laptop</option>
                      <option value="PC">Computadora de Escritorio</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Búsqueda por serial / marca</label>
                    <input type="text" class="form-control form-control-sm" v-model="filtros.texto" placeholder="Serial, marca o modelo..." />
                  </div>
                </template>

                <!-- Filtros para CAJA -->
                <template v-else-if="tipoReporte === 'caja'">
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Estado del Turno</label>
                    <select class="form-select form-select-sm" v-model="filtros.estado">
                      <option value="">Todos los turnos</option>
                      <option value="abiertas">Solo turnos abiertos</option>
                      <option value="cerradas">Solo turnos cerrados</option>
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Fecha Apertura Desde</label>
                    <input type="date" class="form-control form-control-sm" v-model="filtros.fecha_desde" />
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Fecha Apertura Hasta</label>
                    <input type="date" class="form-control form-control-sm" v-model="filtros.fecha_hasta" />
                  </div>
                </template>

                <!-- Filtros para VENTAS -->
                <template v-else-if="tipoReporte === 'ventas'">
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Método de Pago</label>
                    <select class="form-select form-select-sm" v-model="filtros.metodo_pago">
                      <option value="">Todos los métodos</option>
                      <option value="EFECTIVO">Efectivo (USD)</option>
                      <option value="DIVISAS">Divisas / Zelle</option>
                      <option value="PAGO_MOVIL">Pago Móvil (Bs)</option>
                      <option value="TRANSFERENCIA">Transferencia (Bs)</option>
                      <option value="PUNTO_VENTA">Punto de Venta</option>
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Fecha Emisión Desde</label>
                    <input type="date" class="form-control form-control-sm" v-model="filtros.fecha_desde" />
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Fecha Emisión Hasta</label>
                    <input type="date" class="form-control form-control-sm" v-model="filtros.fecha_hasta" />
                  </div>
                </template>

                <!-- Filtros para CLIENTES -->
                <template v-else-if="tipoReporte === 'clientes'">
                  <div class="col-md-12">
                    <label class="form-label small fw-semibold">Búsqueda rápida de clientes</label>
                    <input type="text" class="form-control form-control-sm" v-model="filtros.texto" placeholder="Buscar por cédula, nombre o apellido..." />
                  </div>
                </template>
              </div>
            </div>

            <!-- ==========================================================
                 SECCIÓN 2: FORMATO DE EXPORTACIÓN
                 ========================================================== -->
            <div class="mb-3">
              <label class="form-label small fw-bold text-dark d-block mb-2">
                <i class="bi bi-file-earmark me-1 text-primary"></i> 2. Formato del Documento
              </label>

              <div class="row g-2">
                <div class="col-6">
                  <label
                    class="d-flex align-items-center gap-2 p-2 rounded border cursor-pointer w-100"
                    :class="formato === 'pdf' ? 'border-primary bg-primary bg-opacity-10 text-primary fw-bold' : 'border-light bg-light text-muted'"
                    style="cursor: pointer;"
                  >
                    <input type="radio" value="pdf" v-model="formato" class="form-check-input my-0" />
                    <i class="bi bi-file-earmark-pdf-fill fs-5 text-danger"></i>
                    <div>
                      <div style="font-size: 0.85rem;">Documento PDF (.pdf)</div>
                      <small class="text-muted fw-normal" style="font-size: 0.72rem;">Membrete institucional y diseño para impresión</small>
                    </div>
                  </label>
                </div>

                <div class="col-6">
                  <label
                    class="d-flex align-items-center gap-2 p-2 rounded border cursor-pointer w-100"
                    :class="formato === 'excel' ? 'border-success bg-success bg-opacity-10 text-success fw-bold' : 'border-light bg-light text-muted'"
                    style="cursor: pointer;"
                  >
                    <input type="radio" value="excel" v-model="formato" class="form-check-input my-0" />
                    <i class="bi bi-file-earmark-excel-fill fs-5 text-success"></i>
                    <div>
                      <div style="font-size: 0.85rem;">Hoja de Cálculo Excel (.xlsx)</div>
                      <small class="text-muted fw-normal" style="font-size: 0.72rem;">Formato numérico, tablas dinámicas y fórmulas</small>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <!-- ==========================================================
                 SECCIÓN 3: COMPARTIR POR CORREO ELECTRÓNICO
                 ========================================================== -->
            <div class="card p-3 border-0 rounded" style="background-color: #f1f5f9;">
              <div class="form-check form-switch mb-2">
                <input
                  class="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="chkEnviarEmail"
                  v-model="enviarPorEmail"
                />
                <label class="form-check-label fw-bold text-dark small" for="chkEnviarEmail">
                  <i class="bi bi-envelope-at me-1 text-primary"></i>
                  Compartir reporte vía Correo Electrónico
                </label>
              </div>

              <!-- Input de correo cuando el switch está activo -->
              <div v-if="enviarPorEmail" class="mt-2 pt-2 border-top">
                <label class="form-label small fw-semibold text-dark">
                  Correo Electrónico Destinatario <span class="text-danger">*</span>
                </label>
                <div class="input-group input-group-sm">
                  <span class="input-group-text bg-white"><i class="bi bi-envelope"></i></span>
                  <input
                    type="email"
                    class="form-control"
                    v-model="correoDestino"
                    placeholder="ejemplo@empresa.com / gerencia@tekzon.com"
                    autocomplete="email"
                    :disabled="procesando"
                  />
                </div>
                <small class="text-muted" style="font-size: 0.72rem;">
                  Se remitirá un correo corporativo con el documento {{ formato.toUpperCase() }} adjunto y el resumen de indicadores clave.
                </small>
              </div>
            </div>
          </div>

          <!-- Pie del modal -->
          <div class="modal-footer bg-light p-3 d-flex justify-content-between">
            <button class="btn btn-outline-secondary btn-sm" type="button" :disabled="procesando" @click="cerrarModal(idModal)">
              Cancelar
            </button>
            <button
              class="btn d-flex align-items-center gap-2 btn-sm fw-bold px-3"
              :class="enviarPorEmail ? 'btn-success' : (formato === 'pdf' ? 'btn-primary' : 'btn-success')"
              type="submit"
              :disabled="procesando"
            >
              <span v-if="procesando" class="spinner-border spinner-border-sm"></span>
              <template v-else>
                <i :class="enviarPorEmail ? 'bi bi-send-fill' : (formato === 'pdf' ? 'bi bi-eye-fill' : 'bi bi-file-earmark-excel-fill')"></i>
                <span>{{ enviarPorEmail ? 'Generar y Enviar por Correo' : (formato === 'pdf' ? 'Ver Reporte' : 'Descargar Excel (.XLSX)') }}</span>
              </template>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
