/**
 * ==========================================================================
 * UTILIDADES DE SEGURIDAD (utilidadesSeguridad.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Utilidades transversales (usadas por el módulo de autenticación)
 *
 * PROPÓSITO FUNCIONAL:
 *   Resuelve las dos necesidades criptográficas del Módulo de Usuario (LOGIN)
 *   sin agregar dependencias externas al proyecto:
 *
 *     1. `encriptarContrasenia` / `verificarContrasenia`
 *        Guardan la contraseña como un HASH irreversible (nunca en texto plano)
 *        usando el algoritmo SCRYPT, que es el recomendado por Node.js para
 *        contraseñas porque es deliberadamente costoso en CPU y memoria.
 *
 *     2. `generarTokenSesion` / `verificarTokenSesion`
 *        Emiten y validan un token de sesión con el mismo formato de un JWT
 *        (cabecera.cuerpo.firma en Base64URL) firmado con HMAC-SHA256, de modo
 *        que el cliente Vue pueda guardarlo y enviarlo en cada petición.
 *
 * PROPÓSITO TÉCNICO:
 *   - `crypto.scryptSync` deriva la clave con una SAL aleatoria por usuario.
 *     El valor almacenado tiene el formato:  scrypt$<sal_hex>$<hash_hex>
 *     La sal viaja dentro del propio texto, por lo que no hace falta una
 *     columna adicional en la tabla `usuario`.
 *   - La comparación de hashes se hace con `timingSafeEqual` para evitar
 *     ataques de temporización (comparación en tiempo constante).
 *   - El token incluye `exp` (expiración) y se firma con `JWT_SECRETO`
 *     leído del archivo .env. La firma garantiza que el cliente NO pueda
 *     alterar el rol ni el identificador del usuario.
 * ==========================================================================
 */
import crypto from 'crypto';

/** Coste del algoritmo scrypt: 2^14 = 16384 iteraciones (equilibrio CPU/seguridad). */
const COSTO_SCRYPT = 16384;
/** Longitud en bytes de la clave derivada. */
const LONGITUD_CLAVE = 64;
/** Etiqueta que identifica el formato del hash almacenado en la base de datos. */
const ETIQUETA_HASH = 'scrypt';

/** Vigencia del token de sesión: 8 horas (una jornada laboral). */
const HORAS_VIGENCIA_TOKEN = 8;

/**
 * Clave secreta para firmar los tokens.
 * En un entorno real SIEMPRE debe venir del .env; si falta, se usa una clave
 * de desarrollo y se advierte por consola para no bloquear el arranque
 * académico del sistema.
 */
const obtenerClaveSecreta = () => {
  const clave = process.env.JWT_SECRETO;

  if (!clave) {
    console.warn(
      '[SEGURIDAD] La variable JWT_SECRETO no está definida en el .env. '
      + 'Se usa una clave de desarrollo: NO usar así en producción.'
    );
    return 'tekzon-clave-de-desarrollo-ads433';
  }

  return clave;
};

/** Convierte un texto plano a Base64URL (formato seguro para URLs y tokens). */
const aBase64Url = (texto) => Buffer.from(texto).toString('base64url');

/** Convierte un objeto a Base64URL de su representación JSON. */
const objetoABase64Url = (objeto) => aBase64Url(JSON.stringify(objeto));

/**
 * CIFRA UNA CONTRASEÑA con scrypt y una sal aleatoria.
 * @param {string} contraseniaPlana Contraseña tal como la escribió el usuario.
 * @returns {string} Cadena con formato `scrypt$sal$hash`.
 */
export const encriptarContrasenia = (contraseniaPlana) => {
  // La sal es distinta para cada usuario: dos contraseñas iguales producen
  // hashes diferentes, lo que impide ataques con tablas precalculadas.
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(contraseniaPlana), sal, LONGITUD_CLAVE, {
    N: COSTO_SCRYPT
  });

  return `${ETIQUETA_HASH}$${sal.toString('hex')}$${hash.toString('hex')}`;
};

/**
 * VERIFICA UNA CONTRASEÑA contra el hash guardado en `usuario.contrasenia_usuario`.
 *
 * PROPÓSITO TÉCNICO: se reutiliza la MISMA sal que se guardó con el hash, se
 * recalcula el hash de la contraseña recibida y se comparan ambos en tiempo
 * constante. Devuelve `false` ante cualquier formato inválido o heredado
 * (por ejemplo las contraseñas en texto plano sembradas antes de esta fase),
 * de modo que el sistema nunca autentique por accidente un texto plano.
 *
 * @param {string} contraseniaPlana Contraseña recibida en el formulario.
 * @param {string} hashAlmacenado   Valor de la columna contrasenia_usuario.
 * @returns {boolean} true si la contraseña es correcta.
 */
