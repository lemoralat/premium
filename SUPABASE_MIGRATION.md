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
| Google Drive (imágenes) | **Supabase Storage** (se pueden seguir mostrando las URLs de Drive como `external_url` durante la transición) |
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
│  PostgreSQL + RLS      Storage (5 buckets)      Auth              │
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
| `product_images` | Imágenes (1 principal + galería) | `storage_path` **o** `external_url` (restricción `num_nonnulls <= 1`), `es_principal`, `position`, FK cascada |
| `coupons` | Cupones manuales | `codigo`, `porcentaje`, `expira` (date), `activo` |
| `sliders` | Slides del hero | `titulo`, `texto_soporte`, `storage_path`/`external_url`, `link`, `target` (`interno` default / `externo`), `position`, `activo`, `mostrar_en` (`ambos` default / `mobile` / `desktop`, filtrado por dispositivo en la tienda) |
| `banners` | Banners promocionales | `imagen_path`/`imagen_url`, `logo_path`/`logo_url`, `badge`, `titulo`, `boton`, `link`, `target` (`interno` default / `externo`), `position`, `activo` |
| `reviews` | Testimonios | `nombre`, `valoracion` (1–5), `resena`, `fecha`, `storage_path`/`external_url`, `position`, `activo` |
| `iconos_pie` | Iconos de confianza del pie del home | `titulo` (obligatorio), `descripcion`, `storage_path`/`external_url`, `position`, `activo` |
| `preguntas_frecuentes` | Preguntas de la página faq.html (sección Configuración) | `icono` (clase FontAwesome, opcional), `pregunta`, `respuesta`, `position`, `activo` |
| `marquee_items` | Mensajes de la barra marquee (sección Diseño) | `texto` (obligatorio), `position`, `activo`; sin filas activas la barra no se muestra |
| `orders` | Pedidos | `numero` (generado `PED-####` por trigger), `cliente` (jsonb: nombre, email, teléfono, dirección, ciudad, provincia, CP, notas), `subtotal`, `descuento`, `porcentaje`, `cupon`, `total`, `estado` (Pendiente / Procesando / Enviado / Entregado / Cancelado), `token` (uuid), `created_at` |
| `order_items` | Líneas de pedido | `product_id` (ON DELETE SET NULL: el pedido histórico sobrevive al borrado del producto), `nombre` (congelado al momento de la compra), `variante_texto`, `quantity`, `precio_unitario` |
| `settings` | Configuración global, **fila única id=1** | `site_name`, `whatsapp_number`, `whatsapp_default_message`, `discount_threshold` (100000) y `discount_percent` (10), `transfer_alias` (`hola.mundo.2023`), `transfer_entity`, `transfer_holder`, `email_contact`, `address` (ubicación del negocio: dirección como texto o URL de mapas; se resuelve en `api/ubicacion.js` y se muestra en OpenStreetMap en `contacto.html`), redes sociales, popup de salida (`popup_titulo/descripcion/cta/cta_url/activo`), marquee (`marquee_activo`, `marquee_color_fondo` — sección Diseño), tamaño del logotipo (`logo_tamano` — Small/Medium/Large) |
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

### 3.3 Datos sembrados (`migrations/0002_seed.sql`)

Se migraron todos los datos reales actuales, respetando los ids originales del JSON:

- **16 productos** (ids 1–16, `OVERRIDING SYSTEM VALUE` + `setval`). Incluye el **fix de datos**: el producto 14 pasó de "Remeras" a **"Abrigos"** (revisado contra su nombre/imágenes reales).
- **Variantes**: solo el producto 1 tiene variante "Talles" (50, 52, 54, 56, 58), igual que el JSON actual.
- **48 imágenes** de producto apuntando a Google Drive (`external_url`) para que el catálogo se vea idéntico al momento de migrar. El admin puede re-subirlas a Storage desde el panel (se irán usando `storage_path`).
- **3 cupones**: `sale10` (10%, **inactivo** por estar vencido), `black20` (20%, activo hasta 2026-12-31), `navidad` (25%, activo hasta 2026-12-31).
- **6 slides** de hero, **5 banners**, **12 reseñas**, todos con orden y estado reales.
- **3 iconos del pie** (`0004`): pagos, envíos y stock, con sus rutas locales `img/icons/*.png` como `external_url` (idéntico al HTML original).
- **Configuración** con los valores que estaban hardcodeados en el código: WhatsApp `543515957014`, umbral 100000 → 10%, alias `hola.mundo.2023`, etc.

---

## 4. Políticas RLS (`0001_schema.sql` + `0003_storage.sql` + `0004_iconos_pie.sql`)

