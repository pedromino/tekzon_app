-- ============================================================================
-- SEED 005 · DATOS DE PRODUCCIÓN Y PRUEBA DE REPORTES GERENCIALES · TEKZON C.A.
-- ----------------------------------------------------------------------------
-- PROPÓSITO:
--   Puebla la base de datos `tekzon_bd` con registros completos, realistas y
--   coherentes para la evaluación y demostración en vivo de los 9 reportes
--   del sistema (Operacionales, de Supervisión y Gerenciales para la toma de decisiones).
--
-- COBERTURA:
--   1. Categorías adicionales de insumos y repuestos técnicos.
--   2. Proveedores mayoristas con historial comercial.
--   3. Catálogo de productos con márgenes de ganancia y stock crítico/agotado/óptimo.
--   4. Compras y detalle de compras a proveedores (volumen y abastecimiento).
--   5. Cartera de clientes naturales y comerciales.
--   6. Dispositivos móviles ingresados para servicio técnico.
--   7. Órdenes de servicio técnico en diversas etapas del ciclo de vida.
--   8. Historial de sesiones de caja (abiertas y cerradas).
--   9. Ventas directas facturadas con detalle de productos e ingresos por método de pago.
--  10. Movimientos de inventario (Kárdex completo con entradas, salidas y ajustes).
-- ============================================================================

USE `tekzon_bd`;

-- ----------------------------------------------------------------------------
-- 1. CATEGORÍAS DE PRODUCTOS Y REPUESTOS
-- ----------------------------------------------------------------------------
INSERT INTO `categoria` (`id_categoria`, `nombre_categoria`, `estado`) VALUES
  (4, 'Herramientas y Consumibles', 1),
  (5, 'Cables y Conectores', 1),
  (6, 'Componentes de Placa', 1)
ON DUPLICATE KEY UPDATE `nombre_categoria` = VALUES(`nombre_categoria`), `estado` = VALUES(`estado`);

-- ----------------------------------------------------------------------------
-- 2. PROVEEDORES MAYORISTAS
-- ----------------------------------------------------------------------------
INSERT INTO `proveedor` (`rif_proveedor`, `nombre_proveedor`, `telefono_proveedor`, `direccion_proveedor`, `estado`) VALUES
  ('J-40123456-1', 'MayorTech Soluciones C.A.', '0251-2551020', 'Av. 20 entre calles 31 y 32, Barquisimeto', 1),
  ('J-50987654-2', 'Distribuidora Global Repuestos C.A.', '0414-5558900', 'Zona Industrial I, Edif. Central, Galpón 3', 1),
  ('J-30456789-0', 'Importadora Celulares Andina S.A.', '0251-7193040', 'Av. Venezuela con Calle 12, C.C. Cosmos', 1),
  ('J-29871234-5', 'Suministros Electrónicos del Centro C.A.', '0424-5112233', 'Carrera 19 entre 24 y 25, Local 4', 1)
ON DUPLICATE KEY UPDATE
  `nombre_proveedor` = VALUES(`nombre_proveedor`),
  `telefono_proveedor` = VALUES(`telefono_proveedor`),
  `direccion_proveedor` = VALUES(`direccion_proveedor`),
  `estado` = VALUES(`estado`);

