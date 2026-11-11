/**
 * ==========================================================================
 * MODELO DE USUARIO (usuarioModel.js) - TEKZON C.A.
 * ==========================================================================
 * CAPA: Acceso a datos (Data Access Layer) · Módulo 1 (LOGIN) & Configuración
 *
 * PROPÓSITO FUNCIONAL:
 *   Ejecuta las consultas SQL sobre la tabla `usuario` y su tabla de roles
 *   `rol_usuario`, que es el corazón del sistema de autenticación y gestión
 *   de usuarios:
 *
 *     · `usuario.username`             -> nombre de acceso (único).
 *     · `usuario.contrasenia_usuario`  -> HASH scrypt (nunca texto plano).
 *     · `usuario.id_rolusuario`        -> FK hacia `rol_usuario`.
 *     · `rol_usuario.tipo_usuario`     -> administrador, tecnico, almacenista, cajero.
 *     · `usuario.estado`               -> baja lógica (1 activo / 0 inactivo).
 *     · `usuario.pendiente_aprobacion` -> 1 esperando aprobación, 0 aprobado.
 *
 * PROPÓSITO TÉCNICO:
 *   · `buscarCredencialesPorUsername` es la ÚNICA consulta que devuelve la
 *     columna del hash; se usa exclusivamente para verificar la contraseña
 *     dentro del servicio de autenticación y NUNCA se envía al frontend.
 *   · El resto de consultas devuelven la ficha pública del usuario mediante
 *     `COLUMNAS_USUARIO_PUBLICAS`, garantizando que el hash no se filtre por
 *     accidente en una respuesta JSON.
 * ==========================================================================
 */
import pool from '../config/db.js';

/**
 * Columnas que SÍ pueden viajar al frontend.
 * Nótese que `contrasenia_usuario` NO aparece aquí: es la salvaguarda que
 * impide exponer el hash en cualquier respuesta de la API.
 */
const COLUMNAS_USUARIO_PUBLICAS = `
  u.id_usuario,
  u.id_rolusuario,
  u.nombre_usuario,
  u.username,
  u.estado,
  u.ultimo_acceso,
  u.pendiente_aprobacion,
  COALESCE(r.tipo_usuario, 'Sin asignar') AS tipo_usuario
`;

