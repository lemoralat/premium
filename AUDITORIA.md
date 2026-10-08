# Auditoría de código — Lemora (plan Premium)

**Proyecto:** `/Users/martinleidreiter/Downloads/lemora/Planes/premium`
**Fecha:** 8 de octubre de 2026
**Alcance:** todo el código del repositorio (frontend público, panel admin, API serverless, `proxy.ts`, configuración de Vercel y las 46 migraciones SQL). Excluye `node_modules`.
**Método:** lectura estática + revisión cruzada entre capas. No se ejecutó nada contra producción. Los hallazgos CRÍTICOS marcados como **✔ verificado** fueron confirmados directamente sobre el archivo por el autor de este informe.

> **Naturaleza del proyecto.** Es un e-commerce estático (`index.html`, `producto.html`, …) que se despliega en Vercel, con un panel de administración en `/admin`, backend Supabase (PostgreSQL + Auth + Storage) y tres funciones serverless (`api/pedido.js`, `api/sesion.js`, `api/ubicacion.js`). No hay pasarela de pago: el checkout registra el pedido y descuenta stock, y la confirmación se arma como mensaje de WhatsApp. Cada página HTML es un *shell* de pocos KB: el header, el footer y casi todo el contenido se inyectan en runtime desde Supabase.

---

## 1. Resumen ejecutivo

| Severidad | Nº de hallazgos |
|---|---|
| 🔴 Crítico | 2 |
| 🟠 Alto | 17 |
| 🟡 Medio | ~25 |
| ⚪ Bajo | ~30 |

**Diagnóstico general.** La base es sólida y en varios aspectos mejor que la media: el precio y el stock se recalculan en el servidor, las RLS del flujo normal están bien escritas (`es_admin()` + `security definer`), no hay secretos en el repositorio, el escapado HTML es consistente y el `proxy.ts` protege `/admin` de verdad a nivel de servidor. **Los riesgos reales no están en el diseño, sino en los bordes:** la ausencia total de *rate limiting* en las APIs, un modelo de despliegue manual de migraciones que puede *reabrir* agujeros de RLS ya cerrados, y funciones antiguas posiblemente aún expuestas.

**Los 5 problemas que exigen acción inmediata:**

1. **🔴 Sin rate limiting en `/api/pedido`**: se pueden crear pedidos infinitos que **descuentan stock real** (`api/pedido.js`). ✔ verificado
2. **🔴 Re-ejecutar migraciones antiguas reabre RLS permisiva**: `0001`/`0004`/`0014`/`0017` reinstalan políticas `using(true)` que dan CRUD sobre pedidos (PII) a cualquier usuario autenticado; `0049`, la "red de seguridad", no las repara. — ✅ **arreglado** (ver C3 más abajo).
3. **🔴 Posible agujero sin confirmar**: funciones `security definer` de la migración 0046b quedaron invocables con la anon key (escribir stock/precios); su compensación (`0046_limpieza_variantes.sql`) no está registrada en `schema_migrations`.
4. **🟠 Precio mostrado ≠ precio cobrado**: el carrito congela precios viejos en `localStorage` y calcula totales con ellos (`js/utils.js`, `js/carrito.js`).
5. **🟠 XSS almacenado por el número de WhatsApp** — ✅ **arreglado** (ver actualización más abajo). Re-clasificado de Crítico a Medio: requiere escritura previa en `settings`, que es admin-only, por lo que **no lo explota un anónimo**.

---

## 2. Lo que está bien (y conviene preservar)

