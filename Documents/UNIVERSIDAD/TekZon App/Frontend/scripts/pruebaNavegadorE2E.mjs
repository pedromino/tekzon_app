/**
 * ==========================================================================
 * PRUEBA DE EXTREMO A EXTREMO EN NAVEGADOR REAL - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Simula el flujo real del usuario en el navegador para comprobar que el
 *   módulo de inventario funciona de verdad, no sólo que compila:
 *
 *     1. Clic en "Nuevo producto"  -> el modal se abre.
 *     2. El selector de categorías se llena con datos de MySQL (CRUD 4).
 *     3. Se completa el formulario y se guarda -> POST /api/productos.
 *     4. El producto aparece en la tabla/cards (estado de Éxito con Toast).
 *
 * PROPÓSITO TÉCNICO:
 *   Controla Edge headless por CDP con el WebSocket nativo de Node 24 (sin
 *   Puppeteer ni Playwright). Además intercepta la red con `Network.enable`
 *   para registrar CUALQUIER recurso o petición que falle con 404/500, que es
 *   la vía más rápida de encontrar recursos rotos.
 *
 * USO:  node scripts/pruebaNavegadorE2E.mjs
 * ==========================================================================
 */

import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_APLICACION = process.env.URL_APLICACION || 'http://127.0.0.1:5173/';
const PUERTO_CDP = 9333;
const RUTA_EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let correctas = 0;
let fallidas = 0;

/** Registra el resultado de una comprobación. */
const verificar = (descripcion, condicion, detalle = '') => {
  if (condicion) {
    correctas++;
    console.log(`  [OK]    ${descripcion}`);
  } else {
    fallidas++;
    console.log(`  [FALLO] ${descripcion} ${detalle}`);
  }
};

/** Cliente CDP mínimo sobre WebSocket nativo. */
class ClienteCdp {
  constructor(urlWebSocket) {
    this.url = urlWebSocket;
    this.idComando = 0;
    this.pendientes = new Map();
    this.eventos = [];
  }

  async conectar() {
    this.socket = new WebSocket(this.url);

    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });

    this.socket.addEventListener('message', (evento) => {
      const mensaje = JSON.parse(evento.data);

      if (mensaje.id !== undefined && this.pendientes.has(mensaje.id)) {
        const { resolver, rechazar } = this.pendientes.get(mensaje.id);
        this.pendientes.delete(mensaje.id);

        if (mensaje.error) rechazar(new Error(JSON.stringify(mensaje.error)));
        else resolver(mensaje.result);
        return;
      }

      if (mensaje.method) this.eventos.push(mensaje);
    });
  }

  enviar(metodo, parametros = {}) {
    const id = ++this.idComando;

    return new Promise((resolve, reject) => {
      this.pendientes.set(id, { resolver: resolve, rechazar: reject });
      this.socket.send(JSON.stringify({ id, method: metodo, params: parametros }));

      setTimeout(() => {
        if (this.pendientes.has(id)) {
          this.pendientes.delete(id);
          reject(new Error(`Timeout en el comando ${metodo}`));
        }
      }, 25000);
    });
  }

  async evaluar(expresion) {
    const resultado = await this.enviar('Runtime.evaluate', {
      expression: expresion,
      returnByValue: true,
      awaitPromise: true
    });

    if (resultado.exceptionDetails) {
      return { error: resultado.exceptionDetails.exception?.description || resultado.exceptionDetails.text };
    }

    return { valor: resultado.result?.value };
  }

  cerrar() {
    if (this.socket) this.socket.close();
  }
}

