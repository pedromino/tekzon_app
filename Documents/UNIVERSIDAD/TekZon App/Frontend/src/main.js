/**
 * ==========================================================================
 * PUNTO DE ENTRADA PRINCIPAL
 * ==========================================================================
 */

import { createApp } from 'vue';
import App from './App.vue';

// Importación de Bootstrap y sus iconos oficiales
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import 'bootstrap-icons/font/bootstrap-icons.css';

// 3. Importación de la hoja de estilos global exacta (variables y clases de TekZon)
import './assets/style.css';

// 4. Inicialización y montaje en el DOM
createApp(App).mount('#app');