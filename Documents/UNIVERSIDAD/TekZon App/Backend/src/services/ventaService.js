/**
 * ==========================================================================
 * SERVICIO DE VENTA DIRECTA (ventaService.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Lógica de negocio (Business Logic Layer) · Módulo 3 (Mostrador)
 *
 * PROPÓSITO FUNCIONAL:
 *   Implementa la venta rápida a clientes que vienen únicamente a comprar
 *   artículos electrónicos, cumpliendo paso a paso el requisito:
 *
 *     1. Se registran los datos del cliente (se reutiliza su ficha si ya existe).
 *     2. Se seleccionan los productos (carrito del mostrador).
 *     3. Al confirmar, cada producto se resta del inventario y se guarda el
 *        movimiento del kádex marcado como "Venta".
 *     4. Se procesa el pago, se registra el modo de pago y el monto total, y
 *        se emite la factura.
 *
 * PROPÓSITO TÉCNICO:
 *   Concentra las validaciones de negocio (carrito no vacío, cantidades
 *   enteras, consolidación de líneas repetidas, coherencia del monto cobrado)
 *   y delega la escritura atómica en `VentaModel.registrarVentaCompleta`.
 *
 *   REUTILIZACIÓN: para el cobro se usa la MISMA función `validarDatosPago` que
 *   el módulo de Servicio Técnico, y para el cliente la MISMA
 *   `ClienteService.buscarOCrearCliente`. Así los tres módulos comparten una
 *   única fuente de verdad de las reglas de facturación.
 * ==========================================================================
 */
import { VentaModel } from '../models/ventaModel.js';
import { CajaModel } from '../models/cajaModel.js';
import { ProductoModel } from '../models/productoModel.js';
import { ErrorNegocio } from '../utils/erroresNegocio.js';
import { ClienteService, normalizarCedula } from './clienteService.js';
import { validarDatosPago, METODOS_PAGO } from './ordenServiceTecnicoService.js';

/** Limpia un texto (quita espacios externos). */
const limpiarTexto = (valor) => String(valor ?? '').trim();

/** Cantidad máxima de unidades por línea (control de errores de tecleo). */
const CANTIDAD_MAXIMA_POR_LINEA = 10000;

