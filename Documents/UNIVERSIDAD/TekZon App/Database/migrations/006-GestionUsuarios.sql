-- ============================================================================
-- MIGRACIÓN 006 · GESTIÓN DE USUARIOS Y APROBACIÓN DE REGISTROS
-- Sistema: TekZon C.A. · Asignatura ADS-433 · IUJO Barquisimeto
-- ----------------------------------------------------------------------------
-- PROPÓSITO FUNCIONAL:
--   1. Permite el autoregistro público de usuarios que quedan en estado
--      pendiente de aprobación (pendiente_aprobacion = 1, estado = 0).
--   2. Permite que el Administrador reciba una notificación (modal / campana)
--      y le asigne el rol correspondiente (administrador, técnico, almacenista, cajero).
--   3. Permite al Administrador gestionar (modificar, deshabilitar, habilitar)
--      a los usuarios registrados desde el módulo de Configuración.
--
-- PROPÓSITO TÉCNICO:
--   - Añade columna `pendiente_aprobacion` de forma idempotente a `usuario`.
--   - Permite que `id_rolusuario` sea NULL mientras el usuario no tenga rol asignado.
--   - Garantiza los 4 roles principales en `rol_usuario`:
--       1: administrador
--       2: tecnico
--       3: almacenista
--       4: cajero
-- ============================================================================

USE `tekzon_bd`;

-- 0. Procedimiento auxiliar para agregar columna si no existe
DROP PROCEDURE IF EXISTS `tekzon_agregar_columna`;

DELIMITER $$
CREATE PROCEDURE `tekzon_agregar_columna`(
  IN `p_tabla`  VARCHAR(64),
  IN `p_columna` VARCHAR(64),
  IN `p_definicion` TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE table_schema = DATABASE()
       AND table_name   = p_tabla
       AND column_name  = p_columna
  ) THEN
    SET @sql_alter = CONCAT('ALTER TABLE `', p_tabla, '` ADD COLUMN `', p_columna, '` ', p_definicion);
    PREPARE stmt FROM @sql_alter;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- 1. Columna de aprobación pendiente en usuario
CALL tekzon_agregar_columna(
  'usuario',
  'pendiente_aprobacion',
  'TINYINT(1) NOT NULL DEFAULT 0 COMMENT \'1=nuevo usuario esperando asignacion de rol por el admin\''
);

-- 2. Permitir que id_rolusuario sea NULL en usuario durante el autoregistro
ALTER TABLE `usuario` MODIFY COLUMN `id_rolusuario` INT(11) NULL DEFAULT NULL;

-- 3. Inserción de roles estándar
INSERT INTO `rol_usuario` (`id_rolusuario`, `tipo_usuario`) VALUES
  (1, 'administrador'),
  (2, 'tecnico'),
  (3, 'almacenista'),
  (4, 'cajero')
ON DUPLICATE KEY UPDATE `tipo_usuario` = VALUES(`tipo_usuario`);

-- 4. Limpieza del procedimiento auxiliar
DROP PROCEDURE IF EXISTS `tekzon_agregar_columna`;
