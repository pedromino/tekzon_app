# TekZon — Sistema de Gestión Técnica, Inventario y Ventas

**Instituto Universitario Jesús Obrero (IUJO) · Extensión Barquisimeto**


**Asignatura:** Análisis y Diseño de Sistemas (ADS-433) · Sección INF-4to B · Lapso 2-2026
**Docente Titular:** Prof. Eduardo Nieves

### Equipo de Desarrollo (Célula Full-Stack)

* **Paola Cordero** (C.I.: 30.004.343)


* **Pedro Noguera** (C.I.: 31.758.038)


* **Marianna Moyeja** (C.I.: 31.026.059)


## Descripción del Proyecto

Technik Services es una plataforma web integral diseñada para **TekZon C.A.**, una empresa dedicada a la reparación y venta de productos tecnológicos ubicada en Barquisimeto, estado Lara.

El sistema tiene como objetivo automatizar y centralizar los procesos operativos que actualmente se manejan de forma semi-manual (hojas de cálculo y planillas de papel). La plataforma unifica el control de inventarios, la trazabilidad de las órdenes de servicio técnico y la gestión de ventas directas con soporte multimoneda (Bs. y USD), reduciendo el margen de error humano y optimizando los tiempos de respuesta.

---

## Arquitectura y Tecnologías

El proyecto se rige por una arquitectura Full-Stack desacoplada y orientada a servicios:

* **Frontend (Cliente):** Aplicación reactiva (SPA) estructurada en componentes dinámicos utilizando Vue.js, estilizada con el sistema de diseño basado en **Bootstrap 5.3.3** e iconos de **Bootstrap Icons 1.11.3**. Gestiona los tres estados de interfaz (Loading, Success, Error) en el consumo de red.


* **Backend (Servidor):** API RESTful desarrollada en **Node.js** con **Express.js**, implementando una separación modular estricta en capas (Rutas, Controladores, Servicios y Modelos).


* **Base de Datos:** Motor relacional con diseño normalizado hasta la Tercera Forma Normal (3FN), garantizando la integridad referencial a través de claves primarias y foráneas. La persistencia de datos se gestiona mediante scripts de migración ordenados.

## Módulos Funcionales

El alcance del sistema contempla los siguientes módulos principales:

1. **Seguridad y Gestión de Usuarios:** Autenticación encriptada y control de acceso basado en roles (Administrador, Técnico y Cajero).


2. **Módulo de Inventario (CRUDs interconectados):** Catálogo maestro de repuestos y accesorios con parámetros de stock actual, precios (costo/venta) y alertas de desabastecimiento automáticas.


3. **Servicio Técnico:** Registro de recepción de dispositivos, asignación de técnicos, diagnóstico y presupuesto. El inventario se descuenta en tiempo real al vincular repuestos a la orden. Cuenta con un ciclo de estados (Pendiente, En Revisión, Listo, Entregado, Cancelado).


4. **Ventas y Caja (Punto de Venta):** Gestión de ventas rápidas en mostrador con cobro multimoneda (Efectivo, Pago Móvil, Punto de Venta) y sincronización con la tasa de cambio oficial del BCV.


## Metodología de Trabajo

El desarrollo del proyecto está estrictamente regulado por las normativas de evaluación de la asignatura ADS-433:

* **Flujo de Trabajo (GitFlow):** Integración continua utilizando ramas estandarizadas. Ningún commit se realiza directo a `master` o `develop`. Toda nueva funcionalidad nace como `feature/<numero_ticket>-<titulo>` y se somete a un proceso de revisión a través de Pull Requests (PR) aprobados por el Líder Técnico.


* **Trazabilidad Ágil (Kanban):** Gestión del proyecto mediante un tablero con 4 columnas normadas (Por Hacer, En Progreso, En Revisión PR Open, Terminado Merged). Cada ticket registra detalladamente las horas estimadas vs. las horas reales invertidas.


* **Ingeniería Económica (Costos TI):** El proyecto aplica la *Metodología Oficial de 7 Pasos* para el cálculo del Costo Total Consolidado (CTC) y la fijación de la Banda Absoluta de Precios del software, garantizando que el tiempo registrado en Kanban cuadre matemáticamente con el informe contable.
