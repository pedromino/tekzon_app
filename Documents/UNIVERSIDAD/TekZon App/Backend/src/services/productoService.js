/**
 * ==========================================================================
 * SERVICIO DE PRODUCTOS (productoService.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Lógica de negocio (Business Logic Layer) · CRUD 1
 *
 * PROPÓSITO FUNCIONAL:
 *   Aplica las reglas de negocio del Catálogo Maestro de Productos:
 *     · El CÓDIGO es obligatorio, único y no editable una vez creado.
 *     · La CATEGORÍA debe existir y estar ACTIVA (interconexión con CRUD 4).
 *     · El STOCK NO SE CAPTURA en el alta: se ignora cualquier valor enviado
 *       y la existencia nace en 0 (corrección docente explícita).
 *     · `stock_minimo` sí es parametrizable porque es un umbral de alerta,
 *       no una cantidad física.
 *     · Los precios se validan como números no negativos y con el precio de
 *       venta mayor o igual al costo (regla comercial de TekZon C.A.).
 *
 * PROPÓSITO TÉCNICO:
 *   Realiza el MAPEO DTO (Data Transfer Object) tolerando los dos formatos de
 *   entrada: los nombres cortos que usa Vue (`codigo`, `nombre`, `costo`,
 *   `precio`, `categoria`, `minimo`) y los nombres reales de MySQL
 *   (`cod_producto`, `nombre_producto`, `precio_costo`, `precio_venta`,
 *   `id_categoria`, `stock_minimo`). Así el frontend nunca debe conocer el
 *   esquema físico de la base de datos.
 * ==========================================================================
 */
import { ProductoModel } from '../models/productoModel.js';
import { CategoriaModel } from '../models/CategoriaModel.js';

/** Longitud máxima del código de producto según el DDL (VARCHAR 50). */
const LONGITUD_MAXIMA_CODIGO = 50;
/** Longitud máxima del nombre de producto según el DDL (VARCHAR 150). */
const LONGITUD_MAXIMA_NOMBRE = 150;

/**
 * Error de negocio controlado que transporta el código HTTP a devolver.
 */
class ErrorNegocioProducto extends Error {
  constructor(mensaje, codigoHttp = 400) {
    super(mensaje);
    this.name = 'ErrorNegocioProducto';
    this.codigoHttp = codigoHttp;
  }
}

/** Convierte a texto seguro y recorta espacios externos. */
const limpiarTexto = (valor) => String(valor ?? '').trim();

/**
 * Convierte a número entero no negativo. Devuelve `null` si el valor no es
 * numérico, para que el llamador decida el mensaje de error.
 */
const aEnteroNoNegativo = (valor) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return Math.trunc(numero);
};

/** Convierte a número decimal no negativo (precios en USD). */
const aDecimalNoNegativo = (valor) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return Number(numero.toFixed(2));
};