export const VentaService = {
  /* ======================================================================
   * 1. CONSULTAS
   * ====================================================================== */

  /**
   * LISTA DE VENTAS (histórico de facturación del mostrador).
   * Filtros: ?texto=&cedula=&fechaDesde=&fechaHasta=
   */
  async obtenerVentas(filtros = {}) {
    const texto = limpiarTexto(filtros.texto ?? filtros.busqueda);
    const cedulaCruda = limpiarTexto(filtros.cedula ?? filtros.cedula_cli);

    // La cédula se normaliza para que coincida con lo almacenado en la base.
    const cedula = cedulaCruda ? normalizarCedula(cedulaCruda) : undefined;

    return await VentaModel.listarVentas({
      texto: texto || undefined,
      cedula,
      fechaDesde: limpiarTexto(filtros.fechaDesde) || undefined,
      fechaHasta: limpiarTexto(filtros.fechaHasta) || undefined
    });
  },

  /** FICHA COMPLETA DE UNA VENTA (factura + líneas + pago). */
  async obtenerVentaPorFactura(num_factura) {
    const facturaLimpia = limpiarTexto(num_factura).toUpperCase();

    if (!facturaLimpia) {
      throw new ErrorNegocio('Debe indicar el número de factura.', 400);
    }

    const ventaCompleta = await VentaModel.obtenerVentaCompleta(facturaLimpia);

    if (!ventaCompleta) {
      throw new ErrorNegocio(`No existe la factura "${facturaLimpia}" en el sistema.`, 404);
    }

    return ventaCompleta;
  },

  /** INDICADORES DEL MOSTRADOR (tarjetas KPI de la pantalla de ventas). */
  async obtenerIndicadores() {
    return await VentaModel.obtenerIndicadoresVentas();
  },

  /** PRODUCTOS MÁS VENDIDOS (informe del mostrador). */
  async obtenerProductosMasVendidos(limite) {
    const cantidad = Number(limite) || 10;

    return await VentaModel.listarProductosMasVendidos(cantidad);
  },

  /* ======================================================================
   * 2. NORMALIZACIÓN DEL CARRITO
   * ====================================================================== */

  /**
   * VALIDA Y CONSOLIDA LAS LÍNEAS DEL CARRITO.
   *
   * PROPÓSITO FUNCIONAL: el usuario puede agregar el mismo producto dos veces
   * (por ejemplo, pulsando dos veces el botón "agregar"). Consolidar las líneas
   * repetidas en una sola es indispensable porque `detalle_factura` tiene una
   * llave primaria COMPUESTA (num_factura, cod_producto): dos filas con el
   * mismo producto provocarían un error de llave duplicada.
   *
   * @param {Array} productos Carrito recibido del frontend.
   * @returns {Array<{cod_producto: string, cantidad: number}>} Carrito limpio.
   */
  consolidarCarrito(productos) {
    if (!Array.isArray(productos) || productos.length === 0) {
      throw new ErrorNegocio(
        'Debe agregar al menos un producto para registrar la venta.',
        400
      );
    }

    // Mapa auxiliar: código de producto -> cantidad acumulada.
    const cantidadesPorProducto = new Map();

    for (const linea of productos) {
      const cod_producto = limpiarTexto(
        linea?.cod_producto ?? linea?.codigo ?? linea?.producto
      );

      if (!cod_producto) {
        throw new ErrorNegocio(
          'Cada línea de la venta debe indicar el código del producto.',
          400
        );
      }

      const cantidad = Number(linea?.cantidad);

      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        throw new ErrorNegocio(
          `La cantidad del producto "${cod_producto}" debe ser un número entero mayor que cero.`,
          400
        );
      }

      if (cantidad > CANTIDAD_MAXIMA_POR_LINEA) {
        throw new ErrorNegocio(
          `La cantidad del producto "${cod_producto}" supera el máximo permitido `
          + `(${CANTIDAD_MAXIMA_POR_LINEA} unidades por línea).`,
          400
        );
      }

      // Se acumula la cantidad si el producto ya estaba en el carrito.
      const cantidadAcumulada = (cantidadesPorProducto.get(cod_producto) || 0) + cantidad;

      cantidadesPorProducto.set(cod_producto, cantidadAcumulada);
    }

    // Se convierte el mapa al arreglo que espera el modelo.
    return Array.from(cantidadesPorProducto.entries()).map(([cod_producto, cantidad]) => ({
      cod_producto,
      cantidad
    }));
  },

  /* ======================================================================
   * 3. REGISTRO DE LA VENTA
   * ====================================================================== */

  /**
   * REGISTRA UNA VENTA DIRECTA COMPLETA (Mostrador).
   *
   * PROPÓSITO FUNCIONAL (requisito del módulo 3):
   *   Cliente + productos + consumo de inventario + pago + factura, en una sola
   *   operación de mostrador.
   *
   * @param {Object} datosEntrada Payload del formulario de Venta Directa.
   * @param {Object} usuarioAutenticado Usuario de la sesión (cajero/administrador).
   */
  async registrarVenta(datosEntrada, usuarioAutenticado) {
    // ---- 1. Cliente: se registra si es nuevo, se reutiliza si ya existe ----
    const cedula_cli = normalizarCedula(
      datosEntrada?.cedula_cli ?? datosEntrada?.cedula ?? datosEntrada?.cliente?.cedula
    );

    const { cliente, esNuevo: esClienteNuevo } = await ClienteService.buscarOCrearCliente({
      cedula_cli,
      nombre_cliente: datosEntrada?.nombre_cliente ?? datosEntrada?.nombre,
      apellido_cliente: datosEntrada?.apellido_cliente ?? datosEntrada?.apellido,
      telefono_cliente: datosEntrada?.telefono_cliente ?? datosEntrada?.telefono,
      direccion_cli: datosEntrada?.direccion_cli ?? datosEntrada?.direccion
    });

    // ---- 2. Carrito de productos ----
    const carritoConsolidado = this.consolidarCarrito(
      datosEntrada?.productos ?? datosEntrada?.carrito ?? datosEntrada?.detalle
    );

    // ---- 3. Usuario que factura (firma la FK de `venta.id_usuario`) ----
    const id_usuario = Number(usuarioAutenticado?.id_usuario);

    if (!Number.isInteger(id_usuario) || id_usuario <= 0) {
      throw new ErrorNegocio('No se pudo identificar al usuario que registra la venta.', 401);
    }

    // ---- 4. Caja abierta donde se registra el dinero ----
    const idCajaRecibida = Number(datosEntrada?.id_caja ?? datosEntrada?.caja);

    const caja = Number.isInteger(idCajaRecibida) && idCajaRecibida > 0
      ? await CajaModel.obtenerPorId(idCajaRecibida)
      : await CajaModel.obtenerCajaAbierta(id_usuario);

    if (!caja) {
      throw new ErrorNegocio(
        'No tienes una caja abierta para registrar el cobro. Abre tu caja en el módulo de Caja.',
        400
      );
    }

    if (caja.estado !== 'ABIERTA') {
      throw new ErrorNegocio(
        `La caja seleccionada (id ${caja.id_caja}) está cerrada. Seleccione una caja abierta.`,
        400
      );
    }

    if (Number(caja.id_usuario) !== id_usuario && usuarioAutenticado?.tipo_usuario !== 'administrador') {
      throw new ErrorNegocio(
        `La caja N° ${caja.id_caja} pertenece a otro usuario. Solo puedes operar tu propia caja activa.`,
        403
      );
    }

    /*
     * ---- 5. IMPORTE TOTAL PROVISIONAL ----
     * Se calcula con el precio del catálogo para poder validar el monto que
     * envía el formulario. El importe DEFINITIVO se vuelve a calcular dentro de
     * la transacción del modelo (leyendo los precios con la fila bloqueada), y
     * la factura se emite con ESE valor. Así nunca se factura un precio
     * manipulado desde el navegador.
     */
    let montoProvisional = 0;

    for (const linea of carritoConsolidado) {
      const producto = await ProductoModel.obtenerPorCodigo(linea.cod_producto);

      if (!producto) {
        throw new ErrorNegocio(
          `No existe el producto con código "${linea.cod_producto}" en el catálogo.`,
          404
        );
      }

      if (Number(producto.estado) !== 1) {
        throw new ErrorNegocio(
          `El producto "${producto.nombre_producto}" está inactivo: no se puede vender.`,
          400
        );
      }

      if (Number(producto.existencia) < linea.cantidad) {
        throw new ErrorNegocio(
          `Stock insuficiente para "${producto.nombre_producto}". `
          + `Disponible: ${producto.existencia} u., solicitado: ${linea.cantidad} u.`,
          400
        );
      }

      montoProvisional += Number(producto.precio_venta) * linea.cantidad;
    }

    montoProvisional = Number(montoProvisional.toFixed(2));

    // ---- 6. Validación del pago contra el total calculado ----
    const datosPagoValidados = validarDatosPago(
      datosEntrada?.pago ?? datosEntrada,
      montoProvisional
    );

    // ---- 7. Escritura transaccional: factura + stock + kádex + alertas + pago ----
    const resultado = await VentaModel.registrarVentaCompleta({
      cedula_cli: cliente.cedula_cli,
      productos: carritoConsolidado,
      metodo_pago: datosPagoValidados.metodo_pago,
      tasa_cambio: datosPagoValidados.tasa_cambio,
      referencia: datosPagoValidados.referencia,
      id_usuario,
      id_caja: caja.id_caja
    });

    // ---- 8. Traducción de los resultados del modelo a errores HTTP ----
    if (resultado.productoNoEncontrado) {
      throw new ErrorNegocio(
        `No existe el producto con código "${resultado.cod_producto}" en el catálogo.`,
        404
      );
    }

    if (resultado.productoInactivo) {
      throw new ErrorNegocio(
        `El producto "${resultado.nombre_producto}" está inactivo: no se puede vender.`,
        400
      );
    }

    if (resultado.stockInsuficiente) {
      throw new ErrorNegocio(
        `Stock insuficiente para "${resultado.nombre_producto}". `
        + `Disponible: ${resultado.existenciaDisponible} u., solicitado: ${resultado.cantidadSolicitada} u.`,
        400
      );
    }

    // ---- 9. Documento de la venta (factura completa para imprimir) ----
    const documentoVenta = await VentaModel.obtenerVentaCompleta(resultado.num_factura);

    // Importe en bolívares según la tasa aplicada.
    const totalBolivares = Number((resultado.monto_total * datosPagoValidados.tasa_cambio).toFixed(2));

    /*
     * ---- 10. MENSAJE Y ALERTAS DE STOCK ----
     * Las alertas que disparó el descuento se devuelven en la misma respuesta
     * para que el frontend las muestre INMEDIATAMENTE (Toast rojo) sin esperar
     * a que el usuario recargue la pantalla.
     */
    let mensaje = `Venta registrada. Factura ${resultado.num_factura} emitida por `
      + `${resultado.monto_total.toFixed(2)} USD (Bs. ${totalBolivares.toFixed(2)}) `
      + `pagada en ${datosPagoValidados.metodo_pago}. `
      + `Se descontaron ${resultado.productos_descontados.length} producto(s) del inventario `
      + 'con movimiento de SALIDA de origen "Venta".';

    if (esClienteNuevo) {
      mensaje += ` Se registró al cliente nuevo ${cliente.nombre_cliente} ${cliente.apellido_cliente}.`;
    }

    if (resultado.alertas.length > 0) {
      mensaje += ` ¡ATENCIÓN! ${resultado.alertas[0].mensaje}`;
    }

    return {
      ...documentoVenta,
      /*
       * `movimientos` es un resumen explícito de los asientos que generó la
       * venta en el kádex (uno por producto, con origen 'VENTA' y la traza de
       * existencia previa/posterior). El frontend lo muestra en el comprobante
       * y en el aviso de "consumo de inventario" tras facturar.
       */
      movimientos: resultado.productos_descontados,
      factura: {
        numero_factura: resultado.num_factura,
        cedula_cli: cliente.cedula_cli,
        nombre_cliente: `${cliente.nombre_cliente} ${cliente.apellido_cliente}`,
        fecha: new Date().toISOString(),
        monto_total: resultado.monto_total,
        tasa_cambio: datosPagoValidados.tasa_cambio,
        total_bolivares: totalBolivares,
        metodo_pago: datosPagoValidados.metodo_pago,
        referencia: datosPagoValidados.referencia,
        id_caja: caja.id_caja
      },
      alertas: resultado.alertas,
      esClienteNuevo,
      mensaje
    };
  },

  /* ======================================================================
   * 4. ANULACIÓN
   * ====================================================================== */

  /**
   * ANULA UNA FACTURA DE VENTA Y DEVUELVE LOS PRODUCTOS AL INVENTARIO.
   *
   * PROPÓSITO FUNCIONAL: la factura no se borra nunca (documento contable): se
   * marca como anulada (estado = 0) y el stock regresa al almacén con su asiento
   * de ENTRADA auditado en el kádex.
   */
  async anularVenta(num_factura, datosAnulacion, usuarioAutenticado) {
    const facturaLimpia = limpiarTexto(num_factura).toUpperCase();

    if (!facturaLimpia) {
      throw new ErrorNegocio('Debe indicar el número de factura a anular.', 400);
    }

    // El motivo es obligatorio: toda reversión de una venta debe justificarse.
    const motivo = limpiarTexto(datosAnulacion?.motivo);

    if (!motivo) {
      throw new ErrorNegocio(
        'El motivo de la anulación es obligatorio: toda devolución debe quedar justificada.',
        400
      );
    }

    const id_usuario = Number(usuarioAutenticado?.id_usuario);

    if (!Number.isInteger(id_usuario) || id_usuario <= 0) {
      throw new ErrorNegocio('No se pudo identificar al usuario que anula la venta.', 401);
    }

    const resultado = await VentaModel.anularVenta(facturaLimpia, id_usuario, motivo);

    if (resultado.ventaNoEncontrada) {
      throw new ErrorNegocio(`No existe la factura "${facturaLimpia}" en el sistema.`, 404);
    }

    if (resultado.ventaYaAnulada) {
      throw new ErrorNegocio(`La factura "${facturaLimpia}" ya se encontraba anulada.`, 400);
    }

    return {
      ...resultado,
      mensaje: `Factura ${resultado.num_factura} anulada. `
        + `Se devolvieron ${resultado.productos_devueltos.length} producto(s) al inventario `
        + 'con movimiento de ENTRADA auditado en el kádex.'
    };
  },

  /** Lista de métodos de pago admitidos (la usa el frontend para el selector). */
  obtenerMetodosPago() {
    return METODOS_PAGO;
  }
};

export default VentaService;