Todas las tablas tienen **row level security habilitada**. Resumen:

| Tabla | Lectura pública (anon) | Escritura |
|---|---|---|
| `categories` | Solo `active = true` | Authenticated (full) |
| `products` | Solo `activo = true` | Authenticated (full) |
| `product_options` / `product_option_values` | Sí | Authenticated (full) |
| `product_images` | Sí | Authenticated (full) |
| `coupons` | Solo `activo = true AND expira >= hoy` | Authenticated (full) |
| `sliders` | Solo `activo = true` | Authenticated (full) |
| `banners` | Solo `activo = true` | Authenticated (full) |
| `reviews` | Solo `activo = true` | Authenticated (full) |
| `orders` / `order_items` | **No** (solo administrador) | Authenticated (full) |
| `settings` | Sí (datos públicos) | Authenticated (full) |
| `profiles` | Solo la propia fila | Solo la propia fila |

> En un modelo **single-tenant** "cualquier usuario autenticado" ES el administrador (única cuenta creada). Si en el futuro hubiera varios roles, alcanza con ajustar las políticas.

### Storage (`0003_storage.sql`)

- **5 buckets públicos de lectura**: `products`, `branding`, `slider`, `banners`, `reviews`.
- Lectura pública para anon/authenticated; **subida/actualización/borrado solo authenticated**.
- Convención: la BD guarda el `storage_path` completo `"<bucket>/<ruta>"` y la URL pública se deriva en el frontend con `storage.getPublicUrl()`.
- Carpetas por entidad: `products/<producto_id>/`, `slider/`, `banners/`, `reviews/`, `branding/`.

---

## 5. Variables de entorno

### 5.1 Definición

| Variable | Dónde se usa | ¿Pública? |
|---|---|---|
| `SUPABASE_URL` | build de env, admin, API | Sí (es la URL del proyecto) |
| `SUPABASE_PUBLISHABLE_KEY` (anon) | build de env → `js/env.generated.js`, admin | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo** `api/pedido.js` en Vercel | **No — nunca al frontend** |

### 5.2 Archivos

- `.env.example` — plantilla documentada.
- `js/env.generated.js` — **commiteado como placeholder vacío** y sobrescrito por `npm run build:env`. Contiene solo la URL y la anon key (datos públicos).
- `scripts/build-env.mjs` — genera `env.generated.js` desde `process.env`.
- `package.json` — dependencia `@supabase/supabase-js` (visible para Vercel) y scripts `build:env` / `build`.

### 5.3 Pasos

**Local:**
```bash
cp .env.example .env.local    # completar los tres valores
npm install
npm run build:env             # crea js/env.generated.js con la URL + anon key
```

**Vercel** (Project Settings → Environment Variables): definir `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en Production/Preview/Development. El build de Vercel regenera `env.generated.js` de forma automática (el script `build` hace `build:env`).

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
  - **cupones** — CRUD con vencimiento y vigencia.
  - **slider / banners / resenas / iconos-pie** — CRUD con preview y subida de imágenes.
  - **configuracion** — WhatsApp, descuentos, transferencia, redes, **popup de salida** (título, descripción, CTA, destino y estado) y **preguntas frecuentes** (repetidor con pregunta, respuesta, orden y ícono FontAwesome opcional). Los cambios se reflejan en la tienda en ≤ 1 min por la caché.
  - **cuenta** — perfil, cambio de contraseña y cierre de sesión.
- **Estilo**: `admin/css/admin.css` usa los tokens visuales de la tienda (primario `#2563eb`, éxito `#00a650`, peligro `#ef4444`).
- **Seguridad**: la sesión se persiste con `persistSession`; escrita contra RLS de `authenticated`.

---

## 8. Puesta en marcha (checklist de despliegue)

1. **Crear proyecto** en https://supabase.com (plan free). Anotar `URL`, `anon key` y `service_role key` (Project Settings → API).
2. **Ejecutar las migraciones** en el SQL Editor de Supabase, **en orden**:
   - `migrations/0001_schema.sql` (esquema + RLS + funciones)
   - `migrations/0002_seed.sql` (datos reales)
   - `migrations/0003_storage.sql` (buckets y políticas; ahora define `public.es_admin()` y es autosuficiente, no depende de 0007)
   - `migrations/0004_iconos_pie.sql` (tabla `iconos_pie`, bucket `iconos`, políticas extendidas)
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
3. **Auth**: habilitar correo/contraseña (Authentication → Providers) y **crear una cuenta** exclusiva para el admin (Authentication → Users → Add user, o el formulario de registro). El `profiles` se crea solo por el trigger.
4. **Configurar variables de entorno** (sección 5) en local y Vercel.
5. **Desplegar en Vercel** el directorio `supabase/` (framework "Other"). `vercel.json` se mantiene tal cual (rewrites de rutas limpias; `/admin/...` se sirve estático).
6. **Probar** (sección 9) y luego, si se desea, **ir subiendo las imágenes** del catálogo desde el panel (los `external_url` de Drive siguen funcionando durante la transición).

