-- ============================================================================
-- MIGRACIÓN 005 · AUTENTICACIÓN, SERVICIO TÉCNICO, VENTA DIRECTA Y ALERTAS
-- Sistema: TekZon C.A. · Asignatura ADS-433 · IUJO Barquisimeto
-- ----------------------------------------------------------------------------
-- PROPÓSITO FUNCIONAL:
--   Habilita los módulos que faltaban del sistema, respetando el modelo
--   relacional original (Database/database/tekzon_bd.sql) y sin romper el
--   Módulo de Inventario que ya estaba 100% operativo:
--
--     MÓDULO 1 · USUARIO (LOGIN)
--       · Rol ADMINISTRADOR con permisos globales (único rol de la FASE II).
--       · `usuario.contrasenia_usuario` pasa a almacenar un HASH (nunca texto
--         plano) y se añade `estado` para dar de baja usuarios sin borrarlos.
--
--     MÓDULO 2 · SERVICIO TÉCNICO Y CAJA (flujo completo)
--       Recepción -> Orden "Pendiente" -> Panel del técnico -> Consumo de
--       repuestos (descuenta inventario + kádex "Servicio Técnico") -> Cobro
--       (mano de obra + repuestos) -> Factura -> Cierre de la orden.
--
--     MÓDULO 3 · VENTA DIRECTA (MOSTRADOR)
--       Venta rápida -> descuenta inventario + kádex "Venta" -> pago -> factura.
--
--     MÓDULO 4 · AUTOMATIZACIÓN DE ALERTAS DE STOCK
--       Tabla `alerta_stock` que persiste la alerta "stock mínimo" en el
--       instante exacto en que un descuento deja la existencia en el umbral.
--
-- PROPÓSITO TÉCNICO:
--   Script IDEMPOTENTE. MariaDB 10.4 NO soporta `ADD COLUMN IF NOT EXISTS`,
--   por lo que se usa un PROCEDIMIENTO AUXILIAR (`tekzon_agregar_columna`) que
--   consulta `information_schema` antes de cada ALTER. Así la migración puede
--   ejecutarse tantas veces como sea necesario sin errores 1060/1061/1826.
--
--   Cadena de llaves foráneas que se completa en esta migración:
--
--     cliente (cedula_cli) <── dispositivo <── orden_tecnico
--     orden_tecnico <── detalle_orden ──> producto
--     venta <── detalle_factura ──> producto
--     caja <── pago ──> venta / orden_tecnico
--     movimiento_inventario <── producto / usuario  (+ columna `origen`)
--
-- ORDEN DE EJECUCIÓN:  después de 001, 002, 003 y 004.
-- ============================================================================

USE `tekzon_bd`;

-- ----------------------------------------------------------------------------
-- 0. PROCEDIMIENTO AUXILIAR PARA AGREGAR COLUMNAS DE FORMA IDEMPOTENTE
-- ----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS `tekzon_agregar_columna`;

DELIMITER $$
CREATE PROCEDURE `tekzon_agregar_columna`(
  IN `p_tabla`  VARCHAR(64),
  IN `p_columna` VARCHAR(64),
  IN `p_definicion` TEXT
)
BEGIN
  -- Sólo se ejecuta el ALTER si la columna todavía NO existe en la tabla.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = `p_tabla`
       AND COLUMN_NAME  = `p_columna`
  ) THEN
    SET @sql_dinamico = CONCAT(
      'ALTER TABLE `', `p_tabla`, '` ADD COLUMN `', `p_columna`, '` ', `p_definicion`
    );
    PREPARE sentencia FROM @sql_dinamico;
    EXECUTE sentencia;
    DEALLOCATE PREPARE sentencia;
  END IF;
END$$
DELIMITER ;

-- ----------------------------------------------------------------------------
-- 1. MÓDULO DE USUARIO (LOGIN) · ROL ADMINISTRADOR Y SEGURIDAD
-- ----------------------------------------------------------------------------

