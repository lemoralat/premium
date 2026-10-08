# Lemora — Migración a Supabase (documentación técnica)

> **Proyecto:** tienda Lemora (frontend estático vanilla HTML/CSS/JS + funciones serverless en Vercel)
> **Estado:** migración implementada (pendiente de cargar credenciales y desplegar)
> **Dominio de producción:** `https://supabase.lemora.lat`

Esta documentación reemplaza el funcionamiento basado en **Google Sheets + Apps Script + Google Drive** por una arquitectura **Supabase** de un solo tenant (una tienda = un proyecto Supabase). Incluye arquitectura, modelo de datos, políticas de seguridad, Storage, variables de entorno, pasos de despliegue, panel de administración, riesgos y el reporte de baja de Google.

---

## 1. Resumen

Antes, los datos vivían en Google Sheets (productos, cupones, slider, banners, reseñas, pedidos), un Apps Script proxyaba pedidos desde Vercel y las imágenes apuntaban a Google Drive.

Ahora:

| Pieza anterior | Reemplazo en Supabase |
|---|---|
| Google Sheets (catálogo, cupones, slider, banners, reseñas, configuración) | **PostgreSQL** con tablas `products`, `coupons`, `sliders`, `banners`, `reviews`, `settings` |
| Google Sheets (pedidos) + escalado manual | Tabla `orders` + cada pedido con sus líneas en `order_items` |
| Google Apps Script (proxy webhook de pedidos) | Función serverless `api/pedido.js` → RPC `insertar_pedido` (transacción única en la BD) |
| Numeración manual / hojas | Trigger `PED-####` automático en la BD |
| Google Drive (imágenes) | **Supabase Storage**, una sola fuente: las imágenes se suben desde el panel y las columnas de URL externa se eliminaron en la `0043` |
| Apps Script Auth (admin por hoja) | **Supabase Auth** (correo + contraseña, recuperación de contraseña) |
| Edición en la planilla | **Panel `/admin`** con CRUD completo y en español |

**El frontend de la tienda no cambió de aspecto ni de comportamiento**: el checkout sigue siendo por WhatsApp, el carrito y favoritos en `localStorage`, `gracias.html` sigue validando token, la numeración `PED-####`, las reglas de descuento y el slider/banners/reseñas se mantienen.

---

## 2. Arquitectura

```
┌───────────────────────────  NAVEGADOR  ───────────────────────────┐
│                                                                   │
│   Tienda pública (HTML/CSS/JS)      Panel admin /admin/*          │
│   js/supabase.js (anon key)         js/admin/*  (anon key + auth) │
│   └─ SELECT público (tienda)        └─ DML completo (admin)       │
│                                                                   │
└──────────────┬────────────────────────────────────┬───────────────┘
               │                     Supabase Auth (email/contraseña)
               ▼                                    ▼
┌──────────────────────────  SUPABASE  ─────────────────────────────┐
│  PostgreSQL + RLS      Storage (6 buckets)      Auth              │
│  products, categories, coupons, sliders, banners, reviews,        │
│  orders, order_items, settings, profiles                          │
│  RPC insertar_pedido (transacción) + triggers                     │
└──────────────┬────────────────────────────────────────────────────┘
               │   service_role (SOLO servidor)
               ▼
┌──────────────────────────  VERCEL  ───────────────────────────────┐
│  Estática (HTML/CSS/JS) + api/pedido.js (Node, service_role)      │
└────────────────────────────────────────────────────────────────────┘
```

Reglas de oro:

- **Anon key (`SUPABASE_PUBLISHABLE_KEY`)**: pública, viaja en `js/env.generated.js`.
- **Service role key (`SUPABASE_SERVICE_ROLE_KEY`)**: existe SOLO como variable de entorno en Vercel, usada únicamente por `api/pedido.js`. Nunca en HTML/JS.
- **Modelo single-tenant**: no hay `tenant_id`; el proyecto Supabase ES la tienda. Así queda explicado en el comentario de cabecera de `migrations/0001_schema.sql`.
- **Seguridad real con RLS**, no rutas ocultas.

---

## 3. Base de datos (`migrations/0001_schema.sql`)

### 3.1 Tablas

| Tabla | Propósito | Notas |
|---|---|---|
| `categories` | Categorías del catálogo | `name`, `slug`, `position`, `active` |
| `products` | Productos | `id` **integer identity** (conserva los ids 1–16 del JSON original), `nombre`, `descripcion`, `descripcion_detallada`, `precio` (numeric), `precio_anterior`, `stock`, `caracteristicas` (jsonb array), `activo`, `destacado` (default false: se muestra primero en el home mezclando categorías), `category_id` FK → categories (ON DELETE SET NULL) |
| `product_options` | Variantes (p. ej. "Talles") | FK → products, cascada al borrar producto |
| `product_option_values` | Valores de variante (p. ej. "40, 41, 42") | FK → product_options, cascada |
| `product_images` | Imágenes (1 principal + galería) | `storage_path` (única fuente de imagen; `external_url` se eliminó en la `0043`), `es_principal`, `position`, FK cascada |
| `coupons` | Cupones manuales | `codigo`, `porcentaje`, `expira` (date), `activo`. **Máximo 10 filas** (trigger `trg_cupones_max`, `0036`); el tope cuenta vigentes, inactivos y vencidos |
| `sliders` | Slides del hero | `titulo`, `texto_soporte`, `storage_path`, `link`, `target` (`interno` default / `externo`), `position`, `activo`, `mostrar_en` (`ambos` default / `mobile` / `desktop`, filtrado por dispositivo en la tienda). **Máximo 12 filas** (trigger `trg_sliders_max`, `0037`); el tope cuenta activas e inactivas, y cubre también la acción "Duplicar" |
| `banners` | Banners promocionales | `imagen_path`, `logo_path` (las columnas `imagen_url`/`logo_url` se eliminaron en la `0043`), `badge`, `titulo`, `boton`, `link`, `target` (`interno` default / `externo`), `position`, `activo`, `en_carrito` (`true` = el del carrito, `0030`). **Tope por destino**: 4 al inicio + 1 al carrito = 5 en total (trigger `trg_banners_max`, `0038`) |
| `reviews` | Testimonios | `nombre`, `valoracion` (1–5), `resena`, `fecha`, `storage_path`, `position`, `activo`. **Máximo 10 filas** (trigger `trg_resenas_max`, `0039`); el tope cuenta activas e inactivas |
| `iconos_pie` | Iconos de confianza del pie del home | `titulo` (obligatorio), `descripcion`, `storage_path`, `position`, `activo`. **Máximo 3 filas** (trigger `trg_iconos_pie_max`, `0040`); el 3 no es arbitrario, viene del grid `repeat(3, 1fr)` de `.iconos` en desktop |
| `preguntas_frecuentes` | Preguntas de la página faq.html (sección Configuración) | `icono` (clase FontAwesome, opcional), `pregunta`, `respuesta`, `position`, `activo`. **Máximo 20 filas** (trigger `trg_preguntas_frecuentes_max`, `0041`); el tope cuenta activas e inactivas |
| `marquee_items` | Mensajes de la barra marquee (sección Diseño) | `texto` (obligatorio), `position`, `activo`; sin filas activas la barra no se muestra. **Máximo 6 filas** (trigger `trg_marquee_items_max`, `0035`); el tope cuenta activas e inactivas |
| `orders` | Pedidos | `numero` (generado `PED-####` por trigger), `cliente` (jsonb: nombre, email, teléfono, dirección, ciudad, provincia, CP, notas), `subtotal`, `descuento`, `porcentaje`, `cupon`, `total`, `estado` (Pendiente / Procesando / Enviado / Entregado / Cancelado), `token` (uuid), `created_at` |
| `order_items` | Líneas de pedido | `product_id` (ON DELETE SET NULL: el pedido histórico sobrevive al borrado del producto), `nombre` (congelado al momento de la compra), `variante_texto`, `quantity`, `precio_unitario` |
| `settings` | Configuración global, **fila única id=1** | `site_name`, `whatsapp_number`, `whatsapp_default_message`, `discount_threshold` (100000) y `discount_percent` (10), compra mínima **dual** (`compra_minima_cantidad` y `compra_minima_monto`, ambas con 0 = inactiva y aplicables a la vez — sección Descuentos; `0023` reemplazó el par `compra_minima_modo`/`compra_minima_valor` de `0020`), `transfer_alias`, `transfer_entity`, `transfer_holder` (vacíos por defecto desde `0024`: la plantilla no nace con datos de una tienda en concreto), `email_contact`, `address` (ubicación del negocio: dirección como texto o URL de mapas; se resuelve en `api/ubicacion.js` y se muestra en OpenStreetMap en `contacto.html`), `site_description` (descripción del negocio: el meta description del sitio, que `js/template.js` aplica por JS a las metas marcadas con `data-desde-config` en el HTML; `0033`), <code>modo_web</code> (tipo de web: <code>'venta'</code> default o <code>'turnos'</code>; <code>0051</code>), redes sociales, popup de salida (`popup_titulo/descripcion/cta/cta_url/activo`), marquee (`marquee_activo`, `marquee_color_fondo` — sección Diseño), tamaño del logotipo (`logo_tamano` — Small/Medium/Large), formato de cards (`card_image_format` — 1:1/3:2/4:5), tema del panel (`admin_tema` — `claro`/`oscuro`, `0027`) |
| `profiles` | Perfil del admin (una fila por usuario) | `full_name`, `role`, `created_at`. Se crea automáticamente al registrarse por el trigger `handle_new_user` |

