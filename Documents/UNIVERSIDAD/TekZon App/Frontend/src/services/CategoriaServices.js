/**
 * ==========================================================================
 * SERVICIO DE CATEGORÍAS (CategoriaServices.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Consumo de API REST · CRUD 4 (Categorías de Productos)
 *
 * PROPÓSITO FUNCIONAL:
 *   Encapsula las peticiones HTTP del CRUD 4: listar categorías (para la
 *   tabla de gestión y para el selector del ProductoModal), crear, editar,
 *   desactivar (baja lógica) y reactivar.
 *
 * PROPÓSITO TÉCNICO:
 *   - CERO datos simulados: todo proviene de la tabla `categoria` de la base
 *     `tekzon_bd` a través de los endpoints /api/categorias.
 *   - `listarCategoriasActivas()` es el método que consume el formulario de
 *     productos: garantiza la INTERCONEXIÓN entre el CRUD 4 y el CRUD 1, ya
 *     que sólo ofrece clasificaciones vigentes (estado = 1).
 *   - Cada método usa try/catch y relanza el error normalizado por el
 *     interceptor de axios (con `codigoHttp` 400 / 404 / 500).
 * ==========================================================================
 */
import clienteApi from './apiClient';

/**
 * Traduce una categoría de la base de datos al modelo de vista.
 * `total_productos` permite advertir al usuario del impacto de una baja.
 */
const mapearCategoriaDesdeBD = (categoria) => ({
  id_categoria: categoria.id_categoria,
  id: categoria.id_categoria,
  nombre_categoria: categoria.nombre_categoria,
  nombre: categoria.nombre_categoria,
  estado: Number(categoria.estado ?? 1),
  activa: Number(categoria.estado ?? 1) === 1,
  total_productos: Number(categoria.total_productos || 0)
});

export default {
  /**
   * LISTAR CATEGORÍAS.
   * @param {boolean} soloActivas - true devuelve únicamente estado = 1.
   */
  async listarCategorias(soloActivas = false) {
    try {
      const respuesta = await clienteApi.get('/categorias', {
        params: { soloActivas: soloActivas ? 'true' : 'false' }
      });

      const listaCategorias = respuesta.data?.categorias ?? [];

      return listaCategorias.map(mapearCategoriaDesdeBD);
    } catch (error) {
      console.error('Error en listarCategorias:', error);
      throw error;
    }
  },

  /**
   * ATAJO PARA EL SELECTOR DEL PRODUCTOMODAL (CRUD 1 <-> CRUD 4).
   * Sólo categorías activas: no tiene sentido clasificar un producto nuevo
   * en una categoría dada de baja.
   */
  async listarCategoriasActivas() {
    return await this.listarCategorias(true);
  },

  /** Obtener una categoría por su identificador. */
  async obtenerCategoriaPorId(idCategoria) {
    try {
      const respuesta = await clienteApi.get(`/categorias/${idCategoria}`);
      return mapearCategoriaDesdeBD(respuesta.data.categoria);
    } catch (error) {
      if (error.codigoHttp === 404) return null;
      console.error('Error en obtenerCategoriaPorId:', error);
      throw error;
    }
  },

  /** CREAR CATEGORÍA (CRUD 4). */
  async crearCategoria(datosCategoria) {
    try {
      const respuesta = await clienteApi.post('/categorias', {
        nombre_categoria: (datosCategoria?.nombre_categoria ?? datosCategoria?.nombre ?? '').trim()
      });

      return {
        mensaje: respuesta.data.mensaje,
        categoria: mapearCategoriaDesdeBD(respuesta.data.categoria)
      };
    } catch (error) {
      console.error('Error en crearCategoria:', error);
      throw error;
    }
  },

  /** ACTUALIZAR (renombrar) UNA CATEGORÍA. */
  async actualizarCategoria(idCategoria, datosActualizados) {
    try {
      const respuesta = await clienteApi.put(`/categorias/${idCategoria}`, {
        nombre_categoria: (datosActualizados?.nombre_categoria ?? datosActualizados?.nombre ?? '').trim()
      });

      return {
        mensaje: respuesta.data.mensaje,
        categoria: mapearCategoriaDesdeBD(respuesta.data.categoria)
      };
    } catch (error) {
      console.error('Error en actualizarCategoria:', error);
      throw error;
    }
  },

  /**
   * BAJA LÓGICA DE LA CATEGORÍA (DELETE -> estado = 0).
   *
   * PROPÓSITO TÉCNICO: el backend nunca borra la fila; sólo cambia el estado,
   * preservando la integridad referencial con `producto.id_categoria`.
   */
  async desactivarCategoria(idCategoria) {
    try {
      const respuesta = await clienteApi.delete(`/categorias/${idCategoria}`);
      return respuesta.data;
    } catch (error) {
      console.error('Error en desactivarCategoria:', error);
      throw error;
    }
  },

  /** REACTIVAR UNA CATEGORÍA (estado = 1). */
  async reactivarCategoria(idCategoria) {
    try {
      const respuesta = await clienteApi.patch(`/categorias/${idCategoria}/reactivar`);
      return respuesta.data;
    } catch (error) {
      console.error('Error en reactivarCategoria:', error);
      throw error;
    }
  }
};