-- 1.1 Rol ADMINISTRADOR (id 1 según el comentario del DDL original).
--     El rol `almacenista` (id 3, sembrado en la migración 004) se conserva
--     para no romper la FK del kádex histórico.
INSERT INTO `rol_usuario` (`id_rolusuario`, `tipo_usuario`)
VALUES (1, 'administrador')
ON DUPLICATE KEY UPDATE `tipo_usuario` = VALUES(`tipo_usuario`);

-- 1.2 Baja lógica de usuarios: 1 = activo, 0 = inactivo.
CALL tekzon_agregar_columna('usuario', 'estado',
  'TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''Baja logica: 1 = activo, 0 = inactivo''');

-- 1.3 Fecha del último inicio de sesión (auditoría de acceso).
CALL tekzon_agregar_columna('usuario', 'ultimo_acceso',
  'DATETIME NULL COMMENT ''Marca de tiempo del ultimo inicio de sesion exitoso''');

-- 1.4 El username debe ser único para poder autenticar sin ambigüedad.
--     Se comprueba antes para no repetir el índice en una segunda ejecución.
SET @existe_indice := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuario'
     AND INDEX_NAME = 'uk_usuario_username'
);
SET @sentencia := IF(@existe_indice = 0,
  'CREATE UNIQUE INDEX `uk_usuario_username` ON `usuario` (`username`)',
  'SELECT ''El indice uk_usuario_username ya existe'' AS aviso_migracion');
PREPARE stmt FROM @sentencia; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 1.5 `usuario.id_usuario` es una PK INT manual: se convierte en AUTO_INCREMENT
--     para que el registro de usuarios no dependa de calcular el MAX a mano.
ALTER TABLE `usuario`
  MODIFY COLUMN `id_usuario` INT NOT NULL AUTO_INCREMENT
  COMMENT 'Identificador interno del usuario (autoincremental)';

-- 1.6 USUARIO ADMINISTRADOR POR DEFECTO.
--
--     CREDENCIALES:   usuario: admin        contrasenia: TekZon2026*
--
--     IMPORTANTE: `contrasenia_usuario` guarda un HASH scrypt irreversible,
--     NO la contraseña en texto plano. El hash que aparece abajo se generó con
--     la herramienta del propio proyecto:
--
--         cd Backend
--         node scripts/generarHashAdmin.mjs "TekZon2026*"
--
--     Para cambiar la contraseña del administrador se usa esa misma herramienta
--     y se actualiza la columna con el valor impreso.
INSERT INTO `usuario`
  (`id_usuario`, `id_rolusuario`, `nombre_usuario`, `username`, `contrasenia_usuario`, `estado`)
VALUES
  (1, 1, 'Administrador TekZon', 'admin',
   'scrypt$fee90be0c726d2e4fcc17daa963c0031$12e00513cc2c955a9c1e2f756843f773e925962cc6b343d357406d191e1aee7d27f62023970d0ddff6578f2d84e98d674d38ac9c79fffb44d9300f4befa17129',
   1)
ON DUPLICATE KEY UPDATE
  `id_rolusuario`        = VALUES(`id_rolusuario`),
  `username`             = VALUES(`username`),
  -- Se reafirma el HASH (y no la contrasenia en claro) para que una segunda
  -- ejecución de la migración no degrade la credencial del administrador.
  `contrasenia_usuario`  = VALUES(`contrasenia_usuario`),
  `estado`               = VALUES(`estado`);

-- ----------------------------------------------------------------------------
-- 2. MÓDULO DE SERVICIO TÉCNICO · RECEPCIÓN (cliente + dispositivo + orden)
-- ----------------------------------------------------------------------------

-- 2.1 El dispositivo puede repetirse: un mismo equipo reingresa varias veces.
--     La UNIQUE original impedía registrar dos órdenes del mismo serial.
SET @existe_indice := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dispositivo'
     AND INDEX_NAME = 'numero_serie_UNIQUE'
);
SET @sentencia := IF(@existe_indice > 0,
  'ALTER TABLE `dispositivo` DROP INDEX `numero_serie_UNIQUE`',
  'SELECT ''El indice numero_serie_UNIQUE ya fue eliminado'' AS aviso_migracion');
