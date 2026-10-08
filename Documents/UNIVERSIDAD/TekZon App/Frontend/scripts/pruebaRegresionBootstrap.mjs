/**
 * ==========================================================================
 * PRUEBA DE REGRESIÓN DE LA API DE BOOTSTRAP EN NAVEGADOR REAL
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Evita que vuelva a ocurrir el fallo por el cual TODOS los botones del
 *   módulo dejaron de abrir sus modales sin lanzar ningún error.
 *
 * PROPÓSITO TÉCNICO:
 *   CAUSA RAÍZ DEL FALLO (documentada para la sustentación):
 *     `bootstrap.bundle.min.js` es un módulo UMD. Su cabecera elige destino:
 *
 *       "object" == typeof exports && "undefined" != typeof module
 *         ? module.exports = e()          <-- rama CommonJS (la que ganaba)
 *         : define.amd ? define(e)
 *         : (globalThis || self).bootstrap = e()   <-- rama navegador
 *
 *     Al preempaquetar la dependencia, el bundler le entrega un objeto
 *     `module`, de modo que gana la rama CommonJS y el namespace queda DENTRO
 *     del bundle en lugar de publicarse en `window.bootstrap`.
 *
 *     Como los componentes consultaban `window.bootstrap.Modal` y su guarda era
 *     `if (!window.bootstrap) return;`, la apertura del modal se abortaba en
 *     silencio: el botón "no hacía nada" y la consola no mostraba errores.
 *
 *   ESTA PRUEBA comprueba, contra un navegador real, que:
 *     1. `window.bootstrap.Modal` está disponible (la corrección de main.js).
 *     2. Los botones de las 3 páginas abren su modal correspondiente.
 *     3. No hay excepciones ni recursos rotos.
 *
 * USO:  node scripts/pruebaRegresionBootstrap.mjs
 *       URL_APLICACION=http://127.0.0.1:4173/ node scripts/pruebaRegresionBootstrap.mjs
 * ==========================================================================
 */

import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_BASE = (process.env.URL_APLICACION || 'http://127.0.0.1:5173/').replace(/\/$/, '');
const PUERTO_CDP = 9444;
const RUTA_EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let correctas = 0;
let fallidas = 0;

const verificar = (descripcion, condicion, detalle = '') => {
  if (condicion) {
    correctas++;
    console.log(`  [OK]    ${descripcion}`);
  } else {
    fallidas++;
    console.log(`  [FALLO] ${descripcion} ${detalle}`);
  }
};

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
          reject(new Error(`Timeout en ${metodo}`));
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

  cerrar() { if (this.socket) this.socket.close(); }
}

