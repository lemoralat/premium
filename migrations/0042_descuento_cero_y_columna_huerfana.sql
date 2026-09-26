-- ============================================================================
-- LEMORA — Migración 0042: el 0 del descuento automático y la columna huérfana.
--
-- Son dos arreglos que se aplicaban juntos porque los dos estaban sobre la
-- mesa esperando y las migraciones se corren a mano: si se dejan en archivos
-- sueltos, alguno se saltea sin que nadie se entere.
--
-- ----------------------------------------------------------------------------
-- 1) EL DESCUENTO AUTOMÁTICO NO SE PODÍA DESACTIVAR
-- ----------------------------------------------------------------------------
-- PROBLEMA: el panel de Descuentos (admin/js/cupones.js) ofrece "Umbral para
-- descuento automático" con `min="0"`, o sea que el 0 es una opción legítima
-- y comunica "sin descuento". Pero el front lo descartaba:
--
--   CONFIG_DESCUENTO.UMBRAL    = Number(c.discount_threshold) || 100000;
--   CONFIG_DESCUENTO.PORCENTAJE = Number(c.discount_percent)   || 10;
--
-- `||` es un operador de truthiness de JavaScript: `Number(0) || 100000` da
-- 100000, porque 0 es falsy. El 0 del admin se perdía y quedaban los defaults
-- hardcodeados de js/utils.js.
--
-- El servidor no tenía ese problema, así que los dos lados discrepaban:
--   · Tienda:  `subtotal >= 100000` → muestra 10% de descuento
--   · Servidor: `subtotal >= 0`      → descuento 0
-- El cliente veía un total con descuento y se le cobraba el total completo.
-- Con la fila de settings de la base (threshold 0, percent 0) el descuento
-- automático estaba "desactivado" y aun así la tienda anunciaba 10%.
--
-- DE DÓNDE VIENE EL `||`: de la era Google Sheets. En la hoja, una celda de
-- descuento vacía o en 0 significaba "no hay descuento". Al pasar a Postgres el
-- 0 dejó de ser "ausente" y pasó a ser un número, pero el `||` siguió
-- tratándolo como si no estuviera seteado. Es el mismo bug de semántica que
-- con `discount_threshold not null default 100000` en 0001:215.
--
-- SOLUCIÓN (esta migración, lado servidor): la condición del descuento pasa a
-- exigir umbral y porcentaje positivos. Con eso el 0 es un apagador de verdad
-- en las dos capas, y no de casualidad porque `0 * cualquier_subtotal = 0`.
--
--   if v_subtotal >= v_threshold            -- antes: 0 >= 0, siempre verdadero
--   if v_threshold > 0 and v_discount_pct > 0 and v_subtotal >= v_threshold
--
-- El `> 0` del porcentaje también importa por el caso "umbral 0, porcentaje
-- 10": sin él, un pedido de $1 entraba en el descuento y se llevaba 10% off.
--
-- Las variables se inicializan en 0 en el `declare` a propósito: si la fila de
-- `settings` no existe, el `select ... into` no deja nada y el descuento
-- queda en 0 (no se regala nada por un dato que falta). Es el lado seguro:
-- preferimos no descontar antes que descontar de más.
--
-- ----------------------------------------------------------------------------
-- 2) COLUMNA HUÉRFANA `settings.cargar_imagenes_productos`
-- ----------------------------------------------------------------------------
-- La migración 0034_imagenes_productos.sql agregó esa columna para el
-- interruptor de imágenes de producto, se aplicó en la base y después se
-- revirtió (commit d19347f). El `drop column` quedó pendiente y el archivo se
-- borró del repo, así que la columna quedó sin fuente de verdad en git: existe
-- en la base y no aparece en ninguna migración ni en ninguna línea de código.
--
-- Se puede borrar sin riesgo: `grep` de todo el repositorio no encuentra ni una
-- referencia a `cargar_imagenes_productos` fuera de la nota de
-- SUPABASE_MIGRATION.md:274. El código actual nunca la leyó ni la escribió.
-- (Ojo: sí la usaba el admin de la versión que se revirtió, así que si
-- todavía tenés desplegada esa versión vieja, corré el drop DESPUÉS de
-- actualizarla a esta.)
--
-- `drop column if exists` no hace nada si la columna nunca llegó a existir
-- (base donde 0034 no se aplicó): por eso es idempotente.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ ESTO ES UNA MIGRACIÓN Y NO UN ARREGLO DE JS
-- ----------------------------------------------------------------------------
-- El bug del `||` era del front, pero la mitad honesta del problema —qué
-- significa el 0— es una regla de negocio que tiene que quedar escrita en un
-- solo lugar. Con el `> 0` en el RPC y el `numeroOVacio()` en el JS, las dos
-- capas responden lo mismo, y el próximo que toque el descuento lo lee en el
-- código sin tener que reconstruir el bug.
--
-- NUMERACIÓN: continúa la de 0041. El 0034 queda libre pero ocupado en la
-- historia de git, y el 0016 nunca existió.
--
-- Idempotente: `create or replace function` + `drop column if exists`. Se
-- puede correr las veces que haga falta.
--
-- Aplicar a mano en el SQL Editor de Supabase (no hay runner de migraciones).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) FUNCIÓN: mismo cuerpo que en 0001, con la condición del descuento corregida
-- ----------------------------------------------------------------------------
-- OJO: `create or replace` sobre una función cambia el resultado sólo si el
-- body nuevo compila. Postgres no valida el cuerpo en la definición (depende
-- del check_function_bodies), así que si abajo hay un error de tipeo en plpgsql
-- NO lo vas a ver hasta el primer pedido. El paso de verificación del final
-- incluye un `begin ... rollback` justamente para eso.
create or replace function public.insertar_pedido(
    p_cliente jsonb,
    p_items   jsonb,
    p_cupon   text default null,
    p_token   uuid default null
)
returns jsonb
language plpgsql
as $$
declare
    v_subtotal      numeric := 0;
    v_descuento     numeric := 0;
    v_porcentaje    numeric := 0;
    v_total         numeric := 0;
    -- Antes sin valor por defecto. Con la fila de settings ausente quedaban en
    -- NULL y `subtotal >= NULL` es NULL, o sea "sin descuento" por casualidad.
    -- Ahora arrancan en 0 a propósito: sin dato de configuración, no se descuenta.
    v_threshold     numeric := 0;
    v_discount_pct  numeric := 0;
    v_cupon_final   text := 'NINGUNO';
    v_cupon_monto   numeric := 0;
    v_cupon_pct     numeric;
    v_item          jsonb;
    v_product       record;
    v_qty           integer;
    v_pedido_id     bigint;
