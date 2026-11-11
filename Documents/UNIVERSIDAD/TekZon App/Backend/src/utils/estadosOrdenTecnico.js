/**
 * ==========================================================================
 * ESTADOS DE LA ORDEN DE SERVICIO TÉCNICO (estadosOrdenTecnico.js) - TEKZON
 * ==========================================================================
 * CAPA: Definición de constantes y reglas del dominio (Módulo 2)
 *
 * PROPÓSITO FUNCIONAL:
 *   Define la MÁQUINA DE ESTADOS del flujo de una reparación y centraliza las
 *   reglas que el Panel del Técnico debe respetar:
 *
 *     Pendiente ──► En Reparacion ──► Listo ──► Entregado
 *
 *   ¿Por qué se prohíben los saltos arbitrarios de estado?
 *   Porque la trazabilidad del taller depende de que la reparación siga un
 *   orden lógico verificable: no se puede declarar un equipo "Listo" si antes
 *   no entró en reparación, ni "Entregado" si el cliente todavía no pagó.
 *
 * PROPÓSITO TÉCNICO:
 *   Se exportan cuatro estructuras que consumen el servicio y el frontend:
 *     · ESTADOS_ORDEN      -> catálogo de estados válidos.
 *     · TRANSICIONES_PERMITIDAS -> grafo de avance permitido.
 *     · ETIQUETAS_ESTADO   -> texto legible y color para la interfaz.
 *     · esTransicionPermitida(estadoActual, estadoNuevo) -> validador.
 * ==========================================================================
 */

/** Estados válidos de una orden (coinciden con los valores del DDL). */
export const ESTADOS_ORDEN = Object.freeze({
  PENDIENTE: 'Pendiente',
  EN_REPARACION: 'En Reparacion',
  LISTO: 'Listo',
  ENTREGADO: 'Entregado'
});

/**
 * GRAFO DE TRANSICIONES PERMITIDAS.
 *
 * PROPÓSITO FUNCIONAL: cada clave es el estado ACTUAL y el arreglo contiene los
 * estados a los que el técnico puede avanzar desde ahí. El retroceso de UN
 * paso (corrección) está permitido: de "En Reparación" se puede volver a
 * "Pendiente" si la orden aún no puede procesarse.
 *
 * OBSERVACIÓN IMPORTANTE: 'Entregado' NO aparece como destino de ninguna
 * transición manual. Ese estado sólo lo alcanza el sistema mediante la operación
 * de COBRO (`cobrarOrden`), garantizando que ninguna orden se entregue sin haber
 * sido facturada y pagada.
 */
export const TRANSICIONES_PERMITIDAS = Object.freeze({
  [ESTADOS_ORDEN.PENDIENTE]: [ESTADOS_ORDEN.EN_REPARACION],
  [ESTADOS_ORDEN.EN_REPARACION]: [ESTADOS_ORDEN.LISTO, ESTADOS_ORDEN.PENDIENTE],
  // Desde 'Listo' el técnico puede reabrir la reparación; entregar sólo lo hace el cobro.
  [ESTADOS_ORDEN.LISTO]: [ESTADOS_ORDEN.EN_REPARACION],
  // 'Entregado' es un estado terminal: ya no admite cambios.
  [ESTADOS_ORDEN.ENTREGADO]: []
});

/**
 * ETIQUETAS Y PRESENTACIÓN de cada estado para la interfaz de Vue.
 * `color` es una clase de Bootstrap 5 y `icono` una clase de Bootstrap Icons,
 * de modo que el frontend pinte el estado sin lógica condicional propia.
 *
 * PALETA DE COLORES DEL TALLER:
 *   · Pendiente     -> ROJO    (equipo esperando atención)
 *   · En Reparación -> NARANJA (mano de obra en curso)
 *   · Listo         -> AZUL    (reparación terminada)
 *   · Entregado     -> VERDE   (cobrado y devuelto al cliente)
 */
export const ETIQUETAS_ESTADO = Object.freeze({
  [ESTADOS_ORDEN.PENDIENTE]: {
    etiqueta: 'Pendiente',
    descripcion: 'Equipo recibido, en espera de que el técnico lo atienda.',
    color: 'bg-danger',
    icono: 'bi-hourglass-split'
  },
  [ESTADOS_ORDEN.EN_REPARACION]: {
    etiqueta: 'En Reparación',
    descripcion: 'El técnico diagnostica la falla e interviene el equipo.',
    color: 'bg-warning text-dark',
    icono: 'bi-tools'
  },
  [ESTADOS_ORDEN.LISTO]: {
    etiqueta: 'Listo',
    descripcion: 'Reparación terminada. Pendiente por cobrar y entregar.',
    color: 'bg-primary',
    icono: 'bi-check-circle'
  },
  [ESTADOS_ORDEN.ENTREGADO]: {
    etiqueta: 'Entregado',
    descripcion: 'Orden cobrada, facturada y equipo entregado al cliente.',
    color: 'bg-success',
    icono: 'bi-bag-check'
  }
});

/**
 * VALIDA UNA TRANSICIÓN DE ESTADO.
 *
 * @param {string} estadoActual Estado en el que se encuentra la orden.
 * @param {string} estadoNuevo  Estado al que se quiere avanzar.
 * @returns {Object} { permitida: boolean, motivo: string }
 */
export const esTransicionPermitida = (estadoActual, estadoNuevo) => {
  // Si el estado no cambia, no hay nada que validar (se permite guardar sólo
  // las observaciones o el costo de mano de obra).
  if (estadoActual === estadoNuevo) {
    return { permitida: true, motivo: 'Sin cambio de estado.' };
  }

  // El estado destino debe existir en el catálogo del sistema.
  if (!Object.values(ESTADOS_ORDEN).includes(estadoNuevo)) {
    return {
      permitida: false,
      motivo: `El estado "${estadoNuevo}" no es un estado válido de una orden de servicio técnico.`
    };
  }

  // Un estado terminal no admite ninguna salida.
  if (estadoActual === ESTADOS_ORDEN.ENTREGADO) {
    return {
      permitida: false,
      motivo: 'La orden ya fue entregada y cobrada: no admite más cambios de estado.'
    };
  }

  const destinosValidos = TRANSICIONES_PERMITIDAS[estadoActual] || [];

  if (!destinosValidos.includes(estadoNuevo)) {
    return {
      permitida: false,
      motivo: `No se puede pasar de "${estadoActual}" a "${estadoNuevo}". `
        + (destinosValidos.length > 0
          ? `Los estados permitidos desde "${estadoActual}" son: ${destinosValidos.join(', ')}.`
          : 'La orden no admite cambios.')
    };
  }

  return { permitida: true, motivo: 'Transición válida.' };
};

export default {
  ESTADOS_ORDEN,
  TRANSICIONES_PERMITIDAS,
  ETIQUETAS_ESTADO,
  esTransicionPermitida
};
