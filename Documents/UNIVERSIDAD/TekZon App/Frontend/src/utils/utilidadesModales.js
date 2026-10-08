/**
 * ==========================================================================
 * UTILITARIO DE MODALES BOOTSTRAP (utilidadesModales.js) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Centraliza la apertura y el cierre de los modales de Bootstrap 5 que usan
 *   las páginas del módulo de inventario, para que todas se comporten igual.
 *
 * PROPÓSITO TÉCNICO (lección aprendida de un fallo real):
 *   Antes, cada página tenía su propia función `abrirModal()` con la guarda
 *   silenciosa `if (!window.bootstrap) return;`. Cuando Bootstrap no quedaba
 *   publicado en `window` (el bundle UMD era absorbido como módulo CommonJS
 *   por Vite), TODOS los botones dejaban de abrir sus modales SIN lanzar
 *   ningún error en consola, lo que hizo muy difícil encontrar la causa.
 *
 *   Este utilitario sustituye ese silencio por un diagnóstico explícito: si el
 *   elemento no existe o la API de Bootstrap no está disponible, se registra
 *   un `console.error` con la instrucción concreta para corregirlo.
 * ==========================================================================
 */

/**
 * VERIFICA QUE LA API DE BOOTSTRAP ESTÉ DISPONIBLE.
 * Se valida una sola vez por carga de página para no repetir el mensaje.
 *
 * @returns {boolean} true si `window.bootstrap.Modal` existe.
 */
let yaSeAvisoDeBootstrap = false;

export const bootstrapDisponible = () => {
  const disponible = typeof window !== 'undefined'
    && Boolean(window.bootstrap)
    && typeof window.bootstrap.Modal === 'function';

  if (!disponible && !yaSeAvisoDeBootstrap) {
    yaSeAvisoDeBootstrap = true;
    console.error(
      '[TekZon] La API de Bootstrap no está disponible en window.bootstrap. '
      + 'Los modales no podrán abrirse. Verifique que src/main.js publique el '
      + 'namespace: window.bootstrap = bootstrapImportado;'
    );
  }

  return disponible;
};

/**
 * ABRE UN MODAL POR SU ID.
 *
 * PROPÓSITO TÉCNICO: se usa la API programática (`getOrCreateInstance().show()`)
 * en lugar de atributos `data-bs-toggle` en el HTML. Esto es deliberado: cuando
 * un mismo botón tenía `data-bs-toggle` y además un `@click` de Vue que cargaba
 * los datos del registro, ambos manejadores competían y el modal podía abrirse
 * mostrando los datos del registro ANTERIOR. La apertura programática es
 * determinista.
 *
 * @param {string} idModal Identificador del elemento `.modal` en el DOM.
 * @returns {boolean} true si el modal se abrió correctamente.
 */
export const abrirModal = (idModal) => {
  const elemento = document.getElementById(idModal);

  if (!elemento) {
    console.error(`[TekZon] No existe ningún elemento con id "${idModal}" en el DOM.`);
    return false;
  }

  if (!bootstrapDisponible()) return false;

  const instancia = window.bootstrap.Modal.getOrCreateInstance(elemento);
  instancia.show();

  return true;
};

/**
 * CIERRA UN MODAL POR SU ID Y LIMPIA LOS RESTOS VISUALES.
 *
 * PROPÓSITO TÉCNICO: además de delegar el cierre en Bootstrap, se eliminan el
 * `backdrop` y las clases de bloqueo de scroll del `body`. Es un respaldo
 * necesario porque, si el modal se cierra mientras una petición está en curso,
 * Bootstrap puede no completar su ciclo y la pantalla queda gris e inutilizable.
 *
 * @param {string} idModal Identificador del elemento `.modal` en el DOM.
 */
export const cerrarModal = (idModal) => {
  const elemento = document.getElementById(idModal);

  if (!elemento) {
    console.error(`[TekZon] No existe ningún elemento con id "${idModal}" en el DOM.`);
    return;
  }

  if (bootstrapDisponible()) {
    const instancia = window.bootstrap.Modal.getInstance(elemento);
    if (instancia) instancia.hide();
  }

  // Respaldo manual: limpia backdrop, scroll y atributos de accesibilidad.
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';

  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.remove());

  elemento.classList.remove('show');
  elemento.style.display = 'none';
  elemento.setAttribute('aria-hidden', 'true');
};
