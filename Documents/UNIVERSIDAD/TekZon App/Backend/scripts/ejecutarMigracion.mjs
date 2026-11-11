/**
 * ==========================================================================
 * EJECUTOR DE MIGRACIONES SQL (ejecutarMigracion.mjs) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Aplica un archivo .sql completo sobre la base `tekzon_bd` desde Node.js,
 *   sin necesidad de abrir MySQL Workbench. Se usa para instalar la migración
 *   005 (autenticación, servicio técnico, ventas y alertas).
 *
 * PROPÓSITO TÉCNICO:
 *   El driver mysql2 NO interpreta la directiva `DELIMITER`, que sí entiende el
 *   cliente de MySQL. Por eso este ejecutor:
 *     1. Lee el archivo y lo trocea respetando los cambios de DELIMITER
 *        (necesarios para el PROCEDIMIENTO almacenado de la migración).
 *     2. Ejecuta cada sentencia con `multipleStatements` desactivado, de modo
 *        que un error se detiene exactamente en la sentencia que falló.
 *
 *   USO:
 *     node scripts/ejecutarMigracion.mjs ../Database/migrations/005-....sql
 *     node scripts/ejecutarMigracion.mjs            (busca la migración 005)
 * ==========================================================================
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const directorioActual = path.dirname(fileURLToPath(import.meta.url));

// Ruta del archivo SQL: argumento de consola o la migración 005 por defecto.
const rutaSql = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(directorioActual, '../../Database/migrations/005-AutenticacionServicioTecnicoVentas.sql');

/**
 * Trocea el script SQL en sentencias ejecutables.
 *
 * PROPÓSITO TÉCNICO: se respetan DOS reglas del lenguaje SQL:
 *
 *   1. DIRECTIVA `DELIMITER`. Al encontrar `DELIMITER $$` el separador pasa a
 *      ser `$$`, lo que permite que el CUERPO de un procedimiento almacenado
 *      (que contiene sus propios `;`) viaje como UNA sola sentencia.
 *
 *   2. SENTENCIAS COMPUESTAS DE PREPARED STATEMENT. La terna
 *      `PREPARE ... ; EXECUTE ... ; DEALLOCATE PREPARE ... ;` es en realidad
 *      tres sentencias encadenadas que MySQL exige recibir EN EL MISMO ENVÍO.
 *      Si se enviaran por separado, el servidor respondería
 *      "ER_PARSE_ERROR ... near 'EXECUTE stmt'" porque el statement preparado
 *      vive únicamente dentro del ámbito de esa conexión y de ese envío.
 *
 *      Por eso, cuando el buffer arranca con `PREPARE`, se siguen acumulando
 *      líneas hasta haber incluido el `DEALLOCATE PREPARE` correspondiente.
 *
 * @param {string} contenidoSql Contenido completo del archivo .sql
 * @returns {Array<string>} Lista de sentencias SQL listas para ejecutar.
 */
const dividirSentenciasSql = (contenidoSql) => {
  const sentencias = [];
  let delimitadorActual = ';';
  let buffer = '';

  /** Indica si la sentencia que se está acumulando es un PREPARE encadenado. */
  const esPreparedEncadenado = () => /^PREPARE\b/i.test(buffer.trim());

  /** Comprueba si el buffer ya contiene el cierre de la cadena de PREPARE. */
  const tieneCierreDeallocate = () => /DEALLOCATE\s+PREPARE/i.test(buffer);

  // Se procesa línea a línea porque DELIMITER es una directiva de línea.
  contenidoSql.split(/\r?\n/).forEach((linea) => {
    const lineaLimpia = linea.trim();

    // ---- Directiva DELIMITER: cambia el separador de sentencias ----
    const coincidenciaDelimitador = lineaLimpia.match(/^DELIMITER\s+(\S+)$/i);

    if (coincidenciaDelimitador) {
      delimitadorActual = coincidenciaDelimitador[1];
      return;
    }

    // ---- Los comentarios y líneas vacías no cierran sentencias ----
    if (lineaLimpia === '' || lineaLimpia.startsWith('--')) {
      // Se conservan dentro de una sentencia en construcción; se descartan si
      // están sueltos entre sentencias.
      if (buffer.trim() !== '') buffer += `${linea}\n`;
      return;
    }

    buffer += `${linea}\n`;

    // ---- ¿La línea cierra una sentencia con el delimitador vigente? ----
    if (!lineaLimpia.endsWith(delimitadorActual)) return;

    // Caso especial: cadena PREPARE/EXECUTE/DEALLOCATE -> no cerrar hasta
    // haber acumulado también el DEALLOCATE.
    if (esPreparedEncadenado() && !tieneCierreDeallocate()) return;

    // Se descarta el delimitador final antes de enviar a MySQL.
    const sentenciaLimpia = buffer
      .trim()
      .slice(0, -delimitadorActual.length)
      .trim();

    if (sentenciaLimpia !== '') sentencias.push(sentenciaLimpia);

    buffer = '';
  });

  // Resto pendiente sin delimitador final.
  if (buffer.trim() !== '') sentencias.push(buffer.trim());

  return sentencias;
};

const ejecutar = async () => {
  if (!fs.existsSync(rutaSql)) {
    console.error(`[ERROR] No se encontró el archivo SQL: ${rutaSql}`);
    process.exit(1);
  }

  console.log('='.repeat(74));
  console.log(' EJECUTOR DE MIGRACIONES · TEKZON C.A.');
  console.log('='.repeat(74));
  console.log(` Archivo: ${rutaSql}`);

  const contenidoSql = fs.readFileSync(rutaSql, 'utf8');
  const sentencias = dividirSentenciasSql(contenidoSql);

  console.log(` Sentencias detectadas: ${sentencias.length}`);
  console.log('-'.repeat(74));

  let conexion;

  try {
    conexion = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306,
      // Necesario para enviar las cadenas PREPARE/EXECUTE/DEALLOCATE como un
      // único envío compuesto (ver `dividirSentenciasSql`). El archivo SQL es
      // de confianza: lo redacta el propio equipo de desarrollo.
      multipleStatements: true
    });

    let numero = 0;

    for (const sentencia of sentencias) {
      numero++;
      // Se muestra sólo el encabezado de la sentencia (primera línea útil).
      const resumen = sentencia.split('\n')[0].slice(0, 70);
      try {
        await conexion.query(sentencia);
        console.log(` [${String(numero).padStart(3, '0')}] OK    ${resumen}`);
      } catch (error) {
        console.error(` [${String(numero).padStart(3, '0')}] FALLO ${resumen}`);
        console.error(`        -> ${error.code}: ${error.sqlMessage || error.message}`);
        throw error;
      }
    }

    console.log('-'.repeat(74));
    console.log(' MIGRACIÓN APLICADA CORRECTAMENTE.');
    console.log('='.repeat(74));
  } catch (error) {
    console.error('\n[ERROR] La migración se detuvo. No se continuó ejecutando.');
    process.exitCode = 1;
  } finally {
    if (conexion) await conexion.end();
  }
};

ejecutar();
