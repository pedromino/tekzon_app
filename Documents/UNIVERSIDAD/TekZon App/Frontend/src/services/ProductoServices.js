/**
 * ==========================================================================
 * SERVICIO DE PRODUCTOS (ProductoServices.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Consumo de API REST · CRUD 1 (Catálogo Maestro de Productos)
 *
 * PROPÓSITO FUNCIONAL:
 *   Encapsula todas las peticiones HTTP relacionadas con el catálogo de
 *   productos y traduce (mapeo DTO) las columnas de MySQL al modelo que usan
 *   los componentes de Vue, y viceversa.
 *
 * PROPÓSITO TÉCNICO:
 *   - CERO datos simulados: cada método realiza una petición real al backend
 *     y la totalidad de la información proviene de la base `tekzon_bd`.
 *   - Todo método asíncrono está envuelto en `try/catch` y RELANZA un error
 *     normalizado ({ mensaje, codigoHttp }) que las páginas consumen para
 *     activar el estado de Error de la interfaz.
 *   - La CREACIÓN no envía `existencia`: el backend inicializa el stock en 0
 *     por diseño (corrección docente).
 * ==========================================================================
 */
import clienteApi from './apiClient';

/**
 * Traduce una fila de la tabla `producto` al modelo de vista del frontend.
 * Se conservan AMBAS nomenclaturas (corta para Vue y larga de MySQL) para que
 * ningún componente tenga que saber cómo se llama la columna física.
 */
const mapearProductoDesdeBD = (producto) => ({
  // --- Nomenclatura del frontend ---
  codigo: producto.cod_producto,
  nombre: producto.nombre_producto,
  costo: Number(producto.precio_costo || 0),
  precio: Number(producto.precio_venta || 0),
  existencia: Number(producto.existencia || 0),
  minimo: Number(producto.stock_minimo || 0),
  categoria: producto.id_categoria,
  // --- Nomenclatura original de MySQL (para tablas y depuración) ---
  cod_producto: producto.cod_producto,
  nombre_producto: producto.nombre_producto,
  precio_costo: Number(producto.precio_costo || 0),
  precio_venta: Number(producto.precio_venta || 0),
  stock_minimo: Number(producto.stock_minimo || 0),
  id_categoria: producto.id_categoria,
  nombre_categoria: producto.nombre_categoria || 'Sin categoría',
  // --- Atributos comunes ---
  marca: producto.marca || '',
  descripcion: producto.descripcion || '',
  imagen: producto.imagen || 'pantalla.jpg',
  estado: Number(producto.estado ?? 1),
  // Valorización calculada en el cliente para los KPI del catálogo.
  valorCosto: Number(producto.existencia || 0) * Number(producto.precio_costo || 0),
  valorVenta: Number(producto.existencia || 0) * Number(producto.precio_venta || 0)
});

/**
 * Traduce el formulario de Vue al payload que espera el backend.
 *
 * IMPORTANTE: se omite deliberadamente el campo `existencia`/`stock`.
 * El formulario de alta ya no captura el stock y el backend lo ignora.
 */
const mapearProductoHaciaBD = (datosFormulario) => ({
  cod_producto: datosFormulario.codigo ?? datosFormulario.cod_producto,
  nombre_producto: datosFormulario.nombre ?? datosFormulario.nombre_producto,
  precio_costo: Number(datosFormulario.costo ?? datosFormulario.precio_costo ?? 0),
  precio_venta: Number(datosFormulario.precio ?? datosFormulario.precio_venta ?? 0),
  id_categoria: Number(datosFormulario.categoria ?? datosFormulario.id_categoria),
  marca: datosFormulario.marca,
  descripcion: datosFormulario.descripcion,
  imagen: datosFormulario.imagen || 'pantalla.jpg',
  stock_minimo: Number(datosFormulario.minimo ?? datosFormulario.stock_minimo ?? 0)
  // NO se envía `existencia`: el stock se gestiona en los CRUDs 2 y 3.
});

export default {
  /**
   * LISTAR CATÁLOGO (CRUD 1).
   * @param {boolean} incluirInactivos - true para ver también las bajas lógicas.
   * @returns {Promise<Array>} Lista de productos ya mapeados.
   */
  async listarProductos(incluirInactivos = false) {
    try {
      const respuesta = await clienteApi.get('/productos', {
        params: { incluirInactivos: incluirInactivos ? 'true' : 'false' }
      });

      // El backend responde { exito, total, productos: [...] }.
      const listaProductos = respuesta.data?.productos ?? [];

      return listaProductos.map(mapearProductoDesdeBD);
    } catch (error) {
      console.error('Error en listarProductos:', error);
      throw error;
    }
  },

  /**
   * OBTENER UN PRODUCTO POR CÓDIGO.
   * Devuelve `null` cuando el backend responde 404, en lugar de lanzar, para
   * que el llamador decida el mensaje.
   */
  async obtenerProductoPorCodigo(codigoProducto) {
    try {
      const respuesta = await clienteApi.get(`/productos/${encodeURIComponent(codigoProducto)}`);
      return mapearProductoDesdeBD(respuesta.data.producto);
    } catch (error) {
      if (error.codigoHttp === 404) return null;
      console.error('Error en obtenerProductoPorCodigo:', error);
      throw error;
    }
  },

  /**
   * CREAR PRODUCTO (CRUD 1).
   * El stock NO se envía: nace en 0 en la base de datos.
   */
  async crearProducto(datosFormulario) {
    try {
      const respuesta = await clienteApi.post('/productos', mapearProductoHaciaBD(datosFormulario));
      return {
        mensaje: respuesta.data.mensaje,
        producto: mapearProductoDesdeBD(respuesta.data.producto)
      };
    } catch (error) {
      console.error('Error en crearProducto:', error);
      throw error;
    }
  },

  /**
   * ACTUALIZAR PRODUCTO (CRUD 1).
   * Tampoco envía existencia: el stock sólo cambia por los CRUDs 2 y 3.
   */
  async actualizarProducto(codigoProducto, datosActualizados) {
    try {
      const respuesta = await clienteApi.put(
        `/productos/${encodeURIComponent(codigoProducto)}`,
        mapearProductoHaciaBD(datosActualizados)
      );

      return {
        mensaje: respuesta.data.mensaje,
        producto: mapearProductoDesdeBD(respuesta.data.producto)
      };
    } catch (error) {
      console.error('Error en actualizarProducto:', error);
      throw error;
    }
  },

  /**
   * BAJA LÓGICA DEL PRODUCTO (CRUD 1).
   * El backend ejecuta UPDATE estado = 0 para no romper las claves foráneas
   * del kádex.
   */
  async eliminarProducto(codigoProducto) {
    try {
      const respuesta = await clienteApi.delete(`/productos/${encodeURIComponent(codigoProducto)}`);
      return respuesta.data;
    } catch (error) {
      console.error('Error en eliminarProducto:', error);
      throw error;
    }
  },

  /** REACTIVAR un producto dado de baja lógica. */
  async reactivarProducto(codigoProducto) {
    try {
      const respuesta = await clienteApi.patch(
        `/productos/${encodeURIComponent(codigoProducto)}/reactivar`
      );
      return respuesta.data;
    } catch (error) {
      console.error('Error en reactivarProducto:', error);
      throw error;
    }
  }
};