- **El servidor es la fuente de verdad:** `insertar_pedido` (migración `0048`) recalcula montos, valida stock y descuenta en una sola transacción con `for update`. Los montos que manda el cliente se ignoran a propósito (`api/pedido.js:14-17`).
- **Autorización real, no solo de UI:** `proxy.ts:112-127` valida cada request a `/admin*` contra el RPC `es_admin()`; `public.admins` tiene RLS activa y **sin políticas**, así que nadie se autopromueve. El `service_role` vive únicamente en el servidor.
- **Sin secretos en el repo:** `js/env.generated.js` commiteado tiene `url`/`publishableKey` **vacías**; `.gitignore` cubre `.env*`; `scripts/build-env.mjs` solo escribe la anon key pública.
- **Defensas anti-abuso puntuales bien hechas:** honeypot con `aria-hidden` + `tabindex="-1"`, idempotencia por token, anti-spam por email (10/h), SSRF endurecido en `api/ubicacion.js` (`esSaltoSeguro`), `Set-Cookie` `HttpOnly`/`Secure`/`SameSite` en `api/sesion.js`.
- **Frontend cuidado:** escapado HTML centralizado (`escaparHtml`, `js/utils.js`), filtro de esquemas de URL (`urlSegura`), `target="_blank"` siempre con `noopener` (11/11), protección anti CSV-injection en `admin/js/exportar-datos.js`.
- **CSS mejor factorizado de lo que aparenta:** 792 reglas, solo 2 duplicadas exactas, 4 `!important` justificados, un sistema de tokens real (`:root`) con dark mode en el admin. No hay "caos de especificidad".
- **Documentación interna excelente:** los encabezados de `proxy.ts`, `api/pedido.js` y de casi todas las migraciones explican el *por qué* de las decisiones.

---

## 3. Hallazgos críticos

### ✅ C1 (ARREGLADO) — XSS almacenado vía el número de WhatsApp del header
> **Actualización 08/10/2026 — re-clasificado de 🔴 Crítico a 🟠 Medio y corregido.**
> Este hallazgo **no lo puede explotar un visitante anónimo**: la única escritura posible sobre `settings.whatsapp_number` es admin (`es_admin()`, verificado en `0001` + `0007`). Se mantiene como defensa en profundidad porque el valor se renderiza para todos: amplifica el daño de un admin comprometido y era el único campo sin escapar. **Corregido en 3 capas:** saneo a solo dígitos al guardar (`admin/js/configuracion.js`), saneo al cargar desde la base (`js/utils.js`) y escapado al interpolar (`js/template.js`). El saneo al cargar neutraliza además cualquier valor ya contaminado en la base, sin necesidad de volver a guardar.

**Archivo original:** `js/template.js:354` (validación ausente en `admin/js/configuracion.js`)

```js
// ANTES — el número se interpolaba crudo
whatsapp.innerHTML = `<a href="https://wa.me/${WHATSAPP_CONFIG.number}?text=${encodeURIComponent(...)}" ...>
// DESPUÉS — se sanea a dígitos al cargar (utils.js) y se escapa al interpolar (template.js)
whatsapp.innerHTML = `<a href="https://wa.me/${escaparHtml(WHATSAPP_CONFIG.number)}?text=${encodeURIComponent(...)}" ...>
```

### 🔴 C2 — `/api/pedido` sin rate limiting real ✔ verificado
**Archivo:** `api/pedido.js:32-117` · **Soporte:** `migrations/0048_insertar_pedido_canonico.sql:125-137`

Los únicos frenos son idempotencia **por token** y anti-spam **por email**; ambos los controla el atacante (que genera tokens y emails nuevos). El honeypot no frena nada si no se envía el campo. No hay CAPTCHA, ni límite por IP, ni WAF.

**Impacto:** `curl` en bucle ⇒ pedidos ilimitados, cada uno **descuenta stock real** (`0048:168`) sin pago que lo revierta. Es un DoS de negocio (agotar inventario), además de spam por WhatsApp y coste serverless/Supabase.

**Arreglo:** rate limit por IP (Vercel Firewall/`@vercel/firewall` o Upstash) + CAPTCHA invisible (Cloudflare Turnstile) verificado en servidor + tope global diario.

### ✅ C3 (ARREGLADO) — Re-ejecutar migraciones antiguas reabre RLS permisiva
**Archivos:** `0001_schema.sql:512-657` (incluye `orders` `:631-636` y `settings` `:652-657`), `0004_iconos_pie.sql:56-61`, `0014_preguntas_frecuentes.sql:65`, `0017_marquee.sql:76`

Esas migraciones crean políticas `to authenticated using (true) with check (true)`. El endurecimiento vive en `0007_seguridad.sql` y `0026_cierre_rls_admin.sql`, pero el despliegue es **manual** ("aplicar en el SQL Editor"), y el propio repo contempla re-ejecutar. `0049_higiene_permisos.sql` —que se presenta como red de seguridad post-re-ejecución— **no toca RLS**: solo revoca permisos y crea índices.