-- ----------------------------------------------------------------------------
-- 3. CATÁLOGO DE PRODUCTOS (Variedad de márgenes, precios y estados de stock)
-- ----------------------------------------------------------------------------
INSERT INTO `producto` (`cod_producto`, `nombre_producto`, `precio_costo`, `precio_venta`, `id_categoria`, `marca`, `descripcion`, `imagen`, `existencia`, `stock_minimo`, `estado`) VALUES
  ('REP-PANT-IP13', 'Pantalla OLED iPhone 13 Original Pulled', 65.00, 115.00, 1, 'Apple', 'Módulo de pantalla OLED original con soporte TrueTone y calibración IC', NULL, 6, 2, 1),
  ('REP-BAT-IP12', 'Batería Original iPhone 12 / 12 Pro 2815mAh', 18.50, 38.00, 10, 'Apple', 'Batería de polímero de litio grado A con circuito TI original', NULL, 12, 4, 1),
  ('REP-PANT-A52', 'Pantalla AMOLED Samsung Galaxy A52 con Marco', 42.00, 75.00, 1, 'Samsung', 'Display AMOLED alta resolución tasa 90Hz', NULL, 2, 3, 1),
  ('REP-PIN-C-UNIV', 'Pin de Carga USB Tipo-C Hembra SMD (Pack x10)', 3.50, 8.50, 5, 'OEM', 'Conectores reforzados 16 pines para soldadura en placa', NULL, 25, 5, 1),
  ('ACC-CARG-20W', 'Cargador Rápido 20W USB-C Power Delivery', 6.00, 15.00, 2, 'Anker', 'Cargador compacto compatible con carga rápida iPhone y Android', NULL, 18, 5, 1),
  ('ACC-CABL-LIG', 'Cable Reforzado Tipo C a Lightning 1.2m', 3.20, 9.00, 2, 'Baseus', 'Cable con cubierta trenzada de nylon y conectores de aleación', NULL, 1, 4, 1),
  ('CON-EST-183', 'Estaño en Pasta Baku BK-5050 183°C Sn63/Pb37', 5.50, 12.00, 4, 'Baku', 'Soldadura en pasta para reballing de circuitos integrados BGA', NULL, 8, 3, 1),
  ('CON-FLUX-AM', 'Flux Gel No-Clean Amtech NC-559-ASM 10cc', 4.00, 10.50, 4, 'Amtech', 'Fundente de alta viscosidad para microsoldadura libre de halógenos', NULL, 0, 2, 1),
  ('EQ-XIA-RED11', 'Xiaomi Redmi Note 11 128GB / 6GB RAM Nuevo', 135.00, 175.00, 3, 'Xiaomi', 'Smartphone reacondicionado clase A con garantía 90 días', NULL, 4, 2, 1),
  ('EQ-MOT-G60', 'Motorola Moto G60 128GB / 6GB Pantalla 120Hz', 120.00, 160.00, 3, 'Motorola', 'Smartphone liberado para todas las operadoras nacionales', NULL, 3, 2, 1)
ON DUPLICATE KEY UPDATE
  `nombre_producto` = VALUES(`nombre_producto`),
  `precio_costo`    = VALUES(`precio_costo`),
  `precio_venta`    = VALUES(`precio_venta`),
  `id_categoria`    = VALUES(`id_categoria`),
  `marca`           = VALUES(`marca`),
  `descripcion`     = VALUES(`descripcion`),
  `existencia`      = VALUES(`existencia`),
  `stock_minimo`    = VALUES(`stock_minimo`),
  `estado`          = VALUES(`estado`);

-- ----------------------------------------------------------------------------
-- 4. HISTORIAL DE COMPRAS A PROVEEDORES (Para reportes analíticos de adquisiciones)
-- ----------------------------------------------------------------------------
INSERT INTO `compra` (`id_compra`, `num_factura`, `rif_proveedor`, `id_usuario`, `fecha_compra`, `monto_total`, `observaciones`) VALUES
  (1, 'FAC-PROV-901', 'J-40123456-1', 1, '2026-10-15 10:30:00', 925.00, 'Lote de pantallas OLED para iPhone y AMOLED Samsung'),
  (2, 'FAC-PROV-902', 'J-50987654-2', 1, '2026-10-22 14:15:00', 485.00, 'Reposición de baterías de alta capacidad y conectores'),
  (3, 'FAC-PROV-903', 'J-30456789-0', 1, '2026-11-02 09:45:00', 1280.00, 'Adquisición de lotes de smartphones reacondicionados'),
  (4, 'FAC-PROV-904', 'J-29871234-5', 1, '2026-11-06 16:20:00', 215.00, 'Consumibles de taller: estaño en pasta, flux y mallas')
ON DUPLICATE KEY UPDATE
  `num_factura`   = VALUES(`num_factura`),
  `monto_total`   = VALUES(`monto_total`),
  `observaciones` = VALUES(`observaciones`);

INSERT INTO `detalle_compra` (`id_detalle_compra`, `id_compra`, `cod_producto`, `cantidad`, `precio_costo_unitario`, `subtotal`) VALUES
  (1, 1, 'REP-PANT-IP13', 10, 65.00, 650.00),
  (2, 1, 'REP-PANT-A52', 5, 42.00, 210.00),
  (3, 2, 'REP-BAT-IP12', 20, 18.50, 370.00),
  (4, 2, 'REP-PIN-C-UNIV', 30, 3.50, 105.00),
  (5, 3, 'EQ-XIA-RED11', 6, 135.00, 810.00),
  (6, 3, 'EQ-MOT-G60', 3, 120.00, 360.00),
  (7, 4, 'CON-EST-183', 15, 5.50, 82.50),
  (8, 4, 'CON-FLUX-AM', 10, 4.00, 40.00)
