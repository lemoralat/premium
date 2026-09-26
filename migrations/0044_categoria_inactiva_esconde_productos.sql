-- ============================================================================
-- LEMORA — Migración 0044: desactivar una categoría esconde los productos.
--
-- Sigue a la 0043 (fin de external_url). Es la última de este lote.
--
-- ----------------------------------------------------------------------------
-- EL PROBLEMA
-- ----------------------------------------------------------------------------
-- En la 0001, la lectura pública de productos es `using (activo = true)` y la
-- de categorías es `using (active = true)`. Parecen coherentes, pero cada una
-- mira su propia tabla y a nadie le cruza las dos:
--
--   1) El panel (admin/js/productos.js) filtra las categorías por
--      `active = true` al armar el select de productos, así que desde el panel
--      una categoría desactivada desaparece.
--   2) La tienda (js/supabase.js) embebe `categoria:categories(id, name)` y NO
--      filtra el active de la categoría. La RLS de `categories` hace que, para
--      el embed, una categoría inactiva no sea seleccionable: el producto
--      vuelve con `categoria: null`.
--   3) mapaProducto() convierte ese null en CATEGORIA_SIN_ASIGNAR
--      ('Sin categoría'), que existe justo para que los productos sin
--      categoría no desaparezcan del home.
--
-- O sea que el producto NO se oculta: se mudan de sección. El admin desactiva
-- "Remeras", ve que el panel ya no la ofrece, y la tienda sigue mostrando las
-- remeras — ahora en una sección que se llama "Sin categoría", que además
-- aparece en el submenú del header con ese nombre.
--
-- Para quien administra la tienda, desactivar una categoría tiene que
-- despublicar sus productos. Este era el único camino de "sacar cosas de la
-- vista" que no sea desactivar producto por producto.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ SE ARREGLA EN RLS Y NO EN EL SELECT DEL FRONT
-- ----------------------------------------------------------------------------
-- El arreglo obvious sería agregar el filtro a la query de js/supabase.js:
-- `.or('category_id.is.null,categoria.active.eq.true')`. No se hizo ahí por dos
-- razones.
--
-- La primera es que es sólo una de las maneras de leer productos. Si el filtro
-- vive en el cliente, alcanza con un fetch a PostgREST con la anon key para
-- ver todo el catálogo, incluidos los productos de categorías desactivadas. Con
-- la regla en la base, no: el filtro se aplica aunque nadie pase por el front.
--
-- La segunda es que el front es un consumidor más. La regla "una categoría
-- desactivada no muestra sus productos" es una decisión de negocio, y las
-- decisiones de negocio que importan viven en el esquema. Si mañana alguien
-- agrega un endpoint, un informe o una app, hereda la regla sin tener que
-- acordarse de escribirla.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ EL "or exists" Y NO UN JOIN
-- ----------------------------------------------------------------------------
-- `category_id` es nullable con `on delete set null`, y los productos sin
-- categoría son un caso soportado a propósito: CATEGORIA_SIN_ASIGNAR los mete
-- en su propia sección. Un filtro del tipo "tiene que tener categoría activa"
-- los borraría de la tienda, que es peor que el bug que se está arreglando.
--
-- Por eso la condición es (sin categoría) O (su categoría está activa). El
-- exists() de adentro mira `categories`, que tiene su propia RLS: para anon
-- esa RLS es `active = true`, así que el exists() ya sólo puede ver
-- categorías activas. La comprobación es redundante a propósito — belt and
-- braces: si alguien cambia la policy de `categories` a "lectura pública de
-- todo", la regla de productos sigue considerando el active.
--
-- El service_role no pasa por RLS, así que api/pedido.js y el resto de las
-- serverless siguen viendo el catálogo completo. No es un agujero: el
-- service_role no está en el bundle, vive en las variables de entorno de
-- Vercel.
--
-- ----------------------------------------------------------------------------
-- VERIFICACIÓN OBLIGATORIA ANTES DE DESPLEGAR
-- ----------------------------------------------------------------------------
-- Esta migración cambia una policy de una tabla que TODA la tienda lee, y no se
-- puede probar desde el repo. Es el cambio de este lote que más conviene
-- verificar contra una base con datos. El bloque del final arma el caso
-- completo y lo revierte.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- PASO 1 — La policy nueva
-- ----------------------------------------------------------------------------
-- `category_id` se referencia sin calificar porque estamos dentro de la policy
-- de products; `c.id = category_id` es el correlated link. El índice
-- products_category_id_idx (0001) y el PK de categories hacen que el exists()
-- sea un index scan, no un seq scan.
drop policy if exists "Productos: lectura pública activos" on public.products;
create policy "Productos: lectura pública activos"
    on public.products for select
    to anon, authenticated
    using (
        activo = true
        and (
            category_id is null
            or exists (
                select 1
                  from public.categories c
                 where c.id = category_id
                   and c.active = true
            )
        )
    );

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 2 — Que la regla haga lo que dice. Arma el caso y lo revierte: no
-- escribe nada en la base.
-- ============================================================================
-- begin;
--   -- Categoría activa: sus productos se ven.
--   insert into public.categories (name, slug, position, active)
--        values ('PRUEBA ACTIVA', 'prueba-activa', 90, true);
--   insert into public.products (category_id, nombre, descripcion, precio, stock, activo)
--        values ((select id from public.categories where slug = 'prueba-activa'),
--                'PRUEBA EN CATEGORIA ACTIVA', '', 100, 5, true);
--
--   -- Categoría inactiva: sus productos NO se ven.
--   insert into public.categories (name, slug, position, active)
--        values ('PRUEBA INACTIVA', 'prueba-inactiva', 91, false);
--   insert into public.products (category_id, nombre, descripcion, precio, stock, activo)
--        values ((select id from public.categories where slug = 'prueba-inactiva'),
--                'PRUEBA EN CATEGORIA INACTIVA', '', 100, 5, true);
--
--   -- Producto sin categoría: sí se ve (CATEGORIA_SIN_ASIGNAR).
--   insert into public.products (category_id, nombre, descripcion, precio, stock, activo)
--        values (null, 'PRUEBA SIN CATEGORIA', '', 100, 5, true);
--
--   -- Se mira como los ve el público (rol anon, que es el de la anon key).
--   set local role anon;
--   select nombre from public.products
--    where nombre like 'PRUEBA %'
--    order by nombre;
--   reset role;
--   -- Esperado: 2 filas — 'PRUEBA EN CATEGORIA ACTIVA' y 'PRUEBA SIN CATEGORIA'.
--   -- Si aparece 'PRUEBA EN CATEGORIA INACTIVA', la policy no se aplicó.
--   -- Si NO aparece ninguna, la policy tapó de más: revisar que el exists()
--   --   esté en la condición correcta.
--
--   -- Y que el admin siga viéndolos todos (la otra policy no se tocó):
--   set local role authenticated;
--   select nombre from public.products where nombre like 'PRUEBA %' order by nombre;
--   reset role;
--   -- Con rol authenticated sin sesión, es_admin() es false, así que se ven
--   -- los tres (esta policy es `using (true)`). Lo que importa es que el
--   -- panel no se entere de la pérdida de visibilidad.
-- rollback;
-- -- Con rollback: la base queda como estaba.  ✓