PREPARE stmt FROM @sentencia; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.2 `dispositivo.id_dispositivo` pasa a AUTO_INCREMENT.
--     Se elimina primero la FK de orden_tecnico porque MySQL no permite
--     modificar una columna referenciada por una llave foránea.
SET @existe_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orden_tecnico'
     AND CONSTRAINT_NAME = 'fk_orden_tecnico_dispositivo1'
);
SET @sentencia := IF(@existe_fk > 0,
  'ALTER TABLE `orden_tecnico` DROP FOREIGN KEY `fk_orden_tecnico_dispositivo1`',
  'SELECT ''La FK fk_orden_tecnico_dispositivo1 ya fue eliminada'' AS aviso_migracion');
PREPARE stmt FROM @sentencia; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `dispositivo`
  MODIFY COLUMN `id_dispositivo` INT NOT NULL AUTO_INCREMENT
  COMMENT 'Identificador interno del dispositivo (autoincremental)';

-- Se restaura la llave foránea (con el nombre corto fk_orden_dispositivo).
SET @existe_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orden_tecnico'
     AND CONSTRAINT_NAME = 'fk_orden_dispositivo'
);
SET @sentencia := IF(@existe_fk = 0,
  'ALTER TABLE `orden_tecnico` ADD CONSTRAINT `fk_orden_dispositivo` FOREIGN KEY (`id_dispositivo`) REFERENCES `dispositivo` (`id_dispositivo`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''La FK fk_orden_dispositivo ya existe'' AS aviso_migracion');
PREPARE stmt FROM @sentencia; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.3 Datos de recepción de la orden: accesorios, observaciones y contraseña
--     de desbloqueo del equipo (patrón/ PIN) que el técnico necesita.
CALL tekzon_agregar_columna('orden_tecnico', 'accesorios',
  'VARCHAR(255) NULL COMMENT ''Accesorios entregados con el equipo (cargador, funda, etc.)''');
CALL tekzon_agregar_columna('orden_tecnico', 'patron_desbloqueo',
  'VARCHAR(120) NULL COMMENT ''Patron o clave de desbloqueo reportada por el cliente''');
CALL tekzon_agregar_columna('orden_tecnico', 'observaciones',
  'TEXT NULL COMMENT ''Observaciones del tecnico sobre la revision del equipo''');

-- 2.4 Desglose económico del cierre (mano de obra + repuestos = total).
CALL tekzon_agregar_columna('orden_tecnico', 'costo_mano_obra',
  'DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT ''Mano de obra presupuestada por el tecnico''');
CALL tekzon_agregar_columna('orden_tecnico', 'total_repuestos',
  'DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT ''Suma de los repuestos consumidos (detalle_orden)''');
CALL tekzon_agregar_columna('orden_tecnico', 'total',
  'DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT ''Total a cobrar = mano de obra + repuestos''');

-- 2.5 Cierre de la orden: estado de cobro, factura emitida y caja del cobro.
CALL tekzon_agregar_columna('orden_tecnico', 'cobrada',
  'TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1 = la orden ya fue cobrada y facturada''');
CALL tekzon_agregar_columna('orden_tecnico', 'numero_factura',
  'VARCHAR(50) NULL COMMENT ''Numero de factura emitido al cobrar la orden''');
CALL tekzon_agregar_columna('orden_tecnico', 'id_caja',
  'INT NULL COMMENT ''Caja en la que se registro el cobro de la orden''');
CALL tekzon_agregar_columna('orden_tecnico', 'fecha_cierre',
  'DATETIME NULL COMMENT ''Marca de tiempo del cobro y cierre de la orden''');

-- 2.6 `detalle_orden` distingue el tipo de línea facturada. En esta fase la
--     mano de obra se resume en `orden_tecnico.costo_mano_obra` (línea única) y
--     los repuestos se detallan aquí con tipo_item = 'REPUESTO'.
CALL tekzon_agregar_columna('detalle_orden', 'tipo_item',
  'VARCHAR(20) NOT NULL DEFAULT ''REPUESTO'' COMMENT ''REPUESTO o MANO_OBRA''');
