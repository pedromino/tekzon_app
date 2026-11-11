/**
 * ==========================================================================
 * ENRUTADOR PRINCIPAL (router/index.js) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Declara TODAS las rutas del sistema y las organiza en dos grandes grupos:
 *
 *     RUTAS PÚBLICAS
 *       /login          -> LoginPage.vue (Módulo 1 · acceso al sistema)
 *
 *     RUTAS PROTEGIDAS (requieren sesión de Administrador)
 *       FASE I · INVENTARIO
 *         /inventario       -> InventarioPage.vue   (CRUD 1 + CRUD 2)
 *         /movimientos      -> MovimientosPage.vue  (CRUD 3 kádex)
 *         /categorias       -> CategoriasPage.vue   (CRUD 4)
 *       FASE II · MÓDULOS NUEVOS
 *         /recepcion        -> RecepcionPage.vue    (Módulo 2 recepción)
 *         /ordenes          -> OrdenesPage.vue      (Módulo 2 panel del técnico)
 *         /ventas           -> VentasPage.vue       (Módulo 3 mostrador)
 *         /clientes         -> ClientesPage.vue     (Módulo 2 clientes)
 *         /dispositivos     -> DispositivosPage.vue (Módulo 2 equipos)
 *         /caja             -> CajaPage.vue         (Módulo 2 caja)
 *         /alertas          -> AlertasStockPage.vue (Módulo 4 alertas)
 *
 * PROPÓSITO TÉCNICO:
 *   - Cada ruta declara en `meta` si exige autenticación (`requiereSesion`), el
 *     título y el módulo al que pertenece, datos que consume el Topbar para
 *     mostrar dinámicamente el encabezado de la pantalla.
 *   - El GUARD GLOBAL `beforeEach` es la puerta de seguridad del frontend:
 *     redirige al Login cuando no hay sesión y, si ya la hay, impide volver a
 *     entrar a la pantalla de acceso.
 *   - Carga diferida con importación dinámica en las vistas secundarias para
 *     reducir el tamaño del bundle inicial.
 *
 *   IMPORTANTE (seguridad real): este guard es una comodidad de navegación. La
 *   seguridad efectiva la impone el BACKEND con el middleware
 *   `exigirAdministradorAutenticado`, que valida el token en cada endpoint.
 * ==========================================================================
 */
import { createRouter, createWebHistory } from 'vue-router';
import { obtenerToken, tieneAccesoRuta, rutaInicioSegunRol } from '../services/sesion';

// La pantalla de acceso se carga de forma inmediata (es la puerta de entrada).
import LoginPage from '../pages/LoginPage.vue';

// Página principal del catálogo: también inmediata por ser la ruta por defecto.
import InventarioPage from '../pages/InventarioPage.vue';

