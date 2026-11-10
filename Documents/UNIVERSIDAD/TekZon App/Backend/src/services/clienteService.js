/**
 * ==========================================================================
 * SERVICIO DE CLIENTES (clienteService.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Lógica de negocio (Business Logic Layer) · Módulo 2 (Recepción)
 *
 * PROPÓSITO FUNCIONAL:
 *   Aplica las reglas de negocio de la cartera de clientes, que es la entrada
 *   común de los dos flujos comerciales (Servicio Técnico y Venta Directa):
 *
 *     · La CÉDULA es la llave de identificación del sistema y no se puede
 *       modificar una vez creado el cliente (es la PK referenciada por
 *       `dispositivo` y `venta`).
 *     · Nombre y apellido son OBLIGATORIOS: sin ellos la factura y la orden
 *       de servicio quedarían sin identificar al propietario.
 *     · La cédula se NORMALIZA a un formato único (V-12345678) para que
 *       "v12345678", "V-12.345.678" y "V-12345678" sean el mismo cliente y no
 *       se dupliquen registros por diferencias de escritura.
 *     · Un cliente con historial NO se elimina: se informa el conflicto.
 *
 * PROPÓSITO TÉCNICO:
 *   Capa que NO ejecuta SQL: valida, normaliza y delega en `ClienteModel`.
 *   Todos los fallos se lanzan como `ErrorNegocio` con su código HTTP.
 * ==========================================================================
 */
import { ClienteModel } from '../models/clienteModel.js';
import { ErrorNegocio } from '../utils/erroresNegocio.js';

/** Longitud máxima de la cédula según el DDL (VARCHAR 20). */
const LONGITUD_MAXIMA_CEDULA = 20;
/** Longitud máxima del nombre y del apellido (VARCHAR 150). */
const LONGITUD_MAXIMA_NOMBRE = 150;
/** Longitud máxima del teléfono (VARCHAR 30). */
const LONGITUD_MAXIMA_TELEFONO = 30;

/** Limpia un texto (quita espacios externos). */
const limpiarTexto = (valor) => String(valor ?? '').trim();

/**
 * NORMALIZA Y VALIDA UNA CÉDULA VENEZOLANA.
 *
 * PROPÓSITO FUNCIONAL: acepta las formas en que el usuario suele escribirla
 * (con puntos, con guion, en minúsculas, sin prefijo) y la devuelve SIEMPRE en
 * el formato canónico `V-12345678`, que es el que se guarda como llave primaria.
 *
 * @param {string} cedulaRecibida Texto escrito por el usuario.
 * @returns {string} Cédula normalizada y validada.
 * @throws {ErrorNegocio} 400 si el formato no corresponde a una cédula válida.
 */
export const normalizarCedula = (cedulaRecibida) => {
  const cedulaCruda = limpiarTexto(cedulaRecibida).toUpperCase();

  if (!cedulaCruda) {
    throw new ErrorNegocio('La cédula del cliente es obligatoria.', 400);
  }

  // 1) Se separa la letra del tipo (V, E, J, P) del cuerpo numérico.
  //    Si el usuario no escribió la letra, se asume V (venezolano).
  const coincidencia = cedulaCruda.match(/^([VEJPG]?)[\s\-.]*([\d.,\-]+)$/);

  if (!coincidencia) {
    throw new ErrorNegocio(
      'La cédula no tiene un formato válido. Use por ejemplo V-12345678.',
      400
    );
  }

  const tipoDocumento = coincidencia[1] || 'V';

  // 2) Se descartan puntos, comas y guiones del cuerpo numérico.
  const cuerpoNumerico = coincidencia[2].replace(/[.,\-]/g, '');

  if (!/^\d{5,9}$/.test(cuerpoNumerico)) {
    throw new ErrorNegocio(
      'El número de cédula debe contener entre 5 y 9 dígitos. Ejemplo: V-12345678.',
      400
    );
  }

  const cedulaNormalizada = `${tipoDocumento}-${cuerpoNumerico}`;

  if (cedulaNormalizada.length > LONGITUD_MAXIMA_CEDULA) {
    throw new ErrorNegocio(
      `La cédula no puede superar los ${LONGITUD_MAXIMA_CEDULA} caracteres.`,
      400
    );
  }

  return cedulaNormalizada;
};

