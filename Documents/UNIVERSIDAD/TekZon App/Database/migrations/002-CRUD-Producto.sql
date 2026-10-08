-- -----------------------------------------------------
-- Table `tekzon_bd`.`producto`
-- -----------------------------------------------------
DROP TABLE IF EXISTS `tekzon_bd`.`producto` ;

CREATE TABLE IF NOT EXISTS `tekzon_bd`.`producto` (
  `cod_producto` VARCHAR(50) NOT NULL,
  `nombre_producto` VARCHAR(150) NULL,
  `precio_costo` DECIMAL(12,2) NULL,
  `precio_venta` DECIMAL(12,2) NULL,
  PRIMARY KEY (`cod_producto`))
ENGINE = InnoDB;

ALTER TABLE producto 
ADD COLUMN marca VARCHAR(50),
ADD COLUMN descripcion TEXT,
ADD COLUMN imagen VARCHAR(255) DEFAULT 'pantalla.jpg';