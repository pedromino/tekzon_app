# TekZon C.A. · Backend de los Módulos Nuevos (FASE II)

Sistema de Gestión Técnica, Inventario y Facturación · Asignatura **ADS-433** · IUJO Barquisimeto

Este documento describe los **cuatro módulos nuevos** que se integraron al Módulo de
Inventario que ya estaba operativo. Toda la información proviene de la base de datos
relacional `tekzon_bd` (MySQL / MariaDB): **no hay datos simulados**.

---

## 1. Resumen de lo desarrollado

| Módulo | Alcance | Prefijo del API |
|--------|---------|-----------------|
| **1 · Usuario (Login)** | Inicio de sesión con token firmado. Rol **Administrador** con permisos globales. | `/api/autenticacion` |
| **2 · Servicio Técnico y Caja** | Recepción → Orden "Pendiente" → Panel del técnico → Consumo de repuestos → Cobro, factura y cierre. | `/api/ordenes-tecnicas`, `/api/clientes`, `/api/dispositivos`, `/api/caja` |
| **3 · Venta Directa (Mostrador)** | Venta rápida: cliente + carrito → descuento de inventario → pago → factura. | `/api/ventas` |
| **4 · Alertas de Stock** | Alerta automática en el instante en que un descuento deja la existencia en el stock mínimo. | `/api/alertas/stock` |
| FASE I · Inventario | Catálogo, ajuste de existencias, kárdex y categorías (ya existía, se respetó). | `/api/productos`, `/api/inventario/stock`, `/api/movimientos`, `/api/categorias` |

---

## 2. Puesta en marcha

### 2.1 Instalar la base de datos (en este orden)

```powershell
cd Backend

# 1) Migración 005: adapta el esquema relacional a los módulos nuevos.
node scripts/ejecutarMigracion.mjs ../Database/migrations/005-AutenticacionServicioTecnicoVentas.sql

# 2) Seed del administrador, la caja inicial y los correlativos.
#    (También lo aplica la migración 005; ejecutarlo es idempotente.)
node scripts/ejecutarMigracion.mjs ../Database/seeds/003-AdministradorSeed.sql
```

> La migración 005 es **idempotente**: puede ejecutarse varias veces sin errores.
> Usa un procedimiento auxiliar que consulta `information_schema` antes de cada
> `ALTER TABLE`, porque MariaDB 10.4 no soporta `ADD COLUMN IF NOT EXISTS`.

### 2.2 Configurar el `.env`

```ini
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=tekzon_bd
DB_PORT=3306

# Clave con la que se firman los tokens de sesión (Módulo 1).
JWT_SECRETO=<una cadena larga y privada>
```

> Si `JWT_SECRETO` no está definida, el servidor arranca con una clave de
> desarrollo y lo advierte por consola. **En producción es obligatorio definirla.**

### 2.3 Arrancar el servidor

```powershell
cd Backend
npm start          # o:  node server.js
```

### 2.4 Credenciales del administrador

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| `admin` | `TekZon2026*` | administrador (permisos globales) |

La contraseña **no se guarda en texto plano**: se almacena como un hash `scrypt`
con sal aleatoria (`scrypt$<sal>$<hash>`). Para generar otro hash:

```powershell
node scripts/generarHashAdmin.mjs "NuevaContraseña"
```

---

## 3. Arquitectura por capas

Se mantiene exactamente el patrón del Módulo de Inventario (FASE I):

```
Routes  →  Controllers  →  Services  →  Models  →  MySQL (tekzon_bd)
(URLs)     (HTTP)          (reglas)     (SQL)
```

Archivos añadidos:

