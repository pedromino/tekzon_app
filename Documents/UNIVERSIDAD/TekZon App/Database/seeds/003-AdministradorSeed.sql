-- ============================================================================
-- SEED 003 · USUARIO ADMINISTRADOR Y CAJA INICIAL · TEKZON C.A.
-- ----------------------------------------------------------------------------
-- PROPÓSITO FUNCIONAL:
--   Deja el sistema listo para operar después de aplicar las migraciones:
--
--     1. ROL ADMINISTRADOR con permisos globales (único rol de esta fase).
--     2. USUARIO ADMINISTRADOR para iniciar sesión.
--     3. CAJA ABIERTA para poder registrar cobros desde el primer arranque.
--     4. CORRELATIVOS de facturas y órdenes en cero.
--
-- CREDENCIALES DE ACCESO:
--     usuario:    admin
--     contraseña: TekZon2026*
--
-- PROPÓSITO TÉCNICO:
--   La contraseña se almacena como HASH scrypt (NUNCA en texto plano). El valor
--   que aparece abajo se generó con la herramienta del propio proyecto:
--
--       cd Backend
--       node scripts/generarHashAdmin.mjs "TekZon2026*"
--
--   Para cambiar la contraseña: genere un hash nuevo con esa herramienta y
--   actualice la columna, o vuelva a ejecutar este seed.
--
--   El script es IDEMPOTENTE (ON DUPLICATE KEY UPDATE): puede ejecutarse las
--   veces que haga falta sin duplicar registros ni perder el hash.
--
-- ORDEN DE EJECUCIÓN: después de la migración 005.
-- ============================================================================

USE `tekzon_bd`;

-- ----------------------------------------------------------------------------
-- 1. ROL ADMINISTRADOR (permisos globales sobre todos los módulos)
-- ----------------------------------------------------------------------------
INSERT INTO `rol_usuario` (`id_rolusuario`, `tipo_usuario`)
VALUES (1, 'administrador')
ON DUPLICATE KEY UPDATE `tipo_usuario` = VALUES(`tipo_usuario`);

-- ----------------------------------------------------------------------------
-- 2. USUARIO ADMINISTRADOR
--    Se reafirma el HASH (no la contraseña en claro) para que una segunda
--    ejecución no degrade la credencial.
-- ----------------------------------------------------------------------------
INSERT INTO `usuario`
  (`id_usuario`, `id_rolusuario`, `nombre_usuario`, `username`, `contrasenia_usuario`, `estado`)
VALUES
  (1, 1, 'Administrador TekZon', 'admin',
   'scrypt$fee90be0c726d2e4fcc17daa963c0031$12e00513cc2c955a9c1e2f756843f773e925962cc6b343d357406d191e1aee7d27f62023970d0ddff6578f2d84e98d674d38ac9c79fffb44d9300f4befa17129',
   1)
ON DUPLICATE KEY UPDATE
  `id_rolusuario`       = VALUES(`id_rolusuario`),
  `username`            = VALUES(`username`),
  `contrasenia_usuario` = VALUES(`contrasenia_usuario`),
  `estado`              = VALUES(`estado`);

-- ----------------------------------------------------------------------------
-- 3. CAJA ABIERTA INICIAL
--    El cobro (venta directa y servicio técnico) exige una caja ABIERTA porque
--    `pago.id_caja` es una llave foránea obligatoria. Se siembra una caja con
--    fondo cero para que el sistema sea operable de inmediato.
-- ----------------------------------------------------------------------------
INSERT INTO `caja`
  (`monto_apertura`, `monto_cierre`, `estado`, `fecha_apertura`, `id_usuario`, `observaciones`)
SELECT 0.00, NULL, 'ABIERTA', CURRENT_DATE, 1, 'Caja inicial abierta por el seed 003'
 WHERE NOT EXISTS (SELECT 1 FROM `caja` WHERE `estado` = 'ABIERTA');

-- ----------------------------------------------------------------------------
-- 4. CORRELATIVOS DE FACTURAS Y ÓRDENES DE SERVICIO
--    Formato de los documentos generados por el backend:
--       FAC-000001  (factura de venta directa o de servicio técnico)
--       OS-000001   (orden de servicio técnico)
-- ----------------------------------------------------------------------------
INSERT INTO `secuencia_factura` (`nombre_secuencia`, `prefijo`, `valor_actual`)
VALUES ('FACTURA', 'FAC-', 0), ('ORDEN', 'OS-', 0)
ON DUPLICATE KEY UPDATE `prefijo` = VALUES(`prefijo`);

-- ============================================================================
-- FIN DEL SEED 003
-- ============================================================================
