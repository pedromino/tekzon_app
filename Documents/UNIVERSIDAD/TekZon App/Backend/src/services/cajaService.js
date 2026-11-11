/**
 * ==========================================================================
 * SERVICIO DE CAJA (cajaService.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Lógica de negocio (Business Logic Layer) · Módulo 2 (Caja)
 *
 * PROPÓSITO FUNCIONAL:
 *   Administra el TURNO DE CAJA, que es el marco contable de todos los cobros
 *   del sistema (tanto ventas directas como servicios técnicos):
 *
 *     · Apertura del turno con un fondo inicial.
 *     · Consulta del turno activo y de su recaudación en vivo.
 *     · Cierre con arqueo: se declara el dinero contado y el sistema informa
 *       el SOBRANTE o FALTANTE respecto a lo registrado.
 *
 * PROPÓSITO TÉCNICO:
 *   Regla central: NO puede existir más de una caja ABIERTA al mismo tiempo,
 *   porque los cobros se asignan automáticamente a "la caja abierta" cuando el
 *   usuario no indica una. Permitir dos turnos abiertos haría ambiguo el arqueo.
 * ==========================================================================
 */
import { CajaModel, ESTADOS_CAJA } from '../models/cajaModel.js';
import { ErrorNegocio } from '../utils/erroresNegocio.js';

/** Limpia un texto (quita espacios externos). */
const limpiarTexto = (valor) => String(valor ?? '').trim();

/** Convierte a número decimal con dos posiciones; `null` si no es numérico. */
const aDecimal = (valor) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  return Number(numero.toFixed(2));
};