### 3.2 Triggers y funciones

- **Numeración de pedidos**: el trigger `orders_numero_before_insert` obtiene `PED-####` desde la secuencia `orders_numero_seq`, garantizando la numeración consecutiva aunque haya borrados.
- **`set_updated_at`**: actualiza `updated_at` en cada `UPDATE` de las tablas que lo tienen.
- **`handle_new_user`**: inserta el `profiles` cuando se crea un usuario en `auth.users`.
- **`insertar_pedido` (RPC)**: la pieza central del checkout. Una única transacción:
  1. Valida `p_cliente` (jsonb) y `p_items` (array de `{product_id, quantity, variante_texto}`).
  2. Lee **precios y stock reales de la BD** para cada ítem (nunca confía en el precio del navegador).
  3. Verifica stock; descuenta unidades por producto (si se pasara de stock, la transacción revierte).
  4. Recalcula el descuento: **se aplica el mayor entre** el descuento por umbral (subtotal ≥ `discount_threshold` → `discount_percent`%) **y** el cupón, **no se acumulan**.
  5. Valida el cupón contra la tabla (activo y no vencido) y guarda el código aplicado.
  6. Inserta `orders` + `order_items` con el `token` provisto (o uno nuevo) y devuelve `{ status: 'success', numero, token, subtotal, descuento, total, mensaje }`.

El frontend mantiene el contrato HTTP: `POST /api/pedido` espera `{ status: 'success' }`.

### 3.3 Qué siembra la instalación (`migrations/0002_seed.sql`)

**La plantilla se instala vacía.** Antes esta sección describía el volcado del catálogo de la tienda que originó el proyecto (16 productos con sus precios, 48 imágenes en Google Drive, 3 cupones, 6 slides, 5 banners, 12 reseñas y 3 iconos del pie). Todo eso se sacó: era contenido de ese negocio, no de la plantilla, y un cliente que la compra no tiene por qué heredar el catálogo de otro.

Lo que **sí** queda en `0002` es la fila `id = 1` de `settings`, que no es opcional:

| Por qué no se puede omitir | |
|---|---|
| `admin/js/configuracion.js` hace `.select('*').eq('id', 1).single()` | Con 0 filas el `.single()` tira error y la pestaña Configuración no abre |
| El guardado es `.update(payload).eq('id', 1)` | Con 0 filas actualiza 0 filas **sin avisar**: el admin creería que guardó |
| `insertar_pedido` hace `select … from settings where id = 1` | Sin fila no hay configuración de descuento ni de cupón |

Nace con `site_name = 'Mi Tienda Online'`, WhatsApp y datos de transferencia vacíos, redes sociales vacías y **descuento automático en 0 / 0 (desactivado)**. Todo lo demás se carga desde el panel. Las secciones sin datos (hero, banners, reseñas, iconos del pie, FAQ) **se ocultan solas**, no muestran contenido de relleno.

Los `setval` de las secuencias se mantienen, envueltos en `greatest(coalesce(max(id), 0), 1)`: la forma anterior (`setval(seq, (select max(id) from t))`) revienta con *"value NULL is not allowed"* en una base vacía, que es justo el caso de una instalación nueva de la plantilla.

`0004_iconos_pie.sql` ya no siembra los 3 iconos del pie (pagos con Mercado Pago, envíos desde Córdoba, "yo me comunaré contigo"). El texto era de esa tienda; el mismo contenido estaba duplicado en el array `ICONOS_ESTATICOS` de `js/iconos-pie.js`, y los dos se quitaron.

---

## 4. Políticas RLS (`0001_schema.sql` + `0003_storage.sql` + `0004_iconos_pie.sql` + `0007_seguridad.sql` + `0026_cierre_rls_admin.sql`)

Todas las tablas tienen **row level security habilitada**. El patrón final lo fija **`0007_seguridad.sql`** (tabla `admins` + `public.es_admin()`), reforzado por **`0026_cierre_rls_admin.sql`** para las tablas nacidas después. Resumen del estado final:

| Tabla | Lectura pública (anon) | Escritura |
|---|---|---|
| `categories` | Solo `active = true` | Solo admin (`es_admin()`) |
| `products` | Solo `activo = true` | Solo admin (`es_admin()`) |
| `product_options` / `product_option_values` | Sí | Solo admin (`es_admin()`) |
| `product_images` | Sí | Solo admin (`es_admin()`) |
| `coupons` | Solo `activo = true AND expira >= hoy` | Solo admin (`es_admin()`) |
| `sliders` | Solo `activo = true` | Solo admin (`es_admin()`) |
| `banners` | Solo `activo = true` | Solo admin (`es_admin()`) |
| `reviews` | Solo `activo = true` | Solo admin (`es_admin()`) |
| `iconos_pie` | Solo `activo = true` | Solo admin (`es_admin()`) — cerrado en `0026` |
| `preguntas_frecuentes` | Solo `activo = true` | Solo admin (`es_admin()`) — cerrado en `0026` |
| `marquee_items` | Solo `activo = true` | Solo admin (`es_admin()`) — cerrado en `0026` |
| `admins` | **No** (tabla sin policies: nadie lee ni se autopromueve) | Solo service_role / dueño SQL |
| `orders` / `order_items` | **No** (solo administrador) | Alta solo por la RPC `insertar_pedido` (service_role); el admin únicamente **lee** y cambia `estado` |
| `turnos` | **No** (solo administrador) — única tabla "de agenda" del modo turnos | Alta solo por la RPC `insertar_turno` (service_role); el admin **lee**, cambia `estado` (Pendiente/Confirmado/Realizado/Cancelado) y borra por la RPC `borrar_turnos` (`0051`) |
| `settings` | Sí (datos públicos) | Solo admin (`es_admin()`) |
| `profiles` | Solo la propia fila | Solo `full_name` de la propia fila |

> **Estar autenticado NO alcanza para escribir.** El acceso al panel exige además estar dado de alta en `public.admins`:
> ```sql
> insert into public.admins (user_id)
> select id from auth.users where email = 'TU-EMAIL@EJEMPLO.COM';
> ```
> La tabla `admins` tiene RLS activada y ninguna policy para `anon`/`authenticated`, así que no se puede consultar ni auto-asignarse el rol. Si además se desactiva "Allow new users to sign up" en Authentication → Sign In / Providers, el alta de cuentas queda cerrada.

### Storage (`0003_storage.sql` + `0021_imagenes_storage.sql`)

- **6 buckets públicos de lectura**: `products`, `branding`, `slider`, `banners`, `reviews`, `iconos`.
- Lectura pública para anon/authenticated; **subida/actualización/borrado solo admin** (`public.es_admin()`).
- Convención: la BD guarda el `storage_path` completo `"<bucket>/<ruta>"` y la URL pública se deriva en el frontend con `storage.getPublicUrl()`.
- Carpetas por entidad: `products/<producto_id>/`, `slider/`, `banners/`, `reviews/`, `branding/`, `iconos/`.

---

## 5. Variables de entorno

### 5.1 Definición

| Variable | Dónde se usa | ¿Pública? |
|---|---|---|
| `SUPABASE_URL` | build de env, admin, API | Sí (es la URL del proyecto) |
| `SUPABASE_PUBLISHABLE_KEY` (anon) | build de env → `js/env.generated.js`, admin | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo** `api/pedido.js` en Vercel | **No — nunca al frontend** |
| `SITIO_URL` | build de env → reemplaza `TU-DOMINIO.com` en los 8 HTML, `robots.txt` y genera `sitemap.xml` | Sí (es el dominio público del cliente) |
| `ALLOWED_ORIGINS` | `api/_lib/origenes.js` (CORS de la API) | — (config de Vercel) |

### 5.2 Archivos

- `.env.example` — plantilla documentada.
- `js/env.generated.js` — **commiteado como placeholder vacío** y sobrescrito por `npm run build:env`. Contiene solo la URL y la anon key (datos públicos).
- `scripts/build-env.mjs` — genera `env.generated.js` desde `process.env`, reemplaza `TU-DOMINIO.com` por `SITIO_URL` en los 8 HTML raíz y en `robots.txt`, y genera `sitemap.xml`.
- `package.json` — dependencia `@supabase/supabase-js` (visible para Vercel) y scripts `build:env` / `build`.

