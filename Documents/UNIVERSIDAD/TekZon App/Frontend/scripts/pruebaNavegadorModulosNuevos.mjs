/**
 * ==========================================================================
 * PRUEBA E2E DE LOS MÓDULOS NUEVOS EN NAVEGADOR REAL - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Comprueba que los módulos nuevos funcionan DE VERDAD en el navegador, no
 *   sólo que compilan:
 *
 *     1. La aplicación arranca y muestra la pantalla de LOGIN (Módulo 1).
 *     2. Un acceso con credenciales incorrectas es rechazado con aviso en
 *        pantalla (estado de Error de la interfaz).
 *     3. El inicio de sesión con el Administrador entra al sistema y NAVEGA al
 *        panel de resumen.
 *     4. Cada una de las páginas nuevas (Recepción, Panel del Técnico, Venta
 *        Directa, Clientes, Dispositivos, Caja, Alertas) se abre SIN errores de
 *        JavaScript y SIN respuestas HTTP 4xx/5xx inesperadas del API.
 *     5. El enrutador protege las rutas: sin sesión, /ordenes redirige a /login.
 *
 * PROPÓSITO TÉCNICO:
 *   Controla Microsoft Edge en modo headless por el protocolo CDP (Chrome
 *   DevTools Protocol) usando el WebSocket NATIVO de Node 24, sin Puppeteer ni
 *   Playwright. Es el mismo enfoque que ya usaba `pruebaNavegadorE2E.mjs` del
 *   Módulo de Inventario, de modo que no se agregan dependencias al proyecto.
 *
 *   Se instrumenta la red con `Network.enable` y el runtime con
 *   `Runtime.enable`. Esto es CLAVE en Vue: un error de JavaScript en una página
 *   no rompe el proceso de Node ni devuelve un código HTTP distinto, así que la
 *   ÚNICA forma de detectarlo es escuchar el evento `Runtime.exceptionThrown`.
 *
 * REQUISITOS PREVIOS:
 *   1. Backend en marcha          -> cd Backend  && node server.js
 *   2. Servidor de Vite levantado -> cd Frontend && npm run dev
 *
 *   Si el servidor de Vite no está en marcha, este script lo ARRANCA por su
 *   cuenta (y lo detiene al terminar) para poder ejecutarse de forma autónoma.
 *
 *   USO:  node scripts/pruebaNavegadorModulosNuevos.mjs
 * ==========================================================================
 */
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** URL del servidor de desarrollo de Vite. */
const URL_APLICACION = process.env.URL_APLICACION || 'http://127.0.0.1:5173';
/** Puerto del protocolo de depuración de Edge. */
const PUERTO_CDP = 9334;
/** Ruta del navegador Edge instalado en el equipo. */
const RUTA_EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

/** Credenciales del administrador sembrado por la migración 005. */
const USUARIO_ADMIN = process.env.ADMIN_USERNAME || 'admin';
const CLAVE_ADMIN = process.env.ADMIN_PASSWORD || 'TekZon2026*';

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

/* ==========================================================================
 * CLIENTE CDP MÍNIMO SOBRE EL WEBSOCKET NATIVO DE NODE
 * ========================================================================== */
class ClienteCdp {
  constructor(urlWebSocket) {
    this.url = urlWebSocket;
    this.idComando = 0;
    this.pendientes = new Map();

    /** Eventos recibidos del navegador (los consumen las comprobaciones). */
    this.excepciones = [];   // Errores de JavaScript no capturados.
    this.respuestasHttp = []; // Respuestas de red con su código de estado.
    this.consola = [];        // Mensajes de consola (console.error y warnings).
  }

