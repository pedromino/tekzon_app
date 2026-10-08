/**
 * ==========================================================================
 * SERVICIO DE CATEGORÍAS (categoriaService.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Lógica de negocio (Business Logic Layer) · CRUD 4
 *
 * PROPÓSITO FUNCIONAL:
 *   Valida las reglas de negocio de las categorías antes de tocar la base de
 *   datos: nombre obligatorio, longitud máxima de 50 caracteres (según DDL),
 *   ausencia de duplicados y verificación de existencia para responder con
 *   códigos HTTP semánticos (400 / 404).
 *
 * PROPÓSITO TÉCNICO:
 *   Centraliza los mensajes de error en ESPAÑOL para que el frontend pueda
 *   mostrarlos en el Toast sin traducciones adicionales. Los errores de
 *   negocio se lanzan con la propiedad `codigoHttp` para que el controlador
 *   los traduzca directamente a la respuesta REST.
 * ==========================================================================
 */
import { CategoriaModel } from '../models/CategoriaModel.js';

/** Longitud máxima permitida por el DDL para `nombre_categoria`. */
const LONGITUD_MAXIMA_NOMBRE = 50;

/**
 * Error de negocio controlado: transporta el código HTTP que el controlador
 * debe devolver al cliente (400 para datos inválidos, 404 para no hallado).
 */
class ErrorNegocioCategoria extends Error {
  constructor(mensaje, codigoHttp = 400) {
    super(mensaje);
    this.name = 'ErrorNegocioCategoria';
    this.codigoHttp = codigoHttp;
  }
}

/**
 * Normaliza el nombre recibido desde el formulario de Vue.
 * Elimina espacios sobrantes y colapsa espacios internos duplicados.
 */
const normalizarNombre = (valor) => String(valor ?? '').trim().replace(/\s+/g, ' ');

export const CategoriaService = {
  /**
   * Devuelve las categorías para las tablas y los combos del sistema.
   * @param {boolean} soloActivas - true para alimentar el selector de
   *   categorías del formulario de productos (sólo clasificaciones vigentes).
   */
  async obtenerCategorias(soloActivas = false) {
    return await CategoriaModel.listar({ soloActivas });
  },

  /** Recupera una categoría puntual o lanza 404. */
  async obtenerCategoriaPorId(id_categoria) {
    const idNumerico = Number(id_categoria);

    if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
      throw new ErrorNegocioCategoria('El identificador de la categoría no es válido.', 400);
    }

    const categoria = await CategoriaModel.obtenerPorId(idNumerico);

    if (!categoria) {
      throw new ErrorNegocioCategoria(`No existe la categoría con id ${idNumerico}.`, 404);
    }

    return categoria;
  },

  /**
   * Registra una categoría nueva aplicando todas las validaciones de negocio.
   */
  async crearCategoria(datosCategoria) {
    const nombreNormalizado = normalizarNombre(datosCategoria?.nombre_categoria ?? datosCategoria?.nombre);

    if (!nombreNormalizado) {
      throw new ErrorNegocioCategoria('El nombre de la categoría es obligatorio.', 400);
    }

    if (nombreNormalizado.length > LONGITUD_MAXIMA_NOMBRE) {
      throw new ErrorNegocioCategoria(
        `El nombre no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`,
        400
      );
    }

    // Verificación previa de duplicados: mejor un 400 legible que un
    // ER_DUP_ENTRY (500/400) sin contexto para el usuario final.
    const idDuplicado = await CategoriaModel.existeNombre(nombreNormalizado);

    if (idDuplicado) {
      throw new ErrorNegocioCategoria(
        `Ya existe una categoría registrada con el nombre "${nombreNormalizado}".`,
        400
      );
    }

    return await CategoriaModel.crear(nombreNormalizado);
  },

  /** Actualiza (renombra) una categoría existente. */
  async actualizarCategoria(id_categoria, datosCategoria) {
    // Reutiliza la validación de existencia: si no está, lanza 404.
    const categoriaActual = await this.obtenerCategoriaPorId(id_categoria);

    const nombreNormalizado = normalizarNombre(datosCategoria?.nombre_categoria ?? datosCategoria?.nombre);

    if (!nombreNormalizado) {
      throw new ErrorNegocioCategoria('El nombre de la categoría es obligatorio.', 400);
    }

    if (nombreNormalizado.length > LONGITUD_MAXIMA_NOMBRE) {
      throw new ErrorNegocioCategoria(
        `El nombre no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`,
        400
      );
    }

    const idDuplicado = await CategoriaModel.existeNombre(
      nombreNormalizado,
      categoriaActual.id_categoria
    );

    if (idDuplicado) {
      throw new ErrorNegocioCategoria(
        `Otra categoría ya utiliza el nombre "${nombreNormalizado}".`,
        400
      );
    }

    return await CategoriaModel.actualizar(categoriaActual.id_categoria, nombreNormalizado);
  },

  /**
   * BAJA LÓGICA con control de impacto.
   *
   * PROPÓSITO FUNCIONAL: se informa al frontend cuántos productos siguen
   * clasificados en la categoría desactivada. No se bloquea la operación
   * (el objetivo del soft delete es precisamente no romper las claves
   * foráneas), pero el usuario recibe la advertencia en el Toast.
   */
  async desactivarCategoria(id_categoria) {
    const categoriaActual = await this.obtenerCategoriaPorId(id_categoria);

    const productosAsociados = await CategoriaModel.contarProductosAsociados(categoriaActual.id_categoria);

    const filasAfectadas = await CategoriaModel.desactivar(categoriaActual.id_categoria);

    if (filasAfectadas === 0) {
      throw new ErrorNegocioCategoria(
        `La categoría "${categoriaActual.nombre_categoria}" ya se encontraba inactiva.`,
        400
      );
    }

    return {
      id_categoria: categoriaActual.id_categoria,
      nombre_categoria: categoriaActual.nombre_categoria,
      estado: 0,
      productos_asociados: productosAsociados,
      mensaje: productosAsociados > 0
        ? `Categoría desactivada. ${productosAsociados} producto(s) conservan la clasificación histórica.`
        : 'Categoría desactivada correctamente.'
    };
  },

  /** Reactiva una categoría previamente desactivada. */
  async reactivarCategoria(id_categoria) {
    const categoriaActual = await this.obtenerCategoriaPorId(id_categoria);

    const filasAfectadas = await CategoriaModel.reactivar(categoriaActual.id_categoria);

    if (filasAfectadas === 0) {
      throw new ErrorNegocioCategoria(
        `La categoría "${categoriaActual.nombre_categoria}" ya se encontraba activa.`,
        400
      );
    }

    return {
      id_categoria: categoriaActual.id_categoria,
      nombre_categoria: categoriaActual.nombre_categoria,
      estado: 1,
      mensaje: 'Categoría reactivada correctamente.'
    };
  }
};

export { ErrorNegocioCategoria };