/**
 * VALIDA LOS DATOS PERSONALES DEL CLIENTE (nombre, apellido, contacto).
 * @returns {Object} Datos limpios listos para guardar.
 */
export const validarDatosCliente = (datosEntrada) => {
  const nombre_cliente = limpiarTexto(datosEntrada?.nombre_cliente ?? datosEntrada?.nombre);
  const apellido_cliente = limpiarTexto(datosEntrada?.apellido_cliente ?? datosEntrada?.apellido);
  const telefono_cliente = limpiarTexto(
    datosEntrada?.telefono_cliente ?? datosEntrada?.telefono
  );
  const direccion_cli = limpiarTexto(datosEntrada?.direccion_cli ?? datosEntrada?.direccion);

  if (!nombre_cliente) {
    throw new ErrorNegocio('El nombre del cliente es obligatorio.', 400);
  }

  if (!apellido_cliente) {
    throw new ErrorNegocio('El apellido del cliente es obligatorio.', 400);
  }

  if (nombre_cliente.length > LONGITUD_MAXIMA_NOMBRE || apellido_cliente.length > LONGITUD_MAXIMA_NOMBRE) {
    throw new ErrorNegocio(
      `El nombre y el apellido no pueden superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`,
      400
    );
  }

  // El teléfono es opcional, pero si viene debe ser plausible.
  if (telefono_cliente) {
    if (telefono_cliente.length > LONGITUD_MAXIMA_TELEFONO) {
      throw new ErrorNegocio(
        `El teléfono no puede superar los ${LONGITUD_MAXIMA_TELEFONO} caracteres.`,
        400
      );
    }

    // Se admiten dígitos, espacios, guiones, paréntesis y el signo +.
    if (!/^[\d\s+()\-]{7,}$/.test(telefono_cliente)) {
      throw new ErrorNegocio(
        'El teléfono solo admite números, espacios, guiones y paréntesis (mínimo 7 dígitos).',
        400
      );
    }
  }

  return { nombre_cliente, apellido_cliente, telefono_cliente, direccion_cli };
};