CALL tekzon_agregar_columna('detalle_orden', 'subtotal',
  'DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT ''cantidad * precio_unitario''');

-- ----------------------------------------------------------------------------
-- 3. MÓDULO DE VENTA DIRECTA (MOSTRADOR)
-- ----------------------------------------------------------------------------
CALL tekzon_agregar_columna('venta', 'id_usuario',
  'INT NULL COMMENT ''Cajero/administrador que registro la venta''');
CALL tekzon_agregar_columna('venta', 'tipo_venta',
  'VARCHAR(20) NOT NULL DEFAULT ''DIRECTA'' COMMENT ''DIRECTA: mostrador''');
CALL tekzon_agregar_columna('venta', 'estado',
  'TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''Baja logica: 1 = vigente, 0 = anulada''');

-- 3.1 La fecha de la venta pasa a DATETIME para conservar la hora exacta del
--     comprobante (la columna original DATE perdía la hora del cobro).
ALTER TABLE `venta`
  MODIFY COLUMN `fecha_venta` DATETIME NULL COMMENT 'Fecha y hora de emision de la factura';

-- 3.2 Índice del cliente para acelerar el histórico por cédula.
SET @existe_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venta'
     AND CONSTRAINT_NAME = 'fk_venta_cliente1'
);
SET @sentencia := IF(@existe_fk > 0,
  'ALTER TABLE `venta` DROP FOREIGN KEY `fk_venta_cliente1`',
  'SELECT ''La FK fk_venta_cliente1 ya fue eliminada'' AS aviso_migracion');
PREPARE stmt FROM @sentencia; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe_indice := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venta'
     AND INDEX_NAME = 'fk_venta_cliente1_idx'
);
SET @sentencia := IF(@existe_indice = 0,
  'CREATE INDEX `fk_venta_cliente1_idx` ON `venta` (`cedula_cli`)',
  'SELECT ''El indice fk_venta_cliente1_idx ya existe'' AS aviso_migracion');
PREPARE stmt FROM @sentencia; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe_fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venta'
     AND CONSTRAINT_NAME = 'fk_venta_cliente1'
);
SET @sentencia := IF(@existe_fk = 0,
  'ALTER TABLE `venta` ADD CONSTRAINT `fk_venta_cliente1` FOREIGN KEY (`cedula_cli`) REFERENCES `cliente` (`cedula_cli`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''La FK fk_venta_cliente1 ya existe'' AS aviso_migracion');
PREPARE stmt FROM @sentencia; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3.3 Número de factura único y no nulo (se genera en el backend).
ALTER TABLE `venta`
  MODIFY COLUMN `num_factura` VARCHAR(50) NOT NULL COMMENT 'Numero de factura emitido (FK de detalle y pago)';

-- 3.4 Secuencia de numeración correlativa (se usa desde el backend dentro de
--     la transacción de la venta para evitar números duplicados).
CREATE TABLE IF NOT EXISTS `secuencia_factura` (
  `nombre_secuencia` VARCHAR(40) NOT NULL COMMENT 'Clave de la secuencia (FACTURA, ORDEN)',
  `prefijo`          VARCHAR(10) NOT NULL COMMENT 'Prefijo del correlativo (FAC-, OS-)',
  `valor_actual`     INT NOT NULL DEFAULT 0 COMMENT 'Ultimo correlativo asignado',
  PRIMARY KEY (`nombre_secuencia`)
) ENGINE = InnoDB COMMENT = 'Correlativos de facturas y ordenes de servicio';

INSERT INTO `secuencia_factura` (`nombre_secuencia`, `prefijo`, `valor_actual`)
VALUES ('FACTURA', 'FAC-', 0), ('ORDEN', 'OS-', 0)
ON DUPLICATE KEY UPDATE `prefijo` = VALUES(`prefijo`);

