<#
.SYNOPSIS
    Limpia los registros temporales creados por la prueba automática de
    integración del módulo de inventario de TekZon C.A.

.DESCRIPTION
    El script elimina las filas cuyos identificadores comienzan por el prefijo
    de control de calidad "PRUEBA-INT-" de las tablas `movimiento_inventario`,
    `producto` y `categoria`, devolviendo la base `tekzon_bd` a su estado real.
    El orden de borrado respeta las claves foráneas del kádex.

    Al filtrar por el prefijo PRUEBA-INT- nunca puede afectar información real
    de TekZon C.A.

.EXAMPLE
    pwsh -File Database/scripts/limpiarDatosPrueba.ps1

.EXAMPLE
    pwsh -File Database/scripts/limpiarDatosPrueba.ps1 -RutaClienteMysql 'C:\mysql\bin\mysql.exe'
#>

param(
  # Ruta al cliente de línea de comandos de MySQL / MariaDB.
  [string]$RutaClienteMysql = 'C:\xampp\mysql\bin\mysql.exe',

  # Usuario de la base de datos.
  [string]$UsuarioBd = 'root',

  # Nombre del esquema de TekZon C.A.
  [string]$NombreBd = 'tekzon_bd'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $RutaClienteMysql)) {
  Write-Error "No se encontró el cliente MySQL en '$RutaClienteMysql'. Indique la ruta con -RutaClienteMysql."
  exit 1
}

Write-Host "Eliminando registros de prueba (prefijo PRUEBA-) de $NombreBd..." -ForegroundColor Cyan

# El orden importa: primero el kádex (FK hacia producto) y luego el producto.
$sentenciaSql = @"
USE $NombreBd;
DELETE FROM movimiento_inventario WHERE cod_producto LIKE 'PRUEBA-%';
DELETE FROM producto WHERE cod_producto LIKE 'PRUEBA-%';
DELETE FROM categoria WHERE nombre_categoria LIKE 'PRUEBA-%';
SELECT
  (SELECT COUNT(*) FROM producto)              AS productos,
  (SELECT COUNT(*) FROM movimiento_inventario) AS movimientos,
  (SELECT COUNT(*) FROM categoria)             AS categorias;
"@

$sentenciaSql | & $RutaClienteMysql -u $UsuarioBd

if ($LASTEXITCODE -ne 0) {
  Write-Error "La limpieza falló con el código de salida $LASTEXITCODE."
  exit $LASTEXITCODE
}

Write-Host 'Limpieza completada correctamente.' -ForegroundColor Green
