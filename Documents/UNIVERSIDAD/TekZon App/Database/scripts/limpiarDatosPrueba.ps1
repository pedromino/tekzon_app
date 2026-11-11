<#
.SYNOPSIS
    Limpia los datos temporales de TODAS las pruebas de integración de TekZon C.A.

.DESCRIPTION
    Este script es un ENVOLTORIO del utilitario en Node.js
    `Backend/scripts/limpiarDatosPrueba.mjs`, que es el que realmente hace la
    limpieza. Se conserva este archivo porque era el punto de entrada documentado
    en la FASE I (Módulo de Inventario).

    ¿POR QUÉ SE DELEGA EN NODE Y NO SE USA mysql.exe?
      La versión anterior invocaba directamente al cliente de línea de comandos
      de MySQL en una ruta fija ('C:\xampp\mysql\bin\mysql.exe'). Eso obligaba a
      tener MySQL instalado exactamente en esa carpeta y fallaba en cualquier otro
      entorno (por ejemplo, con MariaDB instalado como servicio). El backend ya
      incluye el driver `mysql2`, de modo que el script de Node se conecta usando
      las mismas credenciales del archivo .env y funciona en cualquier equipo.

    La limpieza elimina:
      · Los registros con prefijo 'PRUEBA-' del Módulo de Inventario (FASE I).
      · El cliente de prueba 'V-99999999' con sus órdenes, facturas y pagos.
      · Los asientos del kádex y las alertas generadas por las pruebas.
      Y restaura la existencia y el stock mínimo del producto real REP-PAN-001.

.EXAMPLE
    pwsh -File Database/scripts/limpiarDatosPrueba.ps1
#>

param(
  # Cédula del cliente de prueba de los módulos nuevos.
  [string]$CedulaPrueba = 'V-99999999'
)

$ErrorActionPreference = 'Stop'

# Se resuelve la ruta del backend a partir de la ubicación de este script,
# de modo que funcione sin importar el directorio desde el que se invoque.
$directorioScript = Split-Path -Parent $MyInvocation.MyCommand.Path
$directorioBackend = Join-Path (Split-Path -Parent (Split-Path -Parent $directorioScript)) 'Backend'
$scriptLimpieza = Join-Path $directorioBackend 'scripts/limpiarDatosPrueba.mjs'

if (-not (Test-Path $scriptLimpieza)) {
  Write-Error "No se encontró el utilitario de limpieza en '$scriptLimpieza'."
  exit 1
}

Write-Host 'Delegando la limpieza en el utilitario de Node.js...' -ForegroundColor Cyan

# Se ejecuta el script de Node desde la carpeta del backend para que `dotenv`
# encuentre el archivo .env con las credenciales de la base de datos.
Push-Location $directorioBackend
try {
  & node $scriptLimpieza $CedulaPrueba

  if ($LASTEXITCODE -ne 0) {
    Write-Error "La limpieza falló con el código de salida $LASTEXITCODE."
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

Write-Host 'Limpieza completada correctamente.' -ForegroundColor Green