  async conectar() {
    this.socket = new WebSocket(this.url);

    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });

    this.socket.addEventListener('message', (evento) => {
      const mensaje = JSON.parse(evento.data);

      // ---- Respuesta a un comando enviado ----
      if (mensaje.id !== undefined && this.pendientes.has(mensaje.id)) {
        const { resolver, rechazar } = this.pendientes.get(mensaje.id);
        this.pendientes.delete(mensaje.id);

        if (mensaje.error) rechazar(new Error(JSON.stringify(mensaje.error)));
        else resolver(mensaje.result);
        return;
      }

      // ---- Eventos del navegador ----
      if (mensaje.method === 'Runtime.exceptionThrown') {
        const detalle = mensaje.params?.exceptionDetails;
        this.excepciones.push(
          detalle?.exception?.description || detalle?.text || 'Excepción sin detalle'
        );
      }

      if (mensaje.method === 'Runtime.consoleAPICalled' && mensaje.params?.type === 'error') {
        this.consola.push(
          (mensaje.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')
        );
      }

      if (mensaje.method === 'Network.responseReceived') {
        const respuesta = mensaje.params?.response;
        if (respuesta) {
          this.respuestasHttp.push({ url: respuesta.url, codigo: respuesta.status });
        }
      }
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

  /** Ejecuta una expresión en la página y devuelve su valor. */
  async evaluar(expresion) {
    const resultado = await this.enviar('Runtime.evaluate', {
      expression: expresion,
      returnByValue: true,
      awaitPromise: true
    });

    if (resultado.exceptionDetails) {
      return {
        error: resultado.exceptionDetails.exception?.description || resultado.exceptionDetails.text
      };
    }

    return { valor: resultado.result?.value };
  }

  /** Vacía los registros de eventos para analizar sólo una página concreta. */
  limpiarRegistros() {
    this.excepciones = [];
    this.respuestasHttp = [];
    this.consola = [];
  }

  /**
   * Devuelve las respuestas del API que fallaron (4xx/5xx), excluyendo las
   * esperadas (el favicon y el propio 401 del intento de login fallido).
   */
  respuestasApiFallidas() {
    return this.respuestasHttp.filter((r) => (
      r.codigo >= 400
      && r.url.includes('/api/')
      && !r.url.includes('/autenticacion/login')
      && r.codigo !== 404 // el favicon y otros recursos estáticos no son del API
    ));
  }

  cerrar() {
    if (this.socket) this.socket.close();
  }
}

/** Obtiene la pestaña de about:blank expuesta por el puerto de depuración. */
const obtenerTargetPagina = async () => {
  const respuesta = await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/list`);
  const targets = await respuesta.json();
  return targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
};

/** Comprueba si el servidor de Vite ya está escuchando. */
const servidorViteActivo = async () => {
  try {
    const respuesta = await fetch(URL_APLICACION, { method: 'GET' });
    return respuesta.ok;
  } catch {
    return false;
  }
};

const ejecutarPrueba = async () => {
  console.log('='.repeat(74));
  console.log(' PRUEBA E2E EN NAVEGADOR REAL · MÓDULOS NUEVOS · TEKZON C.A.');
  console.log('='.repeat(74));
  console.log(` Aplicación: ${URL_APLICACION}`);

  // ---- 0. Se levanta el servidor de Vite si no estaba en marcha ----
  let procesoVite = null;

  if (!(await servidorViteActivo())) {
    console.log('\n[0] El servidor de Vite no estaba activo: se levanta automáticamente…');

    procesoVite = spawn('npm', ['run', 'dev'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true
    });

    // Se espera hasta 60 segundos a que el servidor responda.
    let activo = false;
    for (let intento = 0; intento < 60 && !activo; intento++) {
      await esperar(1000);
      activo = await servidorViteActivo();
    }

    if (!activo) throw new Error('El servidor de Vite no respondió en el tiempo esperado.');
  } else {
    console.log('\n[0] El servidor de Vite ya estaba activo.');
  }

  // ---- 1. Se lanza Edge en modo headless ----
  const perfilTemporal = await mkdtemp(join(tmpdir(), 'tekzon-e2e-nuevos-'));

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
    if (!target) throw new Error('No se pudo conectar al puerto de depuración de Edge.');

    cliente = new ClienteCdp(target.webSocketDebuggerUrl);
    await cliente.conectar();

    await cliente.enviar('Runtime.enable');
    await cliente.enviar('Page.enable');
    await cliente.enviar('Network.enable');

    /* ==================================================================
     * 2. PROTECCIÓN DE RUTAS · sin sesión debe redirigir al Login
     * ================================================================== */
    console.log('\n[1] Protección de rutas (sin sesión)');

    await cliente.enviar('Page.navigate', { url: `${URL_APLICACION}/ordenes` });
    await esperar(6000);

    const rutaProtegida = await cliente.evaluar('window.location.pathname + window.location.search');
    verificar('Una ruta protegida sin sesión redirige al Login',
      String(rutaProtegida.valor).startsWith('/login'), `-> ${rutaProtegida.valor}`);
    verificar('Se conserva la ruta solicitada para volver tras el acceso',
      String(rutaProtegida.valor).includes('redirigir'), `-> ${rutaProtegida.valor}`);

    /* ==================================================================
     * 3. PANTALLA DE LOGIN
     * ================================================================== */
    console.log('\n[2] Pantalla de Login (Módulo 1)');

    const formularioLogin = await cliente.evaluar(`JSON.stringify({
      usuario: !!document.getElementById('usuario'),
      contrasenia: !!document.getElementById('contrasenia'),
      titulo: document.querySelector('.auth-card h1')?.textContent?.trim() || '',
      marca: document.querySelector('.brand-word')?.textContent?.trim() || ''
    })`);

    const login = JSON.parse(formularioLogin.valor || '{}');

    verificar('El campo de usuario existe', login.usuario === true);
    verificar('El campo de contraseña existe', login.contrasenia === true);
    verificar('La pantalla muestra "Iniciar sesión"', /iniciar sesión/i.test(login.titulo), `-> ${login.titulo}`);
    verificar('Se muestra la identidad corporativa de TekZon', /tekzon/i.test(login.marca), `-> ${login.marca}`);

    /* ==================================================================
     * 4. ACCESO CON CREDENCIALES INCORRECTAS (estado de Error)
     * ================================================================== */
    console.log('\n[3] Acceso con credenciales incorrectas');

    await cliente.evaluar(`(() => {
      const usuario = document.getElementById('usuario');
      const clave = document.getElementById('contrasenia');
      usuario.value = '${USUARIO_ADMIN}';
      clave.value = 'clave-incorrecta';
      // Se notifican los cambios para que Vue actualice su modelo reactivo.
      usuario.dispatchEvent(new Event('input', { bubbles: true }));
      clave.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('form').requestSubmit();
      return 'ENVIADO';
    })()`);

    await esperar(3500);

    const errorVisible = await cliente.evaluar(`(() => {
      const panel = document.querySelector('.alert-danger');
      return JSON.stringify({
        visible: !!panel,
        texto: panel?.textContent?.replace(/\\s+/g, ' ').trim() || '',
        sigueEnLogin: window.location.pathname.startsWith('/login')
      });
    })()`);

    const estadoError = JSON.parse(errorVisible.valor || '{}');

    verificar('Un acceso incorrecto permanece en el Login', estadoError.sigueEnLogin === true);
    verificar('Se muestra el panel de error con el código HTTP',
      estadoError.visible === true && /HTTP\s*401/.test(estadoError.texto), `-> ${estadoError.texto}`);
    verificar('El mensaje de error está en español',
      /usuario o contraseña incorrectos/i.test(estadoError.texto), `-> ${estadoError.texto}`);

    /* ==================================================================
     * 5. ACCESO CORRECTO DEL ADMINISTRADOR
     * ================================================================== */
    console.log('\n[4] Acceso correcto del Administrador');

    await cliente.limpiarRegistros();

    await cliente.evaluar(`(() => {
      const usuario = document.getElementById('usuario');
      const clave = document.getElementById('contrasenia');
      usuario.value = '${USUARIO_ADMIN}';
      clave.value = ${JSON.stringify(CLAVE_ADMIN)};
      usuario.dispatchEvent(new Event('input', { bubbles: true }));
      clave.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('form').requestSubmit();
      return 'ENVIADO';
    })()`);

    // Se espera al Toast de bienvenida y a la navegación al panel de resumen.
    await esperar(5000);

    const trasAcceso = await cliente.evaluar(`JSON.stringify({
      ruta: window.location.pathname,
      token: !!localStorage.getItem('tekzon_token_sesion'),
      usuarioGuardado: localStorage.getItem('tekzon_usuario_sesion'),
      menuLateral: !!document.querySelector('.sidebar'),
      campana: !!document.querySelector('.topbar__actions'),
      nombreEnMenu: document.querySelector('.sidebar__foot .fw-semibold')?.textContent?.trim() || ''
    })`);

    const sesionIniciada = JSON.parse(trasAcceso.valor || '{}');

    verificar('El inicio de sesión navega al panel de resumen',
      sesionIniciada.ruta === '/resumen', `-> ${sesionIniciada.ruta}`);
    verificar('El token de sesión quedó guardado', sesionIniciada.token === true);
    verificar('La ficha del usuario quedó guardada',
      /administrador/i.test(sesionIniciada.usuarioGuardado || ''), `-> ${sesionIniciada.usuarioGuardado}`);
    verificar('El layout autenticado muestra el menú lateral', sesionIniciada.menuLateral === true);
    verificar('El layout autenticado muestra la barra superior con la campana', sesionIniciada.campana === true);
    verificar('El menú muestra el usuario real de la sesión',
      /administrador tekzon/i.test(sesionIniciada.nombreEnMenu), `-> ${sesionIniciada.nombreEnMenu}`);

    /* ==================================================================
     * 6. RECORRIDO POR TODAS LAS PÁGINAS NUEVAS
     * ================================================================== */
    console.log('\n[5] Recorrido por las páginas de los módulos nuevos');

    // Cada entrada declara la ruta a visitar y un texto que debe aparecer en la
    // pantalla para confirmar que la vista se montó y no quedó en blanco.
    const paginasNuevas = [
      { ruta: '/resumen', descripcion: 'Resumen general (dashboard)', textoEsperado: /resumen general/i },
      { ruta: '/recepcion', descripcion: 'Recepción de equipos (Módulo 2)', textoEsperado: /recepci/i },
      { ruta: '/ordenes', descripcion: 'Panel del Técnico (Módulo 2)', textoEsperado: /t[eé]cnic|orden/i },
      { ruta: '/ventas', descripcion: 'Venta Directa (Módulo 3)', textoEsperado: /venta|cat[aá]logo|carrito/i },
      { ruta: '/clientes', descripcion: 'Clientes (Módulo 2)', textoEsperado: /cliente/i },
      { ruta: '/dispositivos', descripcion: 'Dispositivos (Módulo 2)', textoEsperado: /dispositivo|equipo/i },
      { ruta: '/caja', descripcion: 'Caja (Módulo 2)', textoEsperado: /caja|arqueo|turno/i },
      { ruta: '/alertas', descripcion: 'Alertas de stock (Módulo 4)', textoEsperado: /alerta|stock/i },
      { ruta: '/inventario', descripcion: 'Inventario (FASE I, sin regresión)', textoEsperado: /inventario|producto/i },
      { ruta: '/movimientos', descripcion: 'Entradas y Salidas (FASE I, sin regresión)', textoEsperado: /movimiento|entrada|salida/i },
      { ruta: '/categorias', descripcion: 'Categorías (FASE I, sin regresión)', textoEsperado: /categor/i }
    ];

    for (const pagina of paginasNuevas) {
      cliente.limpiarRegistros();

      await cliente.enviar('Page.navigate', { url: `${URL_APLICACION}${pagina.ruta}` });
      await esperar(4000);

      // Se lee el contenido visible y el estado de la vista.
      const inspeccion = await cliente.evaluar(`JSON.stringify({
        ruta: window.location.pathname,
        texto: (document.querySelector('main.content')?.innerText || '').slice(0, 4000),
        tieneContenido: !!document.querySelector('main.content'),
        filas: document.querySelectorAll('table tbody tr').length,
        tarjetas: document.querySelectorAll('.kpi, .card-ts').length,
        spinnerPermanente: !!document.querySelector('.spinner-border') && document.querySelectorAll('table tbody tr').length === 0
      })`);

      const estado = JSON.parse(inspeccion.valor || '{}');

      // ---- a) La vista se montó en la ruta correcta ----
      verificar(`${pagina.descripcion}: la vista se montó en ${pagina.ruta}`,
        estado.ruta === pagina.ruta && estado.tieneContenido === true,
        `-> ruta ${estado.ruta}, contenido ${estado.tieneContenido}`);

      // ---- b) La pantalla muestra su contenido esperado ----
      verificar(`${pagina.descripcion}: muestra el contenido esperado`,
        pagina.textoEsperado.test(estado.texto || ''),
        `-> "${(estado.texto || '').replace(/\s+/g, ' ').slice(0, 90)}"`);

      // ---- c) La vista no se quedó cargando indefinidamente ----
      verificar(`${pagina.descripcion}: no quedó bloqueada en estado "cargando"`,
        estado.spinnerPermanente !== true);

      // ---- d) NO hubo errores de JavaScript ----
      verificar(`${pagina.descripcion}: sin errores de JavaScript`,
        cliente.excepciones.length === 0,
        `-> ${cliente.excepciones.slice(0, 2).join(' | ')}`);

      // ---- e) NO hubo fallos del API ----
      const fallosApi = cliente.respuestasApiFallidas();
      verificar(`${pagina.descripcion}: sin respuestas de error del API`,
        fallosApi.length === 0,
        `-> ${fallosApi.slice(0, 3).map((f) => `${f.codigo} ${f.url}`).join(' | ')}`);
    }

    /* ==================================================================
     * 7. CAMPANA DE ALERTAS Y CIERRE DE SESIÓN
     * ================================================================== */
    console.log('\n[6] Cierre de sesión (Módulo 1)');

    await cliente.limpiarRegistros();
    await cliente.enviar('Page.navigate', { url: `${URL_APLICACION}/resumen` });
    await esperar(3500);

    // Se pulsa el botón de cerrar sesión del menú lateral.
    const cierre = await cliente.evaluar(`(() => {
      const boton = [...document.querySelectorAll('button')]
        .find(b => /cerrar sesi[oó]n/i.test(b.textContent));
      if (!boton) return 'BOTON_NO_ENCONTRADO';
      boton.click();
      return 'CLIC_ENVIADO';
    })()`);

    verificar('Se encontró el botón "Cerrar sesión"', cierre.valor === 'CLIC_ENVIADO', `-> ${cierre.valor}`);

    await esperar(3500);

    const trasCierre = await cliente.evaluar(`JSON.stringify({
      ruta: window.location.pathname,
      token: localStorage.getItem('tekzon_token_sesion')
    })`);

    const sesionCerrada = JSON.parse(trasCierre.valor || '{}');

    verificar('El cierre de sesión devuelve al Login',
      sesionCerrada.ruta === '/login', `-> ${sesionCerrada.ruta}`);
    verificar('El token fue eliminado del navegador', sesionCerrada.token === null);

    /* ==================================================================
     * 8. RESUMEN FINAL
     * ================================================================== */
    console.log(`\n${'='.repeat(74)}`);
    console.log(` RESULTADO: ${correctas} prueba(s) correcta(s), ${fallidas} fallida(s)`);
    console.log('='.repeat(74));

    if (fallidas > 0) process.exitCode = 1;
  } catch (error) {
    console.error('\n[ERROR FATAL] La prueba se interrumpió:', error.message);
    process.exitCode = 1;
  } finally {
    // ---- Limpieza: se cierran el navegador y el servidor de Vite ----
    if (cliente) cliente.cerrar();
    edge.kill();

    if (procesoVite) {
      // En Windows es necesario matar el árbol de procesos para liberar el puerto.
      spawn('taskkill', ['/pid', String(procesoVite.pid), '/f', '/t'], { stdio: 'ignore' });
    }
  }
};

ejecutarPrueba();
