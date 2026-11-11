/**
 * ==========================================================================
 * PRECARGA DE COMPILACIÓN (compilarSinSondaDeRed.mjs) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Permite ejecutar `vite build` en este equipo aunque el entorno de ejecución
 *   bloquee los procesos hijos con tuberías.
 *
 * PROPÓSITO TÉCNICO (por qué es necesario):
 *   Vite, en Windows, llama a `child_process.exec('net use')` para averiguar si
 *   una ruta pertenece a una unidad de red y así poder resolverla con su ruta
 *   real (`optimizeSafeRealPathSync`). En este entorno, abrir una tubería para
 *   capturar la salida de otro programa falla con:
 *
 *       Error: spawn EPERM
 *
 *   Ese fallo NO tiene relación con el código del proyecto: es una restricción
 *   del entorno. Esta precarga sustituye ÚNICAMENTE esa llamada concreta por una
 *   respuesta "sin unidades de red", que es exactamente lo que Vite espera en un
 *   equipo cuyas rutas son locales (C:\...). El resto de la compilación se
 *   ejecuta sin ninguna modificación.
 *
 *   USO:
 *     node --import ./scripts/compilarSinSondaDeRed.mjs \
 *          ./node_modules/vite/bin/vite.js build
 *
 *   NOTA: en un equipo sin esa restricción basta con `npm run build`, que es el
 *   comando documentado en el README. Este archivo es sólo una ayuda local.
 * ==========================================================================
 */
import { createRequire } from 'node:module';

const requerir = createRequire(import.meta.url);
const childProcess = requerir('node:child_process');

/** Implementación original, por si se quisiera restaurar. */
const ejecutarOriginal = childProcess.exec;

/**
 * Se intercepta `exec` y `execFile`.
 * Si el comando es la sonda de unidades de red de Vite (`net use`), se responde
 * inmediatamente con una salida vacía (no hay unidades de red). Cualquier otro
 * comando se delega en la implementación original.
 */
const interceptar = (funcionOriginal) => function interceptada(comando, opciones, callback) {
  // Firma flexible: (comando, callback) o (comando, opciones, callback).
  const funcionCallback = typeof opciones === 'function' ? opciones : callback;

  const esSondaDeUnidadesDeRed = typeof comando === 'string'
    && /^\s*net\s+use\b/i.test(comando);

  if (esSondaDeUnidadesDeRed) {
    if (funcionCallback) process.nextTick(() => funcionCallback(null, '', ''));
    // Se devuelve un objeto mínimo compatible con lo que Vite espera (ChildProcess).
    return { on() {}, once() {}, kill() {}, stdout: null, stderr: null };
  }

  return funcionOriginal.call(childProcess, comando, opciones, callback);
};

childProcess.exec = interceptar(ejecutarOriginal);
childProcess.execFile = interceptar(childProcess.execFile);
