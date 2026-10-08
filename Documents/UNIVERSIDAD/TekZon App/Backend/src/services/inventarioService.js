/**
 * ==========================================================================
 * SERVICIO DE STOCK / EXISTENCIAS (inventarioService.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Lógica de negocio (Business Logic Layer) · CRUD 2
 *
 * PROPÓSITO FUNCIONAL:
 *   Da soporte al rol ALMACENISTA para la gestión y el ajuste de existencias:
 *     · Búsqueda rápida y auditoría del stock actual.
 *     · Detección de productos agotados o por debajo del mínimo.
 *     · CORRECCIÓN JUSTIFICADA de la existencia (arqueo físico): el motivo
 *       es obligatorio y la nueva existencia no puede ser negativa.
 *
 * PROPÓSITO TÉCNICO:
 *   El servicio NO escribe la existencia por su cuenta: delega en
 *   `MovimientoService.registrarAjuste`, que ejecuta la transacción SQL
 *   (bloqueo FOR UPDATE + UPDATE producto + INSERT en el kádex). De este modo
 *   el ajuste del CRUD 2 y el movimiento del CRUD 3 comparten una única ruta
 *   de escritura auditada, garantizando que "no exista stock sin asiento".
 * ==========================================================================
 */
import { InventarioStockModel } from '../models/inventarioStockModel.js';
import { MovimientoService } from './movimientoService.js';
import { CategoriaModel } from '../models/CategoriaModel.js';

/** Error de negocio controlado con su código HTTP asociado. */
class ErrorNegocioInventario extends Error {
  constructor(mensaje, codigoHttp = 400) {
    super(mensaje);
    this.name = 'ErrorNegocioInventario';
    this.codigoHttp = codigoHttp;
  }
}

/** Limpia un texto recibido del formulario. */
const limpiarTexto = (valor) => String(valor ?? '').trim();