ON DUPLICATE KEY UPDATE
  `cantidad`              = VALUES(`cantidad`),
  `precio_costo_unitario` = VALUES(`precio_costo_unitario`),
  `subtotal`              = VALUES(`subtotal`);

-- ----------------------------------------------------------------------------
-- 5. CARTERA DE CLIENTES
-- ----------------------------------------------------------------------------
INSERT INTO `cliente` (`cedula_cli`, `nombre_cliente`, `apellido_cliente`, `telefono_cliente`, `direccion_cli`) VALUES
  ('V14250912', 'Carlos', 'Mendoza', '0414-5231144', 'Urb. Fundalara, Calle 5, Casa 12, Barquisimeto'),
  ('V18942105', 'María', 'Rodríguez', '0424-5896321', 'Av. Lara, Res. Las Trinitarias, Apto 4-B'),
  ('V22341890', 'José Luis', 'Hernández', '0412-7890123', 'Calle 42 con Carrera 18, Edif. Centro'),
  ('V25890123', 'Valeria', 'Castillo', '0416-3344556', 'Cabudare, Urb. La Mora, Manzana F'),
  ('V27102934', 'Andrés', 'Morales', '0414-9988776', 'Av. Los Leones, Torre Milenium, Piso 2'),
  ('V19876543', 'Elena', 'Gómez', '0424-6543210', 'Barrio Unión, Calle 11 entre 2 y 3'),
  ('V16543210', 'Ricardo', 'Pacheco', '0412-1122334', 'Urb. El Parral, Barquisimeto')
ON DUPLICATE KEY UPDATE
  `nombre_cliente`    = VALUES(`nombre_cliente`),
  `apellido_cliente`  = VALUES(`apellido_cliente`),
  `telefono_cliente`  = VALUES(`telefono_cliente`),
  `direccion_cli`     = VALUES(`direccion_cli`);

-- ----------------------------------------------------------------------------
-- 6. DISPOSITIVOS REGISTRADOS
-- ----------------------------------------------------------------------------
INSERT INTO `dispositivo` (`id_dispositivo`, `nombre_dis`, `marca`, `modelo`, `numero_serie`, `cedula_cli`) VALUES
  (101, 'iPhone 13 Pro', 'Apple', 'A2638', 'IMEI-354890123456781', 'V14250912'),
  (102, 'Samsung Galaxy S21', 'Samsung', 'SM-G991B', 'IMEI-359876543210982', 'V18942105'),
  (103, 'Xiaomi Redmi Note 11', 'Xiaomi', '2201117TL', 'IMEI-864501234987653', 'V22341890'),
  (104, 'Motorola Moto G60', 'Motorola', 'XT2135-2', 'IMEI-352145890741254', 'V25890123'),
  (105, 'iPhone 12', 'Apple', 'A2403', 'IMEI-356987412358965', 'V27102934'),
  (106, 'Samsung Galaxy A52', 'Samsung', 'SM-A525F', 'IMEI-358412698745126', 'V19876543'),
  (107, 'Xiaomi Poco X3 Pro', 'Xiaomi', 'M2102J20SG', 'IMEI-863214587965417', 'V16543210')
ON DUPLICATE KEY UPDATE
  `nombre_dis`   = VALUES(`nombre_dis`),
  `marca`        = VALUES(`marca`),
  `modelo`       = VALUES(`modelo`),
  `numero_serie` = VALUES(`numero_serie`),
  `cedula_cli`   = VALUES(`cedula_cli`);

