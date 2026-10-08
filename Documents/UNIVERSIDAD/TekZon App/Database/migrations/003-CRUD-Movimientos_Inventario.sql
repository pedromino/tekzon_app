-- ========================================================
-- MIGRACIÓN 004: Movimientos de Inventario (Entradas / Salidas / Ajustes)
-- ========================================================

CREATE TABLE IF NOT EXISTS movimiento_inventario (
    id_movimiento INT AUTO_INCREMENT PRIMARY KEY,
    cod_producto VARCHAR(50) NOT NULL,
    id_usuario INT NOT NULL,
    tipo_movimiento VARCHAR(20) NOT NULL COMMENT 'ENTRADA: Compra/Devolución, SALIDA: Merma/Uso, AJUSTE: Conteo físico',
    cantidad INT NOT NULL COMMENT 'Cantidad de unidades afectadas',
    existencia_previa INT NOT NULL COMMENT 'Stock registrado antes de la operación',
    existencia_posterior INT NOT NULL COMMENT 'Stock resultante tras la operación',
    motivo VARCHAR(150) NOT NULL COMMENT 'Concepto o justificación de la transacción',
    fecha_movimiento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Restricciones de Clave Foránea
    CONSTRAINT fk_movimiento_producto
        FOREIGN KEY (cod_producto) REFERENCES producto(cod_producto)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
        
    CONSTRAINT fk_movimiento_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

