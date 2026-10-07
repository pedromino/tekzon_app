/**
 * ==========================================================================
 * CONFIGURACIÓN CENTRALIZADA DE AXIOS (APICLIENT.JS)
 * ==========================================================================
 * Define la conexión base hacia la API RESTful del backend en el puerto 3000.
 */
import axios from 'axios';

const clienteApi = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 10000 // Tiempo máximo de espera de 10 segundos
});

export default clienteApi;