**Impacto:** cualquier usuario `authenticated` no-admin recupera CRUD sobre `orders`/`order_items` (PII de clientes: nombre, email, teléfono, dirección), `settings` y todo el contenido/precio del catálogo.

**Arreglo:** que `0049` (o una migración nueva) reaplique en bucle las políticas `using (public.es_admin()) with check (public.es_admin())` a todas las tablas; y convertir `0001`/`0004`/`0014`/`0017` en no re-ejecutables (guardas `if not exists` sobre la política endurecida).

**✅ Arreglado (2026-10-08):**
- **Red de seguridad — `migrations/0050_rls_endurecida.sql` (nueva, idempotente).** Re-aplica `public.es_admin()` a las 13 policies "…: admin full"; rehace las policies de `orders`/`order_items` (lectura + cambio de estado) y sus grants (revoca INSERT/UPDATE/DELETE y devuelve sólo `update(estado)`); y cierra la escritura de Storage a "solo admin" sobre los 6 buckets. Se corre después de cualquier re-ejecución de una migración vieja y se registra sola en `schema_migrations`.
- **Causa raíz — guardas anti-degradación en `0001`, `0004`, `0014`, `0017`.** Cada una empieza ahora con un `do $$ … $$` que, si encuentra su nombre en `schema_migrations` (0045), **aborta antes de ejecutar nada** con un mensaje explícito. Re-ejecutarlas sobre la base viva deja de ser posible; en una instalación nueva la tabla aún no existe y la guarda no interfiere. Para forzar un re-run hay que borrar antes su fila — y entonces corresponde correr `0050` después.

### 🔴 C4 — Funciones `security definer` de 0046b posiblemente abiertas a `anon` (condicional)
**Archivo:** `0046_limpieza_variantes.sql:11-18,53-58` · **Soporte:** `0045_schema_migrations.sql:139-182`

La compensación documenta que seis funciones `security definer` de 0046b permitían **escribir stock y precios con la anon key**. El repo solo contiene el script de limpieza, que **no se autorregistra** en `schema_migrations` (el backfill se detiene en `0044`), y `SUPABASE_MIGRATION.md` afirma que 0046/0047 no existen. **No es verificable desde el repo** si el agujero está cerrado.

**Arreglo / verificación inmediata en la base:**
```sql
select has_function_privilege('anon','public.bulk_update_variants_by_category(integer,bigint[],jsonb)','execute');
-- y registrar la compensación:
insert into public.schema_migrations (nombre, nota)
values ('0046_limpieza_variantes','compensa 0046/0046b/0047')
on conflict (nombre) do nothing;
```

---

## 4. Hallazgos altos

### Seguridad / datos
- **A1 — `body.cliente` crudo a la DB.** `api/pedido.js:92` reenvía `p_cliente: body.cliente` entero; solo se validan `nombre` (≤200) y `email` (≤254). El resto (teléfono, dirección, notas, claves extra) puede pesar hasta ~4,5 MB de JSON arbitrario persistido en `orders.cliente`. **Arreglo:** allowlist de campos con longitudes antes del RPC.
- **A2 — Guardado de producto no atómico.** `admin/js/productos.js:694-709` hace `delete` de todas las variantes y luego reinserta una por una, sin transacción. Si un `insert` falla (o se corta la red), el `delete` ya se confirmó: **el producto queda sin variantes**. **Arreglo:** mover a un RPC transaccional (como `insertar_pedido`).
- **A3 — `/api/ubicacion` es un geocodificador público sin límites.** `api/ubicacion.js:31,145-171,240-255`: caché `Map` **sin cota** (OOM por instancia), throttle de 1 req/s con **condición de carrera**, `fetch` a Nominatim **sin timeout**. **Arreglo:** rate limit por IP, LRU con tope y expiración, timeout (`AbortSignal.timeout`), caché negativa.
- **A4 — `settings` legible por `anon` con `using(true)`.** `0001_schema.sql:646-650` + `grant select to anon` + `js/supabase.js:594` (`select('*')`) exponen alias/entidad/titular de transferencia y cualquier columna sensible futura. **Arreglo:** vista con `grant` por columna, o mover secretos a una tabla sin política pública.
- **A5 — Re-ejecutar `0004` degrada Storage a "cualquier authenticated".** `0004_iconos_pie.sql:103-120` recrea políticas de subida/borrado `to authenticated` **sin `es_admin()`** sobre 6 buckets públicos. Defacement y subida arbitraria al CDN.
- **A6 — `0049` no revoca `EXECUTE` a `authenticated`.** `0049_higiene_permisos.sql:107-111` barre `public, anon` pero no `authenticated`; el grant original (`0001:684`) deja la superficie frágil para cualquier función `security definer` futura.
- **A7 — Fallback de cookie de sesión sin `HttpOnly`.** `admin/js/admin-supabase.js:54-60`: si `/api/sesion` falla, escribe el access_token por `document.cookie`, anulando la mitigación. Una XSS en el panel puede robar la sesión admin. (Además el SDK mantiene el token en `localStorage`, `admin-supabase.js:79-85`.)

