/**
 * ==========================================================================
 * ENRUTADOR PRINCIPAL (router/index.js) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Declara las rutas del Módulo de Inventario y las asocia a las páginas que
 *   representan cada CRUD:
 *
 *     /inventario   -> InventarioPage.vue   (CRUD 1 catálogo + CRUD 2 ajuste)
 *     /movimientos  -> MovimientosPage.vue  (CRUD 3 kádex transaccional)
 *     /categorias   -> CategoriasPage.vue   (CRUD 4 clasificaciones)
 *
 * PROPÓSITO TÉCNICO:
 *   Se usa `createWebHistory` para URLs limpias y carga diferida mediante
 *   importación dinámica (`() => import(...)`) en las vistas secundarias, lo
 *   que reduce el tamaño del bundle inicial y acelera la primera pintura.
 * ==========================================================================
 */
import { createRouter, createWebHistory } from 'vue-router';

// Página principal del catálogo: se carga de forma inmediata por ser la ruta
// de entrada del sistema.
import InventarioPage from '../pages/InventarioPage.vue';

const routes = [
  {
    // Redirección por defecto hacia el catálogo maestro.
    path: '/',
    redirect: '/inventario'
  },
  {
    path: '/inventario',
    name: 'Inventario',
    component: InventarioPage,
    meta: { titulo: 'Inventario', modulo: 'CRUD 1 y CRUD 2' }
  },
  {
    path: '/movimientos',
    name: 'Movimientos',
    // Carga diferida: el kádex sólo se descarga cuando se visita la ruta.
    component: () => import('../pages/MovimientosPage.vue'),
    meta: { titulo: 'Entradas y Salidas', modulo: 'CRUD 3' }
  },
  {
    path: '/categorias',
    name: 'Categorias',
    component: () => import('../pages/CategoriasPage.vue'),
    meta: { titulo: 'Categorías de Productos', modulo: 'CRUD 4' }
  },
  {
    // Ruta comodín: cualquier URL desconocida regresa al catálogo.
    path: '/:pathMatch(.*)*',
    redirect: '/inventario'
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  // Desplazamiento al inicio de la página en cada navegación.
  scrollBehavior() {
    return { top: 0 };
  }
});

export default router;
