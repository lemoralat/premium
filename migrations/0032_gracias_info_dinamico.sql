-- ============================================================================
-- 0032 — Bloque "Próximos Pasos" de gracias.html dinámico
--
-- PROBLEMA: el cuadro de próximos pasos de la página de agradecimiento
-- (gracias.html) estaba hardcodeado en el HTML: título "Próximos Pasos" y un
-- párrafo fijo que decía que íbamos a confirmar por WhatsApp. Si la tienda
-- cobrara por otro medio, o quisiera otro texto, había que tocar el HTML y
-- redesplegar.
--
-- SOLUCIÓN: dos columnas en `settings` que el panel edita (Configuración →
-- "Datos para la transferencia", la misma tarjeta que ya maneja el alias, la
-- entidad y el titular) y que gracias.html renderiza por JS.
--
-- Además, la tarjeta hace cumplir la regla que ya se insinúa en los datos:
-- si no hay Alias CBU configurado, no hay cuenta a la que transferir, así que
-- el bloque "Datos para Realizar la Transferencia" se oculta entero (lo hace
-- gracias.js, no esta migración). Se puede cobrar por otros medios sin que
-- aparezca una tabla con un alias vacío.
--
-- El default de las columnas es EXACTAMENTE el texto que ya estaba en
-- gracias.html, así que la fila existente no cambia a la vista al aplicar.
--
-- NO hay backfill, a propósito. El `add column ... not null default` ya llena
-- las filas existentes con ese default, y un `update` de relleno sería
-- contrario a la función: "vacío" es una elección válida del admin (vaciar
-- gracias_texto oculta el cuadro entero), así que rellenarlo al re-correr la
-- migración le pisaría esa decisión. Sin backfill, re-aplicar 0032 no destruye
-- nada de lo que el admin haya configurado.
--
-- Idempotente: sólo `add column if not exists` + `comment on`, que es
-- re-declarable. Se puede correr las veces que haga falta.
--
-- Aplicar a mano en el SQL Editor de Supabase (no hay runner de migraciones).
-- ============================================================================

begin;

alter table public.settings
    add column if not exists gracias_titulo text not null default 'Próximos Pasos';

alter table public.settings
    add column if not exists gracias_texto text not null default
        'Te confirmaremos por WhatsApp cuando recibamos tu transferencia bancaria. Una vez confirmado el pago, procederemos con el envío de tu pedido.';

comment on column public.settings.gracias_titulo is
    'Título del cuadro de próximos pasos en gracias.html. Vacío = el cuadro se muestra sin título.';

comment on column public.settings.gracias_texto is
    'Texto del cuadro de próximos pasos en gracias.html. Admite saltos de línea. Vacío = se oculta el cuadro entero.';

commit;