export const InventarioStockService = {
  /**
   * LISTA DE EXISTENCIAS con búsqueda rápida, filtro por categoría y filtro
   * por situación de stock (agotado / bajo / disponible).
   *
   * @param {Object} filtros Recibidos como query string desde la página.
   */
  async obtenerExistencias(filtros = {}) {
    const texto = limpiarTexto(filtros.texto ?? filtros.busqueda);
    const situacion = limpiarTexto(filtros.situacion).toLowerCase();
    const idCategoria = Number(filtros.id_categoria ?? filtros.categoria) || null;

    // Validación del filtro de situación: sólo se admiten los tres valores
    // que la interfaz gráfica ofrece en su selector.
    const situacionesValidas = ['agotado', 'bajo', 'disponible'];

    if (situacion && !situacionesValidas.includes(situacion)) {
      throw new ErrorNegocioInventario(
        `La situación de stock "${filtros.situacion}" no es válida. Use agotado, bajo o disponible.`,
        400
      );
    }

    // Interconexión con el CRUD 4: si se filtra por categoría, ésta debe existir.
    if (idCategoria) {
      const categoria = await CategoriaModel.obtenerPorId(idCategoria);

      if (!categoria) {
        throw new ErrorNegocioInventario(
          `La categoría indicada (id ${idCategoria}) no existe en el sistema.`,
          400
        );
      }
    }

    return await InventarioStockModel.listarExistencias({
      texto: texto || undefined,
      idCategoria,
      situacion: situacion || undefined,
      orden: limpiarTexto(filtros.orden) || undefined
    });
  },

  /**
   * ESTADO DE EXISTENCIA DE UN PRODUCTO (ficha para el modal de ajuste).
   * Incluye la existencia actual, el mínimo y el último ajuste registrado,
   * para que el almacenista tenga contexto antes de corregir el stock.
   */
  async obtenerExistenciaPorCodigo(cod_producto) {
    const codigoLimpio = limpiarTexto(cod_producto);

    if (!codigoLimpio) {
      throw new ErrorNegocioInventario('Debe indicar el código del producto.', 400);
    }

    const existencia = await InventarioStockModel.obtenerExistenciaPorCodigo(codigoLimpio);

    if (!existencia) {
      throw new ErrorNegocioInventario(
        `No existe el producto con código "${codigoLimpio}" en el catálogo.`,
        404
      );
    }

    const ultimoAjuste = await InventarioStockModel.obtenerUltimoAjuste(codigoLimpio);

    return { ...existencia, ultimo_ajuste: ultimoAjuste };
  },

  /** INDICADORES KPI del almacén para la cabecera de la página de inventario. */
  async obtenerIndicadores() {
    return await InventarioStockModel.obtenerIndicadoresAlmacen();
  },

  /** Listado de alertas: productos en o por debajo del stock mínimo. */
  async obtenerAlertasStockMinimo() {
    return await InventarioStockModel.listarAlertasStockMinimo();
  },

  /**
   * AJUSTE JUSTIFICADO DE EXISTENCIA (PATCH /api/inventario/stock/:cod_producto).
   *
   * PROPÓSITO FUNCIONAL:
   *   Corrige el `existencia` del sistema para que coincida con el conteo
   *   físico del estante y, de forma opcional, actualiza el `stock_minimo`
   *   (umbral de alerta). Es obligatorio indicar el motivo, y se informa al
   *   usuario la diferencia resultante (sobrante o faltante).
   *
   * PROPÓSITO TÉCNICO:
   *   Delega la escritura en `MovimientoService.registrarAjuste`, que abre la
   *   transacción SQL y deja el asiento 'AJUSTE' en el kádex. El presente
   *   servicio valida el payload, aplica la regla estricta del stock mínimo y
   *   enriquece la respuesta con la diferencia calculada.
   *
   * @param {string} cod_producto Código del producto a ajustar.
   * @param {Object} datosAjuste  { existencia, stock_minimo, motivo, id_usuario }
   */
  async ajustarExistencia(cod_producto, datosAjuste) {
    const codigoLimpio = limpiarTexto(cod_producto);

    if (!codigoLimpio) {
      throw new ErrorNegocioInventario('Debe indicar el código del producto a ajustar.', 400);
    }

    // Validación temprana del motivo: es obligatorio por exigencia de auditoría.
    const motivo = limpiarTexto(datosAjuste?.motivo);

    if (!motivo) {
      throw new ErrorNegocioInventario(
        'El motivo del ajuste es obligatorio: todo cambio de existencia debe quedar justificado.',
        400
      );
    }

    // Validación de la existencia contada (entero y no negativo).
    const nuevaExistencia = Number(
      datosAjuste?.existencia ?? datosAjuste?.nueva_existencia ?? datosAjuste?.nuevaExistencia
    );

    if (!Number.isFinite(nuevaExistencia)) {
      throw new ErrorNegocioInventario('La existencia contada debe ser un valor numérico.', 400);
    }

    if (!Number.isInteger(nuevaExistencia)) {
      throw new ErrorNegocioInventario('La existencia contada debe ser un número entero de unidades.', 400);
    }

    if (nuevaExistencia < 0) {
      throw new ErrorNegocioInventario('La existencia contada no puede ser un número negativo.', 400);
    }

    // Se recupera la existencia del sistema para calcular y reportar la
    // diferencia del arqueo (también valida la existencia del producto).
    const existenciaSistema = await this.obtenerExistenciaPorCodigo(codigoLimpio);

    const existenciaPrevia = Number(existenciaSistema.existencia);
    const diferencia = nuevaExistencia - existenciaPrevia;

    /*
     * STOCK MÍNIMO: es opcional. Si el cliente no lo envía se conserva el
     * vigente; si lo envía, la regla ESTRICTA de negocio exige que no supere la
     * existencia resultante del arqueo (el backend vuelve a validarlo en
     * `MovimientoService.registrarAjuste`, que es la autoridad final).
     */
    const stockMinimoRecibido = datosAjuste?.stock_minimo ?? datosAjuste?.stockMinimo;

    const stockMinimoPrevio = Number(existenciaSistema.stock_minimo || 0);

    const stockMinimoFinal = (stockMinimoRecibido === undefined
      || stockMinimoRecibido === null
      || stockMinimoRecibido === '')
      ? stockMinimoPrevio
      : Number(stockMinimoRecibido);

    /*
     * Si no cambia la existencia NI el stock mínimo, no hay nada que escribir:
     * se informa al usuario sin abrir una transacción, ya que un asiento con
     * diferencia 0 sólo ensuciaría el histórico del kádex.
     *
     * IMPORTANTE: cuando la existencia no cambia pero SÍ el stock mínimo, la
     * operación es válida (es una reconfiguración del umbral de alerta).
     */
    const cambiaExistencia = diferencia !== 0;
    const cambiaStockMinimo = stockMinimoFinal !== stockMinimoPrevio;

    if (!cambiaExistencia && !cambiaStockMinimo) {
      throw new ErrorNegocioInventario(
        `La existencia contada (${nuevaExistencia}) y el stock mínimo (${stockMinimoFinal}) coinciden con los del sistema. No hay ajuste que registrar.`,
        400
      );
    }

    // Escritura auditada: transacción SQL + asiento en el kádex (CRUD 3).
    const resultadoAjuste = await MovimientoService.registrarAjuste(codigoLimpio, {
      existencia: nuevaExistencia,
      stock_minimo: stockMinimoFinal,
      motivo,
      id_usuario: datosAjuste?.id_usuario ?? datosAjuste?.usuario
    });

    // Mensaje en español que refleja exactamente lo ocurrido en la base de datos.
    let mensaje;
    if (cambiaExistencia) {
      mensaje = diferencia > 0
        ? `Ajuste registrado: sobrante de ${diferencia} unidad(es). Existencia ${existenciaPrevia} -> ${nuevaExistencia}.`
        : `Ajuste registrado: faltante de ${Math.abs(diferencia)} unidad(es). Existencia ${existenciaPrevia} -> ${nuevaExistencia}.`;
    } else {
      mensaje = `Stock mínimo actualizado a ${stockMinimoFinal} unidad(es) sin variación de existencia.`;
    }

    return {
      ...resultadoAjuste,
      diferencia,
      tipo_diferencia: diferencia > 0 ? 'SOBRANTE' : (diferencia < 0 ? 'FALTANTE' : 'SIN_VARIACION'),
      stock_minimo_previo: stockMinimoPrevio,
      cambia_existencia: cambiaExistencia,
      cambia_stock_minimo: cambiaStockMinimo,
      mensaje
    };
  }
};

export { ErrorNegocioInventario };