### 5.3 Pasos

**Local:**
```bash
cp .env.example .env.local    # completar valores (incluye SITIO_URL)
npm install
npm run build:env             # crea env.generated.js + reemplaza TU-DOMINIO.com + sitemap.xml
```

**Vercel** (Project Settings → Environment Variables): definir `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `SITIO_URL` en Production/Preview/Development. El build de Vercel regenera `env.generated.js`, reemplaza el dominio y genera `sitemap.xml` de forma automática (el script `build` hace `build:env`).

---

## 6. Flujo del checkout (WhatsApp + registro del pedido)

1. El cliente arma el carrito (igual que antes, `localStorage.cart`).
2. `js/formulario.js` calcula totales con los **precios reales** (`obtenerTotales` con datos de Supabase) y verifica el cupón.
3. Genera un `token` (uuid) que guarda en `sessionStorage` y lo pasa en el POST.
4. `POST /api/pedido` (Vercel) → `api/pedido.js` valida la estructura, arma `p_items` y llama `rpc('insertar_pedido', { p_cliente, p_items, p_cupon, p_token })` con la **service role key**.
5. La RPC ejecuta toda la lógica en una transacción (validar → recálculo con precios BD → cupón → descuento por umbral → descuento de stock → insertar).
6. La API responde `{ status: 'success', numero, token, ... }` → el frontend abre WhatsApp con el número calculado y redirige a `gracias.html?token=...`.
7. `gracias.html` valida el token y muestra los datos de transferencia **desde `settings`** (entidad, titular, alias), corrigiendo el bug histórico en que el alias mostrado y el copiado diferían.

El cupón se valida dos veces (frontend para UX, backend para correctitud); lo que manda es el backend.

---

## 7. Panel de administración (`/admin`)

- **Login**: `admin/login.html` — correo + contraseña (Supabase Auth). Incluye recuperación de contraseña: envía enlace a `admin/recuperar.html` donde se fija una contraseña nueva.
- **Router**: `admin/index.html` + `admin/js/admin-app.js` con navegación por hash (`#/productos`, `#/pedidos`, ...) y protección de sesión (`protegerAdmin`).
- **Secciones** (`admin/js/*.js`):
  - **dashboard** — métricas (productos activos, stock bajo, pendientes, ingresos 30 días, últimas órdenes/reseñas).
  - **productos** — CRUD completo: datos, categoría, precios, stock, **variantes** (opción + valores) e **imágenes** (subida desde disco con optimización automática a ≤1920px WebP, o por URL externa; elección de imagen principal; borrado con limpieza del archivo en Storage).
  - **categorias** — CRUD con orden y estado.
  - **pedidos** — filtros por estado, búsqueda, detalle del pedido (productos, descuentos, datos del cliente) y **cambio de estado** inline.
  - **turnos** — listado y filtros de solicitudes de turno (modo turnos), **cambio de estado** inline (Pendiente → Confirmado / Realizado / Cancelado), detalle del cliente, cita y servicio, búsqueda y borrado individual o por lote (`borrar_turnos`).
  - **cupones** — CRUD con vencimiento y vigencia.
  - **slider / banners / resenas / iconos-pie** — CRUD con preview y subida de imágenes.
  - **configuracion** — **tipo de web** (venta / turnos), WhatsApp, descuentos, transferencia, redes, **popup de salida** (título, descripción, CTA, destino y estado) y **preguntas frecuentes** (repetidor con pregunta, respuesta, orden y ícono FontAwesome opcional). Los cambios se reflejan en la tienda en ≤ 1 min por la caché.
  - **cuenta** — perfil, cambio de contraseña y cierre de sesión.
- **Estilo**: `admin/css/admin.css` usa los tokens visuales de la tienda (primario `#2563eb`, éxito `#00a650`, peligro `#ef4444`).
- **Seguridad**: la sesión se persiste con `persistSession`; escrita contra RLS de `authenticated`.

---

## 8. Puesta en marcha (checklist de despliegue)