### Corrección / negocio
- **A8 — Precio mostrado ≠ precio cobrado.** `js/utils.js:531` y `js/producto-detalle.js:744-750` congelan `precio` al agregar; `js/carrito.js:58,207` y `js/template.js:477,496` lo usan para mostrar y calcular. Si el admin cambia un precio, la UI (y la validación de compra mínima) usan el viejo mientras el servidor cobra el nuevo. **Arreglo:** rehidratar el carrito desde el catálogo fresco antes de renderizar.
- **A9 — Checkout sin guarda de reentrada → pedidos duplicados.** `js/formulario.js:61-66` solo aplica una clase CSS; Enter durante el envío dispara un segundo `POST` y abre una segunda ventana de WhatsApp, con doble descuento de stock. **Arreglo:** flag de reentrada + `button.disabled`.
- **A10 — Stock no validado al agregar + doble fuente.** `js/utils.js:515-537` incrementa sin mirar `producto.stock`; `window.agregarAlCarrito` está **redefinido** por `js/productos.js:16` y `js/productos-categorias.js:186` (gana el último). Hoy sin consumidores en HTML (código muerto peligroso). **Arreglo:** unificar en una función con validación de stock.
- **A11 — Falta índice anti-spam.** `0049:200-202` (`orders_cliente_email_idx`) no está aplicado; sin él, cada checkout hace *seq scan* de `orders` (ver C2/B3).
- **A12 — "Guardar y continuar" no espera los guardados.** `admin/js/cambios-sin-guardar.js:190-213` dispara el submit y espera `setTimeout(1200)`; con red lenta o validación fallida se pierden cambios. **Arreglo:** que cada módulo exponga su promesa y hacer `await Promise.allSettled`.

### UX / accesibilidad / SEO
- **A13 — Buscadores del admin inutilizables.** `admin/js/productos.js:97-100` y `admin/js/pedidos.js:96-101` re-renderizan todo el `innerHTML` en cada tecla, incluido el propio `<input>`: se pierde el foco tras cada carácter. **Arreglo:** repintar solo el `<tbody>`.
- **A14 — Productos no indexables (SEO estructural).** Todas las fichas viven en `/producto?id=N` y declaran `canonical: /producto` (`producto.html:16`); el sitemap (`scripts/build-env.mjs:102-111`) no incluye productos. Google nunca indexará un producto por separado. **Arreglo:** URLs estáticas por producto + canonical/`og:url` por ficha + sitemap con productos.
- **A15 — Todo depende de JS, sin SSR ni `<noscript>`.** `index.html` no tiene `<h1>`, `<nav>`, `<footer>` ni contenido; canonical/OG/JSON-LD se inyectan en runtime. Con JS bloqueado el sitio queda en blanco. **Arreglo:** prerender del header/footer/SEO y `<noscript>`.
- **A16 — SRI inválido rompe Font Awesome en el admin.** `admin/index.html:12` y `admin/login.html:12` tienen el hash SHA-512 sin el relleno final `==` (86 vs 88 chars; las 8 páginas raíz sí lo llevan). ✔ verificado. El navegador rechaza `all.min.css` y **el panel pierde todos los iconos**. **Arreglo:** añadir `==`.
- **A17 — Sin coalescing de peticiones en el catálogo.** En `index.html` cinco módulos llaman `obtenerProductos()` en paralelo (`js/supabase.js:244`): hasta 5 consultas idénticas y hasta 5 toasts de error apilados ante una caída. **Arreglo:** cachear la promesa en vuelo.
- **A18 — Carrera del buscador.** `js/busqueda.js:11-20` registra el listener `lemora:header-ready` **después** del `await`; si el header se inyecta antes, los inputs no se vinculan y el buscador queda muerto. **Arreglo:** registrar el listener antes del `await`.