begin
    select discount_threshold, discount_percent
      into v_threshold, v_discount_pct
      from public.settings where id = 1;

    if p_cliente is null or p_items is null or jsonb_array_length(p_items) = 0 then
        raise exception 'Estructura de pedido inválida';
    end if;

    -- 1) Validar productos, stock y acumular subtotal (precios de la BD)
    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_qty := coalesce((v_item->>'quantity')::int, 0);
        if v_qty <= 0 then
            raise exception 'Cantidad inválida para un producto';
        end if;

        select id, nombre, precio, stock, activo
          into v_product
          from public.products
          where id = (v_item->>'product_id')::int
          for update;

        if not found or v_product.activo is false then
            raise exception 'Producto no encontrado o inactivo (id: %)', (v_item->>'product_id')::int;
        end if;
        if v_product.stock < v_qty then
            raise exception 'Stock insuficiente para "%" (quedan %)', v_product.nombre, v_product.stock;
        end if;

        update public.products set stock = stock - v_qty where id = v_product.id;

        v_subtotal := v_subtotal + (v_product.precio * v_qty);
    end loop;

    -- 2) Descuento automático por umbral.
    --    El `v_threshold > 0 and v_discount_pct > 0` es lo nuevo: hace que el 0
    --    sea "desactivado" y no "aplicar 0% a todos los pedidos". Ver el
    --    encabezado.
    if v_threshold > 0 and v_discount_pct > 0 and v_subtotal >= v_threshold then
        v_descuento  := round(v_subtotal * (v_discount_pct / 100), 2);
        v_porcentaje := v_discount_pct;
    end if;

    -- 3) Cupón manual: solo si supera el descuento automático (no acumulables)
    if p_cupon is not null and btrim(p_cupon) <> '' then
        select porcentaje into v_cupon_pct
          from public.coupons
         where codigo = upper(btrim(p_cupon))
           and activo = true
           and expira >= current_date;

        if found then
            v_cupon_monto := round(v_subtotal * (v_cupon_pct / 100), 2);
            if v_cupon_monto > v_descuento then
                v_descuento   := v_cupon_monto;
                v_porcentaje  := v_cupon_pct;
                v_cupon_final := upper(btrim(p_cupon));
            end if;
        end if;
    end if;

    v_total := v_subtotal - v_descuento;

    -- 4) Insertar pedido (token: el del cliente si es válido, si no uno nuevo)
    insert into public.orders (cliente, subtotal, descuento, porcentaje, cupon, total, token)
    values (p_cliente, v_subtotal, v_descuento, v_porcentaje, v_cupon_final, v_total,
            coalesce(p_token, gen_random_uuid()))
    returning id into v_pedido_id;

    -- 5) Insertar líneas (snapshot)
    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_qty := (v_item->>'quantity')::int;
        insert into public.order_items (order_id, product_id, nombre, variante_texto, quantity, precio_unitario)
        select v_pedido_id, p.id, p.nombre, coalesce(v_item->>'variante_texto', ''), v_qty, p.precio
          from public.products p
         where p.id = (v_item->>'product_id')::int;
    end loop;

    return jsonb_build_object(
        'status',      'success',
        'numero',      (select numero from public.orders where id = v_pedido_id),
        'subtotal',    v_subtotal,
        'descuento',   v_descuento,
        'porcentaje',  v_porcentaje,
        'total',       v_total,
        'cupon',       v_cupon_final,
        'token',       (select token from public.orders where id = v_pedido_id)
    );