-- ----------------------------------------------------------------------------
-- 7. SESIONES DE CAJA (Histórico cerrado y sesión activa)
-- ----------------------------------------------------------------------------
INSERT INTO `caja` (`id_caja`, `monto_apertura`, `monto_cierre`, `estado`, `fecha_apertura`, `id_usuario`, `observaciones`) VALUES
  (10, 50.00, 320.00, 'CERRADA', '2026-11-08 08:00:00', 1, 'Cierre de turno sin novedades. Arqueo cuadrado.'),
  (11, 40.00, 485.50, 'CERRADA', '2026-11-09 08:00:00', 1, 'Cierre nocturno. Mayor afluencia por reparaciones.'),
  (12, 50.00, NULL,   'ABIERTA', '2026-11-10 08:00:00', 1, 'Sesión operativa activa del turno matutino')
ON DUPLICATE KEY UPDATE
  `monto_apertura` = VALUES(`monto_apertura`),
  `monto_cierre`   = VALUES(`monto_cierre`),
  `estado`         = VALUES(`estado`),
  `fecha_apertura` = VALUES(`fecha_apertura`),
  `observaciones`  = VALUES(`observaciones`);

-- ----------------------------------------------------------------------------
-- 8. ÓRDENES DE SERVICIO TÉCNICO (Panel del Técnico - KPIs de Resolución)
-- ----------------------------------------------------------------------------
INSERT INTO `orden_tecnico` (`id_ordentec`, `id_dispositivo`, `id_usuario`, `falla_reportada`, `costo`, `estado`, `fecha_ingreso`, `fecha_entrega`, `accesorios`, `patron_desbloqueo`, `observaciones`, `costo_mano_obra`, `total_repuestos`, `total`, `cobrada`, `numero_factura`, `id_caja`, `fecha_cierre`) VALUES
  (201, 101, 1, 'Pantalla rota y táctil inoperante por caída', 115.00, 'ENTREGADO', '2026-11-05 09:30:00', '2026-11-06 15:00:00', 'Forro protector negro', 'Pin: 1234', 'Cambio exitoso de módulo OLED original con calibración TrueTone.', 25.00, 115.00, 140.00, 1, 'FAC-000101', 10, '2026-11-06 15:00:00'),
  (202, 102, 1, 'Batería inflada y recalentamiento al cargar', 38.00, 'ENTREGADO', '2026-11-06 10:15:00', '2026-11-07 12:30:00', 'Sin accesorios', 'Patrón Z', 'Sustitución de celda y sellado térmico contra humedad.', 15.00, 38.00, 53.00, 1, 'FAC-000102', 10, '2026-11-07 12:30:00'),
  (203, 103, 1, 'No enciende tras contacto moderado con líquido', 0.00, 'EN_REPARACION', '2026-11-08 11:00:00', NULL, 'Cargador genérico', 'Sin clave', 'Baño ultrasónico realizado; en proceso de reballing de PMIC.', 35.00, 0.00, 35.00, 0, NULL, 11, NULL),
  (204, 104, 1, 'No carga y pin de conexión flojo', 8.50, 'FINALIZADO', '2026-11-09 09:00:00', NULL, 'Cable USB', 'Pin: 0000', 'Reemplazo de pin Tipo C SMD. Listo para ser retirado por el cliente.', 15.00, 8.50, 23.50, 0, NULL, 11, NULL),
  (205, 105, 1, 'Batería con 74% de vida útil, requiere cambio', 38.00, 'RECIBIDO', '2026-11-10 08:30:00', NULL, 'Forro transparente', 'Pin: 4321', 'En cola de espera de mesa de trabajo técnica.', 15.00, 38.00, 53.00, 0, NULL, 12, NULL),
  (206, 106, 1, 'Pantalla con líneas verticales y parpadeo', 75.00, 'DIAGNOSTICO', '2026-11-10 09:15:00', NULL, 'Sin accesorios', 'Sin clave', 'Revisando si es falla de flex o daño físico del panel AMOLED.', 20.00, 75.00, 95.00, 0, NULL, 12, NULL),
  (207, 107, 1, 'Muerte súbita tras actualización de sistema', 0.00, 'CANCELADO', '2026-11-04 14:00:00', '2026-11-05 10:00:00', 'Caja original', 'Sin clave', 'CPU con daño interno en pistas; cliente desestimó presupuesto.', 0.00, 0.00, 0.00, 0, NULL, 10, '2026-11-05 10:00:00')