export const verificarContrasenia = (contraseniaPlana, hashAlmacenado) => {
  if (!contraseniaPlana || !hashAlmacenado) return false;

  const partes = String(hashAlmacenado).split('$');

  // El formato debe ser exactamente: scrypt $ sal $ hash
  if (partes.length !== 3 || partes[0] !== ETIQUETA_HASH) return false;

  const [, salHex, hashHex] = partes;

  try {
    const sal = Buffer.from(salHex, 'hex');
    const hashGuardado = Buffer.from(hashHex, 'hex');

    // Se recalcula el hash con la sal recuperada.
    const hashCalculado = crypto.scryptSync(String(contraseniaPlana), sal, hashGuardado.length, {
      N: COSTO_SCRYPT
    });

    // Comparación en tiempo constante: evita filtrar información por el tiempo
    // de respuesta del servidor.
    return crypto.timingSafeEqual(hashCalculado, hashGuardado);
  } catch {
    // Sal o hash corruptos: se rechaza el acceso de forma segura.
    return false;
  }
};

/**
 * GENERA UN TOKEN DE SESIÓN firmado (formato JWT HS256).
 *
 * @param {Object} datosUsuario Datos que viajan dentro del token.
 * @param {number} datosUsuario.id_usuario  Identificador del usuario.
 * @param {string} datosUsuario.username    Nombre de usuario.
 * @param {string} datosUsuario.rol         Tipo de rol (administrador).
 * @returns {string} Token `cabecera.cuerpo.firma`.
 */
export const generarTokenSesion = ({ id_usuario, username, rol }) => {
  const cabecera = { alg: 'HS256', typ: 'JWT' };

  // Marca de tiempo de emisión y de expiración (en segundos, como un JWT real).
  const ahoraSegundos = Math.floor(Date.now() / 1000);
  const cuerpo = {
    sub: id_usuario,                 // Sujeto: a quién pertenece el token
    usuario: username,               // Nombre de usuario legible
    rol,                             // Rol para el control de permisos
    iat: ahoraSegundos,              // Emitido en
    exp: ahoraSegundos + (HORAS_VIGENCIA_TOKEN * 3600) // Expira en
  };

  const cabeceraCodificada = objetoABase64Url(cabecera);
  const cuerpoCodificado = objetoABase64Url(cuerpo);

  // La firma cubre cabecera y cuerpo: si el cliente altera un solo carácter
  // del cuerpo, la firma deja de coincidir y el token se rechaza.
  const contenidoAFirmar = `${cabeceraCodificada}.${cuerpoCodificado}`;
  const firma = crypto
    .createHmac('sha256', obtenerClaveSecreta())
    .update(contenidoAFirmar)
    .digest('base64url');

  return `${contenidoAFirmar}.${firma}`;
};

/**
 * VERIFICA UN TOKEN DE SESIÓN y devuelve su contenido.
 *
 * PROPÓSITO TÉCNICO: valida las tres cosas que pueden fallar en un token:
 *   1. Que su estructura sea la esperada (tres segmentos).
 *   2. Que la firma HMAC coincida (nadie manipuló el contenido).
 *   3. Que no haya expirado (`exp` mayor que la hora actual).
 *
 * @param {string} token Token recibido en el encabezado Authorization.
 * @returns {Object|null} Contenido del token, o `null` si no es válido.
 */
export const verificarTokenSesion = (token) => {
  if (!token) return null;

  const partes = String(token).split('.');

  if (partes.length !== 3) return null;

  const [cabeceraCodificada, cuerpoCodificado, firmaRecibida] = partes;

  // ---- 1. Se recalcula la firma esperada y se compara en tiempo constante ----
  const firmaEsperada = crypto
    .createHmac('sha256', obtenerClaveSecreta())
    .update(`${cabeceraCodificada}.${cuerpoCodificado}`)
    .digest('base64url');

  const bufferEsperado = Buffer.from(firmaEsperada);
  const bufferRecibido = Buffer.from(firmaRecibida);

  // Longitudes distintas => comparación imposible => token inválido.
  if (bufferEsperado.length !== bufferRecibido.length) return null;

  if (!crypto.timingSafeEqual(bufferEsperado, bufferRecibido)) return null;

  // ---- 2. Se decodifica el cuerpo del token ----
  let contenido;
  try {
    contenido = JSON.parse(Buffer.from(cuerpoCodificado, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  // ---- 3. Se comprueba la expiración ----
  const ahoraSegundos = Math.floor(Date.now() / 1000);

  if (Number(contenido.exp) <= ahoraSegundos) return null;

  return contenido;
};

/**
 * Extrae el token del encabezado `Authorization: Bearer <token>`.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export const extraerTokenDePeticion = (req) => {
  const encabezado = req.headers?.authorization || '';

  if (!encabezado.toLowerCase().startsWith('bearer ')) return null;

  return encabezado.slice(7).trim() || null;
};