-- ----------------------------------------------------------------------------
-- 4. CAJA Y PAGOS
-- ----------------------------------------------------------------------------

-- 4.1 Caja: identificador automático y control de apertura/cierre.
ALTER TABLE `caja`
  MODIFY COLUMN `id_caja` INT NOT NULL AUTO_INCREMENT COMMENT 'Identificador de la caja (autoincremental)';

CALL tekzon_agregar_columna('caja', 'fecha_cierre',
  'DATETIME NULL COMMENT ''Marca de tiempo del cierre de caja''');
CALL tekzon_agregar_columna('caja', 'observaciones',
  'VARCHAR(255) NULL COMMENT ''Observaciones del arqueo de caja''');

-- 4.2 `caja.estado` se normaliza a texto corto y controlado.
ALTER TABLE `caja`
  MODIFY COLUMN `estado` VARCHAR(20) NOT NULL DEFAULT 'ABIERTA'
  COMMENT 'ABIERTA = turno activo, CERRADA = turno finalizado';

-- 4.3 Semilla de caja: el cobro exige una caja abierta. Si no existe ninguna,
--     se siembra la caja 1 abierta con el administrador para que el flujo de
--     facturación sea operable desde el primer arranque.
INSERT INTO `caja` (`id_caja`, `monto_apertura`, `monto_cierre`, `estado`, `fecha_apertura`, `id_usuario`, `observaciones`)
SELECT 1, 0.00, NULL, 'ABIERTA', CURRENT_TIMESTAMP, 1, 'Caja principal sembrada por la migracion 005'
 WHERE NOT EXISTS (SELECT 1 FROM `caja`);

-- 4.4 PAGO: en el DDL original `venta_num_factura` e `id_ordentec` eran NOT NULL
--     simultáneamente, lo que impedía registrar un cobro (todo pago pertenece a
--     una venta O a una orden de servicio, nunca a ambas a la vez). Se relajan a
--     NULL y el `tipo_origen` indica cuál de las dos referencias aplica.
ALTER TABLE `pago`
  MODIFY COLUMN `id_pago`   INT NOT NULL AUTO_INCREMENT COMMENT 'Identificador del pago (autoincremental)',
  MODIFY COLUMN `id_caja`   INT NOT NULL COMMENT 'Caja donde se recibio el dinero',
  MODIFY COLUMN `tipo_origen` VARCHAR(20) NOT NULL DEFAULT 'VENTA'
    COMMENT 'VENTA = factura de mostrador, SERVICIO_TECNICO = cobro de una orden',
  MODIFY COLUMN `metodo_pago` VARCHAR(50) NOT NULL COMMENT 'EFECTIVO, PAGO_MOVIL, PUNTO_DEBITO, TRANSFERENCIA, ZELLE, DIVISAS',
  MODIFY COLUMN `monto_usd`  DECIMAL(12,2) NOT NULL COMMENT 'Monto cobrado en dolares',
  MODIFY COLUMN `tasa_cambio` DECIMAL(12,2) NOT NULL DEFAULT 1.00 COMMENT 'Tasa USD -> Bs aplicada al cobro',
  MODIFY COLUMN `fecha_pago` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha y hora del cobro',
  MODIFY COLUMN `venta_num_factura` VARCHAR(50) NULL COMMENT 'Factura de venta directa (NULL si es servicio tecnico)',
  MODIFY COLUMN `id_ordentec` VARCHAR(30) NULL COMMENT 'Orden de servicio cobrada (NULL si es venta directa)';

-- 4.5 Índice único del pago por factura u orden: evita cobrar dos veces el
--     mismo documento (regla de negocio crítica de facturación).
SET @existe_indice := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pago'
     AND INDEX_NAME = 'uk_pago_venta'
);
SET @sentencia := IF(@existe_indice = 0,
  'CREATE UNIQUE INDEX `uk_pago_venta` ON `pago` (`venta_num_factura`)',
  'SELECT ''El indice uk_pago_venta ya existe'' AS aviso_migracion');
