/**
 * ==========================================================================
 * DIAGNÓSTICO DE BOTONES EN NAVEGADOR REAL - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO TÉCNICO:
 *   Controla Microsoft Edge en modo headless mediante el protocolo CDP
 *   (Chrome DevTools Protocol) usando el WebSocket nativo de Node 24. No
 *   requiere dependencias externas (nada de Puppeteer ni Playwright).
 *
 *   Responde empíricamente a estas preguntas:
 *     1. ¿Existe `window.bootstrap` dentro de la aplicación?
 *     2. ¿Se registran errores de JavaScript al cargar o al hacer clic?
 *     3. ¿El botón "Nuevo producto" abre realmente el modal en el DOM?
 *
 * USO:  node scripts/diagnosticoNavegador.mjs
 * ==========================================================================
 */

import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_APLICACION = process.env.URL_APLICACION || 'http://127.0.0.1:5173/';
const PUERTO_CDP = 9222;
const RUTA_EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

/** Pausa simple para dar tiempo al navegador entre pasos. */
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cliente CDP mínimo sobre WebSocket nativo.
 * Envía comandos con identificadores incrementales y resuelve por id.
 */
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

      // Respuesta a un comando emitido por nosotros.
      if (mensaje.id !== undefined && this.pendientes.has(mensaje.id)) {
        const { resolver, rechazar } = this.pendientes.get(mensaje.id);
        this.pendientes.delete(mensaje.id);

        if (mensaje.error) rechazar(new Error(JSON.stringify(mensaje.error)));
        else resolver(mensaje.result);
        return;
      }

      // Evento espontáneo del navegador (consola, excepciones, carga).
      if (mensaje.method) this.eventos.push(mensaje);
    });
  }

  /** Emite un comando CDP y espera su resultado. */
  enviar(metodo, parametros = {}) {
    const id = ++this.idComando;

    return new Promise((resolve, reject) => {
      this.pendientes.set(id, { resolver: resolve, rechazar: reject });
      this.socket.send(JSON.stringify({ id, method: metodo, params: parametros }));

      // Tiempo máximo de espera por comando.
      setTimeout(() => {
        if (this.pendientes.has(id)) {
          this.pendientes.delete(id);
          reject(new Error(`Timeout en el comando ${metodo}`));
        }
      }, 20000);
    });
  }

  /**
   * Evalúa una expresión JavaScript en la página y devuelve su valor.
   * Se usa `returnByValue` para recibir objetos ya serializados.
   */
  async evaluar(expresion) {
    const resultado = await this.enviar('Runtime.evaluate', {
      expression: expresion,
      returnByValue: true,
      awaitPromise: true
    });

    if (resultado.exceptionDetails) {
      return { error: resultado.exceptionDetails.text || 'excepción en la evaluación' };
    }

    return { valor: resultado.result?.value };
  }

  cerrar() {
    if (this.socket) this.socket.close();
  }
}