const routes = [
  /* ======================================================================
   * RUTA PÚBLICA · ACCESO AL SISTEMA (Módulo 1)
   * ====================================================================== */
  {
    path: '/login',
    name: 'Login',
    component: LoginPage,
    meta: { titulo: 'Iniciar sesión', publica: true }
  },

  /* ======================================================================
   * RUTAS PROTEGIDAS · FASE I (Módulo de Inventario ya operativo)
   * ====================================================================== */
  {
    // Panel de inicio: resumen consolidado de todos los módulos del sistema.
    path: '/resumen',
    name: 'ResumenGeneral',
    component: () => import('../pages/DashboardPage.vue'),
    meta: {
      titulo: 'Resumen general',
      subtitulo: 'Estado consolidado de inventario, taller, ventas y alertas',
      modulo: 'Panel general',
      requiereSesion: true,
      icono: 'bi-grid'
    }
  },
  {
    path: '/inventario',
    name: 'Inventario',
    component: InventarioPage,
    meta: {
      titulo: 'Inventario',
      subtitulo: 'Catálogo maestro y ajuste de existencias',
      modulo: 'CRUD 1 y CRUD 2',
      requiereSesion: true,
      icono: 'bi-box-seam'
    }
  },
  {
    path: '/movimientos',
    name: 'Movimientos',
    component: () => import('../pages/MovimientosPage.vue'),
    meta: {
      titulo: 'Entradas y Salidas',
      subtitulo: 'Kárdex transaccional · Entradas, salidas y ajustes',
      modulo: 'CRUD 3',
      requiereSesion: true,
      icono: 'bi-arrow-left-right'
    }
  },
  {
    path: '/categorias',
    name: 'Categorias',
    component: () => import('../pages/CategoriasPage.vue'),
    meta: {
      titulo: 'Categorías de Productos',
      subtitulo: 'Clasificación y agrupación de artículos',
      modulo: 'CRUD 4',
      requiereSesion: true,
      icono: 'bi-tags'
    }
  },
  {
    path: '/proveedores',
    name: 'Proveedores',
    component: () => import('../pages/ProveedoresPage.vue'),
    meta: {
      titulo: 'Proveedores',
      subtitulo: 'Cartera comercial de proveedores y compras',
      modulo: 'Módulo de Proveedores',
      requiereSesion: true,
      icono: 'bi-truck'
    }
  },

  /* ======================================================================
   * RUTAS PROTEGIDAS · FASE II (módulos nuevos)
   * ====================================================================== */
  {
    path: '/recepcion',
    name: 'Recepcion',
    component: () => import('../pages/RecepcionPage.vue'),
    meta: {
      titulo: 'Recepción de Equipos',
      subtitulo: 'Registro del cliente, del dispositivo y apertura de la orden',
      modulo: 'Módulo 2 · Servicio Técnico',
      requiereSesion: true,
      icono: 'bi-clipboard-plus'
    }
  },
  {
    path: '/ordenes',
    name: 'OrdenesServicio',
    component: () => import('../pages/OrdenesPage.vue'),
    meta: {
      titulo: 'Panel del Técnico',
      subtitulo: 'Órdenes de servicio técnico, estados, repuestos y cobro',
      modulo: 'Módulo 2 · Servicio Técnico',
      requiereSesion: true,
      icono: 'bi-tools'
    }
  },
  {
    path: '/ventas',
    name: 'VentaDirecta',
    component: () => import('../pages/VentasPage.vue'),
    meta: {
      titulo: 'Venta Directa',
      subtitulo: 'Mostrador · venta rápida de artículos electrónicos',
      modulo: 'Módulo 3 · Venta Directa',
      requiereSesion: true,
      icono: 'bi-cart'
    }
  },
  {
    path: '/clientes',
    name: 'Clientes',
    component: () => import('../pages/ClientesPage.vue'),
    meta: {
      titulo: 'Clientes',
      subtitulo: 'Cartera de clientes, equipos y facturación',
      modulo: 'Módulo 2 · Recepción',
      requiereSesion: true,
      icono: 'bi-people'
    }
  },
  {
    path: '/dispositivos',
    name: 'Dispositivos',
    component: () => import('../pages/DispositivosPage.vue'),
    meta: {
      titulo: 'Dispositivos',
      subtitulo: 'Equipos registrados y su historial de reparaciones',
      modulo: 'Módulo 2 · Recepción',
      requiereSesion: true,
      icono: 'bi-laptop'
    }
  },
  {
    path: '/caja',
    name: 'Caja',
    component: () => import('../pages/CajaPage.vue'),
    meta: {
      titulo: 'Caja',
      subtitulo: 'Turnos, cobros del día y arqueo',
      modulo: 'Módulo 2 · Caja',
      requiereSesion: true,
      icono: 'bi-cash-stack'
    }
  },
  {
    path: '/alertas',
    name: 'AlertasStock',
    component: () => import('../pages/AlertasStockPage.vue'),
    meta: {
      titulo: 'Alertas de Stock',
      subtitulo: 'Productos en o por debajo del stock mínimo',
      modulo: 'Módulo 4 · Automatización',
      requiereSesion: true,
      icono: 'bi-exclamation-triangle'
    }
  },
  {
    path: '/configuracion',
    name: 'Configuracion',
    component: () => import('../pages/ConfiguracionPage.vue'),
    meta: {
      titulo: 'Configuración del Sistema',
      subtitulo: 'Gestión de usuarios, roles, accesos y aprobaciones',
      modulo: 'Módulo de Administración',
      requiereSesion: true,
      icono: 'bi-gear'
    }
  },

  /* ======================================================================
   * REDIRECCIONES
   * ====================================================================== */
  {
    // La raíz lleva al panel por defecto según el rol del usuario autenticado
    path: '/',
    redirect: () => rutaInicioSegunRol()
  },
  {
    // Ruta comodín: regresa a la ruta inicial según el rol
    path: '/:pathMatch(.*)*',
    redirect: () => rutaInicioSegunRol()
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

/**
 * GUARD GLOBAL DE NAVEGACIÓN (seguridad del frontend).
 *
 * PROPÓSITO FUNCIONAL:
 *   1. Si la ruta exige sesión y no hay token -> se redirige al Login,
 *      recordando la ruta solicitada en `?redirigir=` para volver a ella
 *      después de iniciar sesión.
 *   2. Si el usuario ya tiene sesión e intenta volver al Login -> se le redirige
 *      a la página que le corresponde según su rol (/ordenes para técnico, /resumen para admin/cajero).
 *   3. Si la ruta protegida no está permitida para su rol (ej: técnico intentando ver /resumen
 *      o cajero intentando ver /inventario) -> se le redirige a su módulo autorizado.
 */
router.beforeEach((destino) => {
  const haySesion = Boolean(obtenerToken());

  // ---- Caso 1: ruta protegida sin sesión ----
  if (destino.meta?.requiereSesion && !haySesion) {
    return {
      path: '/login',
      query: { redirigir: destino.fullPath }
    };
  }

  // ---- Caso 2: ya hay sesión y se intenta volver al Login ----
  if (destino.path === '/login' && haySesion) {
    return { path: rutaInicioSegunRol() };
  }

  // ---- Caso 3: verificación de permisos por rol para rutas protegidas ----
  if (haySesion && destino.meta?.requiereSesion) {
    if (!tieneAccesoRuta(destino.path)) {
      return { path: rutaInicioSegunRol() };
    }
  }

  // ---- Caso 4: se permite la navegación ----
  return true;
});

export default router;
