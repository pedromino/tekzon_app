/**
 * ==========================================================================
 * SERVICIO DE DISPOSITIVOS (dispositivoService.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Lógica de negocio (Business Logic Layer) · Módulo 2 (Recepción)
 *
 * PROPÓSITO FUNCIONAL:
 *   Registra las CARACTERÍSTICAS DEL EQUIPO que el cliente trae al taller,
 *   como paso previo a la apertura de la Orden de Servicio Técnico:
 *
 *     nombre_dis    -> "Laptop", "Teléfono", "Impresora"
 *     marca         -> "HP", "Samsung", "Epson"
 *     modelo        -> "Pavilion 15", "Galaxy A54"
 *     numero_serie  -> identificador de fábrica (IMEI / Service Tag)
 *
 * PROPÓSITO TÉCNICO:
 *   · `nombre_dis` y `marca` son obligatorios: sin ellos el técnico no sabe qué
 *     equipo está revisando.
 *   · Si el cliente trae un equipo YA registrado (mismo número de serie), el
 *     servicio REUTILIZA la ficha existente para que todas sus reparaciones
 *     queden en el mismo historial en lugar de repartirse entre duplicados.
 * ==========================================================================
 */
import { DispositivoModel } from '../models/dispositivoModel.js';
import { ClienteModel } from '../models/clienteModel.js';
import { ErrorNegocio } from '../utils/erroresNegocio.js';

/** Longitudes máximas según el DDL de la tabla `dispositivo`. */
const LONGITUD_MAXIMA_NOMBRE = 50;
const LONGITUD_MAXIMA_MARCA = 50;
const LONGITUD_MAXIMA_MODELO = 50;
const LONGITUD_MAXIMA_SERIE = 100;

/** Limpia un texto (quita espacios externos). */
const limpiarTexto = (valor) => String(valor ?? '').trim();

/**
 * VALIDA Y NORMALIZA LAS CARACTERÍSTICAS DEL DISPOSITIVO.
 * El `numero_serie` se guarda en MAYÚSCULAS para que la comparación de equipos
 * repetidos no falle por diferencias de escritura (abc123 vs ABC123).
 */
const validarDatosDispositivo = (datosEntrada) => {
  const nombre_dis = limpiarTexto(datosEntrada?.nombre_dis ?? datosEntrada?.nombre_dispositivo);
  const marca = limpiarTexto(datosEntrada?.marca);
  const modelo = limpiarTexto(datosEntrada?.modelo);
  const numero_serie = limpiarTexto(
    datosEntrada?.numero_serie ?? datosEntrada?.serial ?? datosEntrada?.imei
  ).toUpperCase();

  if (!nombre_dis) {
    throw new ErrorNegocio(
      'Debe indicar qué tipo de dispositivo es (por ejemplo: Laptop, Teléfono, Impresora).',
      400
    );
  }

  if (nombre_dis.length > LONGITUD_MAXIMA_NOMBRE) {
    throw new ErrorNegocio(`El tipo de dispositivo no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres.`, 400);
  }

  if (!marca) {
    throw new ErrorNegocio('La marca del dispositivo es obligatoria.', 400);
  }

  if (marca.length > LONGITUD_MAXIMA_MARCA) {
    throw new ErrorNegocio(`La marca no puede superar los ${LONGITUD_MAXIMA_MARCA} caracteres.`, 400);
  }

  if (modelo.length > LONGITUD_MAXIMA_MODELO) {
    throw new ErrorNegocio(`El modelo no puede superar los ${LONGITUD_MAXIMA_MODELO} caracteres.`, 400);
  }

  if (numero_serie.length > LONGITUD_MAXIMA_SERIE) {
    throw new ErrorNegocio(`El número de serie no puede superar los ${LONGITUD_MAXIMA_SERIE} caracteres.`, 400);
  }

  return { nombre_dis, marca, modelo, numero_serie };
};

/**
 * Comprueba que el cliente propietario exista antes de asociarle un equipo.
 * La FK `fk_dispositivo_cliente1` lo exige.
 */
const verificarClienteExistente = async (cedula_cli) => {
  const cliente = await ClienteModel.obtenerPorCedula(cedula_cli);

  if (!cliente) {
    throw new ErrorNegocio(
      `No existe el cliente con cédula "${cedula_cli}". Registre primero al cliente.`,
      404
    );
  }

  return cliente;
};