> Si se usa Supabase CLI: `supabase link` + `supabase db push`. Las migraciones son idempotentes (usan `drop policy if exists` / `on conflict do nothing`).

---

## 9. Pruebas sugeridas

1. **Tienda**: abrir `index.html` con Supabase configurado → slider, banners, reseñas, catálogo y filtros idénticos al sitio actual.
2. **Ruta sin config**: con `env.generated.js` vacío → la tienda cae a los JSON locales (modo dual) sin romper nada.
3. **Detalle**: `producto.html?id=1` muestra variantes y galería; el id 14 aparece en Abrigos.
4. **Checkout**: comprar con stock disponible → genera `PED-####`, descuenta stock, abre WhatsApp y `gracias.html` muestra alias válido y copiable.
5. **Stock insuficiente**: pedir más unidades de las que hay → respuesta de error (409) y la transacción revierte todo.
6. **Cupones**: `black20` aplica 20%; intentar `sale10` (inactivo) → no aplica; umbral 100000 y cupón juntos → aplica el mayor, no suma.
7. **Admin**: login, CRUD de cada sección, subida/reemplazo de imágenes, cambio de estado de pedido y cierre de sesión.
8. **Popup de salida**: desde configuraciones, cambiar título/descripción/CTA/destino y desactivar → la tienda refleja el contenido nuevo (hasta 1 min por caché) y deja de mostrar la ventana si está inactiva.
9. **Preguntas frecuentes**: con la tabla vacía, `faq.html` muestra el contenido estático actual; al crear la primera pregunta activa pasa a la lista dinámica (con su ícono) y el acordeón sigue funcionando (delegación de eventos); si se ocultan todas, la sección desaparece.
10. **Seguridad**: sin sesión, la API anon NO debe poder leer `orders` ni escribir en `products` (probarlo desde una pestaña anónima).
11. **Recuperación de contraseña**: en `login.html` → "¿Olvidaste tu contraseña?" con el correo admin → el enlace llega a `admin/recuperar.html` → fijar una contraseña nueva → volver a iniciar sesión con la nueva.
12. **Ubicación del negocio** (`contacto.html` + `api/ubicacion.js`): con `address` vacío el bloque "Nuestra Ubicación" no se muestra (sin valores por defecto); con una dirección como texto, un link corto (`maps.app.goo.gl/…`) o una URL de mapas larga, `/api/ubicacion` la resuelve a coordenadas (sigue redirecciones server-side y/o geocodifica con Nominatim) y la página muestra un mapa de OpenStreetMap con el nombre del lugar bajo el mapa. Si no se puede resolver, se muestra el valor como texto sin mapa.
13. **Marquee promocional** (sección Diseño): con "Mostrar marquee" marcado y al menos un mensaje activo, la tienda muestra la barra superior animada (textos duplicados, pausa al hover) con el color de fondo elegido; si se desactiva el toggle, se ocultan todos los mensajes o no hay ninguno, la barra desaparece. La caché de la tienda (60 s, 5 min en configuración) limita la verificación inmediata.
14. **Tamaño del logotipo** (sección Diseño → Logotipo): elegir Small (40px), Medium (60px) o Large (80px) aplica la altura correspondiente al header de la tienda al guardar; el ancho se ajusta automáticamente (`width: auto`). En móvil se conserva solo el ajuste de márgenes.
15. **Slider por dispositivo**: desde el panel (sección Slider) marcar un slide "Solo móvil" y otro "Solo escritorio" → en escritorio solo se ve el de escritorio y los "Ambos"; al achicar la ventana por debajo de 768px (o probarlo con DevTools responsive), el set cambia automáticamente y el slider reinicia en el primer slide visible. Si ningún slide aplica al viewport, la portada se oculta.

---

## 10. Riesgos y decisiones tomadas