```
Backend/src/
├── utils/
│   ├── utilidadesSeguridad.js     # scrypt + token firmado HMAC-SHA256
│   ├── erroresNegocio.js          # ErrorNegocio + responderConError
│   └── estadosOrdenTecnico.js     # Máquina de estados de la orden
├── middlewares/
│   └── autenticacionMiddleware.js # exigirSesion / exigirAdministrador
├── models/
│   ├── usuarioModel.js
│   ├── clienteModel.js
│   ├── dispositivoModel.js
│   ├── ordenServiceTecnicoModel.js   # transacciones del taller
│   ├── ventaModel.js                 # transacción del mostrador
│   ├── cajaModel.js
│   └── alertaStockModel.js
├── services/
│   ├── autenticacionService.js
│   ├── clienteService.js
│   ├── dispositivoService.js
│   ├── ordenServiceTecnicoService.js
│   ├── ventaService.js
│   ├── cajaService.js
│   └── alertaStockService.js
├── controllers/   (7 controladores nuevos)
└── routes/        (7 routers nuevos)
```

**Todas las variables, funciones y métodos están en español** y su nombre describe
su función (`descontarStockProducto`, `calcularEstadosPermitidos`,
`registrarRecepcion`, `tomarSiguienteCorrelativo`, `validarDatosPago`, …).

---

## 4. Módulo 1 · Usuario (LOGIN)

### Endpoints

| Método | Ruta | Protegida | Acción |
|--------|------|-----------|--------|
| POST | `/api/autenticacion/login` | No | Inicia sesión y devuelve el token |
| GET | `/api/autenticacion/perfil` | Sí | Ficha del usuario de la sesión |
| GET | `/api/autenticacion/verificar` | Sí | ¿Sigue vigente la sesión? |
| POST | `/api/autenticacion/cerrar-sesion` | Sí | Cierra la sesión |

### Cómo está protegido el sistema

1. **Hash de contraseña con scrypt** (`crypto.scryptSync`, 16384 iteraciones, sal
   aleatoria de 16 bytes). La comparación es de **tiempo constante**
   (`timingSafeEqual`) para no filtrar información por el tiempo de respuesta.
2. **Token de sesión firmado** con HMAC-SHA256 y formato JWT
   (`cabecera.cuerpo.firma` en Base64URL), con vigencia de 8 horas. Si alguien
   altera un solo carácter del cuerpo, la firma deja de coincidir y el token se
   rechaza (probado en la batería de integración).
3. **Middleware `exigirSesion`**: valida la firma del token *y además* consulta la
   base de datos para confirmar que el usuario **sigue activo**. Un token
   criptográficamente válido de un usuario dado de baja es rechazado.
4. **Middleware `exigirAdministrador`**: comprueba el rol. Todos los endpoints de
   los módulos 2, 3 y 4 exigen **sesión + rol Administrador**.
