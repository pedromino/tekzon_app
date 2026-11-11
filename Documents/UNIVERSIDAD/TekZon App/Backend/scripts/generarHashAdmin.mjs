/**
 * ==========================================================================
 * GENERADOR DE HASH DE CONTRASEÑA (generarHashAdmin.mjs) - TEKZON C.A.
 * ==========================================================================
 * PROPÓSITO FUNCIONAL:
 *   Herramienta de consola que cifra una contraseña con el MISMO algoritmo del
 *   backend (scrypt, ver `src/utils/utilidadesSeguridad.js`) e imprime el valor
 *   listo para pegarlo en la base de datos. Sirve para:
 *
 *     · Sembrar el usuario administrador (migración 005 / seed 003).
 *     · Cambiar la contraseña de un usuario directamente en MySQL:
 *         UPDATE usuario
 *            SET contrasenia_usuario = '<hash impreso>'
 *          WHERE username = 'admin';
 *
 * PROPÓSITO TÉCNICO:
 *   Se ejecuta con Node.js y NO forma parte del bundle del frontend:
 *
 *     node scripts/generarHashAdmin.mjs "TekZon2026*"
 *     node scripts/generarHashAdmin.mjs            (usa la clave por defecto)
 * ==========================================================================
 */
import { encriptarContrasenia, verificarContrasenia } from '../src/utils/utilidadesSeguridad.js';

/** Contraseña por defecto del administrador académico de TekZon C.A. */
const CONTRASENIA_POR_DEFECTO = 'TekZon2026*';

// La contraseña puede venir como argumento de la línea de comandos.
const contrasenia = process.argv[2] || CONTRASENIA_POR_DEFECTO;

// 1) Se cifra la contraseña (formato scrypt$sal$hash).
const hashGenerado = encriptarContrasenia(contrasenia);

// 2) Se comprueba inmediatamente que el hash verifica (control de calidad).
const verificacionCorrecta = verificarContrasenia(contrasenia, hashGenerado);

console.log('='.repeat(74));
console.log(' HASH DE CONTRASEÑA · TEKZON C.A.');
console.log('='.repeat(74));
console.log(` Contraseña evaluada : ${contrasenia}`);
console.log(` Verificación interna: ${verificacionCorrecta ? 'CORRECTA' : 'FALLIDA'}`);
console.log('-'.repeat(74));
console.log(' Copie el siguiente valor en usuario.contrasenia_usuario:');
console.log(hashGenerado);
console.log('='.repeat(74));