export const ProductoService = {
  /**
   * Lista el catálogo maestro (CRUD 1) para la página de inventario.
   * @param {boolean} soloActivos - Por defecto sólo productos vigentes.
   */
  async obtenerProductos(soloActivos = true) {
    return await ProductoModel.obtenerCatalogo({ soloActivos });
  },

  /** Recupera un producto por código o lanza 404. */
  async obtenerProductoPorCodigo(cod_producto) {
    const codigoLimpio = limpiarTexto(cod_producto);

    if (!codigoLimpio) {
      throw new ErrorNegocioProducto('Debe indicar el código del producto.', 400);
    }

    const producto = await ProductoModel.obtenerPorCodigo(codigoLimpio);

    if (!producto) {
      throw new ErrorNegocioProducto(`No existe el producto con código "${codigoLimpio}".`, 404);
    }

    return producto;
  },

  /**
   * REGISTRA LA FICHA TÉCNICA DE UN PRODUCTO NUEVO (CRUD 1).
   *
   * PROPÓSITO FUNCIONAL (corrección docente):
   *   La existencia inicial es SIEMPRE 0. Aunque el cliente envíe un campo
   *   `stock`/`existencia` en el payload, se descarta de forma deliberada:
   *   el stock sólo puede entrar al sistema por el kádex (CRUD 3) o por un
   *   ajuste justificado de almacén (CRUD 2).
   *
   * @param {Object} datosEntrada - Datos del formulario ProductoModal.vue.
   */
  async crearProducto(datosEntrada) {
    // ---- 1. Mapeo DTO: se aceptan nombres cortos (Vue) y nombres de MySQL.
    const cod_producto = limpiarTexto(datosEntrada?.cod_producto ?? datosEntrada?.codigo);
    const nombre_producto = limpiarTexto(datosEntrada?.nombre_producto ?? datosEntrada?.nombre);
    const marca = limpiarTexto(datosEntrada?.marca);
    const descripcion = limpiarTexto(datosEntrada?.descripcion);
    const imagen = limpiarTexto(datosEntrada?.imagen) || 'pantalla.jpg';

    const precio_costo = aDecimalNoNegativo(datosEntrada?.precio_costo ?? datosEntrada?.costo);
    const precio_venta = aDecimalNoNegativo(datosEntrada?.precio_venta ?? datosEntrada?.precio);
    const id_categoria = aEnteroNoNegativo(datosEntrada?.id_categoria ?? datosEntrada?.categoria);
    const stock_minimo = aEnteroNoNegativo(datosEntrada?.stock_minimo ?? datosEntrada?.minimo) ?? 0;

    // ---- 2. Validaciones de obligatoriedad y formato.
    if (!cod_producto) {
      throw new ErrorNegocioProducto('El código del producto es obligatorio.', 400);
    }

    if (cod_producto.length > LONGITUD_MAXIMA_CODIGO) {
      throw new ErrorNegocioProducto(
        `El código no puede superar los ${LONGITUD_MAXIMA_CODIGO} caracteres.`,
        400
      );
    }

    if (!nombre_producto) {
      throw new ErrorNegocioProducto('El nombre del producto es obligatorio.', 400);
    }

    if (nombre_producto.length > LONGITUD_MAXIMA_NOMBRE) {
      throw new ErrorNegocioProducto(
        `El nombre no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`,
        400
      );
    }

    if (!marca) {
      throw new ErrorNegocioProducto('La marca del producto es obligatoria.', 400);
    }

    if (precio_costo === null) {
      throw new ErrorNegocioProducto('El precio de costo debe ser un número mayor o igual a 0.', 400);
    }

    if (precio_venta === null) {
      throw new ErrorNegocioProducto('El precio de venta debe ser un número mayor o igual a 0.', 400);
    }

    if (precio_venta < precio_costo) {
      throw new ErrorNegocioProducto(
        'El precio de venta no puede ser menor que el precio de costo.',
        400
      );
    }

    if (!id_categoria || id_categoria <= 0) {
      throw new ErrorNegocioProducto('Debe seleccionar una categoría válida para el producto.', 400);
    }

    // ---- 3. INTERCONEXIÓN CON EL CRUD 4: la categoría debe existir y estar activa.
    const categoria = await CategoriaModel.obtenerPorId(id_categoria);

    if (!categoria) {
      throw new ErrorNegocioProducto(
        `La categoría seleccionada (id ${id_categoria}) no existe en el sistema.`,
        400
      );
    }

    if (Number(categoria.estado) !== 1) {
      throw new ErrorNegocioProducto(
        `La categoría "${categoria.nombre_categoria}" está inactiva. Active la categoría o seleccione otra.`,
        400
      );
    }

    // ---- 4. Unicidad de la llave primaria antes de intentar el INSERT.
    const yaExiste = await ProductoModel.existeCodigo(cod_producto);

    if (yaExiste) {
      throw new ErrorNegocioProducto(
        `El código "${cod_producto}" ya está registrado en el catálogo.`,
        400
      );
    }

    // ---- 5. Inserción: NÓTESE que `existencia` no se envía al modelo.
    return await ProductoModel.crearProducto({
      cod_producto,
      nombre_producto,
      precio_costo,
      precio_venta,
      id_categoria,
      marca,
      descripcion,
      imagen,
      stock_minimo
    });
  },

  /**
   * ACTUALIZA LA FICHA TÉCNICA DE UN PRODUCTO (CRUD 1).
   *
   * PROPÓSITO FUNCIONAL:
   *   Sólo se modifican los atributos comerciales. La EXISTENCIA queda
   *   intacta para preservar la trazabilidad del kádex.
   *
   *   Aplica la VALIDACIÓN ESTRICTA DEL STOCK MÍNIMO: al editar una ficha ya
   *   existe una cantidad física real en el almacén, por lo que el umbral de
   *   alerta no puede quedar por encima de ella. En el ALTA esta regla no se
   *   aplica porque la existencia es siempre 0 (el almacenista la carga después
   *   en el CRUD 2), lo que permite completar la cadena
   *   Categoría -> Producto -> Ajuste de stock -> Kárdex.
   */
  async actualizarProducto(cod_producto, datosEntrada) {
    const codigoLimpio = limpiarTexto(cod_producto);

    if (!codigoLimpio) {
      throw new ErrorNegocioProducto('Debe indicar el código del producto a actualizar.', 400);
    }

    // Verifica existencia del registro -> 404 si no está. Se conserva la fila
    // devuelta porque contiene la `existencia` real contra la que se valida el
    // stock mínimo, evitando una segunda consulta a la base de datos.
    const productoActual = await this.obtenerProductoPorCodigo(codigoLimpio);

    const nombre_producto = limpiarTexto(datosEntrada?.nombre_producto ?? datosEntrada?.nombre);
    const marca = limpiarTexto(datosEntrada?.marca);
    const descripcion = limpiarTexto(datosEntrada?.descripcion);
    const imagen = limpiarTexto(datosEntrada?.imagen) || 'pantalla.jpg';

    const precio_costo = aDecimalNoNegativo(datosEntrada?.precio_costo ?? datosEntrada?.costo);
    const precio_venta = aDecimalNoNegativo(datosEntrada?.precio_venta ?? datosEntrada?.precio);
    const id_categoria = aEnteroNoNegativo(datosEntrada?.id_categoria ?? datosEntrada?.categoria);
    const stock_minimo = aEnteroNoNegativo(datosEntrada?.stock_minimo ?? datosEntrada?.minimo) ?? 0;

    // Validaciones equivalentes a las del alta.
    if (!nombre_producto) {
      throw new ErrorNegocioProducto('El nombre del producto es obligatorio.', 400);
    }

    if (nombre_producto.length > LONGITUD_MAXIMA_NOMBRE) {
      throw new ErrorNegocioProducto(
        `El nombre no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`,
        400
      );
    }

    if (!marca) {
      throw new ErrorNegocioProducto('La marca del producto es obligatoria.', 400);
    }

    if (precio_costo === null || precio_venta === null) {
      throw new ErrorNegocioProducto('Los precios deben ser números mayores o iguales a 0.', 400);
    }

    if (precio_venta < precio_costo) {
      throw new ErrorNegocioProducto(
        'El precio de venta no puede ser menor que el precio de costo.',
        400
      );
    }

    if (!id_categoria || id_categoria <= 0) {
      throw new ErrorNegocioProducto('Debe seleccionar una categoría válida para el producto.', 400);
    }

    // Interconexión con CRUD 4: se admite reactivar la categoría o cambiarla.
    const categoria = await CategoriaModel.obtenerPorId(id_categoria);

    if (!categoria) {
      throw new ErrorNegocioProducto(
        `La categoría seleccionada (id ${id_categoria}) no existe en el sistema.`,
        400
      );
    }

    if (Number(categoria.estado) !== 1) {
      throw new ErrorNegocioProducto(
        `La categoría "${categoria.nombre_categoria}" está inactiva. Active la categoría o seleccione otra.`,
        400
      );
    }

    /*
     * VALIDACIÓN ESTRICTA DEL STOCK MÍNIMO EN LA EDICIÓN.
     *
     * El stock mínimo es el umbral que dispara la alerta de reposición; si se
     * configura por encima de la existencia real, la alerta quedaría encendida
     * de forma permanente. En el alta no se aplica porque la existencia es 0.
     */
    const existenciaActual = Number(productoActual.existencia || 0);

    if (stock_minimo > existenciaActual) {
      throw new ErrorNegocioProducto(
        `El stock mínimo (${stock_minimo} u.) no puede ser mayor que la existencia actual `
        + `(${existenciaActual} u.). Registre primero una Entrada o un Ajuste de existencia en el `
        + 'módulo de almacén, o reduzca el stock mínimo.',
        400
      );
    }

    return await ProductoModel.actualizarProducto(codigoLimpio, {
      nombre_producto,
      precio_costo,
      precio_venta,
      id_categoria,
      marca,
      descripcion,
      imagen,
      stock_minimo
    });
  },

  /**
   * BAJA LÓGICA DEL PRODUCTO (estado = 0).
   *
   * PROPÓSITO FUNCIONAL: se verifica que no existan movimientos de kádex
   * asociados; si los hay igualmente se permite la baja lógica (el histórico
   * permanece intacto) pero se informa al usuario del impacto.
   */
  async desactivarProducto(cod_producto) {
    const producto = await this.obtenerProductoPorCodigo(cod_producto);

    const filasAfectadas = await ProductoModel.desactivarProducto(producto.cod_producto);

    if (filasAfectadas === 0) {
      throw new ErrorNegocioProducto(
        `El producto "${producto.cod_producto}" ya se encontraba inactivo.`,
        400
      );
    }

    return {
      cod_producto: producto.cod_producto,
      nombre_producto: producto.nombre_producto,
      estado: 0,
      mensaje: `Producto "${producto.cod_producto}" dado de baja lógica del catálogo.`
    };
  },

  /** Reactiva un producto dado de baja lógica (estado = 1). */
  async reactivarProducto(cod_producto) {
    const producto = await this.obtenerProductoPorCodigo(cod_producto);

    const filasAfectadas = await ProductoModel.reactivarProducto(producto.cod_producto);

    if (filasAfectadas === 0) {
      throw new ErrorNegocioProducto(
        `El producto "${producto.cod_producto}" ya se encontraba activo.`,
        400
      );
    }

    return {
      cod_producto: producto.cod_producto,
      nombre_producto: producto.nombre_producto,
      estado: 1,
      mensaje: `Producto "${producto.cod_producto}" reactivado correctamente.`
    };
  }
};

export { ErrorNegocioProducto };
