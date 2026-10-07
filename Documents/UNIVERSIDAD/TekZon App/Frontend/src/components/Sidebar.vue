<script setup>
/**
 * ==========================================================================
 * COMPONENTE SIDEBAR (MENÚ LATERAL Y NAVEGACIÓN) - TEKZON C.A.
 * ==========================================================================
 * Gestiona la barra lateral de navegación fija, la identidad visual corporativa,
 * el menú adaptativo para dispositivos móviles (hamburguesa) y el perfil del usuario.
 */
import { defineProps, defineEmits } from 'vue';
import logoUrl from '../assets/img/logo.svg';

// Definición de propiedades para recibir el estado de apertura desde App.vue si es necesario
defineProps({
  estaAbierto: {
    type: Boolean,
    default: false
  }
});

// Evento para notificar al componente padre cuando se deba cerrar el menú en móvil
const emit = defineEmits(['cerrarMenu']);

const cerrarSidebarMovil = () => {
  emit('cerrarMenu');
};
</script>

<template>
  <div>
    <!-- ==================================================================
         BARRA LATERAL (SIDEBAR PRINCIPAL)
         ================================================================== -->
    <aside class="sidebar" :class="{ 'is-open': estaAbierto }" id="sidebar" aria-label="Menú principal">
      
      <!-- Encabezado del Sidebar: Logotipo y Nombre de Marca -->
      <div class="sidebar__brand">
        <img :src="logoUrl" alt="Logo TekZon" width="34" height="34">
        <div class="brand-word">
          TekZone
          <small>Gestión técnica</small>
        </div>
        <!-- Botón de cierre para pantallas móviles (X) -->
        <button class="btn btn-ghost btn-icon sidebar__close ms-auto" type="button" @click="cerrarSidebarMovil" aria-label="Cerrar menú">
          <i class="bi bi-x-lg fs-5"></i>
        </button>
      </div>

      <!-- Enlaces de Navegación del Sistema -->
      <nav class="sidebar__nav">
        <p class="sidebar__label">General</p>
        <a class="sidebar__link" href="#" @click="cerrarSidebarMovil">
          <i class="bi bi-grid-1x2"></i> Dashboard
        </a>
        <a class="sidebar__link active" href="#" @click="cerrarSidebarMovil">
          <i class="bi bi-box-seam"></i> Inventario
        </a>

        <p class="sidebar__label">Operaciones</p>
        <a class="sidebar__link" href="#" @click="cerrarSidebarMovil">
          <i class="bi bi-clipboard2-pulse"></i> Órdenes de servicio 
          <span class="count">18</span>
        </a>
        <a class="sidebar__link" href="#" @click="cerrarSidebarMovil">
          <i class="bi bi-cart3"></i> Ventas 
          <span class="soon">Fase II</span>
        </a>
        <a class="sidebar__link" href="#" @click="cerrarSidebarMovil">
          <i class="bi bi-cash-coin"></i> Caja y pagos 
          <span class="soon">Fase II</span>
        </a>
        <a class="sidebar__link" href="#" @click="cerrarSidebarMovil">
          <i class="bi bi-person-vcard"></i> Clientes 
          <span class="soon">Fase II</span>
        </a>
      </nav>

      <!-- Pie del Sidebar: Usuario Autenticado en Sesión -->
      <div class="sidebar__foot">
        <div class="sidebar__user">
          <span class="avatar avatar--sm">PC</span>
          <div>
            <p class="name">Paola Cordero</p>
            <p class="role">Administrador</p>
          </div>
        </div>
      </div>
    </aside>

    <!-- Fondo oscuro desenfocado (Backdrop) para cerrar el menú en móviles al hacer clic fuera -->
    <div class="sidebar-backdrop" :class="{ 'show': estaAbierto }" @click="cerrarSidebarMovil"></div>
  </div>
</template>