---

## 5. Hallazgos medios (agrupados)

**Seguridad / configuración**
- CSP con `'unsafe-inline'` en `script-src` (handlers `onclick=` masivos en frontend y admin) impide una CSP estricta. El SDK de Supabase se carga desde jsDelivr **sin SRI** (`admin/js/admin-supabase.js:78`, `js/supabase.js:128`) → riesgo de cadena de suministro. `vercel.json:20-21,40-42`.
- `proxy.ts:112-130` hace un `fetch` a Supabase por **cada** request a `/admin*` (incluidos todos los `.js`) sin timeout ni caché.
- Política de orígenes (`api/_lib/origenes.js:49,92-106`) acepta `Origin` ausente, `*.vercel.app` y `localhost` **en producción**: es una mitigación CSRF de navegador, no anti-abuso.
- HSTS sin `includeSubDomains`/`preload`; faltan COOP/CORP (`vercel.json:40-42`).
- `urlSegura` (`js/utils.js:342`) acepta URLs protocol-relative (`//evil.com`) en banners/slider/redes administradas.
- URLs del admin (`banners.js:203`, `slider.js:151`, redes/`cfgAddress`) no validan esquema antes de publicarse en el sitio.

**Integridad / concurrencia**
- Triggers de tope "check-then-insert" sin lock (`0035`–`0041`): carrera que permite superar el máximo (p. ej. 11 cupones).
- "Last-write-wins" sin versión: `productos.js:685` (update sin `updated_at`), `configuracion.js:299-314`, `slider.js:334-358` (duplicar con N updates secuenciales + insert).
- Diálogos que se eliminan sin resolver la promesa previa: `admin-ui.js:92-93,301-302`, `cambios-sin-guardar.js:217-220` (deja `enDialogo=true` para siempre).
- `event.submitter` sin fallback rompe el guardado programático (`categorias.js:106`, `cuenta.js:92`, `cupones.js:108,133,218`).
- Validación numérica incompleta (límites solo en HTML): descuento >100% (`cupones.js:110`), posiciones negativas (`slider.js:237`), `precio_anterior` negativo (`productos.js:421`).
- `conCarga` destruye los `<i>` de los botones al restaurar con `textContent` (`admin-ui.js:178-194`).
- Pedidos del admin limitados a 300 sin paginación ni aviso (`pedidos.js:18-21`).
- Sin auditoría de pedidos: borrado físico (`0025:29-49`) sin historial. `0004` no es transaccional (no tiene `begin/commit`).

**Frontend / UX**
- `JSON.parse(localStorage...)` sin `try/catch` en 13 sitios (`carrito.js`, `template.js`, `utils.js`, `formulario.js`, `gracias.js`, `producto-detalle.js`, `favoritos.js`): un valor corrupto rompe el render. Falta un helper central.
- `querySelector(window.location.hash)` puede lanzar `SyntaxError` y cortar la inicialización (`productos-categorias.js:19-24`).
- Fuga de listeners / modales de zoom apilables (`producto-detalle.js:396-471,555-651`); listeners de `document` nunca removidos.
- Flechas globales mueven el slider mientras se escribe en un input (`hero-slider.js:217-226`).
- Caducidad de cupón con desfase de zona horaria (`utils.js:217-221`, duplicado en `carrito.js:136-140`).
- Navegación prev/next asume IDs contiguos (`producto-detalle.js:171-172`).
- Ausencia general de estados de carga/error/vacío (catálogo, búsqueda, FAQ, reseñas); la FAQ oculta la sección entera si falla Supabase.
- Accesibilidad: sin `<h1>` en `index.html` y varios `<h1>` si hay varios slides; errores de formulario sin `aria-invalid`/`role="alert"`; modales sin *focus trap*; toasts sin `aria-live`; menú móvil sin `aria-expanded`; input de cupón sin label (`carrito.html:60`); `<iframe>` sin `title` (`contacto.html:76`); contraste insuficiente en estados (stock `#f59e0b` 2.15:1, `#00a650` 3.20:1, error `#ef4444` 3.76:1); `outline:none` en 6 reglas de inputs; submenú de categorías solo `:hover`.
- Header bloqueado por red: `js/template.js:316-325` espera `obtenerProductos()` antes de inyectar el header.