export const CajaService = {
  /** LISTA DE CAJAS con su recaudación (pantalla de Caja). */
  async obtenerCajas(id_usuario = null) {
    return await CajaModel.listarCajas(id_usuario);
  },

  /**
   * CAJA ACTIVA (la que está abierta para el usuario especificado o general).
   * Devuelve `null` cuando no hay ningún turno abierto para ese usuario.
   */
  async obtenerCajaActiva(id_usuario = null) {
    return await CajaModel.obtenerCajaAbierta(id_usuario);
  },

  /**
   * ABRE UN TURNO DE CAJA PERSONALIZADO PARA EL USUARIO AUTENTICADO.
   * @param {Object} datosApertura { monto_apertura, observaciones }
   * @param {Object} usuarioAutenticado Usuario responsable del turno.
   */
  async abrirCaja(datosApertura, usuarioAutenticado) {
    const id_usuario = Number(usuarioAutenticado?.id_usuario);

    if (!Number.isInteger(id_usuario) || id_usuario <= 0) {
      throw new ErrorNegocio('No se pudo identificar al usuario que abre la caja.', 401);
    }

    // ---- Regla: este usuario no puede tener dos turnos abiertos simultáneamente ----
    const cajaYaAbierta = await CajaModel.obtenerCajaAbierta(id_usuario);

    if (cajaYaAbierta) {
      throw new ErrorNegocio(
        `Ya tienes una caja abierta (Turno N° ${cajaYaAbierta.id_caja}, apertura `
        + `${cajaYaAbierta.fecha_apertura}). Debes cerrar ese turno antes de abrir uno nuevo.`,
        409
      );
    }

    // ---- El fondo de apertura es un monto no negativo ----
    const monto_apertura = aDecimal(datosApertura?.monto_apertura ?? datosApertura?.monto ?? 0);

    if (monto_apertura === null) {
      throw new ErrorNegocio('El monto de apertura debe ser un valor numérico.', 400);
    }

    if (monto_apertura < 0) {
      throw new ErrorNegocio('El monto de apertura no puede ser negativo.', 400);
    }

    const cajaAbierta = await CajaModel.abrirCaja({
      monto_apertura,
      id_usuario,
      observaciones: limpiarTexto(datosApertura?.observaciones) || null
    });

    return {
      caja: cajaAbierta,
      mensaje: `Caja ${cajaAbierta.id_caja} abierta con un fondo inicial de ${monto_apertura.toFixed(2)} USD.`
    };
  },

  /**
   * CIERRA UN TURNO DE CAJA CON ARQUEO.
   *
   * PROPÓSITO FUNCIONAL: el administrador declara el dinero contado físicamente
   * y el sistema compara contra el total de pagos registrados, informando si la
   * caja quedó cuadrada, con sobrante o con faltante.
   */
  async cerrarCaja(id_caja, datosCierre) {
    const idNumerico = Number(id_caja);

    if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
      throw new ErrorNegocio('El identificador de la caja no es válido.', 400);
    }

    // ---- 1. La caja debe existir ----
    const caja = await CajaModel.obtenerPorId(idNumerico);

    if (!caja) {
      throw new ErrorNegocio(`No existe la caja con id ${idNumerico}.`, 404);
    }

    // ---- 2. La caja debe estar abierta ----
    if (caja.estado !== ESTADOS_CAJA.ABIERTA) {
      throw new ErrorNegocio(`La caja ${idNumerico} ya se encuentra cerrada.`, 400);
    }

    // ---- 3. Monto contado físicamente ----
    const monto_cierre = aDecimal(datosCierre?.monto_cierre ?? datosCierre?.monto ?? 0);

    if (monto_cierre === null) {
      throw new ErrorNegocio('El monto de cierre debe ser un valor numérico.', 400);
    }

    if (monto_cierre < 0) {
      throw new ErrorNegocio('El monto de cierre no puede ser negativo.', 400);
    }

    // ---- 4. Cierre con arqueo (el modelo calcula la diferencia) ----
    const resultadoCierre = await CajaModel.cerrarCaja(idNumerico, {
      monto_cierre,
      observaciones: limpiarTexto(datosCierre?.observaciones) || null
    });

    if (!resultadoCierre) {
      throw new ErrorNegocio(
        `No se pudo cerrar la caja ${idNumerico}: verifique que siga abierta.`,
        409
      );
    }

    // ---- 5. Mensaje que refleja el resultado del arqueo ----
    let mensajeCuadre;

    if (resultadoCierre.tipo_diferencia === 'CUADRADA') {
      mensajeCuadre = 'La caja cuadra exactamente con lo registrado en el sistema.';
    } else if (resultadoCierre.tipo_diferencia === 'SOBRANTE') {
      mensajeCuadre = `Sobrante de ${resultadoCierre.diferencia.toFixed(2)} USD respecto al sistema.`;
    } else {
      mensajeCuadre = `Faltante de ${Math.abs(resultadoCierre.diferencia).toFixed(2)} USD respecto al sistema.`;
    }

    return {
      ...resultadoCierre,
      mensaje: `Caja ${idNumerico} cerrada. Total registrado en el sistema: `
        + `${resultadoCierre.total_recaudado.toFixed(2)} USD; contado: ${monto_cierre.toFixed(2)} USD. ${mensajeCuadre}`
    };
  },

  /** DETALLE DE LOS PAGOS DE UNA CAJA (arqueo detallado, uno por uno). */
  async obtenerPagosDeCaja(id_caja) {
    const idNumerico = Number(id_caja);

    if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
      throw new ErrorNegocio('El identificador de la caja no es válido.', 400);
    }

    const caja = await CajaModel.obtenerPorId(idNumerico);

    if (!caja) {
      throw new ErrorNegocio(`No existe la caja con id ${idNumerico}.`, 404);
    }

    const pagos = await CajaModel.listarPagosDeCaja(idNumerico);
    const resumenPorMetodo = await CajaModel.resumirPagosPorMetodo(idNumerico);

    const totalVentas = caja.total_ventas != null
      ? Number(Number(caja.total_ventas).toFixed(2))
      : Number(pagos.filter((p) => p.tipo_origen === 'VENTA').reduce((suma, pago) => suma + Number(pago.monto_usd), 0).toFixed(2));

    const totalServicios = caja.total_servicios != null
      ? Number(Number(caja.total_servicios).toFixed(2))
      : Number(pagos.filter((p) => p.tipo_origen === 'SERVICIO_TECNICO').reduce((suma, pago) => suma + Number(pago.monto_usd), 0).toFixed(2));

    const totalRecaudado = caja.total_recaudado != null
      ? Number(Number(caja.total_recaudado).toFixed(2))
      : Number((totalVentas + totalServicios).toFixed(2));

    return {
      caja,
      pagos,
      resumen_por_metodo: resumenPorMetodo,
      totales: {
        total_recaudado: totalRecaudado,
        total_ventas: totalVentas,
        total_servicios: totalServicios,
        total_operaciones: pagos.length
      }
    };
  }
};

export default CajaService;
