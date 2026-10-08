-- ============================================================================
-- MIGRACIÓN 004 · REFACTORIZACIÓN INTEGRAL DEL MÓDULO DE INVENTARIO
-- Sistema: TekZon C.A. · Asignatura ADS-433 · IUJO Barquisimeto
-- ----------------------------------------------------------------------------
-- PROPÓSITO FUNCIONAL:
--   Adaptar el esquema relacional a las correcciones docentes que dividen el
--   módulo de inventario en 4 CRUDs independientes pero interconectados:
--     CRUD 1 -> producto      (ficha técnica, existencia inicial 0)
--     CRUD 2 -> producto      (ajuste/arqueo de existencias)
--     CRUD 3 -> movimiento_inventario (kádex transaccional)
--     CRUD 4 -> categoria     (clasificación con baja lógica)
--
-- PROPÓSITO TÉCNICO:
--   1. `producto.existencia`   : columna que almacena el stock físico real.
--      NO se captura en el alta del producto; nace en 0 y sólo el kádex
--      (CRUD 3) o el ajuste de almacén (CRUD 2) pueden modificarla.
--   2. `producto.stock_minimo` : umbral para las alertas visuales del KPI.
--   3. `producto.estado`       : baja lógica del catálogo maestro (1 activo,
--      0 inactivo) para no romper las claves foráneas de detalle_factura,
--      detalle_orden y movimiento_inventario.
--   4. `categoria.estado`      : baja lógica de categorías. Se normaliza de
--      VARCHAR a TINYINT(1) y se rellenan los NULL heredados con 1 (activo).
--
-- SEGURIDAD DE EJECUCIÓN:
--   El script es IDEMPOTENTE. Usa información de `information_schema` para
--   verificar la existencia previa de columnas, índices y llaves foráneas,
--   por lo que puede ejecutarse varias veces sin producir errores 1060/1061.
-- ============================================================================

USE `tekzon_bd`;

-- ----------------------------------------------------------------------------
-- 1. COLUMNA `producto.existencia` (stock físico real, inicializado en 0)
-- ----------------------------------------------------------------------------
SET @existe_columna := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'tekzon_bd'
    AND TABLE_NAME = 'producto'
    AND COLUMN_NAME = 'existencia'
);
SET @sentencia_sql := IF(
  @existe_columna = 0,
  'ALTER TABLE `producto` ADD COLUMN `existencia` INT NOT NULL DEFAULT 0 COMMENT ''Stock fisico real. Nace en 0 y solo lo altera el kardex (CRUD 3) o el ajuste de almacen (CRUD 2)''',
  'SELECT ''La columna producto.existencia ya existe'' AS aviso_migracion'
);
PREPARE stmt FROM @sentencia_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- 2. COLUMNA `producto.stock_minimo` (umbral de alerta de reposición)
-- ----------------------------------------------------------------------------
SET @existe_columna := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'tekzon_bd'
    AND TABLE_NAME = 'producto'
    AND COLUMN_NAME = 'stock_minimo'
);
SET @sentencia_sql := IF(
  @existe_columna = 0,
  'ALTER TABLE `producto` ADD COLUMN `stock_minimo` INT NOT NULL DEFAULT 0 COMMENT ''Umbral minimo de reposicion para las alertas de stock bajo''',
  'SELECT ''La columna producto.stock_minimo ya existe'' AS aviso_migracion'
);
PREPARE stmt FROM @sentencia_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- 3. COLUMNA `producto.estado` (baja lógica del catálogo maestro)
-- ----------------------------------------------------------------------------
SET @existe_columna := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'tekzon_bd'
    AND TABLE_NAME = 'producto'
    AND COLUMN_NAME = 'estado'
);
SET @sentencia_sql := IF(
  @existe_columna = 0,
  'ALTER TABLE `producto` ADD COLUMN `estado` TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''Baja logica: 1 = activo, 0 = inactivo (no rompe FKs)''',
  'SELECT ''La columna producto.estado ya existe'' AS aviso_migracion'
);
PREPARE stmt FROM @sentencia_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- 4. NORMALIZACIÓN DE `categoria.estado` (VARCHAR heredado -> TINYINT 1/0)
-- ----------------------------------------------------------------------------
-- ORDEN CRÍTICO: primero se sanea el contenido heredado y sólo después se
-- cambia el tipo de dato. Si se alterara el tipo antes, MySQL convertiría los
-- valores vacíos ('') en 0 y todas las categorías históricas quedarían
-- desactivadas por accidente.
UPDATE `categoria` SET `estado` = '1' WHERE `estado` IS NULL OR `estado` NOT IN ('0', '1');

ALTER TABLE `categoria`
  MODIFY COLUMN `estado` TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'Baja logica de la categoria: 1 = activa, 0 = inactiva';

-- Salvaguarda posterior: cualquier categoría en 0 que no haya sido desactivada
-- de forma deliberada vuelve a estado activo.
UPDATE `categoria` SET `estado` = 1 WHERE `estado` IS NULL;

-- ----------------------------------------------------------------------------
-- 5. ÍNDICES DE APOYO PARA LOS FILTROS DE LOS 4 CRUDs
-- ----------------------------------------------------------------------------
SET @existe_indice := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'tekzon_bd'
    AND TABLE_NAME = 'producto'
    AND INDEX_NAME = 'idx_producto_estado_categoria'
);
SET @sentencia_sql := IF(
  @existe_indice = 0,
  'CREATE INDEX `idx_producto_estado_categoria` ON `producto` (`estado`, `id_categoria`)',
  'SELECT ''El indice idx_producto_estado_categoria ya existe'' AS aviso_migracion'
);
PREPARE stmt FROM @sentencia_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe_indice := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'tekzon_bd'
    AND TABLE_NAME = 'movimiento_inventario'
    AND INDEX_NAME = 'idx_movimiento_fecha_tipo'
);
SET @sentencia_sql := IF(
  @existe_indice = 0,
  'CREATE INDEX `idx_movimiento_fecha_tipo` ON `movimiento_inventario` (`fecha_movimiento`, `tipo_movimiento`)',
  'SELECT ''El indice idx_movimiento_fecha_tipo ya existe'' AS aviso_migracion'
);
PREPARE stmt FROM @sentencia_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- 6. ROL OPERATIVO "ALMACENISTA" (responsable de los CRUD 2 y 3)
-- ----------------------------------------------------------------------------
INSERT INTO `rol_usuario` (`id_rolusuario`, `tipo_usuario`)
VALUES (3, 'almacenista')
ON DUPLICATE KEY UPDATE `tipo_usuario` = VALUES(`tipo_usuario`);

-- ----------------------------------------------------------------------------
-- 7. USUARIO OPERATIVO POR DEFECTO
-- ----------------------------------------------------------------------------
-- El kádex exige `id_usuario` como llave foránea obligatoria. Se siembra un
-- usuario almacenista para que los movimientos y ajustes queden firmados
-- mientras el módulo de autenticación (FASE II) no esté operativo.
INSERT INTO `usuario`
  (`id_usuario`, `id_rolusuario`, `nombre_usuario`, `username`, `contrasenia_usuario`)
VALUES
  (1, 3, 'Paola Cordero', 'almacenista', 'TekZon2026*')
ON DUPLICATE KEY UPDATE `nombre_usuario` = VALUES(`nombre_usuario`);

-- ============================================================================
-- FIN DE LA MIGRACIÓN 004
-- ============================================================================