ON DUPLICATE KEY UPDATE
  `falla_reportada`   = VALUES(`falla_reportada`),
  `estado`            = VALUES(`estado`),
  `costo_mano_obra`   = VALUES(`costo_mano_obra`),
  `total_repuestos`   = VALUES(`total_repuestos`),
  `total`             = VALUES(`total`),
  `cobrada`           = VALUES(`cobrada`),
  `numero_factura`    = VALUES(`numero_factura`),
  `observaciones`     = VALUES(`observaciones`);

-- Repuestos aplicados en órdenes
INSERT INTO `detalle_orden` (`id_ordentec`, `cod_producto`, `cantidad`, `precio_unitario`, `tipo_item`, `subtotal`) VALUES
  (201, 'REP-PANT-IP13', 1, 115.00, 'REPUESTO', 115.00),
  (202, 'REP-BAT-IP12', 1, 38.00, 'REPUESTO', 38.00),
  (204, 'REP-PIN-C-UNIV', 1, 8.50, 'REPUESTO', 8.50)
ON DUPLICATE KEY UPDATE
  `cantidad`        = VALUES(`cantidad`),
  `precio_unitario` = VALUES(`precio_unitario`),
  `subtotal`        = VALUES(`subtotal`);

-- ----------------------------------------------------------------------------
-- 9. VENTAS FACTURADAS Y PAGOS (Ventas directas y de taller)
-- ----------------------------------------------------------------------------
INSERT INTO `venta` (`num_factura`, `cedula_cli`, `monto_total`, `fecha_venta`, `id_usuario`, `tipo_venta`, `estado`, `id_caja`) VALUES
  ('FAC-000101', 'V14250912', 140.00, '2026-11-06 15:00:00', 1, 'SERVICIO_TECNICO', 'Vigente', 10),
  ('FAC-000102', 'V18942105', 53.00,  '2026-11-07 12:30:00', 1, 'SERVICIO_TECNICO', 'Vigente', 10),
  ('FAC-000103', 'V25890123', 24.00,  '2026-11-08 10:45:00', 1, 'DIRECTA',          'Vigente', 10),
  ('FAC-000104', 'V27102934', 184.00, '2026-11-09 11:20:00', 1, 'DIRECTA',          'Vigente', 11),
  ('FAC-000105', 'V19876543', 15.00,  '2026-11-09 16:40:00', 1, 'DIRECTA',          'Vigente', 11),
  ('FAC-000106', 'V16543210', 30.00,  '2026-11-10 09:30:00', 1, 'DIRECTA',          'Vigente', 12)
ON DUPLICATE KEY UPDATE
  `cedula_cli`  = VALUES(`cedula_cli`),
  `monto_total` = VALUES(`monto_total`),
  `fecha_venta` = VALUES(`fecha_venta`),
  `tipo_venta`  = VALUES(`tipo_venta`),
  `estado`      = VALUES(`estado`),
  `id_caja`     = VALUES(`id_caja`);

-- Detalle de productos en facturas de venta directa
INSERT INTO `detalle_factura` (`num_factura`, `cod_producto`, `cantidad`, `Precio_unitario`) VALUES
  ('FAC-000103', 'ACC-CARG-20W', 1, 15.00),
  ('FAC-000103', 'ACC-CABL-LIG', 1, 9.00),
  ('FAC-000104', 'EQ-MOT-G60',   1, 160.00),
  ('FAC-000104', 'ACC-CARG-20W', 1, 15.00),
  ('FAC-000104', 'ACC-CABL-LIG', 1, 9.00),
  ('FAC-000105', 'ACC-CARG-20W', 1, 15.00),
  ('FAC-000106', 'ACC-CARG-20W', 2, 15.00)
ON DUPLICATE KEY UPDATE
  `cantidad`        = VALUES(`cantidad`),
  `Precio_unitario` = VALUES(`Precio_unitario`);