**SEO / rendimiento**
- Metadatos duplicados: `index`, `producto`, `carrito`, `faq` y `gracias` comparten `<title>`/`<meta description>`; `carrito` y `gracias` deberían llevar `noindex`.
- Canonical/OG con placeholder `TU-DOMINIO.com` si no se define `SITIO_URL` (el build solo emite un `warn`, no falla).
- JSON-LD `Product` válido pero inyectado por JS, sin `brand` ni `aggregateRating` pese a tener reseñas.
- Enlaces rotos: `producto.html:47` apunta a `/index#productos` (no existe `id="productos"`; el catálogo es `id="tienda"`).
- CSS: breakpoints inconsistentes (`767` vs `768` provoca reglas contradictorias a 768px), `@media` anidado (ignorado en Safari <16.5), `.testimonio-card { width:100vw }` sin `overflow-x:hidden` global.
- Colores de estado hardcodeados que saltan los tokens (`#ef4444` ×10, `#00a650` ×8, `#f59e0b` ×3).
- `@keyframes fillProgress` anima `width`; `transition: max-height` en acordeones; `box-shadow` animado en WhatsApp; `transition: all` en 10 reglas.
- `prefers-reduced-motion` parcial: no cubre marquee, `bounce`/`drift` del 404 ni el autoplay del hero.
- Miniaturas de galería sin `loading="lazy"` (`producto-detalle.js:219,444`).

---

## 6. Hallazgos bajos / oportunidades

- **Código muerto:** `js/faq.js:39-57`; `js/producto-detalle.js:564-579`; `js/productos.js` entero; `utils.js:549-551`; `admin/js/cupones.js:13,26`; `admin/js/resenas.js:116-118`; `admin/js/slider.js:103-105`; CSS de la FAQ estática antigua (~150-200 líneas), `.marquee-separator`, `.logo--small`, `.estado-enviado`.
- **Duplicación:** `escaparHtml` reimplementado en `preguntas-frecuentes.js` e `iconos-pie.js`; render de banners casi idéntico entre `carrito.js` y `productos-categorias.js`; render/lógica de carrito duplicados entre `carrito.js` y `template.js`; patrón CRUD repetido casi idéntico en ~10 módulos del admin (candidato a helper `crearSeccionCRUD`).
- **Errores ignorados:** deletes/updates de imágenes y posiciones sin chequear `error` (`productos.js:715,733,754`); render tras guardar sin `await`/`.catch` (posibles `unhandledrejection`).
- **Fugas menores:** Chart.js no se destruye al salir del dashboard; `URL.createObjectURL` sin `revokeObjectURL` en previews.
- **Detalles:** `toast(esc(...))` con doble escapado (`pedidos.js:127,176`); `esc()` en labels de Chart.js (aparece `&amp;` literal); mensajes crudos de Supabase mostrados al usuario; token de pedido con `Math.random()` no criptográfico (`formulario.js:122-125`).
- **Higiene:** `robots.txt` sin `Sitemap:`; `405` sin header `Allow`; `api/ubicacion.js:272-275` responde `500` en vez de `502/504`; `console.error` con `error.message` crudo puede arrastrar datos personales; `.env.example` y `migrations/` quedan en el directorio servido estáticamente.
- **Dependencias:** sin CVEs conocidos en las versiones fijadas; recomendable activar Dependabot/`npm audit` en CI. ⚪
- **Observaciones de comentarios/documentación:** `0044:148-150` afirma algo incorrecto sobre la RLS; `0001:165` obsoleto tras `0030`; `orders_numero_seq` no se resetea en `0002` (inofensivo hoy).