export const UsuarioModel = {
  /**
   * Recupera la ficha pública de un usuario por su llave primaria.
   * La usa el middleware de sesión en cada petición protegida.
   */
  async obtenerPorId(id_usuario) {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_USUARIO_PUBLICAS}
         FROM usuario u
         LEFT JOIN rol_usuario r ON r.id_rolusuario = u.id_rolusuario
        WHERE u.id_usuario = ?`,
      [id_usuario]
    );

    return filas[0];
  },

  /**
   * Recupera la ficha pública de un usuario por su nombre de acceso.
   */
  async obtenerPorUsername(username) {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_USUARIO_PUBLICAS}
         FROM usuario u
         LEFT JOIN rol_usuario r ON r.id_rolusuario = u.id_rolusuario
        WHERE u.username = ?`,
      [username]
    );

    return filas[0];
  },

  /**
   * BUSCA LAS CREDENCIALES COMPLETAS PARA EL INICIO DE SESIÓN.
   *
   * PROPÓSITO TÉCNICO: es la única consulta del sistema que trae el hash de la
   * contraseña (`contrasenia_usuario`). El servicio de autenticación la usa para
   * comparar con `verificarContrasenia` y el objeto resultante nunca se
   * serializa directamente hacia el cliente.
   *
   * @param {string} username Nombre de acceso escrito en el formulario.
   */
  async buscarCredencialesPorUsername(username) {
    const [filas] = await pool.query(
      `SELECT u.id_usuario,
              u.id_rolusuario,
              u.nombre_usuario,
              u.username,
              u.contrasenia_usuario,
              u.estado,
              u.ultimo_acceso,
              u.pendiente_aprobacion,
              COALESCE(r.tipo_usuario, 'Sin asignar') AS tipo_usuario
         FROM usuario u
         LEFT JOIN rol_usuario r ON r.id_rolusuario = u.id_rolusuario
        WHERE u.username = ?
        LIMIT 1`,
      [username]
    );

    return filas[0];
  },

  /**
   * Registra la marca de tiempo del último acceso correcto.
   */
  async registrarUltimoAcceso(id_usuario) {
    await pool.query(
      'UPDATE usuario SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id_usuario = ?',
      [id_usuario]
    );
  },

  /**
   * Lista los usuarios del sistema (pantalla de administración/configuración).
   * Nunca incluye el hash de la contraseña.
   */
  async listarUsuarios() {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_USUARIO_PUBLICAS}
         FROM usuario u
         LEFT JOIN rol_usuario r ON r.id_rolusuario = u.id_rolusuario
        ORDER BY u.id_usuario ASC`
    );

    return filas;
  },

  /**
   * Lista únicamente los usuarios pendientes de aprobación por el Administrador.
   */
  async listarPendientes() {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_USUARIO_PUBLICAS}
         FROM usuario u
         LEFT JOIN rol_usuario r ON r.id_rolusuario = u.id_rolusuario
        WHERE u.pendiente_aprobacion = 1
        ORDER BY u.id_usuario DESC`
    );

    return filas;
  },

  /**
   * Cuenta cuántos usuarios están esperando aprobación por el Administrador.
   */
  async contarPendientes() {
    const [filas] = await pool.query(
      'SELECT COUNT(*) AS total FROM usuario WHERE pendiente_aprobacion = 1'
    );

    return Number(filas[0]?.total || 0);
  },

  /**
   * Inserta un nuevo usuario en la base de datos y retorna su ficha pública.
   */
  async crearUsuario({ nombre_usuario, username, contrasenia_usuario, id_rolusuario = null, estado = 1, pendiente_aprobacion = 0 }) {
    const [resultado] = await pool.query(
      `INSERT INTO usuario (
         nombre_usuario,
         username,
         contrasenia_usuario,
         id_rolusuario,
         estado,
         pendiente_aprobacion
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        nombre_usuario,
        username,
        contrasenia_usuario,
        id_rolusuario,
        estado,
        pendiente_aprobacion
      ]
    );

    return this.obtenerPorId(resultado.insertId);
  },

  /**
   * Actualiza los datos informativos y rol de un usuario existente.
   */
  async actualizarUsuario(id_usuario, { nombre_usuario, username, id_rolusuario }) {
    await pool.query(
      `UPDATE usuario
          SET nombre_usuario = ?,
              username = ?,
              id_rolusuario = ?
        WHERE id_usuario = ?`,
      [nombre_usuario, username, id_rolusuario, id_usuario]
    );

    return this.obtenerPorId(id_usuario);
  },

  /**
   * Cambia el estado de activación (habilitar / deshabilitar) de un usuario.
   */
  async cambiarEstado(id_usuario, nuevoEstado) {
    const [resultado] = await pool.query(
      'UPDATE usuario SET estado = ? WHERE id_usuario = ?',
      [nuevoEstado, id_usuario]
    );

    return resultado.affectedRows > 0;
  },

  /**
   * Aprueba a un usuario pendiente asignándole su rol correspondiente y activándolo.
   */
  async aprobarUsuario(id_usuario, id_rolusuario) {
    const [resultado] = await pool.query(
      `UPDATE usuario
          SET id_rolusuario = ?,
              pendiente_aprobacion = 0,
              estado = 1
        WHERE id_usuario = ?`,
      [id_rolusuario, id_usuario]
    );

    return resultado.affectedRows > 0;
  },

  /**
   * Rechaza y elimina un usuario que estaba en estado pendiente de aprobación.
   */
  async rechazarUsuario(id_usuario) {
    const [resultado] = await pool.query(
      'DELETE FROM usuario WHERE id_usuario = ? AND pendiente_aprobacion = 1',
      [id_usuario]
    );

    return resultado.affectedRows > 0;
  },

  /**
   * Actualiza el hash de la contraseña de un usuario.
   */
  async cambiarContrasenia(id_usuario, hashContrasenia) {
    const [resultado] = await pool.query(
      'UPDATE usuario SET contrasenia_usuario = ? WHERE id_usuario = ?',
      [hashContrasenia, id_usuario]
    );

    return resultado.affectedRows > 0;
  },

  /**
   * Elimina un usuario definitivamente si no tiene historial asociado.
   */
  async eliminarUsuario(id_usuario) {
    const [resultado] = await pool.query(
      'DELETE FROM usuario WHERE id_usuario = ?',
      [id_usuario]
    );

    return resultado.affectedRows > 0;
  },

  /**
   * Comprueba si un username ya está en uso, ignorando opcionalmente un ID de usuario.
   */
  async existeUsername(username, excluirIdUsuario = null) {
    let consulta = 'SELECT id_usuario FROM usuario WHERE username = ?';
    const parametros = [username];

    if (excluirIdUsuario) {
      consulta += ' AND id_usuario != ?';
      parametros.push(excluirIdUsuario);
    }

    consulta += ' LIMIT 1';
    const [filas] = await pool.query(consulta, parametros);

    return filas.length > 0;
  },

  /**
   * Obtiene la lista de todos los roles configurados en el sistema.
   */
  async listarRoles() {
    const [filas] = await pool.query(
      'SELECT id_rolusuario, tipo_usuario FROM rol_usuario ORDER BY id_rolusuario ASC'
    );

    return filas;
  },

  /**
   * Verifica la existencia de un usuario por su ID.
   */
  async existeUsuario(id_usuario) {
    const [filas] = await pool.query(
      'SELECT 1 FROM usuario WHERE id_usuario = ? LIMIT 1',
      [id_usuario]
    );

    return filas.length > 0;
  }
};

export default UsuarioModel;
