/**
 * ==========================================================================
 * SERVICIO DE PROVEEDORES (proveedorService.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Lógica de negocio (Business Logic Layer) · Módulo de Proveedores
 *
 * PROPÓSITO FUNCIONAL:
 *   Aplica las reglas de negocio y validaciones para la gestión de proveedores:
 *     · RIF es obligatorio, único y normalizado (ej.: J-12345678-9).
 *     · Nombre / Razón Social es obligatorio.
 *     · Teléfono y dirección son validados en longitud.
 *     · Estado / Status (1 = Activo, 0 = Inactivo).
 * ==========================================================================
 */
import { ProveedorModel } from '../models/proveedorModel.js';
import { ErrorNegocio } from '../utils/erroresNegocio.js';

const LONGITUD_MAXIMA_RIF = 20;
const LONGITUD_MAXIMA_NOMBRE = 150;
const LONGITUD_MAXIMA_TELEFONO = 30;
const LONGITUD_MAXIMA_DIRECCION = 150;

const limpiarTexto = (valor) => String(valor ?? '').trim();

/**
 * NORMALIZA UN RIF DE PROVEEDOR.
 * Convierte a mayúsculas y limpia espacios externos.
 */
export const normalizarRif = (rifRecibido) => {
  const rifLimpio = limpiarTexto(rifRecibido).toUpperCase().replace(/\s+/g, '');

  if (!rifLimpio) {
    throw new ErrorNegocio('El RIF del proveedor es obligatorio.', 400);
  }

  if (rifLimpio.length > LONGITUD_MAXIMA_RIF) {
    throw new ErrorNegocio(`El RIF no puede superar los ${LONGITUD_MAXIMA_RIF} caracteres.`, 400);
  }

  return rifLimpio;
};

export const ProveedorService = {
  /**
   * LISTA PROVEEDORES.
   */
  async listarProveedores(filtros = {}) {
    return await ProveedorModel.listarProveedores(filtros);
  },

  /**
   * OBTIENE UN PROVEEDOR POR SU RIF.
   */
  async obtenerProveedor(rif) {
    const rifNormalizado = normalizarRif(rif);
    const proveedor = await ProveedorModel.obtenerPorRif(rifNormalizado);

    if (!proveedor) {
      throw new ErrorNegocio(`El proveedor con RIF "${rifNormalizado}" no está registrado.`, 404);
    }

    return proveedor;
  },

  /**
   * REGISTRA UN NUEVO PROVEEDOR.
   */
  async crearProveedor(datos) {
    const rif_proveedor = normalizarRif(datos?.rif_proveedor || datos?.rif);
    const nombre_proveedor = limpiarTexto(datos?.nombre_proveedor || datos?.nombre);
    const telefono_proveedor = limpiarTexto(datos?.telefono_proveedor || datos?.telefono);
    const direccion_proveedor = limpiarTexto(datos?.direccion_proveedor || datos?.direccion);
    const estado = datos?.estado !== undefined ? (Number(datos.estado) === 1 ? 1 : 0) : 1;

    if (!nombre_proveedor) {
      throw new ErrorNegocio('El nombre o razón social del proveedor es obligatorio.', 400);
    }

    if (nombre_proveedor.length > LONGITUD_MAXIMA_NOMBRE) {
      throw new ErrorNegocio(`El nombre no puede exceder los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`, 400);
    }

    if (telefono_proveedor.length > LONGITUD_MAXIMA_TELEFONO) {
      throw new ErrorNegocio(`El teléfono no puede exceder los ${LONGITUD_MAXIMA_TELEFONO} caracteres.`, 400);
    }

    if (direccion_proveedor.length > LONGITUD_MAXIMA_DIRECCION) {
      throw new ErrorNegocio(`La dirección no puede exceder los ${LONGITUD_MAXIMA_DIRECCION} caracteres.`, 400);
    }

    const existe = await ProveedorModel.existeRif(rif_proveedor);
    if (existe) {
      throw new ErrorNegocio(`Ya existe un proveedor registrado con el RIF "${rif_proveedor}".`, 409);
    }

    return await ProveedorModel.crearProveedor({
      rif_proveedor,
      nombre_proveedor,
      telefono_proveedor,
      direccion_proveedor,
      estado
    });
  },

  /**
   * ACTUALIZA UN PROVEEDOR EXISTENTE.
   */
  async actualizarProveedor(rif, datos) {
    const rifNormalizado = normalizarRif(rif);
    const proveedorExistente = await ProveedorModel.obtenerPorRif(rifNormalizado);

    if (!proveedorExistente) {
      throw new ErrorNegocio(`El proveedor con RIF "${rifNormalizado}" no existe.`, 404);
    }

    const nombre_proveedor = datos?.nombre_proveedor !== undefined
      ? limpiarTexto(datos.nombre_proveedor)
      : proveedorExistente.nombre_proveedor;

    const telefono_proveedor = datos?.telefono_proveedor !== undefined
      ? limpiarTexto(datos.telefono_proveedor)
      : (proveedorExistente.telefono_proveedor || '');

    const direccion_proveedor = datos?.direccion_proveedor !== undefined
      ? limpiarTexto(datos.direccion_proveedor)
      : (proveedorExistente.direccion_proveedor || '');

    const estado = datos?.estado !== undefined
      ? (Number(datos.estado) === 1 ? 1 : 0)
      : proveedorExistente.estado;

    if (!nombre_proveedor) {
      throw new ErrorNegocio('El nombre o razón social del proveedor es obligatorio.', 400);
    }

    if (nombre_proveedor.length > LONGITUD_MAXIMA_NOMBRE) {
      throw new ErrorNegocio(`El nombre no puede exceder los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`, 400);
    }

    if (telefono_proveedor.length > LONGITUD_MAXIMA_TELEFONO) {
      throw new ErrorNegocio(`El teléfono no puede exceder los ${LONGITUD_MAXIMA_TELEFONO} caracteres.`, 400);
    }

    if (direccion_proveedor.length > LONGITUD_MAXIMA_DIRECCION) {
      throw new ErrorNegocio(`La dirección no puede exceder los ${LONGITUD_MAXIMA_DIRECCION} caracteres.`, 400);
    }

    return await ProveedorModel.actualizarProveedor(rifNormalizado, {
      nombre_proveedor,
      telefono_proveedor,
      direccion_proveedor,
      estado
    });
  },

  /**
   * CAMBIA EL ESTADO DE UN PROVEEDOR.
   */
  async cambiarEstado(rif, nuevoEstado) {
    const rifNormalizado = normalizarRif(rif);
    const proveedorExistente = await ProveedorModel.obtenerPorRif(rifNormalizado);

    if (!proveedorExistente) {
      throw new ErrorNegocio(`El proveedor con RIF "${rifNormalizado}" no existe.`, 404);
    }

    const estadoBinario = Number(nuevoEstado) === 1 ? 1 : 0;
    return await ProveedorModel.cambiarEstado(rifNormalizado, estadoBinario);
  }
};

export default ProveedorService;