/** Obtiene el WebSocket del primer target de tipo page. */
const obtenerTargetPagina = async () => {
  const respuesta = await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/list`);
  const targets = await respuesta.json();

  return targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
};

const ejecutarDiagnostico = async () => {
  console.log('='.repeat(74));
  console.log(' DIAGNÓSTICO DE BOTONES EN NAVEGADOR REAL · TEKZON C.A.');
  console.log('='.repeat(74));
  console.log(` URL analizada: ${URL_APLICACION}`);

  // Perfil temporal aislado: evita conflictos con un Edge ya abierto.
  const perfilTemporal = await mkdtemp(join(tmpdir(), 'tekzon-edge-'));

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
    // Espera a que el puerto de depuración esté disponible.
    let target = null;
    for (let intento = 0; intento < 40 && !target; intento++) {
      await esperar(500);
      try {
        target = await obtenerTargetPagina();
      } catch {
        target = null;
      }
    }

    if (!target) throw new Error('No se pudo conectar al puerto de depuración de Edge.');

    cliente = new ClienteCdp(target.webSocketDebuggerUrl);
    await cliente.conectar();

    // Se habilitan los dominios para capturar errores de consola y excepciones.
    await cliente.enviar('Runtime.enable');
    await cliente.enviar('Page.enable');
    await cliente.enviar('Log.enable');

    console.log('\n[1] Cargando la aplicación...');
    await cliente.enviar('Page.navigate', { url: URL_APLICACION });
    await esperar(6000);

    // ------------------------------------------------------------------
    console.log('\n[2] ¿Existe window.bootstrap?');
    // ------------------------------------------------------------------
    const infoBootstrap = await cliente.evaluar(`JSON.stringify({
      tipoBootstrap: typeof window.bootstrap,
      tipoModal: window.bootstrap ? typeof window.bootstrap.Modal : 'N/A',
      clavesBootstrap: window.bootstrap ? Object.keys(window.bootstrap).slice(0, 12) : []
    })`);
    const datosBootstrap = JSON.parse(infoBootstrap.valor || '{}');

    console.log(`    typeof window.bootstrap : ${datosBootstrap.tipoBootstrap}`);
    console.log(`    typeof window.bootstrap.Modal : ${datosBootstrap.tipoModal}`);
    console.log(`    claves disponibles : ${JSON.stringify(datosBootstrap.clavesBootstrap)}`);

    // ------------------------------------------------------------------
    console.log('\n[3] ¿Se renderizó la aplicación de Vue?');
    // ------------------------------------------------------------------
    const infoVue = await cliente.evaluar(`JSON.stringify({
      appMontada: !!document.querySelector('#app')?.children.length,
      tituloPagina: document.querySelector('.page-head h2')?.textContent?.trim() || '(sin título)',
      totalBotones: document.querySelectorAll('button').length,
      hayModalProducto: !!document.getElementById('productModal'),
      hayToast: !!document.querySelector('.toast-stack')
    })`);
    console.log('    ' + infoVue.valor);

    // ------------------------------------------------------------------
    console.log('\n[4] Buscando el botón "Nuevo producto" y haciéndole clic...');
    // ------------------------------------------------------------------
    const clicRealizado = await cliente.evaluar(`(() => {
      const botones = [...document.querySelectorAll('button')];
      const boton = botones.find(b => /nuevo producto/i.test(b.textContent));
      if (!boton) return JSON.stringify({ encontrado: false });
      const antes = document.getElementById('productModal')?.classList.contains('show');
      boton.click();
      return JSON.stringify({ encontrado: true, visibleAntesDelClic: !!antes, texto: boton.textContent.trim() });
    })()`);
    console.log('    ' + clicRealizado.valor);

    await esperar(1500);

    // ------------------------------------------------------------------
    console.log('\n[5] Estado del modal DESPUÉS del clic');
    // ------------------------------------------------------------------
    const estadoModal = await cliente.evaluar(`(() => {
      const modal = document.getElementById('productModal');
      if (!modal) return JSON.stringify({ existe: false });
      return JSON.stringify({
        existe: true,
        tieneClaseShow: modal.classList.contains('show'),
        display: modal.style.display || '(sin estilo en línea)',
        visibility: getComputedStyle(modal).visibility,
        opacity: getComputedStyle(modal).opacity,
        hayBackdrop: !!document.querySelector('.modal-backdrop'),
        bodyTieneModalOpen: document.body.classList.contains('modal-open'),
        ariaHidden: modal.getAttribute('aria-hidden')
      });
    })()`);
    console.log('    ' + estadoModal.valor);

    // ------------------------------------------------------------------
    console.log('\n[6] Errores de consola y excepciones capturadas');
    // ------------------------------------------------------------------
    const errores = cliente.eventos.filter((evento) =>
      evento.method === 'Runtime.exceptionThrown'
      || (evento.method === 'Runtime.consoleAPICalled' && evento.params?.type === 'error')
      || (evento.method === 'Log.entryAdded' && evento.params?.entry?.level === 'error')
    );

    if (errores.length === 0) {
      console.log('    (ninguno)');
    } else {
      errores.slice(0, 10).forEach((evento, indice) => {
        if (evento.method === 'Runtime.exceptionThrown') {
          const detalle = evento.params.exceptionDetails;
          console.log(`    ${indice + 1}. EXCEPCIÓN: ${detalle.exception?.description || detalle.text}`);
        } else if (evento.method === 'Runtime.consoleAPICalled') {
          const textos = (evento.params.args || []).map((a) => a.value ?? a.description).join(' ');
          console.log(`    ${indice + 1}. console.error: ${textos}`);
        } else {
          console.log(`    ${indice + 1}. LOG: ${evento.params.entry.text}`);
        }
      });
    }

    // ------------------------------------------------------------------
    console.log('\n[7] Prueba directa de la API de Bootstrap desde la página');
    // ------------------------------------------------------------------
    const pruebaDirecta = await cliente.evaluar(`(() => {
      const modal = document.getElementById('productModal');
      if (!window.bootstrap || !window.bootstrap.Modal) {
        return 'window.bootstrap NO está disponible: abrirModal() sale por su guarda y no ocurre nada.';
      }
      try {
        window.bootstrap.Modal.getOrCreateInstance(modal).show();
        return 'getOrCreateInstance().show() ejecutado sin excepción.';
      } catch (e) {
        return 'Excepción al mostrar: ' + e.message;
      }
    })()`);
    console.log('    ' + pruebaDirecta.valor);

    // ------------------------------------------------------------------
    console.log('\n[8] ¿Los scripts de Bootstrap se registraron en el DOM?');
    // ------------------------------------------------------------------
    const recursos = await cliente.evaluar(`JSON.stringify(
      performance.getEntriesByType('resource')
        .map(r => r.name)
        .filter(n => /bootstrap/i.test(n))
    )`);
    console.log('    Recursos con "bootstrap" en la URL: ' + recursos.valor);

  } finally {
    if (cliente) cliente.cerrar();
    edge.kill();
  }

  console.log('\n' + '='.repeat(74));
};

ejecutarDiagnostico().catch((error) => {
  console.error('Error fatal en el diagnóstico:', error);
  process.exit(1);
});
