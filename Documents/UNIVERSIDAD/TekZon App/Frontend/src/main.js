/**
 * ==========================================================================
 * PUNTO DE ENTRADA PRINCIPAL (main.js) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Crea la aplicación Vue 3, activa el enrutador, carga las hojas de estilo
 *   corporativas y monta la interfaz en el contenedor `#app` del index.html.
 *
 * PROPÓSITO TÉCNICO:
 *   Bootstrap 5 se importa y se EXPONE EXPLÍCITAMENTE en `window.bootstrap`.
 *
 *   ¿POR QUÉ ES NECESARIA ESA ASIGNACIÓN?
 *   El archivo `bootstrap.bundle.min.js` es un módulo UMD cuya cabecera decide
 *   su destino en tiempo de ejecución:
 *
 *     !function(t, e) {
 *        "object" == typeof exports && "undefined" != typeof module
 *          ? module.exports = e()                      // <-- rama CommonJS
 *          : "function" == typeof define && define.amd
 *            ? define(e)                               // <-- rama AMD
 *            : (t = globalThis || t || self).bootstrap = e()  // <-- rama navegador
 *     }(this, function () { ... });
 *
 *   Cuando Vite preempaqueta esa dependencia, la envuelve como módulo CommonJS
 *   y le proporciona un objeto `module`; por tanto gana la PRIMERA rama y el
 *   namespace de Bootstrap queda dentro del bundle (`module.exports`) en lugar
 *   de registrarse en `window.bootstrap`.
 *
 *   Consecuencia observada: todos los componentes que llaman a
 *   `window.bootstrap.Modal.getOrCreateInstance(...)` fallaban de forma
 *   SILENCIOSA (la guarda `if (!window.bootstrap) return;` abortaba la apertura
 *   del modal sin lanzar ningún error), por lo que los botones "no hacían nada".
 *
 *   La solución es capturar el namespace que devuelve la importación y
 *   publicarlo en `window`, de modo que la API de Bootstrap esté disponible
 *   tanto si el empaquetador resuelve la rama CommonJS como la del navegador.
 * ==========================================================================
 */

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

// ---------------------------------------------------------------------------
// 1. HOJAS DE ESTILO (primero el framework, después la identidad corporativa)
// ---------------------------------------------------------------------------
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

// La hoja global de TekZon se carga AL FINAL para que sus variables y clases
// sobrescriban las de Bootstrap 5.
import './assets/styles.css';

// ---------------------------------------------------------------------------
// 2. BOOTSTRAP JAVASCRIPT (modales, dropdowns, toasts nativos)
// ---------------------------------------------------------------------------
// Se captura el namespace que exporta el bundle UMD...
import * as bootstrapImportado from 'bootstrap/dist/js/bootstrap.bundle.min.js';

/*
 * ...y se publica en `window.bootstrap` para que los componentes de Vue puedan
 * invocar la API de modales (getOrCreateInstance, show, hide) sin depender de
 * atributos `data-bs-toggle` en el HTML.
 *
 * La comprobación con `Object.keys().length` evita sobrescribir una instancia
 * válida ya registrada (por ejemplo si el bundle tomó la rama del navegador).
 */
if (!window.bootstrap || Object.keys(window.bootstrap).length === 0) {
  window.bootstrap = bootstrapImportado;
}

// ---------------------------------------------------------------------------
// 3. ARRANQUE DE LA APLICACIÓN VUE
// ---------------------------------------------------------------------------
const app = createApp(App);

app.use(router); // Habilita la navegación entre los 4 módulos del inventario

app.mount('#app');
