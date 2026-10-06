/**
 * ==========================================================================
 * CONFIGURACIÓN CENTRALIZADA DE AXIOS - TEKZON C.A.
 * ==========================================================================
 * Define la URL base del servidor backend (puerto 3000) y las cabeceras HTTP
 * predeterminadas para todas las peticiones del sistema.
 */
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 10000 // Límite de espera de 10 segundos
});

export default apiClient;