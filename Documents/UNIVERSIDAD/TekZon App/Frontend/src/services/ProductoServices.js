/**
 * ==========================================================================
 * SERVICIO DE PRODUCTOS (PRODUCTOSERVICES.JS)
 * ==========================================================================
 * Orquesta las peticiones HTTP y mapea los datos (DTO) para que coincidan
 * con las columnas exactas de la base de datos relacional.
 */
import clienteApi from './apiClient';

export default {
  // 1. Obtener y adaptar los datos para el Frontend
  async listarProductos() {
    const respuesta = await clienteApi.get('/productos');
    
    // Convertimos lo que viene de la BD al formato que usa Vue
    return respuesta.data.map(p => ({
      codigo: p.cod_producto,
      nombre: p.nombre_producto,
      categoria: p.id_categoria, // Ahora usamos el ID
      marca: p.marca,
      costo: parseFloat(p.precio_costo),
      precio: parseFloat(p.precio_venta),
      stock: p.existencia,
      minimo: p.stock_minimo,
      imagen: p.imagen,
      descripcion: p.descripcion
    }));
  },

  // 2. Crear producto: Mapeo de Vue hacia la Base de Datos
  async crearProducto(datosFormulario) {
    const payloadBD = {
      cod_producto: datosFormulario.codigo,
      nombre_producto: datosFormulario.nombre,
      id_categoria: datosFormulario.categoria, // 1, 2 o 3
      marca: datosFormulario.marca,
      precio_costo: datosFormulario.costo,
      precio_venta: datosFormulario.precio,
      existencia: datosFormulario.stock,
      stock_minimo: datosFormulario.minimo,
      imagen: datosFormulario.imagen,
      descripcion: datosFormulario.descripcion
    };

    // Enviamos payloadBD (traducido) y NO datosFormulario
    const respuesta = await clienteApi.post('/productos', payloadBD);
    return respuesta.data;
  },

  // 3. Actualizar producto: Mapeo de Vue hacia la Base de Datos
  async actualizarProducto(codigoProducto, datosActualizados) {
    const payloadBD = {
      cod_producto: datosActualizados.codigo,
      nombre_producto: datosActualizados.nombre,
      id_categoria: datosActualizados.categoria,
      marca: datosActualizados.marca,
      precio_costo: datosActualizados.costo,
      precio_venta: datosActualizados.precio,
      existencia: datosActualizados.stock,
      stock_minimo: datosActualizados.minimo,
      imagen: datosActualizados.imagen,
      descripcion: datosActualizados.descripcion
    };

    const respuesta = await clienteApi.put(`/productos/${codigoProducto}`, payloadBD);
    return respuesta.data;
  },

  // 4. Eliminar
  async eliminarProducto(codigoProducto) {
  const respuesta = await clienteApi.delete(`/productos/${codigoProducto}`);
  return respuesta.data;
}
};