5. **Mensaje genérico** ante credenciales incorrectas ("Usuario o contraseña
   incorrectos"): no se revela si falló el usuario o la contraseña, para no
   facilitar la enumeración de cuentas.

### Códigos de respuesta

| Código | Cuándo |
|--------|--------|
| 200 | Credenciales correctas |
| 400 | Falta el usuario o la contraseña |
| 401 | Credenciales incorrectas o token ausente/expirado/manipulado |
| 403 | Usuario inactivo o sin rol Administrador |

---

## 5. Módulo 2 · Servicio Técnico y Caja (flujo completo)

### 5.1 El ciclo de vida de una orden

```
Recepción ──► Pendiente ──► En Reparacion ──► Listo ──► Entregado
                    ▲              │               │
                    └──────────────┘               │
                     (retroceso / reapertura)      │
                                                 ▼
                                       Cobro + Factura + Cierre
```

La máquina de estados vive en `src/utils/estadosOrdenTecnico.js` y **el backend es
la autoridad**: si el cliente intenta un salto inválido (por ejemplo
`Pendiente → Listo`), responde `400` con el detalle de las transiciones permitidas.

> **Regla clave:** el estado `Entregado` **no se alcanza desde el panel del
> técnico**. Sólo lo aplica el sistema en la operación de **cobro**, de modo que
> ninguna orden puede entregarse sin haber sido facturada y pagada.

### 5.2 Endpoints

| Método | Ruta | Acción |
|--------|------|--------|
| GET | `/api/ordenes-tecnicas` | Panel del técnico (filtros: `estado`, `texto`, `cedula`, `soloPendientesDeCobro`) |
| GET | `/api/ordenes-tecnicas/indicadores` | KPI del taller |
| GET | `/api/ordenes-tecnicas/:id` | Ficha completa + repuestos + desglose |
| POST | `/api/ordenes-tecnicas/recepcion` | Recepción: cliente + dispositivo + orden "Pendiente" |
| PATCH | `/api/ordenes-tecnicas/:id/estado` | Cambia estado y registra el diagnóstico |
| POST | `/api/ordenes-tecnicas/:id/repuestos` | **Consume un repuesto** (descuenta inventario) |
| DELETE | `/api/ordenes-tecnicas/:id/repuestos/:codigo` | Devuelve el repuesto al inventario |
| POST | `/api/ordenes-tecnicas/:id/cobrar` | **Cobra**: suma mano de obra + repuestos, factura y cierra |
| GET | `/api/ordenes-tecnicas/:id/factura` | Comprobante de la orden cobrada |

### 5.3 Recepción (una sola transacción)

`POST /api/ordenes-tecnicas/recepcion` ejecuta en **una única transacción SQL**:

1. Da de alta el **cliente** si su cédula no existe (o reutiliza su ficha).
2. Da de alta el **dispositivo** si no estaba registrado para ese cliente (o
   reutiliza la ficha, para no perder el historial de reparaciones del equipo).
3. Toma el **número correlativo** de la orden (`OS-000001`).
4. Crea la **orden** con estado `Pendiente` y totales en cero.

Si algo falla, no queda ni el cliente ni el equipo "huérfanos" sin su orden.

### 5.4 Consumo de inventario (requisito explícito)

`POST /api/ordenes-tecnicas/:id/repuestos` — al agregar un repuesto, **una sola
transacción** encadena:

1. `SELECT ... FOR UPDATE` sobre la fila del producto (bloqueo pesimista).
2. `UPDATE producto SET existencia = existencia - cantidad`.
3. `INSERT INTO movimiento_inventario` con `tipo_movimiento = 'SALIDA'` y
   **`origen = 'SERVICIO_TECNICO'`** ← el requisito de marcar la salida.
4. `INSERT`/`UPDATE` en `alerta_stock` si la existencia llegó al mínimo.
5. `INSERT`/`UPDATE` en `detalle_orden` y recálculo de los totales de la orden.

Si no hay stock suficiente, se hace **ROLLBACK de todo**: no puede existir una
orden con un repuesto descontado del almacén sin su asiento en el kádex.

### 5.5 Cobro (requisito explícito)

`POST /api/ordenes-tecnicas/:id/cobrar`:

1. Exige que la orden esté en estado **`Listo`** (no se cobra un equipo sin reparar).
2. **Recalcula el total dentro de la transacción**:
   `total = costo_mano_obra + SUM(detalle_orden)`. El importe **no se toma del
   navegador**, de modo que no puede manipularse desde el cliente.
3. Si el monto enviado no coincide con el calculado (tolerancia de 1 centavo),
   responde `400`.
4. Toma el correlativo de factura (`FAC-000001`), inserta el **pago**
   (`metodo_pago`, `monto_usd`, `tasa_cambio`, `referencia`, `id_caja`,
   `tipo_origen = 'SERVICIO_TECNICO'`).
5. Marca la orden como `cobrada = 1`, le asigna `numero_factura`, `id_caja`,
   `fecha_cierre` y la pasa a **`Entregado`**.
6. Marca como atendidas las alertas de los repuestos consumidos.

Una orden **no puede cobrarse dos veces**: hay un índice `UNIQUE` sobre
`pago.id_ordentec` y una comprobación explícita (responde `400` la segunda vez).

### 5.6 Caja

| Método | Ruta | Acción |
|--------|------|--------|
| GET | `/api/caja` | Turnos con su recaudación |
| GET | `/api/caja/activa` | Caja abierta (o `null`) |
| GET | `/api/caja/:id/pagos` | Arqueo detallado |
| POST | `/api/caja/abrir` | Apertura con fondo inicial |
| POST | `/api/caja/:id/cerrar` | Cierre con cálculo de sobrante/faltante |

No puede haber **dos cajas abiertas** a la vez (el cobro se asigna
automáticamente a "la caja abierta" cuando no se indica una). El cierre compara el
dinero contado con el registrado y clasifica el resultado en `CUADRADA`,
`SOBRANTE` o `FALTANTE`.

---

## 6. Módulo 3 · Venta Directa (Mostrador)

### Endpoints

| Método | Ruta | Acción |
|--------|------|--------|
| GET | `/api/ventas` | Histórico de facturas |
| GET | `/api/ventas/indicadores` | KPI del mostrador |
| GET | `/api/ventas/mas-vendidos` | Informe de rotación |
| GET | `/api/ventas/metodos-pago` | Formas de pago admitidas |
| GET | `/api/ventas/:numFactura` | Factura completa |
| POST | `/api/ventas` | **Registra la venta** |
| POST | `/api/ventas/:numFactura/anular` | Anula y devuelve el stock |

### Flujo transaccional de `POST /api/ventas`

```
1. Valida el carrito y consolida líneas repetidas (la PK de detalle_factura es
   compuesta: num_factura + cod_producto).
2. Busca o CREA al cliente (cédula como llave).
3. Abre transacción:
     a. Por cada producto: lee precio y existencia con FOR UPDATE, valida stock
        y calcula el total con el PRECIO DEL CATÁLOGO (nunca el del navegador).
     b. Toma el correlativo de factura (FAC-000001).
     c. INSERT en `venta`.
     d. Por cada producto:
          · descuenta la existencia (UPDATE producto),
          · INSERT en `movimiento_inventario` (SALIDA, origen 'VENTA'),
          · INSERT en `detalle_factura`,
          · evalúa y registra la ALERTA de stock mínimo si corresponde.
     e. INSERT en `pago` (tipo_origen = 'VENTA').
     f. COMMIT.
```

Si **cualquier** producto no tiene stock suficiente, se revierte la factura
completa: no quedan facturas a medias ni stock descontado sin documento.

`POST /api/ventas/:numFactura/anular` es una **baja lógica** (`estado = 0`): la
factura es un documento contable y no se borra. Los productos vuelven al almacén
con un asiento de **ENTRADA** auditado en el kádex.

---

## 7. Módulo 4 · Automatización de alertas de stock mínimo

### Cómo funciona

La alerta **no** se genera por un temporizador ni por una consulta periódica: se
dispara **de forma reactiva y síncrona** en el mismo instante en que se descuenta
stock, ya sea por:

- **Venta Directa** → `origen = 'VENTA'`
- **Consumo de repuesto en Servicio Técnico** → `origen = 'SERVICIO_TECNICO'`

Condición de disparo: `existencia_posterior <= stock_minimo`.

La alerta viaja **dentro de la misma transacción** que el descuento, por lo que o
se guardan los dos, o no se guarda ninguno. Además se **devuelve en la respuesta
HTTP** de la venta o del consumo del repuesto, de modo que el frontend la muestra
inmediatamente (Toast + campana de notificaciones) sin recargar la pantalla.

Mensaje generado (requisito literal):

```
Alerta de stock mínimo para el producto "<nombre>": alcanzó el stock mínimo (N u.).
Existencia actual: M u.
```

Variantes según la gravedad: `se agotó` (existencia 0) o `quedó por debajo del
stock mínimo`.

**Regla anti-ruido:** si el producto ya tiene una alerta sin atender, no se crea
una segunda fila; se **actualiza** la existente con la nueva existencia y el nuevo
documento. Así la campana muestra un aviso por producto y no una lista inflada con
la misma alerta repetida.

### Endpoints

| Método | Ruta | Acción |
|--------|------|--------|
| GET | `/api/alertas/stock` | Listado (`?soloPendientes=true`) |
| GET | `/api/alertas/stock/indicadores` | Contadores (campana) |
| GET | `/api/alertas/stock/productos-riesgo` | Productos activos en o bajo el mínimo |
| PATCH | `/api/alertas/stock/:id/atender` | Marca una alerta como atendida |
| PATCH | `/api/alertas/stock/producto/:codigo/atender` | Atiende todas las de un producto |

---

## 8. Cambios en el esquema relacional (migración 005)

### Tablas nuevas

| Tabla | Para qué |
|-------|----------|
| `alerta_stock` | Respaldo persistente (y auditable) de las alertas de stock mínimo. |
| `secuencia_factura` | Correlativos de facturas (`FAC-`) y órdenes (`OS-`). |

### Cambios en tablas existentes

| Tabla | Cambio | Motivo |
|-------|--------|--------|
| `usuario` | `+estado`, `+ultimo_acceso`, `username` UNIQUE, PK autoincremental | Baja lógica, auditoría de acceso y autenticación sin ambigüedad. |
| `dispositivo` | PK autoincremental, se elimina `numero_serie_UNIQUE` | Un mismo equipo puede reingresar al taller varias veces. |
| `orden_tecnico` | `+accesorios`, `+patron_desbloqueo`, `+observaciones`, `+costo_mano_obra`, `+total_repuestos`, `+total`, `+cobrada`, `+numero_factura`, `+id_caja`, `+fecha_cierre` | Desglose económico, cierre y trazabilidad del cobro. |
| `detalle_orden` | `+tipo_item`, `+subtotal` | Distingue repuestos y guarda el importe de la línea. |
| `venta` | `+id_usuario`, `+tipo_venta`, `+estado`; `fecha_venta` pasa a DATETIME | Cajero, baja lógica y hora exacta del comprobante. |
| `caja` | PK autoincremental, `+fecha_cierre`, `+observaciones`; `estado` normalizado | Control de turnos y arqueo. |
| `pago` | PK autoincremental; **`venta_num_factura` e `id_ordentec` pasan a NULL**; índices UNIQUE | *Corrección clave:* en el DDL original ambas columnas eran `NOT NULL`, lo que hacía **imposible** registrar un cobro, porque todo pago pertenece a una venta **o** a una orden, nunca a las dos. |
| `movimiento_inventario` | **`+origen`** (indexado), `motivo` ampliado a 255 | Marcar la salida como **"Venta"** o **"Servicio Técnico"** de forma indexable, sin depender del texto libre. |
| `rol_usuario` | Se añade el rol `administrador` (id 1) | Permisos globales. |

> El rol `almacenista` (id 3) y el usuario sembrado por la migración 004 se
> **conservan**: son referenciados por el histórico del kádex y borrarlos rompería
> la integridad referencial.

---

## 9. Verificación

### 9.1 Batería de integración (63 comprobaciones)

Con el servidor en marcha:

```powershell
cd Backend
node scripts/pruebaModulosNuevos.mjs
```

Recorre los cuatro módulos de punta a punta contra el API real y la base de datos:
login (incluido el rechazo de un token manipulado), recepción, máquina de estados,
consumo de repuestos con verificación del kádex, cobro con factura, venta directa,
alerta automática de stock mínimo, arqueo de caja e integración entre módulos
(historial del cliente, indicadores y orígenes del kádex).

Para limpiar los datos que genera:

```powershell
node scripts/limpiarDatosPrueba.mjs
```

> Este script limpia **todo** el proyecto: los datos de los módulos nuevos
> (cliente `V-99999999`, órdenes, facturas, pagos y alertas), los registros
> `PRUEBA-%` del Módulo de Inventario, restaura la existencia y el stock mínimo
> del producto real `REP-PAN-001`, y reinicia los correlativos. Respeta el orden
> de las llaves foráneas y al final imprime el estado de cada tabla.

### 9.2 Prueba del Módulo de Inventario (FASE I)

El script original sigue disponible y en verde:

```powershell
node scripts/pruebaIntegracionApi.mjs
```

---

## 10. Herramientas de consola incluidas

| Script | Para qué |
|--------|----------|
| `scripts/generarHashAdmin.mjs` | Cifra una contraseña con scrypt y la imprime lista para la base de datos. |
| `scripts/ejecutarMigracion.mjs` | Aplica un archivo `.sql` completo (respeta `DELIMITER` y las cadenas `PREPARE/EXECUTE/DEALLOCATE`). |
| `scripts/pruebaModulosNuevos.mjs` | Batería de integración de los módulos nuevos (63 comprobaciones). |
| `scripts/limpiarDatosPrueba.mjs` | Limpia los datos de prueba de todo el proyecto y restaura el estado real. |
| `scripts/pruebaIntegracionApi.mjs` | Batería de integración del Módulo de Inventario (FASE I, 74 comprobaciones). |

`Database/scripts/limpiarDatosPrueba.ps1` sigue existiendo como envoltorio de
`limpiarDatosPrueba.mjs` para quien prefiera invocarlo desde PowerShell.

---

## 11. Nota sobre la convivencia con el rol Almacenista (FASE I)

Esta entrega incorpora **únicamente el rol Administrador**, tal como se solicitó.
El rol `almacenista` (id 3) y el usuario sembrado por la migración 004 **se
conservan** porque el kádex histórico los referencia con una llave foránea:
eliminarlos rompería la integridad referencial del inventario ya registrado.

Los módulos del inventario (FASE I) siguen aceptando el encabezado
`X-Usuario-Responsable` para firmar sus movimientos, mientras que los módulos
nuevos firman con el **usuario real de la sesión** (`Authorization: Bearer`).

---

## 12. Decisiones técnicas y su justificación

| Decisión | Por qué |
|----------|---------|
| **scrypt en lugar de bcrypt** | El proyecto no incluía dependencias de cifrado y el entorno de trabajo no permite instalar paquetes nuevos. `crypto` es nativo de Node.js y `scrypt` es el algoritmo recomendado para contraseñas por ser deliberadamente costoso en CPU y memoria. |
| **Token firmado con HMAC en lugar de `jsonwebtoken`** | Se emite el mismo formato JWT (HS256) usando sólo `crypto`, sin agregar dependencias. |
| **`origen` como columna aparte del `motivo`** | El requisito exige marcar la salida como "Venta" o "Servicio Técnico". Con una columna indexada el filtro es eficiente y no depende de comparar texto libre. |
| **Correlativos en una tabla con `UPDATE ... + 1`** | El número se toma **dentro** de la transacción del documento, con la fila bloqueada: dos cajeros facturando a la vez obtienen números distintos y consecutivos. Se evita calcular `MAX() + 1`, que bajo concurrencia produce duplicados. |
| **El total lo calcula siempre el backend** | Ni la venta ni el cobro del taller aceptan el importe del navegador. Es el control que impide manipular precios desde el cliente. |
| **Baja lógica en facturas y catálogo** | Las facturas y los movimientos son documentos contables y de auditoría protegidos por llaves foráneas `ON DELETE RESTRICT`. Borrarlos destruiría el histórico. |
| **`final_conexion.release()` siempre en `finally`** | Toda transacción devuelve la conexión al pool incluso si hubo excepción, para no agotar el pool (`connectionLimit: 10`). |