1. **Crear proyecto** en https://supabase.com (plan free). Anotar `URL`, `anon key` y `service_role key` (Project Settings → API).
2. **Ejecutar las migraciones** en el SQL Editor de Supabase, **en orden**:
   - `migrations/0001_schema.sql` (esquema + RLS + funciones)
   - `migrations/0002_seed.sql` (fila `settings` id=1 y secuencias — **no** siembra catálogo; ver §3.3)
   - `migrations/0003_storage.sql` (buckets y políticas; crea la tabla `admins` y `public.es_admin()`, y es autosuficiente: no depende de 0007)
   - `migrations/0004_iconos_pie.sql` (tabla `iconos_pie`, bucket `iconos`, políticas extendidas; **no** siembra los 3 iconos del pie, ver §3.3)
   - `migrations/0005_enlace_target.sql` (columna `target` en `sliders` y `banners`: `interno` → `_self` default, `externo` → `_blank`)
   - `migrations/0006_productos_destacado.sql` (columna `destacado` en `products`, default false)
   - `migrations/0007_seguridad.sql` (tabla `admins` + re-creación de `public.es_admin()` con el mismo cuerpo, policies de escritura exigiendo admin)
   - `migrations/0008_higiene.sql` (perfil: `full_name` como única columna editable)
   - `migrations/0009_diseno.sql` (sección Diseño: `logo_path`, `favicon_path`, `og_image_path`, `color_principal` negro, `estilo_bordes`)
   - `migrations/0010_color_principal_negro.sql` (default del color principal → negro)
   - `migrations/0011_redes_sociales.sql` (redes del header: YouTube, X, Pinterest, LinkedIn, WhatsApp y Otra sobre las 3 existentes)
   - `migrations/0012_iconos_fontawesome.sql` (sección Iconos: columna `icono` FontAwesome en `iconos_pie`, con selector curado + buscador en el dashboard)
   - `migrations/0013_popup_salida.sql` (Configuración → Popup de salida: `popup_titulo`, `popup_descripcion`, `popup_cta`, `popup_cta_url`, `popup_activo`)
   - `migrations/0014_preguntas_frecuentes.sql` (tabla `preguntas_frecuentes` + RLS; sin seed: la tienda mantiene el HTML estático de faq.html como fallback inicial)
   - `migrations/0015_preguntas_frecuentes_rpc.sql` (RPC `contar_preguntas_frecuentes()` para que la tienda distinga "tabla vacía" de "todas ocultas")
   - `migrations/0017_marquee.sql` (sección Diseño: tabla `marquee_items` + `marquee_activo`/`marquee_color_fondo` en `settings`; sin ítems activos la barra no se muestra)
   - `migrations/0018_logo_tamano.sql` (sección Diseño: `logo_tamano` en `settings` → tamaño del logotipo del encabezado: Small 40 px / Medium 60 px / Large 80 px)
   - `migrations/0019_slider_mostrar_en.sql` (sección Slider: `mostrar_en` en `sliders` → `ambos` | `mobile` | `desktop` con check)
   - `migrations/0020_compra_minima.sql` (menú Descuentos → Compra mínima: `compra_minima_modo` 'off'|'cantidad'|'monto' y `compra_minima_valor` en `settings`; refuerza la validación en el RPC `insertar_pedido`)
   - `migrations/0021_imagenes_storage.sql` (pipeline de imágenes: incluye `iconos` en Storage y convierte los iconos del seed a Font Awesome)
   - `migrations/0022_formato_cards.sql` (selector de formato de imágenes de cards: `1:1`, `3:2` o `4:5`)
   - `migrations/0023_compra_minima_dual.sql` (compra mínima **dual**: columnas `compra_minima_cantidad` y `compra_minima_monto` en `settings`, ambas acumulables; `insertar_pedido` validaba modo+valor, ahora recalcula contra las dos)
   - `migrations/0024_plantilla_sin_datos_lemora.sql` (plantilla reutilizable: DEFAULTS de `settings` sin datos de Lemora — `whatsapp_number`, `transfer_alias`, `transfer_entity`, `transfer_holder` → `''`; solo cambia DEFAULTS, no toca la fila existente)
   - `migrations/0025_borrar_pedidos.sql` (borrado de pedidos: RPC `borrar_pedidos(p_ids bigint[])` con `security definer` que valida `public.es_admin()` y borra en cascada las líneas; el panel lo usa para eliminar un pedido o un lote desde Pedidos)
   - `migrations/0026_cierre_rls_admin.sql` (**seguridad**: cierra el gap de RLS en las tablas creadas después de 0007 — `iconos_pie` (0004), `preguntas_frecuentes` (0014) y `marquee_items` (0017) seguían con `to authenticated using (true)`, o sea que cualquier usuario autenticado podía escribirlas; las pasa a exigir `public.es_admin()`)
   - `migrations/0027_admin_tema.sql` (tema del panel admin: columna `admin_tema` en `settings` — `claro` | `oscuro`, con check; la preferencia es global, no por navegador)
   - `migrations/0028_pedido_items_fiables.sql` (**integridad del pedido**: `insertar_pedido` devuelve además `items[]` con el snapshot real de `order_items` (nombre, variante, cantidad, precio unitario). El mensaje de WhatsApp pasó a armarse con esa respuesta en lugar del carrito del `localStorage`, que el cliente controla. También devuelve `items` en los caminos idempotentes. **Sin esta migración la tienda funciona igual**, pero el mensaje de WhatsApp vuelve a mostrar los ítems del cliente)
   - `migrations/0029_resenas_red.sql` (columna `red` en `reviews`: la red de origen del testimonio — Google, Instagram, YouTube… — como clase de Font Awesome Brands, elegible desde el panel en Reseñas → Editar. Conjunto de valores cerrado con `check`)
   - `migrations/0030_banners_carrito.sql` (columna `banners.en_carrito`: el banner del carrito se elige explícitamente con un check en vez de deducirse de la posición — antes era "el último por `position`", regla que hacía que todo banner nuevo acapara el carrito)
   - `migrations/0031_stock_pedidos.sql` (**integridad del stock**: el stock pasa a seguir el estado del pedido, con triggers sobre `orders` — `trg_orders_stock_estado` (AFTER UPDATE OF estado) reintegra al cruzar a `Cancelado` y vuelve a descontar al reabrir, y `trg_orders_stock_borrado` (BEFORE DELETE) compensa el descuento original. Las funciones son `security definer` y se les revoca el EXECUTE a todos: **sin ese `revoke`, la anon key podría llamar `descontar_stock_por_pedido()` y vaciar el stock de cualquier producto**. Es idempotente y va en `begin`/`commit`)
   - `migrations/0032_gracias_info_dinamico.sql` (cuadro "Próximos Pasos" de `gracias.html` editable desde Configuración → "Datos para la transferencia": `gracias_titulo` y `gracias_texto` en `settings`, con default = el texto que la página ya mostraba. También habilita la regla de la tarjeta: **si no hay Alias CBU, la página oculta el bloque de transferencia**. Es idempotente y va en `begin`/`commit`)
   - `migrations/0033_meta_descripcion.sql` (descripción del negocio editable desde Configuración → "Datos generales": columna `site_description` en `settings`, con default = el texto genérico que las metas ya traían hardcodeado. `js/template.js` la aplica por JS a las metas marcadas con `data-desde-config` en el HTML. Es idempotente y va en `begin`/`commit`)
   - `migrations/0035_marquee_max.sql` (tope de 6 mensajes en la barra marquee: función `limitar_marquee_items()` + trigger `trg_marquee_items_max` BEFORE INSERT sobre `marquee_items`. El límite va en la BD y no sólo en el panel a propósito: la anon key es pública y la policy "Marquee: admin full" es `for all to authenticated`, así que un admin con sesión puede insertar por API sin pasar por la UI — un tope que vive sólo en el JavaScript se esquiva con una línea de curl. Es `security invoker` (no necesita definer) y **no toca los UPDATE**: editar un mensaje no cambia la cantidad. **No borra nada** si ya hay más de 6: sólo bloquea inserts nuevos, y el PASO 2 del archivo lista cuáles son para que borres desde el panel. El panel (Diseño → "Marquee promocional") apaga el botón "Nuevo mensaje" al llegar a 6 y muestra el contador. Es idempotente y va en `begin`/`commit`)

   - `migrations/0036_cupones_max.sql` (tope de 10 cupones: función `limitar_cupones()` + trigger `trg_cupones_max` BEFORE INSERT sobre `coupons`). Mismo criterio que `0035` en el marquee: el límite va en la BD y no sólo en el panel, porque la anon key es pública y "Cupones: admin full" es `for all`, así que un admin con sesión puede insertar por API sin pasar por la UI. Es `security invoker` (no necesita definer) y **no toca los UPDATE**: con la lista llena, renombrar un código, cambiarle el porcentaje o reactivarlo siguen funcionando. **No borra nada** si ya hay más de 10: sólo bloquea inserts nuevos, y el PASO 2 del archivo lista los cupones marcados como `vencido` para que borres desde el panel. Ojo con el caso de los vencidos: el tope **no** los exime, aunque la tienda no los muestre (la policy de lectura pública filtra por `activo = true and expira >= current_date`). Si se acumulan, hay que borrarlos a mano para liberar lugar. El panel (Descuentos) apaga el botón "Nuevo cupón" al llegar a 10 y muestra el contador. Es idempotente y va en `begin`/`commit`)

   - `migrations/0037_sliders_max.sql` (tope de 12 slides: función `limitar_slides()` + trigger `trg_sliders_max` BEFORE INSERT sobre `sliders`). Mismo criterio que `0035` y `0036`: el límite va en la BD porque la anon key es pública y "Slider: admin full" es `for all`. Es `security invoker` (no necesita definer) y **no toca los UPDATE**: cambiar título, imagen, orden, activar o desactivar siguen funcionando con la lista llena. Cubre los **dos** caminos que crean filas en `admin/js/slider.js` — el botón "Nuevo slide" y la acción "Duplicar" de cada fila, que es la que más fácil se olvida en una revisión. **No borra nada** si ya hay más de 12: sólo bloquea inserts nuevos, y el PASO 2 del archivo lista los `oculto` para que borres desde el panel. Ojo: desactivar un slide lo saca del carrusel pero **no** libera lugar; hay que borrarlo. A diferencia de los banners —cuyo tope de 4 es de `slice(0, 4)` en el render, o sea que crear más no da error pero tampoco se ve—, los slides no tienen recorte: el carrusel rota todas las filas, así que el tope acá es de creación. Es idempotente y va en `begin`/`commit`)

   - `migrations/0038_banners_max.sql` (tope de banners **por destino**: función `limitar_banners()` + trigger `trg_banners_max` BEFORE INSERT **OR UPDATE** sobre `banners`). Con 4 al inicio y 1 al carrito, el total nunca pasa de 5. Es `security invoker` (no necesita definer). **No borra nada** si ya hay de más: sólo frena inserts y cambios de destino, y el PASO 2 del archivo muestra el reparto actual.
   
     Tres cosas que la hacen distinta de `0035`/`0036`/`0037` y que conviene no pasar por alto:
     1. **No es un tope de 5 filas, es un reparto.** Con un tope plano el admin podría crear 5 banners de inicio, el `slice(0, 4)` del front mostraría 4 y el quinto quedaría invisible con el carrito vacío: el mismo bug de las filas invisibles, en versión chica. Contando por destino no se llega a eso, y con el inicio lleno el único lugar libre es el carrito, que es justo el que hay que poder seguir usando. Por eso el botón "Nuevo banner" **no** se apaga cuando el inicio llega a 4: se apaga recién con 4 + 1.
     2. **Es el único de los cuatro que dispara en UPDATE.** Un banner puede pasar del inicio al carrito o al revés, y eso cambia el reparto. El conteo excluye la fila en edición (`id is distinct from new.id`): sin eso, con el inicio lleno no se podría ni cambiar el título de un banner. En un BEFORE INSERT la identidad ya está asignada, así que la misma exclusión no descarta nada y un solo camino de código sirve para los dos casos.
     3. **El panel cambia el destino del carrito en dos pasos** (desmarca el viejo, después marca el nuevo, por el índice único parcial `banners_solo_un_carrito` de `0030`). Con el inicio en 3 el intercambio entra; con el inicio en 4 se rechaza, que es lo correcto, porque el resultado final sería un inicio con 5. El trigger frena en el primer paso, así que no queda estado parcial. Todo esto está explicado en el `.sql`.
     
     El carrito ya estaba topeado desde `0030` con el índice único parcial: como máximo una fila con `en_carrito = true`. El trigger repite ese chequeo sólo para dar un mensaje legible en vez de un `unique_violation` crudo; la garantía real sigue siendo el índice, que además protege el `UPDATE`. Y ojo: el tope cuenta **inactivos**, que siguen ocupando lugar en la tabla, aunque el `slice(0, 4)` del inicio corra sobre los que la tienda lee (`activo = true`) y un inactivo no ocupe lugar de *pantalla*. Es el mismo criterio que marquee, cupones y slides.
     
     Es idempotente y va en `begin`/`commit`

   - `migrations/0039_resenas_max.sql` (tope de 10 testimonios: función `limitar_resenas()` + trigger `trg_resenas_max` BEFORE INSERT sobre `reviews`). Mismo criterio que `0035`–`0038`: el límite va en la BD porque la anon key es pública y "Reseñas: admin full" es `for all`. `security invoker`, no toca los `UPDATE` y **no borra nada**. El tope cuenta activas e inactivas. **Correr el PASO 1 antes de aplicar**: la policy pública muestra 2 testimonios activos con ids 13 y 14, o sea que hubo 14 filas y no se puede distinguir desde afuera cuántas quedaron inactivas. Si el total ya está en 10 o más, el trigger bloquea inserts desde el primer día (aplicar igual es seguro: no borra). Si preferís que los ocultos no cuenten, es agregar `and activo` al `where` del count, y el panel tiene que mostrar los dos números
   - `migrations/0040_iconos_pie_max.sql` (tope de 3 iconos del pie: función `limitar_iconos_pie()` + trigger `trg_iconos_pie_max` BEFORE INSERT sobre `iconos_pie`). El **3 no es arbitrario**: `.iconos` es un grid de `repeat(3, 1fr)` en desktop, así que 3 llena una fila exacta y un cuarto cae a una segunda fila dejando dos huecos. En móvil el grid pasa a `1fr` y se apila bien; el tope responde a cómo se ve en escritorio. `security invoker`, no toca los `UPDATE` y no borra nada. Ojo: esta tabla endureció sus policies en `0026`, no en `0007` como las demás — el resultado para el count es el mismo. **Correr el PASO 1 antes de aplicar**: la policy pública muestra 1 icono activo con id 5, así que hubo 5 filas. Con un tope de 3, si hay más de 3 activos el bloque del pie **ya se está viendo roto hoy**, más allá de que el tope bloquee crear nuevos
   - `migrations/0041_preguntas_frecuentes_max.sql` (tope de 20 preguntas: función `limitar_preguntas_frecuentes()` + trigger `trg_preguntas_frecuentes_max` BEFORE INSERT sobre `preguntas_frecuentes`). `security invoker`, no toca los `UPDATE` y no borra nada. **El trigger no usa `contar_preguntas_frecuentes()`** (0015) aunque cuente lo mismo, y conviene que siga así: esa función es `security definer`, y usarla pasó el chequeo de depender de las policies de RLS a depender de permisos de `EXECUTE` — justo lo que `0031` revocó. Acá no hay apuro: `contar_preguntas_frecuentes()` da 1 en total, o sea que hay una sola pregunta y el id 1 fue borrado, no ocultado
   - `migrations/0042_descuento_cero_y_columna_huerfana.sql` (el 0 del umbral **desactiva** el descuento automático: la condición del RPC pasa a exigir umbral y porcentaje > 0, y tira la columna huérfana `settings.cargar_imagenes_productos`). **Correr el PASO 2**: `create or replace function` no valida el cuerpo plpgsql, así que un error de tipeo sólo aparece al primer pedido. El bloque del final es un `begin … rollback` que lo compila sin escribir
   - `migrations/0043_eliminar_external_url.sql` (fuera las 6 columnas de URL externa — `external_url`, `imagen_url`, `logo_url` — y sus 4 CHECK `num_nonnulls(...) <= 1`). **Correr el PASO 1 antes**: dice cuántas filas quedan sin imagen. En una base con las columnas migradas desde Drive eso puede no ser cero, y no hay forma de copiar esas fotos a Storage automáticamente: el endpoint de Drive pide la API key de la cuenta que las subió
   - `migrations/0044_categoria_inactiva_esconde_productos.sql` (una categoría desactivada **esconde** sus productos: la policy pública de `products` pasa a exigir `category_id is null or exists (categoría activa)`). **Correr el PASO 2**: cambia una policy de la tabla que toda la tienda lee, y el bloque arma el caso completo (categoría activa / inactiva / sin categoría) y lo revierte con `rollback`
   - `migrations/0044_categoria_inactiva_esconde_productos.sql` (una categoría desactivada **esconde** sus productos: la policy pública de `products` pasa a exigir `category_id is null or exists (categoría activa)`)
   - `migrations/0045_schema_migrations.sql` (tabla `schema_migrations` con las 42 anteriores registradas, RLS activada y sin policies, más la vista `ultimas_migraciones`)
   - `migrations/0048_insertar_pedido_canonico.sql` (**C1 canónico**: restaura las protecciones perdidas en `0042` — idempotencia, anti-spam, compra mínima dual, snapshot `items[]` y `set search_path` — y deja la función igual a la viva verificada)
   - `migrations/0049_higiene_permisos.sql` (**C3**: revoke TRUNCATE/TRIGGER/REFERENCES a anon/authenticated, EXECUTE explícito por RPC, default privileges endurecidos, `search_path = public, pg_temp` en funciones propias, índices faltantes y cierre de `ultimas_migraciones`). El backfill asume que la base tenía aplicadas esas 42: **si tu base no aplicó alguna, borrala de la lista antes de correrla**. De la 0045 en adelante cada migración se registra sola con un `insert … on conflict do nothing` al final. **Va la última del lote** (después de `0042`, `0043` y `0044`): no por dependencia de esquema, sino porque su backfill declara esas tres como aplicadas, y correrla antes deja el registro mintiendo de la forma exacta que la tabla existe para evitar
    - `migrations/0050_rls_endurecida.sql` (**Error 3 · re-endurecedor RLS**: vuelve a poner `public.es_admin()` en las 13 policies "…: admin full", re-crea las policies de pedidos (lectura + cambio de estado) y los grants de `orders`/`order_items`, y deja la escritura de Storage sólo admin sobre los 6 buckets). **Cuándo correrla:** después de re-ejecutar CUALQUIER migración vieja (`0001`, `0004`, `0014`, `0017`), que al re-correr recrean sus policies `using (true)` y revierten el endurecimiento de `0007`/`0026`. Es idempotente y se registra sola. Regla completa: tras re-ejecutar una vieja → `0050` (RLS) → `0049` (permisos de funciones) → `0048` (si se tocó `0007`/`0028`, reponer el RPC canónico)
    - `migrations/0051_tipo_web_turnos.sql` (**modo venta / turnos**: el cliente elige en Configuración → "Tipo de web" si su sitio es de compras (`modo_web = 'venta'`, default: **ninguna tienda existente cambia** hasta elegirlo) o de solicitud de turnos (`'turnos'`). Crea la columna `settings.modo_web`, la tabla `public.turnos` con RLS al estilo de `orders` (solo lectura + cambio de `estado` por admin; escritura directa revocada) y dos RPC: `insertar_turno` (única vía de alta, service_role: valida nombre/teléfono/email/fecha, genera `TRN-####`, idempotencia por token, anti-spam de 10 solicitudes/hora por correo) y `borrar_turnos` (security definer + `es_admin()`, para el panel). En modo turnos el frontend deja de vender: `/carrito` pasa a ser el formulario de solicitud (nombre, teléfono, email, fecha, hora, notas), cards y ficha de catálogo muestran "Solicitar turno" sin precios ni stock, el header reemplaza el carrito por un vínculo "Turnos", y `gracias.html` no muestra montos ni datos de transferencia —sí el resumen de la solicitud—. El panel gana la sección "Turnos". Se registra sola)

   > **El número `0034` queda libre pero no se reutiliza.** Era el interruptor de imágenes de producto (`cargar_imagenes_productos` en `settings`), que se aplicó y después se revirtió. No vuelvas a correrlo. La columna huérfana la tira la `0042`. La lista de arriba es la fuente de verdad: después de `0033` van `0035` a `0045`, `0048`, `0049`, `0050` y `0051` (los archivos `0046` y `0047` no existen: están reservados en la historia de git).

   > **Backfill de `0031` (paso único,manual):** los pedidos que YA estaban en `Cancelado` cuando corrió la migración no dispararon ningún trigger, así que su stock sigue descontado. Corré el **PASO 1** (es un `SELECT` de diagnóstico) que está al final de `0031_stock_pedidos.sql`. Si devuelve filas y nadie repuso stock a mano, descomentá y corré el **PASO 2** una sola vez. No lo repitas: no es idempotente entre ejecuciones.

   > Nota: la numeración salta de `0015` a `0017` — **no falta ningún archivo**, `0016` nunca existió. La lista de arriba es la fuente de verdad de qué hay que correr.

   > **Cómo se verifica qué se aplicó.** El proyecto no usa `supabase db push`: se aplican a mano por el SQL Editor. Desde la `0045` hay una tabla `schema_migrations` que registra los nombres, así que `select nombre, aplicada_en from public.ultimas_migraciones` muestra el estado. Dos salvedades honestas: el backfill de la `0045` **asume** que la base tenía las 42 anteriores (si no era así, ajustá la lista antes de correrla), y la tabla no puede saber qué archivos hay en el repo, así que para "¿cuál me falta?" sigue haciendo falta comparar `ls migrations/` con un `select nombre`. Para las que ya no se pueden registrar retroactivamente, el chequeo es por objeto — la lista de abajo — y sigue siendo la forma de confirmar una base con datos de antes de la `0045`.
   >
   > ```sql
   > select tgname from pg_trigger
   >  where tgname in ('trg_orders_stock_estado', 'trg_orders_stock_borrado');
   > -- 2 filas = 0031 aplicada. 0 filas = falta correrla.
   >
   > select column_name from information_schema.columns
   >  where table_name = 'settings' and column_name like 'gracias%';
   > -- 2 filas = 0032 aplicada. 0 filas = falta correrla.
   >
   > select site_description from public.settings where id = 1;
   > -- 1 fila con el texto genérico = 0033 aplicada. 0 filas = falta correrla.
   >
   > select tgname, tgenabled from pg_trigger where tgname = 'trg_marquee_items_max';
   > -- 1 fila con tgenabled = 'O' = 0035 aplicada. 0 filas = falta correrla.
   >
   > select tgname, tgenabled from pg_trigger where tgname = 'trg_cupones_max';
   > -- 1 fila con tgenabled = 'O' = 0036 aplicada. 0 filas = falta correrla.
   >
   > select tgname, tgenabled from pg_trigger where tgname = 'trg_sliders_max';
   > -- 1 fila con tgenabled = 'O' = 0037 aplicada. 0 filas = falta correrla.
   >
   > select tgname, tgenabled from pg_trigger where tgname = 'trg_banners_max';
   > -- 1 fila con tgenabled = 'O' = 0038 aplicada. 0 filas = falta correrla.
   >
   > select tgname, tgenabled from pg_trigger
   >  where tgname in ('trg_resenas_max', 'trg_iconos_pie_max', 'trg_preguntas_frecuentes_max');
   > -- 3 filas = 0039, 0040 y 0041 aplicadas. 0 filas = faltan las tres.
   >
   > select modo_web from public.settings where id = 1;
   > -- 1 fila ('venta' o 'turnos') = 0051 aplicada. 0 filas = falta correrla.
   > ```
   >
   > `0032` y `0033` tienen su propio aviso en el panel: si faltan, la tarjeta que las contiene muestra un error al guardar y ese campo no se persiste. El resto de los campos de esas tarjetas **siguen guardando** — el panel filtra las columnas inexistentes del `UPDATE` justamente para que la migración pendiente no rompa el guardado que ya funcionaba.
   >
   > `0035` a `0041` son al revés: sin ellas **el panel anda igual** (el botón se apaga y el contador dice "Máximo 6" / "10" / "12", y en banners el reparto "Inicio 4/4 · Carrito 0/1"), lo que falta es la red de seguridad de la BD — un admin con la sesión abierta podría seguir insertando por API. El síntoma es silencioso en el otro sentido: la UI parece acotada pero el límite no existe. Si el trigger no está, corré la migración; no vas a ver ningún error que te avise.