- **Precios recalculados servidor-side** (`insertar_pedido`): el front no es de confianza; el negocio lo replica.
- **`external_url` convive con `storage_path`** durante la transición: los drives originales siguen funcionando; el admin decide cuándo migrar cada imagen al Storage (limpieza progresiva, sin apuro).
- **Borrado de productos**: `order_items.product_id` es `SET NULL` → el historial de pedidos no se corrompe; las imágenes se limpian del Storage manualmente desde el panel.
- **Caché en memoria (60s / 5min en configuración)**: cambios del admin se ven en la tienda en hasta ~1 minuto. Es intencional para no golpear Supabase en cada render.
- **Fallback JSON**: si no hay configuración o Supabase está caído, la tienda usa los JSON locales (`js/*.json`). Controlado por cada `obtener*`.
- **`GOOGLE_SCRIPT_URL` conserva el nombre** en `js/formulario.js` (legado): evita tocar puntos ciegos del frontend; el destino `/api/pedido` ya no proxea a Google.
- **Metas SEO**: se corrigieron los placeholders `tusitio.com` → `supabase.lemora.lat` en los 8 HTML.
- **Sin ventanas nativas del navegador** (solo UI propia): las confirmaciones usan el modal del panel (`confirmarDialogo` en `admin-ui.js`) y las notificaciones de la tienda usan los toasts propios (`mostrarNotificacion`).
- **`sale10` quedó inactivo** (vencido el 2026-08-30) respetando la realidad de la planilla.
- **Mapa de contacto con OpenStreetMap**: Google deshabilitó el embed keyless (`maps?q=…&output=embed` muestra "Este contenido está bloqueado") y los links cortos no son embebibles desde el navegador (CORS en la redirección). La tienda resuelve la ubicación server-side (`api/ubicacion.js`: sigue redirecciones de `maps.app.goo.gl`, extrae coordenadas de URLs y geocodifica texto con Nominatim, con cache y respeto a su política de uso) y la muestra con el embed de OpenStreetMap, que no requiere API key ni restricciones de referrer.
- **Marquee administrable**: la barra promocional estaba comentada/desactivada en el código con textos hardcodeados. Ahora el contenido, la activación y el color de fondo se administran desde la sección "Diseño" del panel (repeater de mensajes + toggle + selector de color junto al color principal), y la tienda renderiza la barra solo si hay mensajes activos (sin valores por defecto).

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
| **Google Sheets** (planillas de productos, cupones, slider, banners, reseñas, pedidos, config) | Fuente de datos del frontend y del admin | **Deprecado.** Los datos viven en PostgreSQL (seed con los datos reales a la fecha de migración) |
| **Google Apps Script** (web app proxy de pedidos) | `api/pedido.js` reenviaba a `script.google.com/.../exec` | **Deprecado.** `api/pedido.js` ahora escribe directo en Supabase vía RPC |
| **Google Drive** (imágenes en `drive.google.com` / `googleusercontent.com`) | URLs `external_url` en productos/slider/banners/reseñas | **En desuso gradual.** Se mantienen como `external_url` solo para que el sitio se vea idéntico durante la transición; el objetivo es pasar al **Storage** del proyecto vía panel |

### 12.2 Qué hay que apagar (cuando se confirme el funcionamiento)

1. **Apps Script**: eliminar el script/proyecto web y quitar su permiso de ejecución (el endpoint deja de recibir tráfico apenas se despliegue la nueva `api/pedido.js`).
2. **Sheets**: pueden dejarse como respaldo histórico, pero **dejar de editarlas** (ya no alimentan la tienda). Si se desea, exportar copia como respaldo antes de borrar.
3. **Drive**: las imágenes seed seguirán referenciadas hasta que se re-suban al Storage. **No borrar los archivos originales de Drive** hasta migrar cada imagen; al reemplazar desde el panel, la URL externa se reemplaza por `storage_path`.

### 12.3 Riesgos de la desconexión

- Si se corta el acceso a Drive (compartido "público con enlace" revocado), el catálogo mostrará imágenes vacías **hasta** que se re-suban al Storage. Mitigación: la tienda tiene placeholder propio y el panel permite re-subir sin prisa.
- El comercio ya NO depende de Sheets: incluso sin ninguna cuenta de Google activa, la tienda y los pedidos funcionan contra Supabase.
- Dependencia mínima restante: las URLs de imagen de Drive mientras dure la transición.

### 12.4 Criterios para considerar la migración completa

- [ ] Las 48 imágenes + slider + logos de banner subidos y verificados en Storage (bucket `products`, `slider`, `banners`, `reviews`).
- [ ] Sin URLs de `googleusercontent.com` ni `drive.google.com` en la BD (se puede consultar con `select ... where external_url like '%google%'`).
- [ ] Apps Script eliminado y variables `WEB_API_KEY`/`GOOGLE_SCRIPT_URL` retiradas del entorno de Vercel.
- [ ] Planillas de Sheets archivadas/exportadas como copia simple.
</content>
</invoke>