exception
    when others then
        raise;
end;
$$;

comment on function public.insertar_pedido(jsonb, jsonb, text, uuid) is
    'Registra un pedido en una transacción: valida producto y stock, descuenta stock, recalcula los montos contra products y aplica descuento por umbral o cupón (el mayor, no acumulables). El descuento por umbral exige umbral y porcentaje mayores a 0 (migración 0042), así que el 0 en settings lo desactiva de verdad. Reemplaza el doPost de Apps Script.';

-- El grant de 0001 sigue vigente: `create or replace` conserva los permisos.
-- Se lo repite igual para que la migración se pueda aplicar sola sobre una base
-- donde 0001 se aplicó a mano pero el grant se hubiera perdido.
grant execute on function public.insertar_pedido(jsonb, jsonb, text, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 2) COLUMNA HUÉRFANA
-- ----------------------------------------------------------------------------
alter table public.settings drop column if exists cargar_imagenes_productos;

commit;

-- ============================================================================
-- Verificación (correr por separado, después del commit).
--
-- PASO 1 — Que la columna haya caído y que la función esté redefinida.
-- ============================================================================
-- select column_name
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'settings'
--   and column_name = 'cargar_imagenes_productos';
-- -- Esperado: 0 filas. Si devuelve 1, el drop no se aplicó.

-- select pg_get_functiondef('public.insertar_pedido(jsonb,jsonb,text,uuid)'::regprocedure)
--   like '%v_threshold > 0%' as descuento_corregido;
-- -- Esperado: true. Si devuelve false, la función sigue con la versión de 0001
-- --   y el 0 del panel todavía no desactiva nada del lado del servidor.

-- ============================================================================
-- PASO 2 — Que la función compile. `create or replace` NO valida el cuerpo
-- plpgsql al definirla, así que un error de tipeo sólo aparece al ejecutarla.
-- Este bloque no escribe nada: se deshace con el rollback.
-- ============================================================================
-- begin;
--   -- Se espera que frene con 'Producto no encontrado o inactivo' porque la
--   -- base está vacía. Lo que importa es que NO diga 'function ... does not
--   -- exist' ni un error de sintaxis: eso probaría que el cuerpo compiló.
--   select public.insertar_pedido(
--       '{"nombre":"PRUEBA"}'::jsonb,
--       '[{"product_id":999999,"quantity":1}]'::jsonb
--   );
-- rollback;
-- -- fringe con un error de producto inexistente => el cuerpo está bien  ✓
-- -- si tira error de sintaxis o "does not exist" => avisar antes de seguir

-- ============================================================================
-- PASO 3 — Comprobar la regla del 0 con la configuración real. No escribe.
-- ============================================================================
-- select discount_threshold, discount_percent,
--        case
--          when discount_threshold <= 0 or discount_percent <= 0
--            then 'desactivado (0 = apagador)'
--          else 'activo sobre ' || discount_threshold
--        end as estado
--   from public.settings where id = 1;
-- -- Con threshold 0 y percent 0: 'desactivado (0 = apagador)'.
-- --   Antes de esta migración esa fila producía un 10% en la tienda.