const obtenerTargetPagina = async () => {
  const respuesta = await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/list`);
  const targets = await respuesta.json();
  return targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
};

/** Código de producto único para no chocar con registros previos. */
const CODIGO_PRODUCTO = `E2E-${Date.now().toString().slice(-6)}`;

const ejecutarPrueba = async () => {
  console.log('='.repeat(74));
  console.log(' PRUEBA E2E EN NAVEGADOR REAL · MÓDULO DE INVENTARIO · TEKZON C.A.');
  console.log('='.repeat(74));
  console.log(` Producto de prueba: ${CODIGO_PRODUCTO}`);

  const perfilTemporal = await mkdtemp(join(tmpdir(), 'tekzon-e2e-'));

  const edge = spawn(RUTA_EDGE, [
    '--headless=new',
    `--remote-debugging-port=${PUERTO_CDP}`,
    `--user-data-dir=${perfilTemporal}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank'
  ], { stdio: 'ignore' });

  let cliente = null;

  try {
    let target = null;
    for (let intento = 0; intento < 40 && !target; intento++) {
      await esperar(500);
      try { target = await obtenerTargetPagina(); } catch { target = null; }
    }
    if (!target) throw new Error('No se pudo conectar al puerto de depuración.');

    cliente = new ClienteCdp(target.webSocketDebuggerUrl);
    await cliente.conectar();

    await cliente.enviar('Runtime.enable');
    await cliente.enviar('Page.enable');
    await cliente.enviar('Network.enable');
    await cliente.enviar('Log.enable');

    console.log('\n[1] Cargando la aplicación y esperando las peticiones al backend...');
    await cliente.enviar('Page.navigate', { url: URL_APLICACION });
    await esperar(7000);

    // ------------------------------------------------------------------
    console.log('\n[2] API de Bootstrap disponible');
    // ------------------------------------------------------------------
    const bootstrapOk = await cliente.evaluar('typeof window.bootstrap?.Modal');
    verificar('window.bootstrap.Modal es una función', bootstrapOk.valor === 'function', `-> ${bootstrapOk.valor}`);

    // ------------------------------------------------------------------
    console.log('\n[3] Apertura del modal "Nuevo producto"');
    // ------------------------------------------------------------------
    const clic = await cliente.evaluar(`(() => {
      const boton = [...document.querySelectorAll('button')]
        .find(b => /nuevo producto/i.test(b.textContent));
      if (!boton) return 'BOTON_NO_ENCONTRADO';
      boton.click();
      return 'CLIC_ENVIADO';
    })()`);
    verificar('Se encontró y pulsó el botón "Nuevo producto"', clic.valor === 'CLIC_ENVIADO', `-> ${clic.valor}`);

    await esperar(2000);

    const modalAbierto = await cliente.evaluar(`JSON.stringify({
      show: document.getElementById('productModal')?.classList.contains('show'),
      display: document.getElementById('productModal')?.style.display,
      backdrop: !!document.querySelector('.modal-backdrop')
    })`);
    const estadoModal = JSON.parse(modalAbierto.valor || '{}');
    verificar('El modal quedó visible (clase show + display block)',
      estadoModal.show === true && estadoModal.display === 'block', `-> ${modalAbierto.valor}`);
    verificar('Se creó el backdrop del modal', estadoModal.backdrop === true);

    // ------------------------------------------------------------------
    console.log('\n[4] Selector de categorías cargado desde MySQL (CRUD 4)');
    // ------------------------------------------------------------------
    const opciones = await cliente.evaluar(`(() => {
      const select = document.getElementById('producto-categoria');
      if (!select) return JSON.stringify({ existe: false });
      const valores = [...select.options].map(o => o.value).filter(v => v !== '');
      return JSON.stringify({
        existe: true,
        cantidad: valores.length,
        valores,
        textos: [...select.options].map(o => o.textContent.trim()).filter(t => !/selecciona/i.test(t))
      });
    })()`);
    const datosSelect = JSON.parse(opciones.valor || '{}');
    verificar('El selector de categorías tiene opciones reales de la base de datos',
      datosSelect.cantidad > 0, `-> ${opciones.valor}`);
    console.log(`          Categorías ofrecidas: ${JSON.stringify(datosSelect.textos)}`);

    // ------------------------------------------------------------------
    console.log('\n[5] Completando el formulario y guardando el producto');
    // ------------------------------------------------------------------
    const llenado = await cliente.evaluar(`(() => {
      // Los v-model de Vue se actualizan disparando el evento 'input'.
      const setValor = (id, valor) => {
        const el = document.getElementById(id);
        if (!el) return false;
        const prototipo = el.tagName === 'SELECT'
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototipo, 'value').set;
        setter.call(el, valor);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };

      const selectCat = document.getElementById('producto-categoria');
      const primeraCategoria = [...selectCat.options].find(o => o.value !== '')?.value;

      const resultados = {
        codigo: setValor('producto-codigo', '${CODIGO_PRODUCTO}'),
        nombre: setValor('producto-nombre', 'Producto de prueba E2E'),
        marca: setValor('producto-marca', 'TekZonQA'),
        categoria: setValor('producto-categoria', primeraCategoria),
        costo: setValor('producto-costo', '15.50'),
        precio: setValor('producto-precio', '29.90'),
        minimo: setValor('producto-minimo', '3')
      };

      const form = document.querySelector('#productModal form');
      const botonGuardar = form?.querySelector('button[type="submit"]');

      return JSON.stringify({
        campos: resultados,
        botonDeshabilitado: botonGuardar?.disabled,
        textoBoton: botonGuardar?.textContent?.trim()
      });
    })()`);
    console.log('    ' + llenado.valor);

    await esperar(600);

    // Clic en "Registrar producto".
    const guardado = await cliente.evaluar(`(() => {
      const form = document.querySelector('#productModal form');
      const boton = form?.querySelector('button[type="submit"]');
      if (!boton) return 'SIN_BOTON';
      if (boton.disabled) return 'BOTON_DESHABILITADO';
      boton.click();
      return 'ENVIADO';
    })()`);
    verificar('El botón de guardado estaba habilitado y se pulsó',
      guardado.valor === 'ENVIADO', `-> ${guardado.valor}`);

    // Espera a que el backend responda y la tabla se refresque.
    await esperar(4000);

    // ------------------------------------------------------------------
    console.log('\n[6] El producto se persistió y aparece en la interfaz');
    // ------------------------------------------------------------------
    const apareceEnUI = await cliente.evaluar(`JSON.stringify({
      estaEnLaTablaOCards: document.body.textContent.includes('${CODIGO_PRODUCTO}'),
      hayToastExito: !!document.querySelector('.toast-ts.success'),
      textoToast: document.querySelector('.toast-ts')?.textContent?.replace(/\\s+/g,' ').trim() || '',
      modalCerrado: !document.getElementById('productModal')?.classList.contains('show')
    })`);
    const resultadoUI = JSON.parse(apareceEnUI.valor || '{}');
    verificar('El producto nuevo aparece en la interfaz (cards/tabla)',
      resultadoUI.estaEnLaTablaOCards === true, `-> ${apareceEnUI.valor}`);
    verificar('Se mostró un Toast de éxito',
      resultadoUI.hayToastExito === true, `-> ${resultadoUI.textoToast}`);
    verificar('El modal se cerró tras guardar', resultadoUI.modalCerrado === true);

    // ------------------------------------------------------------------
    console.log('\n[7] Recursos y peticiones que fallaron (404/500)');
    // ------------------------------------------------------------------
    const fallos = cliente.eventos
      .filter((e) => e.method === 'Network.responseReceived')
      .map((e) => e.params.response)
      .filter((r) => r.status >= 400)
      .map((r) => `${r.status} ${r.url}`);

    if (fallos.length === 0) {
      console.log('    (ninguno)');
      verificar('No hubo recursos ni peticiones fallidas', true);
    } else {
      [...new Set(fallos)].forEach((f) => console.log(`    ${f}`));
      verificar('No hubo recursos ni peticiones fallidas', false, `-> ${fallos.length} fallo(s)`);
    }

    // ------------------------------------------------------------------
    console.log('\n[8] Excepciones de JavaScript');
    // ------------------------------------------------------------------
    const excepciones = cliente.eventos
      .filter((e) => e.method === 'Runtime.exceptionThrown')
      .map((e) => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);

    if (excepciones.length === 0) {
      console.log('    (ninguna)');
      verificar('No se lanzaron excepciones durante el flujo', true);
    } else {
      excepciones.slice(0, 5).forEach((e, i) => console.log(`    ${i + 1}. ${e}`));
      verificar('No se lanzaron excepciones durante el flujo', false);
    }

  } finally {
    if (cliente) cliente.cerrar();
    edge.kill();
  }

  console.log('\n' + '='.repeat(74));
  console.log(` RESULTADO: ${correctas} correctas · ${fallidas} fallidas`);
  console.log('='.repeat(74));

  process.exit(fallidas === 0 ? 0 : 1);
};

ejecutarPrueba().catch((error) => {
  console.error('Error fatal en la prueba E2E:', error);
  process.exit(1);
});