export const DispositivoService = {
  /** LISTA DE DISPOSITIVOS con búsqueda libre y filtro por propietario. */
  async obtenerDispositivos(filtros = {}) {
    const texto = limpiarTexto(filtros.texto ?? filtros.busqueda);
    const cedula_cli = limpiarTexto(filtros.cedula_cli ?? filtros.cedula);

    return await DispositivoModel.listarDispositivos({
      texto: texto || undefined,
      cedula_cli: cedula_cli || undefined
    });
  },

  /** OBTIENE UN DISPOSITIVO POR ID O LANZA 404. */
  async obtenerDispositivoPorId(id_dispositivo) {
    const idNumerico = Number(id_dispositivo);

    if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
      throw new ErrorNegocio('El identificador del dispositivo no es válido.', 400);
    }

    const dispositivo = await DispositivoModel.obtenerPorId(idNumerico);

    if (!dispositivo) {
      throw new ErrorNegocio(`No existe el dispositivo con id ${idNumerico}.`, 404);
    }

    return dispositivo;
  },

  /**
   * REGISTRA UN DISPOSITIVO NUEVO ASOCIADO A UN CLIENTE.
   *
   * PROPÓSITO FUNCIONAL: se usa desde la pantalla de Dispositivos. A diferencia
   * de la recepción (que reutiliza el equipo si ya existe), aquí el usuario está
   * dando de alta un equipo de forma deliberada, por lo que se informa el
   * conflicto si el serial ya pertenece a ese mismo cliente.
   */
  async crearDispositivo(datosEntrada) {
    // Se acepta la cédula tanto en la raíz del payload como anidada.
    const cedulaRecibida = datosEntrada?.cedula_cli
      ?? datosEntrada?.cedula
      ?? datosEntrada?.cliente?.cedula_cli
      ?? datosEntrada?.cliente?.cedula;

    const cedula_cli = limpiarTexto(cedulaRecibida).toUpperCase();

    if (!cedula_cli) {
      throw new ErrorNegocio('Debe indicar la cédula del propietario del dispositivo.', 400);
    }

    const datosDispositivo = validarDatosDispositivo(datosEntrada);

    // Interconexión con el módulo de clientes (FK obligatoria).
    await verificarClienteExistente(cedula_cli);

    // Regla: un mismo número de serie no puede repetirse para el mismo cliente.
    if (datosDispositivo.numero_serie) {
      const dispositivoDuplicado = await DispositivoModel.buscarPorSerieYCliente(
        datosDispositivo.numero_serie,
        cedula_cli
      );

      if (dispositivoDuplicado) {
        throw new ErrorNegocio(
          `El cliente ya tiene registrado un equipo con el número de serie `
          + `"${datosDispositivo.numero_serie}" (id ${dispositivoDuplicado.id_dispositivo}).`,
          409
        );
      }
    }

    return await DispositivoModel.crearDispositivo({ cedula_cli, ...datosDispositivo });
  },

  /**
   * ACTUALIZA LAS CARACTERÍSTICAS DE UN EQUIPO.
   * No permite cambiar de propietario: para eso existe `transferirPropietario`.
   */
  async actualizarDispositivo(id_dispositivo, datosEntrada) {
    // Se valida la existencia (lanza 404 si no está).
    const dispositivoActual = await this.obtenerDispositivoPorId(id_dispositivo);

    const datosDispositivo = validarDatosDispositivo(datosEntrada);

    // Si cambia el serial, se comprueba que no choque con otro equipo del mismo
    // cliente (se excluye el propio dispositivo que se está editando).
    if (
      datosDispositivo.numero_serie
      && datosDispositivo.numero_serie !== dispositivoActual.numero_serie
    ) {
      const dispositivoDuplicado = await DispositivoModel.buscarPorSerieYCliente(
        datosDispositivo.numero_serie,
        dispositivoActual.cedula_cli
      );

      if (dispositivoDuplicado && Number(dispositivoDuplicado.id_dispositivo) !== Number(dispositivoActual.id_dispositivo)) {
        throw new ErrorNegocio(
          `Ya existe otro equipo del mismo cliente con el número de serie "${datosDispositivo.numero_serie}".`,
          409
        );
      }
    }

    const dispositivoActualizado = await DispositivoModel.actualizarDispositivo(
      dispositivoActual.id_dispositivo,
      datosDispositivo
    );

    if (!dispositivoActualizado) {
      throw new ErrorNegocio(`No existe el dispositivo con id ${id_dispositivo}.`, 404);
    }

    return dispositivoActualizado;
  },

  /**
   * TRANSFIERE UN EQUIPO A OTRO CLIENTE (venta de segunda mano, cambio de
   * titular). Se valida que el nuevo propietario exista.
   */
  async transferirPropietario(id_dispositivo, cedulaRecibida) {
    const dispositivoActual = await this.obtenerDispositivoPorId(id_dispositivo);

    const cedula_cli = limpiarTexto(cedulaRecibida).toUpperCase();

    if (!cedula_cli) {
      throw new ErrorNegocio('Debe indicar la cédula del nuevo propietario.', 400);
    }

    const nuevoPropietario = await verificarClienteExistente(cedula_cli);

    const dispositivoTransferido = await DispositivoModel.transferirPropietario(
      dispositivoActual.id_dispositivo,
      cedula_cli
    );

    return {
      dispositivo: dispositivoTransferido,
      mensaje: `Dispositivo transferido a ${nuevoPropietario.nombre_cliente} ${nuevoPropietario.apellido_cliente}.`
    };
  },

  /**
   * ELIMINA UN DISPOSITIVO SÓLO SI NO TIENE ÓRDENES DE SERVICIO.
   *
   * PROPÓSITO FUNCIONAL: el historial de reparaciones es documentación técnica
   * y contable del taller. Si el equipo tiene órdenes, se responde 409 Conflict
   * con el conteo exacto para que el usuario entienda el motivo.
   */
  async eliminarDispositivo(id_dispositivo) {
    const dispositivo = await this.obtenerDispositivoPorId(id_dispositivo);

    const totalOrdenes = await DispositivoModel.contarOrdenes(dispositivo.id_dispositivo);

    if (totalOrdenes > 0) {
      throw new ErrorNegocio(
        `No se puede eliminar el equipo "${dispositivo.nombre_dis} ${dispositivo.marca}": `
        + `tiene ${totalOrdenes} orden(es) de servicio técnico asociada(s).`,
        409
      );
    }

    await DispositivoModel.eliminarDispositivo(dispositivo.id_dispositivo);

    return {
      id_dispositivo: dispositivo.id_dispositivo,
      mensaje: `Dispositivo "${dispositivo.nombre_dis} ${dispositivo.marca}" eliminado correctamente.`
    };
  }
};

export default DispositivoService;