---

## 7. Plan de remediación priorizado

**Fase 0 — inmediato (horas)**
1. Escapar/sanear `whatsapp_number` (C1). ✔
2. Añadir `==` al SRI de `admin/index.html` y `admin/login.html` (A16). ✔
3. Verificar en la base que las funciones de 0046b estén revocadas y registrar la compensación (C4).

**Fase 1 — esta semana**
4. Rate limiting por IP + CAPTCHA en `/api/pedido` y `/api/ubicacion` (C2, A3); tope de caché + timeout en `ubicacion`.
5. Allowlist y longitudes para `body.cliente` (A1).
6. Rehidratar el carrito con precios frescos (A8) y añadir la guarda de reentrada del checkout (A9).
7. Mover el guardado de producto + variantes a un RPC transaccional (A2).

**Fase 2 — este mes**
8. ~~Endurecer el modelo de migraciones~~ **C3 ✅ arreglado** (`0050_rls_endurecida.sql` + guardas anti-degradación en `0001/0004/0014/0017`); quedan Storage (A5, A6) y el `select('*')` de `settings` (A4).
9. Quitar el fallback de cookie sin `HttpOnly` y migrar a cookies gestionadas (A7); quitar `'unsafe-inline'` de la CSP y autohospedar el SDK de Supabase.
10. SEO estructural (A14, A15): URLs de producto, canonical/`og:url` por ficha, sitemap con productos, `<noscript>`.
11. Arreglar los buscadores del admin (A13) y "guardar y continuar" (A12); coalescing del catálogo (A17) y carrera del buscador (A18).

**Fase 3 — mejora continua**
12. Accesibilidad (contraste, foco, labels, roles, focus trap), limpieza de código muerto y duplicación, `prefers-reduced-motion` completo, paginación en admin.

---

## 8. Anexo — verificaciones directas realizadas

- `js/template.js:354` — confirmado: `WHATSAPP_CONFIG.number` en `innerHTML` sin escapar. ✔
- `admin/js/configuracion.js:66,241` — confirmado: solo `.trim()`, sin normalización a dígitos. ✔
- `api/pedido.js:32-117` — confirmado: sin rate limiting; `p_cliente: body.cliente` sin sanear (línea 92). ✔
- `admin/index.html:12`, `admin/login.html:12` — confirmado: hash SRI sin `==` (86 chars) mientras las 8 páginas raíz usan `==` (88 chars). ✔
- `migrations/0001/0004/0014/0017` — confirmado: políticas `using(true)` presentes; endurecidas por `0007`/`0026`. ✔
- `js/env.generated.js` — confirmado: valores vacíos (sin claves filtradas). ✔
- `proxy.ts:92-133` — confirmado comportamiento de guard server-side descrito. ✔

> Este informe comenzó siendo de solo lectura. Se editó luego para registrar los arreglos aplicados: C1 (WhatsApp) en `admin/js/configuracion.js`, `js/utils.js`, `js/template.js`; y C3 (RLS) con `migrations/0050_rls_endurecida.sql` y guardas anti-degradación en `0001_schema.sql`, `0004_iconos_pie.sql`, `0014_preguntas_frecuentes.sql` y `0017_marquee.sql`.
>
> **Función nueva (2026-10-08) — modo venta / turnos:** implementada junto con la remediación: `migrations/0051_tipo_web_turnos.sql` (columna `settings.modo_web` default `'venta'`, tabla `public.turnos` con RLS al estilo de `orders`, RPC `insertar_turno` —idempotencia por token + anti-spam por correo— y `borrar_turnos` security definer), panel (tarjeta "Tipo de web" en Configuración + sección Turnos), frontend (`/carrito` bifurcado según el modo, CTAs sin precios ni stock, `api/turno.js`, `gracias.html` adaptada). Documentada en `SUPABASE_MIGRATION.md`. **[Pendiente] C4** — verificación de permisos de las funciones `security definer` de 0046b y autorregistro de `0046_limpieza_variantes.sql` — sigue sin aplicar.