const obtenerTargetPagina = async () => {
  const respuesta = await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/list`);
  const targets = await respuesta.json();
  return targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
};

/**
 * Hace clic en el botón cuyo texto coincide con el patrón y devuelve si el
 * modal indicado quedó visible. Se usa `history.pushState` + evento popstate
 * para navegar entre rutas del router sin recargar la página.
 */
const probarAperturaDeModal = async (cliente, { ruta, patronBoton, idModal, descripcion }) => {
  // Navegación por el router de Vue sin recargar el documento.
  await cliente.evaluar(`(() => {
    window.history.pushState({}, '', '${ruta}');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return true;
  })()`);
  await esperar(2500);

  const clic = await cliente.evaluar(`(() => {
    const boton = [...document.querySelectorAll('button')]
      .find(b => ${patronBoton}.test(b.textContent));
    if (!boton) return 'BOTON_NO_ENCONTRADO';
    boton.click();
    return 'CLIC_ENVIADO';
  })()`);

  if (clic.valor !== 'CLIC_ENVIADO') {
    verificar(`${descripcion} (botón encontrado)`, false, `-> ${clic.valor}`);
    return;
  }

  await esperar(1500);

  const estado = await cliente.evaluar(`JSON.stringify({
    show: document.getElementById('${idModal}')?.classList.contains('show'),
    display: document.getElementById('${idModal}')?.style.display,
    backdrop: !!document.querySelector('.modal-backdrop')
  })`);
  const datos = JSON.parse(estado.valor || '{}');

  verificar(`${descripcion} (${idModal} visible)`,
    datos.show === true && datos.display === 'block', `-> ${estado.valor}`);
  verificar(`${descripcion} (backdrop creado)`, datos.backdrop === true);

  // Cierre limpio antes de la siguiente comprobación.
  await cliente.evaluar(`(() => {
    document.querySelectorAll('.modal.show').forEach(m => {
      if (window.bootstrap) window.bootstrap.Modal.getInstance(m)?.hide();
    });
    return true;
  })()`);
  await esperar(900);
};

const ejecutar = async () => {
  console.log('='.repeat(74));
  console.log(' PRUEBA DE REGRESIÓN · API DE BOOTSTRAP EN NAVEGADOR REAL');
  console.log('='.repeat(74));
  console.log(` URL base: ${URL_BASE}`);

  const perfilTemporal = await mkdtemp(join(tmpdir(), 'tekzon-reg-'));

  const edge = spawn(RUTA_EDGE, [
    '--headless=new',
    `--remote-debugging-port=${PUERTO_CDP}`,
    `--user-data-dir=${perfilTemporal}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
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

    await cliente.enviar('Page.navigate', { url: `${URL_BASE}/inventario` });
    await esperar(7000);

    // ------------------------------------------------------------------
    console.log('\n[1] La API de Bootstrap se publica en window');
    // ------------------------------------------------------------------
    /*
     * NOTA TÉCNICA: en Bootstrap 5 `getOrCreateInstance` y `getInstance` son
     * métodos ESTÁTICOS de la clase Modal, mientras que `show()` y `hide()`
     * pertenecen al PROTOTIPO (métodos de instancia, accesibles a través de
     * `Modal.prototype`). Comprobar los cuatro como estáticos daría un falso
     * negativo, así que se validan por separado.
     */
    const bootstrap = await cliente.evaluar(`JSON.stringify({
      tipo: typeof window.bootstrap,
      tipoModal: typeof window.bootstrap?.Modal,
      estaticos: window.bootstrap?.Modal
        ? ['getOrCreateInstance','getInstance'].filter(m => typeof window.bootstrap.Modal[m] === 'function')
        : [],
      instancia: window.bootstrap?.Modal
        ? ['show','hide','toggle','dispose'].filter(m => typeof window.bootstrap.Modal.prototype[m] === 'function')
        : []
    })`);
    const datos = JSON.parse(bootstrap.valor || '{}');
    verificar('window.bootstrap es un objeto', datos.tipo === 'object', `-> ${datos.tipo}`);
    verificar('window.bootstrap.Modal es una función', datos.tipoModal === 'function', `-> ${datos.tipoModal}`);
    verificar('Métodos ESTÁTICOS disponibles (getOrCreateInstance, getInstance)',
      datos.estaticos?.length === 2, `-> ${JSON.stringify(datos.estaticos)}`);
    verificar('Métodos de INSTANCIA disponibles (show, hide, toggle, dispose)',
      datos.instancia?.length === 4, `-> ${JSON.stringify(datos.instancia)}`);

    // ------------------------------------------------------------------
    console.log('\n[2] Botones que abren modales en cada página del módulo');
    // ------------------------------------------------------------------
    await probarAperturaDeModal(cliente, {
      ruta: '/inventario',
      patronBoton: '/nuevo producto/i',
      idModal: 'productModal',
      descripcion: 'Inventario · "Nuevo producto"'
    });

    await probarAperturaDeModal(cliente, {
      ruta: '/categorias',
      patronBoton: '/nueva categoría|registrar primera categoría/i',
      idModal: 'categoriaModal',
      descripcion: 'Categorías · "Nueva categoría"'
    });

    await probarAperturaDeModal(cliente, {
      ruta: '/movimientos',
      patronBoton: '/registrar entrada|registrar primer movimiento/i',
      idModal: 'movimientoModal',
      descripcion: 'Movimientos · "Registrar entrada / salida"'
    });

    // ------------------------------------------------------------------
    console.log('\n[3] Integridad de la sesión');
    // ------------------------------------------------------------------
    const fallos = cliente.eventos
      .filter((e) => e.method === 'Network.responseReceived')
      .map((e) => e.params.response)
      .filter((r) => r.status >= 400 && !/favicon/i.test(r.url))
      .map((r) => `${r.status} ${r.url}`);

    verificar('Sin recursos ni peticiones fallidas', fallos.length === 0,
      fallos.length ? `-> ${[...new Set(fallos)].join(' | ')}` : '');

    const excepciones = cliente.eventos
      .filter((e) => e.method === 'Runtime.exceptionThrown')
      .map((e) => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);

    verificar('Sin excepciones de JavaScript', excepciones.length === 0,
      excepciones.length ? `-> ${excepciones[0]}` : '');

  } finally {
    if (cliente) cliente.cerrar();
    edge.kill();
  }

  console.log('\n' + '='.repeat(74));
  console.log(` RESULTADO: ${correctas} correctas · ${fallidas} fallidas`);
  console.log('='.repeat(74));

  process.exit(fallidas === 0 ? 0 : 1);
};

ejecutar().catch((error) => {
  console.error('Error fatal:', error);
  process.exit(1);
});
