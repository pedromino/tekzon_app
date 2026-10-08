-- -----------------------------------------------------
-- Table `tekzon_bd`.`rol_usuario`
-- -----------------------------------------------------
DROP TABLE IF EXISTS `tekzon_bd`.`rol_usuario` ;

CREATE TABLE IF NOT EXISTS `tekzon_bd`.`rol_usuario` (
  `id_rolusuario` INT NOT NULL,
  `tipo_usuario` VARCHAR(45) NULL COMMENT 'Define el rol del usuario (administrador, tecnico o cajero)',
  PRIMARY KEY (`id_rolusuario`))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `tekzon_bd`.`usuario`
-- -----------------------------------------------------
DROP TABLE IF EXISTS `tekzon_bd`.`usuario` ;

CREATE TABLE IF NOT EXISTS `tekzon_bd`.`usuario` (
  `id_usuario` INT NOT NULL,
  `id_rolusuario` INT NOT NULL,
  `nombre_usuario` VARCHAR(80) NULL COMMENT 'Nombre formal de la persona que se esta ingresando',
  `username` VARCHAR(80) NULL COMMENT 'El nombre de usuario del perfil o del rol',
  `contrasenia_usuario` VARCHAR(255) NULL,
  PRIMARY KEY (`id_usuario`),
  INDEX `fk_usuario_rol_usuario_idx` (`id_rolusuario` ASC) ,
  CONSTRAINT `fk_usuario_rol_usuario`
    FOREIGN KEY (`id_rolusuario`)
    REFERENCES `tekzon_bd`.`rol_usuario` (`id_rolusuario`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;