3. **Auth**: habilitar correo/contraseña (Authentication → Providers) y **crear una cuenta** exclusiva para el admin (Authentication → Users → Add user, o el formulario de registro). El `profiles` se crea solo por el trigger.
4. **Configurar variables de entorno** (sección 5) en local y Vercel.
5. **Desplegar en Vercel** el directorio `supabase/` (framework "Other"). `vercel.json` se mantiene tal cual: `cleanUrls: true` (rutas limpias nativas) + el guard `proxy.ts` de `/admin/*` + los headers de seguridad.
6. **El dominio se reemplaza solo en el build.** Los 8 HTML raíz tienen `https://TU-DOMINIO.com` en los `canonical` y en las metas `og:url` / `og:image` / `twitter:*` (5 líneas por archivo, más `robots.txt`). **Ya no se reemplaza a mano**: `scripts/build-env.mjs` lo hace al desplegar, tomando la variable `SITIO_URL` (ver sección 5) y además genera `sitemap.xml`. Si un deploy queda con `TU-DOMINIO.com` a la vista, es señal de `SITIO_URL` mal configurada — chequealo en Project Settings → Environment Variables.
7. **Probar** (sección 9) y después cargar contenido desde el panel: productos, banners, reseñas, iconos del pie, FAQ. La tienda arranca vacía y las secciones sin datos se ocultan solas.

