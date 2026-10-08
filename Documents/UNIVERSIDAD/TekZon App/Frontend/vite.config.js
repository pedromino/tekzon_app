import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/**
 * ==========================================================================
 * CONFIGURACIÓN DE VITE - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Configura el servidor de desarrollo y el empaquetado de producción del
 *   frontend en Vue 3.
 *
 * PROPÓSITO TÉCNICO:
 *   Se añade `server.watch.ignored` para silenciar los errores de observador
 *   de archivos en Windows:
 *
 *     file watcher error: EBUSY: resource busy or locked, watch
 *       '...\\.pruebaNavegadorE2E.mjs.3432.xxxx.tmpdir\\...tmp'
 *
 *   CAUSA: los editores y las herramientas que escriben de forma atómica crean
 *   carpetas temporales (`.<archivo>.<pid>.<uuid>.tmpdir`) y archivos `.tmp`
 *   dentro del proyecto que desaparecen en milisegundos. El observador de Vite
 *   alcanza a registrarlos y, al intentar vigilarlos, Windows responde EBUSY
 *   porque ya no existen o están bloqueados. El error es RUIDO: no afecta a la
 *   compilación, pero ensucia el log y dificulta detectar errores reales
 *   (justamente así se ocultó el "Invalid end tag" de Sidebar.vue).
 *
 *   EXCEPCIÓN DELIBERADA: NO se ignora `**\/*.vue` ni `**\/*.js`, porque son
 *   los archivos cuya recompilación interesa vigilar.
 * ==========================================================================
 */
export default defineConfig({
  plugins: [vue()],

  server: {
    watch: {
      ignored: [
        // Carpetas temporales de escritura atómica de editores y herramientas.
        '**/.*.tmpdir/**',
        // Archivos temporales sueltos.
        '**/*.tmp',
        // Artefactos de compilación previa.
        '**/dist/**'
      ]
    }
  }
})
