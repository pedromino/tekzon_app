-- ============================================================================
-- MIGRACIÓN 008 · FORMATOS DE FECHA Y HORA EN CAJA, TALLER Y MOVIMIENTOS
-- Sistema: TekZon C.A. · Asignatura ADS-433 · IUJO Barquisimeto
-- ----------------------------------------------------------------------------
-- PROPÓSITO:
--   Permite que la fecha de apertura de caja y las fechas de recepción/entrega
--   guarden la HORA EXACTA actual (DATETIME) en lugar de truncarse a solo fecha (DATE).
-- ============================================================================

USE `tekzon_bd`;

-- 1. Modificar fecha_apertura de caja a DATETIME
ALTER TABLE `caja`
  MODIFY COLUMN `fecha_apertura` DATETIME NULL COMMENT 'Fecha y hora exacta de apertura del turno';

-- 2. Modificar fechas de orden_tecnico a DATETIME
ALTER TABLE `orden_tecnico`
  MODIFY COLUMN `fecha_ingreso` DATETIME NULL COMMENT 'Fecha y hora de recepcion del equipo',
  MODIFY COLUMN `fecha_entrega` DATETIME NULL COMMENT 'Fecha y hora de entrega del equipo';