> **Nota — rutas limpias (`cleanUrls`) y el guard del panel.** `vercel.json` usa `cleanUrls: true`, la función nativa de Vercel: `/carrito.html` se sirve en `/carrito` y **quien entre a la URL con `.html` recibe un 308 a la limpia**. Por eso se **eliminaron las 7 rewrites manuales** que antes hacían ese trabajo: la doc de Vercel dice explícitamente que con `cleanUrls` los `rewrites` no deben llevar extensión en `source` ni en `destination` (con extensión, `/carrito` → `/carrito.html` → 308 → `/carrito` sería un loop).
>
> Eso obliga a que **`proxy.ts` compare siempre el pathname normalizado**, sin `.html`. Es la única parte del proyecto donde el routing y el guard están acoplados:
>
> - `RUTAS_PUBLICAS` y `ASSETS_PUBLICOS` guardan rutas **sin** extensión (`/admin/login`, no `/admin/login.html`), y `esRutaPublica()` normaliza con `normalizar()` antes de comparar.
> - El 307 de `redirigirALogin()` apunta a `/admin/login` (la URL limpia).
> - Si se agrega una página pública nueva bajo `/admin`, hay que whitelistearla **sin extensión**. Si se agrega con `.html`, el 308 de `cleanUrls` la manda a la forma limpia, el guard no la reconoce y la manda a login: **queda inalcanzable y, peor, el login mismo entra en loop** (307 a `/admin/login.html` → 308 a `/admin/login` → 307…). Ese es el fallo que este acoplamiento previene.
>
> Los enlaces internos ya apuntan a las URLs limpias (`/`, `/carrito`, `/producto?id=…`), igual que los `canonical` y `og:url`: si apuntaran a `.html`, cada navegación pagaría un 308 y el `canonical` describiría una URL que redirige. Lo mismo para el CTA del popup de salida, que el admin edita en Configuración (si guardaste ahí un valor con `.html`, actualizalo a `/#tienda`: el default del panel ya viene sin extensión).

> Si se usa Supabase CLI: `supabase link` + `supabase db push`. Las migraciones son idempotentes (usan `drop policy if exists` / `on conflict do nothing`).

---

## 9. Pruebas sugeridas

