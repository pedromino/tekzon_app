-- ============================================================================
-- MIGRACIÓN 007 · ASOCIACIÓN DE VENTA CON SESIÓN DE CAJA ACTIVA
-- Sistema: TekZon C.A. · Asignatura ADS-433 · IUJO Barquisimeto
-- ----------------------------------------------------------------------------
-- PROPÓSITO FUNCIONAL:
--   1. Añade la columna `id_caja` a la tabla `venta` para que cada factura
--      emitida quede explícitamente vinculada a la sesión de caja activa.
--   2. Rellena retroactivamente `id_caja` en las ventas históricas a partir
--      de la tabla `pago`.
--   3. Crea índice sobre `id_caja` para acelerar los arqueos y cierres de caja.
-- ============================================================================

USE `tekzon_bd`;

-- 1. Agregar columna id_caja si no existe
DROP PROCEDURE IF EXISTS `tekzon_agregar_columna_007`;
DELIMITER $$
CREATE PROCEDURE `tekzon_agregar_columna_007`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE table_schema = DATABASE()
       AND table_name   = 'venta'
       AND column_name  = 'id_caja'
  ) THEN
    ALTER TABLE `venta` ADD COLUMN `id_caja` INT(11) NULL COMMENT 'ID de la sesion de caja activa donde se emitio la venta';
  END IF;
END$$
DELIMITER ;

CALL tekzon_agregar_columna_007();
DROP PROCEDURE IF EXISTS `tekzon_agregar_columna_007`;

-- 2. Índice sobre id_caja en venta
SET @existe_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venta'
     AND INDEX_NAME = 'idx_venta_id_caja'
);
SET @sentencia := IF(@existe_idx = 0,
  'CREATE INDEX `idx_venta_id_caja` ON `venta` (`id_caja`)',
  'SELECT \'El indice idx_venta_id_caja ya existe\' AS aviso_migracion');
PREPARE stmt FROM @sentencia; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Actualizar retroactivamente ventas existentes según la tabla pago
UPDATE `venta` v
INNER JOIN `pago` p ON p.venta_num_factura = v.num_factura
   SET v.id_caja = p.id_caja
 WHERE v.id_caja IS NULL;
