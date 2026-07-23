# ADR-0009: Autenticación y autorización (login por roles)

- **Estado**: Aceptado
- **Fecha**: 2026-07-23
- **Decisores**: Arquitecto técnico, dueño

## Contexto

El POS necesita login seguro con jerarquía de roles: **Admin, Encargado, Cajero,
Vendedor** (más Contador externo de solo lectura). Debe funcionar en la LAN de
cada sucursal (offline-first) y dejar rastro de auditoría. Es un comercio chico:
la solución tiene que ser segura pero no sobre-diseñada.

## Decisiones

### Contraseñas
- **Hashing con Argon2id** (`@node-rs/argon2`, binarios precompilados → sin
  toolchain nativo en Windows). Nunca texto plano. Verificación "señuelo" cuando
  el usuario no existe para igualar tiempos (mitiga timing attacks).

### Sesiones
- **Sesión server-side revocable**, no JWT. El cliente recibe un **token opaco**
  (32 bytes aleatorios) en **cookie httpOnly** (`sameSite=lax`, `path=/`); en la
  DB se guarda **solo el hash SHA-256 del token** (si se filtra la base, el token
  no sirve). Permite **revocar** (logout, cierre de turno), expira (12 h) y queda
  auditada. En producción la cookie va con `secure` (HTTPS).
- Las sesiones **no se sincronizan** entre sucursales (son locales a cada nodo),
  coherente con el modelo offline-first ([ADR-0001](0001-offline-first-y-sincronizacion.md)).

### Autorización (RBAC)
- **Mapa estático rol → permisos en código** (`auth/permisos.ts`), NO una ACL
  configurable en base de datos. Para 4 roles es lo correcto: se audita de una
  mirada y no agrega una tabla de permisos que nadie va a tocar. Si algún día se
  necesitan permisos por-usuario, se migra.
- Guards en el servidor (`requiereAuth`, `requierePermiso`) por endpoint, con
  **menor privilegio**. El `vendedorId` de una venta sale de la **sesión**, nunca
  del cliente (no se confía en el front).

### Defensa y auditoría
- **Bloqueo temporal** tras 5 intentos fallidos (15 min) contra fuerza bruta.
- **Mensajes de error genéricos** en login (no revelan si el usuario existe).
- **Auditoría** de `LOGIN_OK`, `LOGIN_FALLIDO`, `LOGOUT` en `RegistroAuditoria`
  (reusa la preocupación transversal, [ADR-0008](0008-auditoria-transversal-y-uuidv7.md)).

### Matriz de permisos
Jerarquía Admin > Encargado > Cajero ≈ Vendedor. Cajero y Vendedor son roles
**distintos**: el Vendedor arma el ticket y consulta stock; el **cobro (cerrar la
venta) y la caja** son del Cajero. Detalle en `auth/permisos.ts`.

## Opciones descartadas

- **JWT stateless**: más simple, pero no se puede revocar antes de expirar y es
  más expuesto a XSS si se guarda en el cliente. Para un POS con turnos y
  auditoría, la sesión revocable server-side es mejor.
- **PIN de piso** para Cajero/Vendedor: más ágil en el mostrador pero menos
  seguro (PIN corto). Se dejó para más adelante; hoy password para todos.
- **ACL dinámica en DB**: sobre-ingeniería para 4 roles.

## Consecuencias

- **Se gana**: login seguro y auditado, revocación real, RBAC claro y barato,
  funciona offline en la LAN.
- **Se pierde / se acepta**: los permisos se cambian tocando código (no config);
  no hay aún gestión de usuarios por UI (se siembran) ni recuperación de
  contraseña. CSRF se mitiga con `sameSite=lax` + same-origin (si se expusiera a
  otros orígenes, sumar token CSRF).
- **Seguimiento**: gestión de usuarios (alta/baja/cambio de contraseña) por UI,
  política de contraseñas más estricta, y evaluar PIN de piso si la velocidad en
  caja lo pide. Parte del módulo Empleados (Etapa 8).