1. **Tienda**: abrir `index.html` con Supabase configurado → slider, banners, reseñas, catálogo y filtros idénticos al sitio actual.
2. **Ruta sin config**: con `env.generated.js` vacío → la tienda cae a los JSON locales (modo dual) sin romper nada.
3. **Detalle**: `producto.html?id=1` muestra variantes y galería; el id 14 aparece en Abrigos.
4. **Checkout**: comprar con stock disponible → genera `PED-####`, descuenta stock, abre WhatsApp y `gracias.html` muestra alias válido y copiable.
5. **Stock insuficiente**: pedir más unidades de las que hay → respuesta de error (409) y la transacción revierte todo.
6. **Cupones**: `black20` aplica 20%; intentar `sale10` (inactivo) → no aplica; umbral 100000 y cupón juntos → aplica el mayor, no suma. **Tope de 10** (`0036`): cargar hasta 10 → el botón "Nuevo cupón" se apaga y el contador dice "Límite alcanzado"; al borrar uno vuelve a habilitarse. Con la lista llena, editar un cupón existente (cambiarle el porcentaje, renombrarlo, reactivarlo) tiene que seguir funcionando — los `UPDATE` no pasan por el trigger. Con 10 filas, un `insert` directo contra la tabla debe fallar con el mensaje del trigger (probá el PASO 3 del `.sql`). Ojo: los cupones **vencidos** ocupan lugar igual que los vigentes, aunque la tienda no los muestre; para liberar hay que borrarlos.
7. **Admin**: login, CRUD de cada sección, subida/reemplazo de imágenes, cambio de estado de pedido y cierre de sesión.
8. **Popup de salida**: desde configuraciones, cambiar título/descripción/CTA/destino y desactivar → la tienda refleja el contenido nuevo (hasta 1 min por caché) y deja de mostrar la ventana si está inactiva.
9. **Preguntas frecuentes**: con la tabla vacía, `faq.html` muestra el contenido estático actual; al crear la primera pregunta activa pasa a la lista dinámica (con su ícono) y el acordeón sigue funcionando (delegación de eventos); si se ocultan todas, la sección desaparece.
10. **Seguridad**: sin sesión, la API anon NO debe poder leer `orders` ni escribir en `products` (probarlo desde una pestaña anónima).
11. **Recuperación de contraseña**: en `login.html` → "¿Olvidaste tu contraseña?" con el correo admin → el enlace llega a `admin/recuperar.html` → fijar una contraseña nueva → volver a iniciar sesión con la nueva.
12. **Ubicación del negocio** (`contacto.html` + `api/ubicacion.js`): con `address` vacío el bloque "Nuestra Ubicación" no se muestra (sin valores por defecto); con una dirección como texto, un link corto (`maps.app.goo.gl/…`) o una URL de mapas larga, `/api/ubicacion` la resuelve a coordenadas (sigue redirecciones server-side y/o geocodifica con Nominatim) y la página muestra un mapa de OpenStreetMap con el nombre del lugar bajo el mapa. Si no se puede resolver, se muestra el valor como texto sin mapa.
13. **Marquee promocional** (sección Diseño): con "Mostrar marquee" marcado y al menos un mensaje activo, la tienda muestra la barra superior animada (textos duplicados, pausa al hover) con el color de fondo elegido; si se desactiva el toggle, se ocultan todos los mensajes o no hay ninguno, la barra desaparece. La caché de la tienda (60 s, 5 min en configuración) limita la verificación inmediata. **Tope de 6** (`0035`): cargar hasta 6 → el botón "Nuevo mensaje" se apaga y el contador dice "Límite alcanzado"; al borrar uno vuelve a habilitarse. Con 6 filas, un `insert` directo contra la tabla debe fallar con el mensaje del trigger (probá el PASO 3 del `.sql`). Ojo: desactivar un mensaje **no** libera lugar — el tope cuenta activas e inactivas.
14. **Tamaño del logotipo** (sección Diseño → Logotipo): elegir Small (40px), Medium (60px) o Large (80px) aplica la altura correspondiente al header de la tienda al guardar; el ancho se ajusta automáticamente (`width: auto`). En móvil se conserva solo el ajuste de márgenes.
15. **Slider por dispositivo**: desde el panel (sección Slider) marcar un slide "Solo móvil" y otro "Solo escritorio" → en escritorio solo se ve el de escritorio y los "Ambos"; al achicar la ventana por debajo de 768px (o probarlo con DevTools responsive), el set cambia automáticamente y el slider reinicia en el primer slide visible. Si ningún slide aplica al viewport, la portada se oculta.
16. **Redes y WhatsApp en una ficha** (Configuración → Redes y WhatsApp): las redes sociales del header (dejá vacía la que no uses) y el canal de WhatsApp (número + mensaje por defecto) se editan juntos en la misma card. La barra social del header ya **no muestra el ícono de WhatsApp** (lo demás sigue igual: botón de contacto y checkout usan el número). El antiguo campo "Enlace de WhatsApp (red social)" dejó de editarse.
17. **Sección Descuentos** (menú "Descuentos", antes "Cupones"): además del CRUD de cupones, la card "Descuentos automáticos" (umbral y % de descuento, antes en Configuración) se edita en la misma sección; guardar actualiza `settings`. En Configuración la card ya no aparece.
18. **Modo turnos** (`0051`, Configuración → Tipo de web → "Solicitud de turnos"): el header reemplaza el carrito por un vínculo "Turnos" (desktop y móvil) y no hay sidemenu de carrito; las cards del catálogo y la ficha de producto muestran "Solicitar turno" sin precios ni stock; `/carrito` muestra el formulario de solicitud (nombre, teléfono, email, fecha, hora, notas) y una solicitud válida registra un `TRN-####` nuevo, abre WhatsApp con el mensaje armado desde la respuesta de la RPC y `gracias.html` muestra el resumen de la solicitud **sin** montos ni transferencia. El panel lista la solicitud en la sección Turnos con su cliente, cita y servicio, permite cambiar el estado y borrarla. Verificación RLS: la anon key no puede invocar `insertar_turno` (solo service_role) y la tabla no acepta INSERT/UPDATE/DELETE directos.
18. **Compra mínima** (menú Descuentos → Compra mínima): elegir "Cantidad de productos" con valor 3 → con 1–2 productos el carrito muestra el aviso "La compra mínima es de 3 productos…" y "Finalizar Compra" queda deshabilitado; con 3 o más se habilita. Cambiar a "Monto ($)" con valor 50000 → el aviso muestra cuánto falta y el botón se habilita al superar el subtotal. Probar también el refuerzo server-side: forzar un envío directo a `/api/pedido` por debajo del mínimo → el RPC lo rechaza con el mensaje (409) y la transacción revierte. Con "Desactivada" el flujo queda igual que siempre.
19. **Formato de cards** (Diseño): seleccionar `1:1`, `3:2` o `4:5`, guardar y verificar que los cards del catálogo, búsqueda y relacionados cambian de proporción sin modificar detalle, carrito ni favoritos.
20. **Tope de slides** (`0037`): cargar hasta 12 slides → el botón "Nuevo slide" se apaga, el contador dice "Límite alcanzado" y **los botones "Duplicar" de cada fila también**, que es el otro camino de creación. Al borrar uno vuelven a habilitarse. Con la lista llena, editar un slide existente (cambiarle el título, la imagen, el orden, activarlo o desactivarlo) tiene que seguir funcionando — los `UPDATE` no pasan por el trigger. Con 12 filas, un `insert` directo contra la tabla debe fallar con el mensaje del trigger (probá el PASO 3 del `.sql`). Ojo: **desactivar un slide no libera lugar** (lo saca del carrusel, pero la fila sigue), y a diferencia de los banners los slides no tienen `slice` en el render: el carrusel rota todos los que le lleguen, así que el tope es de creación y no de visualización.
21. **Tope de banners** (`0038`): el panel muestra el reparto "Inicio N/4 · Carrito N/1". Con 4 en el inicio, el botón "Nuevo banner" **sigue habilitado** a propósito, porque el lugar del carrito está libre y es un destino válido. Al crear uno con "Banner del carrito" marcado, el reparto pasa a 4/4 + 1/1 y recién ahí el botón se apaga. Ojo que el tope es **por destino**, no de 5 filas: no se puede llegar a 5 banners de inicio (el quinto quedaría invisible por el `slice(0, 4)` y el carrito quedaría vacío). Con el inicio en 4, cambiar el banner del carrito por otro tiene que ser **rechazado** (el inicio pasaría a 5): es el único de los cuatro topes que también dispara en `UPDATE`, y el panel lo hace en dos pasos, así que el error tiene que aparecer sin dejar el carrito a medio camino. Con el inicio en 3, el mismo intercambio se tiene que aceptar. Desactivar un banner no libera lugar, y un `insert` directo saltándose el panel tiene que fallar con el mensaje del trigger (PASO 3 del `.sql`).
22. **Tope de testimonios** (`0039`): cargar hasta 10 → el botón "Nueva reseña" se apaga y el contador dice "Límite alcanzado"; al borrar uno vuelve a habilitarse. Con la lista llena, editar una reseña existente (corregir el texto, la valoración, la foto, la fecha) tiene que seguir funcionando. Ojo: si al aplicar la migración el `PASO 1` dice que ya hay 10 o más, el trigger bloquea los inserts desde el primer día: no es un error de la migración, es que había testimonios ocultos ocupando lugar.
23. **Tope de iconos del pie** (`0040`): cargar hasta 3 → el botón "Nuevo icono" se apaga. Con 3 iconos activos el bloque del pie tiene que verse como **una sola fila de tres** en escritorio (el grid es `repeat(3, 1fr)`); es el criterio para comprobar que el 3 es el número correcto y no un tope arbitrario. Si al correr el `PASO 1` antes de aplicar hay más de 3 activos, el bloque ya se ve roto hoy (fila de un solo elemento con dos huecos) y hay que borrar antes de que la migración sirva de algo.
24. **Tope de preguntas frecuentes** (`0041`): cargar hasta 20 → el botón "Nueva pregunta" se apaga. Con la lista llena, editar una pregunta (cambiarle la respuesta, el ícono o el orden) tiene que seguir funcionando. Regresión del RPC: la sección del FAQ tiene que seguir distinguiendo "tabla vacía" (cae al contenido estático) de "todas ocultas" (se oculta la sección), porque `contar_preguntas_frecuentes()` cuenta totales y no lo filtra — el trigger nuevo no lo toca, pero conviene confirmarlo.

---

## 10. Riesgos y decisiones tomadas