export const ClienteService = {
  /** LISTA DE CLIENTES con búsqueda libre (pantalla de Clientes). */
  async obtenerClientes(filtros = {}) {
    const texto = limpiarTexto(filtros.texto ?? filtros.busqueda);

    return await ClienteModel.listarClientes({ texto: texto || undefined });
  },

  /**
   * OBTIENE UN CLIENTE POR CÉDULA O LANZA 404.
   * Acepta la cédula sin normalizar para que la URL sea tolerante.
   */
  async obtenerClientePorCedula(cedulaRecibida) {
    const cedulaNormalizada = normalizarCedula(cedulaRecibida);
    const cliente = await ClienteModel.obtenerPorCedula(cedulaNormalizada);

    if (!cliente) {
      throw new ErrorNegocio(
        `No existe el cliente con cédula "${cedulaNormalizada}" en el sistema.`,
        404
      );
    }

    return cliente;
  },

  /**
   * REGISTRA UN CLIENTE NUEVO.
   * Verifica la unicidad de la cédula ANTES de insertar, para responder 409
   * Conflict con un mensaje claro en lugar de un error 1062 del motor.
   */
  async crearCliente(datosEntrada) {
    const cedula_cli = normalizarCedula(datosEntrada?.cedula_cli ?? datosEntrada?.cedula);
    const datosPersonales = validarDatosCliente(datosEntrada);

    const yaExiste = await ClienteModel.existeCliente(cedula_cli);

    if (yaExiste) {
      throw new ErrorNegocio(
        `Ya existe un cliente registrado con la cédula "${cedula_cli}".`,
        409
      );
    }

    return await ClienteModel.crearCliente({ cedula_cli, ...datosPersonales });
  },

  /**
   * BUSCA UN CLIENTE O LO CREA SI NO EXISTE ("alta implícita").
   *
   * PROPÓSITO FUNCIONAL: es la operación que agiliza el MOSTRADOR y la
   * RECEPCIÓN. El administrador escribe la cédula y los datos; si el cliente ya
   * está registrado se reutiliza su ficha (no se pierde el historial) y si es
   * nuevo se crea en el momento, todo dentro de la misma operación de venta o
   * de apertura de orden.
   *
   * PROPÓSITO TÉCNICO: devuelve `{ cliente, esNuevo }` para que el servicio
   * llamador pueda informar en el mensaje final si el cliente se dio de alta.
   */
  async buscarOCrearCliente(datosEntrada) {
    const cedula_cli = normalizarCedula(datosEntrada?.cedula_cli ?? datosEntrada?.cedula);

    // ---- Caso 1: el cliente ya existe -> se reutiliza su ficha ----
    const clienteExistente = await ClienteModel.obtenerPorCedula(cedula_cli);

    if (clienteExistente) {
      return { cliente: clienteExistente, esNuevo: false };
    }

    // ---- Caso 2: es un cliente nuevo -> se valida y se registra ----
    const datosPersonales = validarDatosCliente(datosEntrada);

    const clienteCreado = await ClienteModel.crearCliente({ cedula_cli, ...datosPersonales });

    return { cliente: clienteCreado, esNuevo: true };
  },

  /**
   * ACTUALIZA LOS DATOS DE CONTACTO DE UN CLIENTE.
   * La cédula NO se modifica: es la llave referenciada por las ventas y los
   * dispositivos ya registrados.
   */
  async actualizarCliente(cedulaRecibida, datosEntrada) {
    const cedula_cli = normalizarCedula(cedulaRecibida);
    const datosPersonales = validarDatosCliente(datosEntrada);

    const clienteActualizado = await ClienteModel.actualizarCliente(cedula_cli, datosPersonales);

    if (!clienteActualizado) {
      throw new ErrorNegocio(
        `No existe el cliente con cédula "${cedula_cli}" en el sistema.`,
        404
      );
    }

    return clienteActualizado;
  },

  /** HISTORIAL DEL CLIENTE: equipos, facturas y órdenes de servicio. */
  async obtenerHistorial(cedulaRecibida) {
    // Reutiliza la validación de existencia del cliente (lanza 404 si no está).
    const cliente = await this.obtenerClientePorCedula(cedulaRecibida);

    const historial = await ClienteModel.obtenerHistorialCliente(cliente.cedula_cli);

    return { cliente, ...historial };
  },

  /**
   * ELIMINA UN CLIENTE SÓLO SI NO TIENE DOCUMENTOS ASOCIADOS.
   *
   * PROPÓSITO FUNCIONAL: se protege la integridad de la facturación y de las
   * órdenes. Si el cliente ya compró o tiene equipos en el taller, el sistema
   * responde 409 Conflict explicando por qué no puede borrarse, en lugar de
   * permitir un borrado en cascada que destruiría el histórico contable.
   */
  async eliminarCliente(cedulaRecibida) {
    const cedula_cli = normalizarCedula(cedulaRecibida);

    const cliente = await ClienteModel.obtenerPorCedula(cedula_cli);

    if (!cliente) {
      throw new ErrorNegocio(
        `No existe el cliente con cédula "${cedula_cli}" en el sistema.`,
        404
      );
    }

    const documentos = await ClienteModel.tieneDocumentosAsociados(cedula_cli);

    if (documentos.total_dispositivos > 0 || documentos.total_ventas > 0) {
      throw new ErrorNegocio(
        `No se puede eliminar al cliente "${cliente.nombre_cliente} ${cliente.apellido_cliente}": `
        + `tiene ${documentos.total_dispositivos} dispositivo(s) y ${documentos.total_ventas} venta(s) registradas.`,
        409
      );
    }

    await ClienteModel.eliminarCliente(cedula_cli);

    return {
      cedula_cli,
      mensaje: `Cliente "${cliente.nombre_cliente} ${cliente.apellido_cliente}" eliminado correctamente.`
    };
  }
};

export default ClienteService;