PREPARE stmt FROM @sentencia; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe_indice := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pago'
     AND INDEX_NAME = 'uk_pago_orden'
);
SET @sentencia := IF(@existe_indice = 0,
  'CREATE UNIQUE INDEX `uk_pago_orden` ON `pago` (`id_ordentec`)',
  'SELECT ''El indice uk_pago_orden ya existe'' AS aviso_migracion');
PREPARE stmt FROM @sentencia; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- 5. KÁRDEX · ORIGEN DEL MOVIMIENTO (Venta / Servicio Técnico / Almacén)
-- ----------------------------------------------------------------------------
-- El requisito exige marcar la salida como "Venta" o "Servicio Técnico".
-- Se añade una columna dedicada `origen` en lugar de sobrecargar `motivo`,
-- de modo que el filtro del kádex sea indexable y no dependa del texto libre.
CALL tekzon_agregar_columna('movimiento_inventario', 'origen',
  'VARCHAR(30) NOT NULL DEFAULT ''ALMACEN'' COMMENT ''ALMACEN, VENTA, SERVICIO_TECNICO o AJUSTE''');

SET @existe_indice := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'movimiento_inventario'
     AND INDEX_NAME = 'idx_movimiento_origen'
);
SET @sentencia := IF(@existe_indice = 0,
  'CREATE INDEX `idx_movimiento_origen` ON `movimiento_inventario` (`origen`, `fecha_movimiento`)',
  'SELECT ''El indice idx_movimiento_origen ya existe'' AS aviso_migracion');
PREPARE stmt FROM @sentencia; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- El motivo automático de ventas y servicios técnicos es más largo que los
-- 150 caracteres del DDL original; se amplía para no truncar la descripción.
ALTER TABLE `movimiento_inventario`
  MODIFY COLUMN `motivo` VARCHAR(255) NOT NULL COMMENT 'Concepto o justificacion de la transaccion';

-- ----------------------------------------------------------------------------
-- 6. MÓDULO 4 · AUTOMATIZACIÓN DE ALERTAS DE STOCK MÍNIMO
-- ----------------------------------------------------------------------------
-- Cada vez que un descuento (Venta o Servicio Técnico) deja la existencia de un
-- producto en o por debajo del `stock_minimo`, el backend inserta aquí la
-- alerta. La tabla es el respaldo persistente del aviso que aparece en pantalla
-- (Toast + campana de notificaciones) y permite auditar cuándo se avisó.
CREATE TABLE IF NOT EXISTS `alerta_stock` (
  `id_alerta`         INT NOT NULL AUTO_INCREMENT,
  `cod_producto`      VARCHAR(50) NOT NULL,
  `existencia`        INT NOT NULL COMMENT 'Existencia en el momento de la alerta',
  `stock_minimo`      INT NOT NULL COMMENT 'Umbral configurado en el producto',
  `origen`            VARCHAR(30) NOT NULL COMMENT 'VENTA o SERVICIO_TECNICO (quien provoco el descuento)',
  `documento`         VARCHAR(50) NULL COMMENT 'Factura u orden que originó el descuento',
  `mensaje`           VARCHAR(255) NOT NULL COMMENT 'Texto mostrado al usuario',
  `atendida`          TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = el administrador ya la revisó',
  `fecha_alerta`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_alerta`),
  INDEX `idx_alerta_producto` (`cod_producto` ASC),
  INDEX `idx_alerta_atendida` (`atendida` ASC, `fecha_alerta` DESC),
  CONSTRAINT `fk_alerta_producto`
    FOREIGN KEY (`cod_producto`)
    REFERENCES `producto` (`cod_producto`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE = InnoDB COMMENT = 'Alertas automaticas de stock minimo disparadas por descuentos';

-- ----------------------------------------------------------------------------
-- 7. LIMPIEZA DEL PROCEDIMIENTO AUXILIAR
-- ----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS `tekzon_agregar_columna`;

-- ============================================================================
-- FIN DE LA MIGRACIÓN 005
-- ============================================================================