- **Precios recalculados servidor-side** (`insertar_pedido`): el front no es de confianza; el negocio lo replica.
- **Una sola fuente de imagen**: `storage_path` apunta a Supabase Storage y es la única columna de imagen (`0043`). No hay campo para pegar una URL, y la CSP lo refuerza con `img-src 'self' data: blob: https://*.supabase.co` en vez de `https:`. El costo de esa decisión es que toda imagen tiene que pesarse y subirse desde el panel; la Indemnidad es que la plantilla no arrastra el CDN de Google ni permite que un admin pegue un pixel de tracking.
- **Borrado de productos**: `order_items.product_id` es `SET NULL` → el historial de pedidos no se corrompe; las imágenes se limpian del Storage manualmente desde el panel.
- **Caché en memoria (60s / 5min en configuración)**: cambios del admin se ven en la tienda en hasta ~1 minuto. Es intencional para no golpear Supabase en cada render.
- **Secciones resilientes**: si no hay configuración o Supabase está caído, cada `obtener*` devuelve su forma vacía (catálogo `[]`, reseñas/slider/banners/iconos `null` → contenido estático u oculto). El fallback JSON de la era Sheets (archivos `js/*.json` + funciones `*DesdeJSON`) se eliminó del repo: Supabase es la única fuente de datos.
- **`API_PEDIDO_URL`** en `js/formulario.js` apunta a `/api/pedido`, que escribe el pedido en Supabase vía RPC (se renombró al retirar el legado `GOOGLE_SCRIPT_URL`).
- **Metas SEO**: se corrigieron los placeholders `tusitio.com` → `supabase.lemora.lat` en los 8 HTML.
- **Sin ventanas nativas del navegador** (solo UI propia): las confirmaciones usan el modal del panel (`confirmarDialogo` en `admin-ui.js`) y las notificaciones de la tienda usan los toasts propios (`mostrarNotificacion`).
- **`sale10` quedó inactivo** (vencido el 2026-08-30) respetando la realidad de la planilla.
- **Mapa de contacto con OpenStreetMap**: Google deshabilitó el embed keyless (`maps?q=…&output=embed` muestra "Este contenido está bloqueado") y los links cortos no son embebibles desde el navegador (CORS en la redirección). La tienda resuelve la ubicación server-side (`api/ubicacion.js`: sigue redirecciones de `maps.app.goo.gl`, extrae coordenadas de URLs y geocodifica texto con Nominatim, con cache y respeto a su política de uso) y la muestra con el embed de OpenStreetMap, que no requiere API key ni restricciones de referrer.
- **Marquee administrable**: la barra promocional estaba comentada/desactivada en el código con textos hardcodeados. Ahora el contenido, la activación y el color de fondo se administran desde la sección "Diseño" del panel (repeater de mensajes + toggle + selector de color junto al color principal), y la tienda renderiza la barra solo si hay mensajes activos (sin valores por defecto).
- **WhatsApp sin ícono en el header**: por pedido, la barra social del header dejó de mostrar el ícono de WhatsApp; el canal de contacto sigue vivo solo con el número (`whatsapp_number`) en el botón de WhatsApp y el checkout. En Configuración, las redes del header y el canal de WhatsApp (número + mensaje) se editan juntos en la ficha "Redes y WhatsApp"; el campo `social_whatsapp` quedó huérfano (no se edita ni se muestra, la columna se conserva).
- **Descuentos agrupados**: el menú "Cupones" pasó a llamarse "Descuentos" y concentra el CRUD de cupones junto a la card "Descuentos automáticos" (mudada desde Configuración). Sin cambios de esquema: `discount_threshold`/`discount_percent` se guardan en `settings` y la tienda los lee igual.
- **Compra mínima con refuerzo server-side**: card del menú Descuentos con **dos reglas acumulables** — cantidad mínima de productos y monto mínimo (migración 0023 sobre `settings`; cada una se activa con valor > 0, 0 = inactiva). El front la muestra en el carrito y bloquea el checkout, pero la validación real vive en `insertar_pedido` (RPC, junto al resto de la lógica de negocio): si se saltea el front, el pedido se rechaza y la transacción revierte el stock. Sin la migración 0023, la tienda no cambia (0 y 0 = desactivada).
- **Placeholders del dashboard**: productos, logos de banners, fotos de reseñas e imágenes de iconos del pie muestran `<i class="fa-regular fa-image"></i>` sobre un fondo gris cuando todavía no tienen una imagen. No se guardan placeholders en Supabase.
- **Pipeline de imágenes del dashboard**: cada archivo local se valida, redimensiona según el módulo y convierte a WebP antes de subirlo a Supabase Storage. Como ya no hay URLs externas, no queda el caso de una imagen que se reference sin pasar por el pipeline.
- **Imágenes públicas sin archivo**: la tienda no depende de assets PNG/JPG locales eliminados; un producto, slide, banner o reseña sin imagen conserva su espacio con un bloque gris neutro. Los iconos configurados usan Font Awesome.

---

## 11. Próximos pasos sugeridos

1. Cargar las credenciales reales y desplegar (sección 5 y 8).
2. Crear la cuenta de admin y entrar a `/admin`.
3. Re-subir progresivamente las imágenes del catálogo al Storage desde el panel (con la opción "elegir imagen / reemplazar").
4. Completar datos en **Configuración**: redes sociales, titular real de la transferencia, ubicación del negocio (texto o URL de Google Maps) y email de contacto.
5. Opcional: activar *Email Templates* en Auth (redactar el correo de recuperación y verificar remitente).
6. Revisar rendimiento: índice actualizado por `created_at` en `orders`; si crece el histórico, paginar el listado del panel.

---

## 12. Reporte de deprecación de Google (Sheets / Apps Script / Drive)

### 12.1 Qué deja de usarse

| Servicio Google | Uso anterior | Estado tras la migración |
|---|---|---|
| **Google Sheets** (planillas de productos, cupones, slider, banners, reseñas, pedidos, config) | Fuente de datos del frontend y del admin | **Deprecado.** Los datos viven en PostgreSQL. El seed ya no vuelca el catálogo: la plantilla se instala vacía (§3.3) |
| **Google Apps Script** (web app proxy de pedidos) | `api/pedido.js` reenviaba a `script.google.com/.../exec` | **Deprecado.** `api/pedido.js` ahora escribe directo en Supabase vía RPC |
| **Google Drive** (imágenes en `drive.google.com` / `googleusercontent.com`) | URLs `external_url` en productos/slider/banners/reseñas | **Deprecado por completo.** Las columnas `external_url` / `imagen_url` / `logo_url` se eliminan en la `0043`. Las imágenes salen todas de Supabase Storage, subidas desde el panel |

### 12.2 Qué hay que apagar (cuando se confirme el funcionamiento)

1. **Apps Script**: **hecho en el repo** (se eliminaron `scripts/MenuPrincipal.gs` y `scripts/script-premium.gs`). Falta solo apagar el proyecto web en script.google.com y retirar `WEB_API_KEY`/`GOOGLE_SCRIPT_URL` de las propiedades del script y del entorno de Vercel.
2. **Sheets**: pueden dejarse como respaldo histórico, pero **dejar de editarlas** (ya no alimentan la tienda). Si se desea, exportar copia como respaldo antes de borrar.
3. **Drive**: **ya se puede desconectar**, con una condición. La `0043` tira las columnas de URL externa, así que las imágenes que quedaran sólo con `external_url` pierden el src y hay que volver a subirlas desde el panel. Por eso el **PASO 1 de la 0043** tiene que correrse antes: informa cuántas filas quedan sin imagen. Con 0 filas, se puede cortar el acceso a Drive sin riesgo. **No borrar los archivos originales** hasta que dé 0 (o hasta haber guardado copia de lo que haya que resubir).

### 12.3 Riesgos de la desconexión

- **Resuelto**: la tienda no tiene ninguna dependencia de Google. Sin cuenta de Google activa funcionan el catálogo, el carrito, el checkout y el panel.
- **Resuelto**: no queda ninguna URL de Drive en el código. Se eliminaron los 6 puntos de entrada que podían reintroducirlas —los campos para pegar una URL en reseñas, iconos, slider, banners y productos— junto con `imagenOptimizada()`, que reescribía las URLs de `lh3.googleusercontent.com` para pedirle WebP al CDN de Google.
- **Restricción que sí se puso**: la CSP pasó de `img-src … https:` a `img-src 'self' data: blob: https://*.supabase.co`. Cualquier imagen que venga de un host que no sea Supabase deja de cargar, y eso es intencional: una plantilla que permite pegar URLs es una plantilla donde un admin (o un XSS) puede meter un pixel de tracking desde cualquier lado. Las fuentes de imagen legítimas son el Storage, `data:`, `blob:` (los previews de archivo sin subir) y los assets locales del repo.

### 12.4 Criterios para considerar la migración completa

- [x] Sin URLs de `googleusercontent.com` ni `drive.google.com` en la BD: las columnas que las contenían ya no existen (migración `0043`).
- [x] Sin forma de reintroducirlas desde el panel: los campos de URL externa se eliminaron de reseñas, iconos, slider, banners y productos.
- [x] Apps Script eliminado del repositorio (queda apagar el proyecto web en script.google.com y retirar `WEB_API_KEY`/`GOOGLE_SCRIPT_URL`).
- [x] Sin datos de la tienda original en el repo: ni el seed de `0002`, ni los 3 iconos de `0004`, ni los arrays de relleno `TESTIMONIOS` / `ICONOS_ESTATICOS`, ni el FAQ estático de `faq.html`.
- [ ] Planillas de Sheets archivadas/exportadas como copia simple.
- [ ] Imágenes que quedaban sólo con `external_url` resubidas al Storage (el PASO 1 de la `0043` dice cuántas son).