-- Pagos desglosados por método financiero
INSERT INTO `pago` (`id_pago`, `id_caja`, `tipo_origen`, `metodo_pago`, `monto_usd`, `tasa_cambio`, `referencia`, `fecha_pago`, `venta_num_factura`, `id_ordentec`) VALUES
  (501, 10, 'SERVICIO_TECNICO', 'EFECTIVO_USD',  140.00, 1.00,  'CASH-S10-01', '2026-11-06 15:00:00', 'FAC-000101', 201),
  (502, 10, 'SERVICIO_TECNICO', 'PAGO_MOVIL',    53.00,  39.50, 'PM-984123',   '2026-11-07 12:30:00', 'FAC-000102', 202),
  (503, 10, 'VENTA_DIRECTA',    'EFECTIVO_USD',  24.00,  1.00,  'CASH-S10-02', '2026-11-08 10:45:00', 'FAC-000103', NULL),
  (504, 11, 'VENTA_DIRECTA',    'TRANSFERENCIA', 184.00, 40.00, 'TRANS-0102-55','2026-11-09 11:20:00', 'FAC-000104', NULL),
  (505, 11, 'VENTA_DIRECTA',    'PAGO_MOVIL',    15.00,  40.00, 'PM-112093',   '2026-11-09 16:40:00', 'FAC-000105', NULL),
  (506, 12, 'VENTA_DIRECTA',    'EFECTIVO_USD',  30.00,  1.00,  'CASH-S12-01', '2026-11-10 09:30:00', 'FAC-000106', NULL)
ON DUPLICATE KEY UPDATE
  `id_caja`           = VALUES(`id_caja`),
  `metodo_pago`       = VALUES(`metodo_pago`),
  `monto_usd`         = VALUES(`monto_usd`),
  `tasa_cambio`       = VALUES(`tasa_cambio`),
  `referencia`        = VALUES(`referencia`),
  `venta_num_factura` = VALUES(`venta_num_factura`);

-- ----------------------------------------------------------------------------
-- 10. MOVIMIENTOS DE KÁRDEX / ENTRADAS Y SALIDAS
-- ----------------------------------------------------------------------------
INSERT INTO `movimiento_inventario` (`id_movimiento`, `cod_producto`, `id_usuario`, `tipo_movimiento`, `cantidad`, `existencia_previa`, `existencia_posterior`, `motivo`, `fecha_movimiento`, `origen`) VALUES
  (301, 'REP-PANT-IP13', 1, 'ENTRADA', 10, 0, 10, 'Ingreso por compra FAC-PROV-901 MayorTech', '2026-10-15 11:00:00', 'COMPRA'),
  (302, 'REP-PANT-IP13', 1, 'SALIDA',   1, 10, 9, 'Consumo en orden técnica OS-000201', '2026-11-05 16:00:00', 'SERVICIO'),
  (303, 'REP-BAT-IP12',  1, 'ENTRADA', 20, 0, 20, 'Ingreso por compra FAC-PROV-902 Global', '2026-10-22 15:00:00', 'COMPRA'),
  (304, 'REP-BAT-IP12',  1, 'SALIDA',   1, 20, 19, 'Consumo en orden técnica OS-000202', '2026-11-06 14:00:00', 'SERVICIO'),
  (305, 'ACC-CARG-20W',  1, 'SALIDA',   1, 22, 21, 'Venta mostrador FAC-000103', '2026-11-08 10:45:00', 'VENTA'),
  (306, 'ACC-CARG-20W',  1, 'SALIDA',   1, 21, 20, 'Venta mostrador FAC-000104', '2026-11-09 11:20:00', 'VENTA'),
  (307, 'ACC-CARG-20W',  1, 'SALIDA',   2, 20, 18, 'Venta mostrador FAC-000106', '2026-11-10 09:30:00', 'VENTA'),
  (308, 'CON-FLUX-AM',   1, 'SALIDA',   2, 2,  0, 'Agotado por consumo interno de taller', '2026-11-09 18:00:00', 'AJUSTE')
ON DUPLICATE KEY UPDATE
  `tipo_movimiento`      = VALUES(`tipo_movimiento`),
  `cantidad`             = VALUES(`cantidad`),
  `existencia_previa`    = VALUES(`existencia_previa`),
  `existencia_posterior` = VALUES(`existencia_posterior`),
  `motivo`               = VALUES(`motivo`),
  `origen`               = VALUES(`origen`);

-- Sincronizar el correlativo de secuencia si está por debajo
UPDATE `secuencia_factura` SET `valor_actual` = 106 WHERE `nombre_secuencia` = 'FACTURA' AND `valor_actual` < 106;
UPDATE `secuencia_factura` SET `valor_actual` = 207 WHERE `nombre_secuencia` = 'ORDEN' AND `valor_actual` < 207;

-- ============================================================================
-- FIN DEL SEED 005 · DATOS DE PRODUCCIÓN Y REPORTES
-- ============================================================================
