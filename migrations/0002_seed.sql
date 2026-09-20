-- ============================================================================
-- LEMORA — Migración 0002: Datos semilla.
-- Vuelca los datos REALES actuales del repositorio (json) a Supabase para poder
-- probar la tienda y el dashboard enseguida.
--
-- NOTA: las imágenes seed siguen apuntando a Google Drive (external_url) para
-- no romper el catálogo visual durante la primera prueba. Desde el dashboard se
-- pueden re-subir a Storage progresivamente (storage_path por defecto).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CATEGORÍAS
-- ----------------------------------------------------------------------------
insert into public.categories (id, name, slug, position, active) overriding system value values
    (1, 'Calzado',   'calzado',   1, true),
    (2, 'Abrigos',   'abrigos',   2, true),
    (3, 'Pantalones','pantalones',3, true),
    (4, 'Remeras',   'remeras',   4, true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- PRODUCTOS (16 reales, mismos ids que js/productos.json)
-- ----------------------------------------------------------------------------
insert into public.products (
    id, category_id, nombre, descripcion, descripcion_detallada,
    precio, precio_anterior, stock, caracteristicas, activo
) overriding system value values
(2,  (select id from public.categories where name='Calzado'),
 'Botitas lowtops mujer',
 'Botitas bajas modernas y versátiles para uso diario',
 'Botitas lowtops para mujer con diseño urbano, ideales para looks casuales. Livianas y cómodas, perfectas para acompañarte todo el día sin perder estilo.',
 78000, 80000, 12,
 '["Diseño lowtop","Material sintético premium","Livianas","Suela flexible"]'::jsonb, true),

(1,  (select id from public.categories where name='Calzado'),
 'Botas de cuero hombre',
 'Botas de cuero resistentes con estilo clásico masculino',
 'Botas de cuero genuino diseñadas para hombres que buscan durabilidad y presencia. Ideales para uso diario o salidas, combinan comodidad con un diseño robusto y elegante.',
 114000, 125000, 8,
 '["Cuero genuino","Suela antideslizante","Interior acolchado","Alta durabilidad"]'::jsonb, true),

(3,  (select id from public.categories where name='Abrigos'),
 'Buzo canguro liso hombre',
 'Buzo canguro básico y cómodo para uso diario',
 'Buzo canguro liso para hombre, ideal para un look relajado. Fabricado con materiales suaves que brindan abrigo y confort en cualquier ocasión.',
 54000, 60000, 30,
 '["Bolsillo frontal","Capucha ajustable","Tela suave","Corte regular"]'::jsonb, true),

(4,  (select id from public.categories where name='Abrigos'),
 'Buzo canguro mujer',
 'Buzo canguro femenino cómodo y versátil',
 'Buzo canguro para mujer con diseño moderno, ideal para outfits casuales. Ofrece abrigo y estilo en una sola prenda.',
 57600, 60000, 9,
 '["Capucha con cordón","Bolsillo frontal","Tela abrigada","Ajuste cómodo"]'::jsonb, true),

(5,  (select id from public.categories where name='Abrigos'),
 'Buzo liso mujer',
 'Buzo básico femenino, ideal para cualquier ocasión',
 'Buzo liso para mujer de diseño minimalista, fácil de combinar. Perfecto para looks casuales o deportivos.',
 48000, 50000, 34,
 '["Diseño minimalista","Tela suave","Corte clásico","Fácil combinación"]'::jsonb, true),

(6,  (select id from public.categories where name='Abrigos'),
 'Buzo oversize mujer',
 'Buzo oversize con estilo relajado y moderno',
 'Buzo oversize para mujer, tendencia actual que combina comodidad y estilo urbano. Ideal para looks sueltos y descontracturados.',
 62400, 70000, 22,
 '["Fit oversize","Tela gruesa","Estilo urbano","Máximo confort"]'::jsonb, true),

(7,  (select id from public.categories where name='Pantalones'),
 'Jean oscuro mujer',
 'Jean oscuro elegante y versátil',
 'Jean para mujer en tono oscuro, ideal para looks tanto casuales como formales. Ajuste cómodo que resalta la silueta.',
 66000, 70000, 27,
 '["Color oscuro","Ajuste cómodo","Tela resistente","Diseño versátil"]'::jsonb, true),

(8,  (select id from public.categories where name='Pantalones'),
 'Jeans clásicos hombre',
 'Jeans clásicos masculinos de uso diario',
 'Jeans para hombre con corte tradicional, ideales para cualquier ocasión. Duraderos y cómodos para el día a día.',
 72000, 75000, 31,
 '["Corte clásico","Denim resistente","Ajuste regular","Alta durabilidad"]'::jsonb, true),

(9,  (select id from public.categories where name='Pantalones'),
 'Jeans pata elefante mujer',
 'Jeans pata elefante con estilo retro',
 'Jeans para mujer con corte pata elefante, inspirados en tendencias vintage. Perfectos para destacar con un look único.',
 69600, 75000, 17,
 '["Corte amplio","Estilo retro","Tela cómoda","Tiro medio/alto"]'::jsonb, true),

(10, (select id from public.categories where name='Pantalones'),
 'Jeans rotura hombre',
 'Jeans desgastados con roturas modernas',
 'Jeans para hombre con roturas estratégicas que aportan un look urbano y actual. Ideales para outfits informales.',
 74400, 82000, 22,
 '["Diseño con roturas","Estilo urbano","Denim flexible","Ajuste moderno"]'::jsonb, true),

(11, (select id from public.categories where name='Remeras'),
 'Remera de calavera hombre',
 'Remera con diseño de calavera llamativo',
 'Remera para hombre con estampado de calavera, perfecta para un estilo rebelde y moderno.',
 36000, 42000, 10,
 '["Estampa frontal","Algodón suave","Corte regular","Alta calidad de impresión"]'::jsonb, true),

(12, (select id from public.categories where name='Remeras'),
 'Remera game over mujer',
 'Remera gamer con diseño “Game Over”',
 'Remera para mujer con estampa divertida “Game Over”, ideal para fanáticas del gaming y el estilo casual.',
 33600, 45000, 4,
 '["Diseño gamer","Tela liviana","Corte femenino","Estampa duradera"]'::jsonb, true),

(13, (select id from public.categories where name='Remeras'),
 'Remera tucán mujer',
 'Remera con estampa de tucán colorida',
 'Remera femenina con diseño de tucán vibrante, ideal para looks frescos y veraniegos',
 32400, 42000, 22,
 '["Estampa tropical","Algodón liviano","Corte cómodo","Colores vivos"]'::jsonb, true),

(14, (select id from public.categories where name='Abrigos'),
 'Suéter traveller mujer',
 'Suéter cómodo ideal para viajes',
 'Suéter para mujer pensado para viajes y uso diario, combinando abrigo ligero con estilo moderno.',
 60000, 70000, 5,
 '["Tela térmica ligera","Diseño versátil","Ajuste cómodo","Fácil de transportar"]'::jsonb, true),

(15, (select id from public.categories where name='Calzado'),
 'Zapatillas hightop mujer',
 'Zapatillas high top con estilo urbano',
 'Zapatillas de caña alta para mujer, ideales para looks urbanos y modernos. Combinan diseño y comodidad.',
 84000, 100000, 14,
 '["Caña alta","Diseño moderno","Suela resistente","Ajuste seguro"]'::jsonb, true),

(16, (select id from public.categories where name='Calzado'),
 'Zapatillas urbanas mujer',
 'Zapatillas urbanas cómodas para el día a día',
 'Zapatillas para mujer con estilo urbano, pensadas para uso diario. Livianas, cómodas y fáciles de combinar.',
 81600, 82000, 10,
 '["Diseño urbano","Material liviano","Suela flexible","Uso diario"]'::jsonb, true)
on conflict (id) do nothing;

-- NOTA de migración: el producto 14 estaba con categoria "Remeras" en el JSON
-- debido a un error de carga en la planilla; corresponde a Abrigos.

-- ----------------------------------------------------------------------------
-- VARIANTES (solo el producto 1 tiene variantes reales)
-- ----------------------------------------------------------------------------
insert into public.product_options (id, product_id, opcion, position) overriding system value values
    (1, 1, 'Talles', 0),
    (2, 1, 'Estilo', 1)
on conflict (id) do nothing;

insert into public.product_option_values (id, product_option_id, valor, position) overriding system value values
    (1,  1, '40',          0),
    (2,  1, '41',          1),
    (3,  1, '42',          2),
    (4,  1, '43',          3),
    (5,  1, '44',          4),
    (6,  2, 'Cuero',       0),
    (7,  2, 'Simil cuero', 1)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- IMÁGENES DE PRODUCTO (imagen principal + galería; hoy en Drive)
-- ----------------------------------------------------------------------------
insert into public.product_images (product_id, external_url, es_principal, position)
select * from (values
(2,  'https://lh3.googleusercontent.com/d/1chpIpDRi3entVZIyx263n07Xckfjj34A=s600-rw',  true,  0),
(2,  'https://lh3.googleusercontent.com/d/1chpIpDRi3entVZIyx263n07Xckfjj34A=s1920-rw', false, 1),
(2,  'https://lh3.googleusercontent.com/d/1_IHhJb5QW6Ie-NXl-8tVfxfH4Jqpx9Il=s1920-rw', false, 2),

(1,  'https://lh3.googleusercontent.com/d/1Ba5xtv9-SwFO562P1-WMmHjNwGDm2MXL=s600-rw',  true,  0),
(1,  'https://lh3.googleusercontent.com/d/1Ba5xtv9-SwFO562P1-WMmHjNwGDm2MXL=s1920-rw', false, 1),
(1,  'https://lh3.googleusercontent.com/d/1IqnqIrbVSZwl9oBtKM-zHyo8TFDitdrw=s1920-rw', false, 2),

(3,  'https://lh3.googleusercontent.com/d/173otchL7GYHVETPZLnR5OMzOvhVAUlLR=s600-rw',  true,  0),
(3,  'https://lh3.googleusercontent.com/d/173otchL7GYHVETPZLnR5OMzOvhVAUlLR=s1920-rw', false, 1),
(3,  'https://lh3.googleusercontent.com/d/1iW_uG4JVAe-fL_OY5Qfd773J0TJ1EZyF=s1920-rw', false, 2),

(4,  'https://lh3.googleusercontent.com/d/1lBZErffkP78i9QT0f1B3v3zZAqUHrMew=s600-rw',  true,  0),
(4,  'https://lh3.googleusercontent.com/d/1lBZErffkP78i9QT0f1B3v3zZAqUHrMew=s1920-rw', false, 1),
(4,  'https://lh3.googleusercontent.com/d/1m1Tpfrb6esGhJh-00rvDgPj6sIsy6Kjr=s1920-rw', false, 2),

(5,  'https://lh3.googleusercontent.com/d/1COHCVlYKoP9mLjhDyFJV-RXDx2z4nv4Z=s600-rw',  true,  0),
(5,  'https://lh3.googleusercontent.com/d/1COHCVlYKoP9mLjhDyFJV-RXDx2z4nv4Z=s1920-rw', false, 1),
(5,  'https://lh3.googleusercontent.com/d/1M3fksTv8rce5SIt1ZthOxltAnf9SX5sN=s1920-rw', false, 2),

(6,  'https://lh3.googleusercontent.com/d/14TQIywEvQECz1Ncm7zcIWRYu-Eh2iky_=s600-rw',  true,  0),
(6,  'https://lh3.googleusercontent.com/d/14TQIywEvQECz1Ncm7zcIWRYu-Eh2iky_=s1920-rw', false, 1),
(6,  'https://lh3.googleusercontent.com/d/1Z-Ks2eO_oen0WFcqLgKnS-hVLU87IcRt=s1920-rw', false, 2),

(7,  'https://lh3.googleusercontent.com/d/1UZ58YlTmiD6vJG17KO5a9arMPazDZRhb=s600-rw',  true,  0),
(7,  'https://lh3.googleusercontent.com/d/1UZ58YlTmiD6vJG17KO5a9arMPazDZRhb=s1920-rw', false, 1),
(7,  'https://lh3.googleusercontent.com/d/1WSYhWlMtRdd5KTw2R_D_8sP85Y1_Aw84=s1920-rw', false, 2),

(8,  'https://lh3.googleusercontent.com/d/1hQm8KY4BylP2HGX6fF1TSp5yVSEk5Fg-=s600-rw',  true,  0),
(8,  'https://lh3.googleusercontent.com/d/1hQm8KY4BylP2HGX6fF1TSp5yVSEk5Fg-=s1920-rw', false, 1),
(8,  'https://lh3.googleusercontent.com/d/12IBqcVguZy3sji3OB46wzl5DpEwOPVxX=s1920-rw', false, 2),

(9,  'https://lh3.googleusercontent.com/d/198k0iQV1AIsxAPjUn637oALOsCymoAHK=s600-rw',  true,  0),
(9,  'https://lh3.googleusercontent.com/d/198k0iQV1AIsxAPjUn637oALOsCymoAHK=s1920-rw', false, 1),
(9,  'https://lh3.googleusercontent.com/d/1fWLYOS2a4S5GmzPMDsssXkAGIycTvL15=s1920-rw', false, 2),

(10, 'https://lh3.googleusercontent.com/d/17hoYbcXrmDnud2xdASaG8a9Hje5hcBp8=s600-rw',  true,  0),
(10, 'https://lh3.googleusercontent.com/d/17hoYbcXrmDnud2xdASaG8a9Hje5hcBp8=s1920-rw', false, 1),
(10, 'https://lh3.googleusercontent.com/d/1-maAOR-8vDr08Fae8zyMi9xjRfD1SESv=s1920-rw', false, 2),

(11, 'https://lh3.googleusercontent.com/d/1i9_wsEzbhsJEg_38eC-871rGTOht707S=s600-rw',  true,  0),
(11, 'https://lh3.googleusercontent.com/d/1i9_wsEzbhsJEg_38eC-871rGTOht707S=s1920-rw', false, 1),
(11, 'https://lh3.googleusercontent.com/d/1TNEQaI12VC-_V1A-509MLndU9O8DHRuv=s1920-rw', false, 2),

(12, 'https://lh3.googleusercontent.com/d/1hHhV8QWwB2ZR1EvFoTDvJxuLrOsXcdkE=s600-rw',  true,  0),
(12, 'https://lh3.googleusercontent.com/d/1hHhV8QWwB2ZR1EvFoTDvJxuLrOsXcdkE=s1920-rw', false, 1),
(12, 'https://lh3.googleusercontent.com/d/17FmdrshomW8qPnt6uta1TibqUy_OZZOA=s1920-rw', false, 2),

(13, 'https://lh3.googleusercontent.com/d/17Z0xkc7TToqhWKEhEcikkfTB1wyn4KCv=s600-rw',  true,  0),
(13, 'https://lh3.googleusercontent.com/d/17Z0xkc7TToqhWKEhEcikkfTB1wyn4KCv=s1920-rw', false, 1),
(13, 'https://lh3.googleusercontent.com/d/10GcXtskh8OX4mh_kDOJ9QOEsrnuYRfnr=s1920-rw', false, 2),

(14, 'https://lh3.googleusercontent.com/d/1wf4nMMrzwYeMCHg68TqTEDpmkxS27BN0=s600-rw',  true,  0),
(14, 'https://lh3.googleusercontent.com/d/1wf4nMMrzwYeMCHg68TqTEDpmkxS27BN0=s1920-rw', false, 1),
(14, 'https://lh3.googleusercontent.com/d/13KA6zyWGpalYHI_f1VmFIln7E5AzDRSS=s1920-rw', false, 2),

(15, 'https://lh3.googleusercontent.com/d/1zOHzeyvKYqJY87Lm98ElW0ShZyx2GCGM=s600-rw',  true,  0),
(15, 'https://lh3.googleusercontent.com/d/1zOHzeyvKYqJY87Lm98ElW0ShZyx2GCGM=s1920-rw', false, 1),
(15, 'https://lh3.googleusercontent.com/d/1r-jP3oBqp9zRj51PuN5y0MaQDYwIg3Rk=s1920-rw', false, 2),

(16, 'https://lh3.googleusercontent.com/d/1Cr9wWp58riNVbQWbXV-w83pIwb56QFt6=s600-rw',  true,  0),
(16, 'https://lh3.googleusercontent.com/d/1Cr9wWp58riNVbQWbXV-w83pIwb56QFt6=s1920-rw', false, 1),
(16, 'https://lh3.googleusercontent.com/d/1-nkFYu8z8wdfn9NBkHNaag94qrdPulAF=s1920-rw', false, 2)
) as v(product_id, external_url, es_principal, position)
where not exists (select 1 from public.product_images);

-- ----------------------------------------------------------------------------
-- CUPONES (sale10 está vencido → se migra inactivo, conservando el histórico)
-- ----------------------------------------------------------------------------
insert into public.coupons (codigo, porcentaje, expira, activo)
select * from (values
    ('sale10',  10, '2026-08-30'::date, false),
    ('black20', 20, '2026-12-31'::date, true),
    ('navidad', 25, '2026-12-31'::date, true)
) as v(codigo, porcentaje, expira, activo)
where not exists (select 1 from public.coupons);

-- ----------------------------------------------------------------------------
-- SLIDER (6 slides reales)
-- ----------------------------------------------------------------------------
insert into public.sliders (titulo, texto_soporte, external_url, link, position, activo)
select * from (values
('Envíos a todo el país',
 'Recibí tus compras estés donde estés, llegamos a cada rincón de Argentina.',
 'https://lh3.googleusercontent.com/d/1dlHXo6ycXegzZHoblOTORxav1tjR5Y6O=s1920-rw', '', 0, true),
('Ofertas exclusivas',
 'Aprovechá promociones únicas y descuentos especiales por tiempo limitado.',
 'https://lh3.googleusercontent.com/d/1kQHT9YlLPXQ_mzA88EB7JRLcMyshcWI8=s1920-rw', '', 1, true),
('Comprá de forma segura',
 'Encontrá tus productos favoritos y realizá tu pedido de manera simple y rápida.',
 'https://lh3.googleusercontent.com/d/1XkDZBY4ydSlFFcn4kP8WhY6MMJOsFQ8q=s1920-rw', '', 2, true),
('Productos seleccionados',
 'Calidad y variedad para que encuentres exactamente lo que estás buscando.',
 'https://lh3.googleusercontent.com/d/1JH9x1chPaA0SIOcURZBSS3O331SNIEGF=s1920-rw', '', 3, true),
('Nuevos productos',
 'Descubrí las últimas novedades que tenemos preparadas para vos.',
 'https://lh3.googleusercontent.com/d/1QN9jdND9_g3v0zcdNgFG8ucZYamAaIkV=s1920-rw', '', 4, true),
('Todo en un solo lugar',
 'Explorá nuestra tienda, elegí tus favoritos y hacé tu pedido en pocos pasos.',
 'https://lh3.googleusercontent.com/d/15FC3UYY3rxy_BEHXV1JSDTti6VteLBuh=s1920-rw', '', 5, true)
) as v(titulo, texto_soporte, external_url, link, position, activo)
where not exists (select 1 from public.sliders);

-- ----------------------------------------------------------------------------
-- BANNERS (5 reales; el último es el del carrito)
-- ----------------------------------------------------------------------------
insert into public.banners (
    imagen_url, logo_url, badge, titulo, boton, link, position, activo
)
select * from (values
('https://lh3.googleusercontent.com/d/1iGHNrNwm7EmYIwnz7W3K7jiUDC31OlCx=s1200-rw',
 'https://lh3.googleusercontent.com/d/1MSIaEOo1DUlkJKox3ssA687CJmrHnEoF=s240-rw',
 'Promociona', 'Producto destacado', 'Ver producto',
 'https://planluxury.lemora.lat/producto.html?id=2', 0, true),

('https://lh3.googleusercontent.com/d/1jGefjHB-Dfgvs3kJGNr3Lca02xH-uOmf=s1200-rw',
 'https://lh3.googleusercontent.com/d/165MhCr5wFsx6rzSRR9Nzh_FbpzUuJQLB=s240-rw',
 'Promociona', 'Producto destacado', 'Ver producto',
 'https://planluxury.lemora.lat/producto.html?id=2', 1, true),

('https://lh3.googleusercontent.com/d/1vTXk1ssQ6JvB5lgQgzdFmUGVHERG8_9V=s1200-rw',
 'https://lh3.googleusercontent.com/d/1iMGaXcjO1fs3NYidCh5MM4YBl-1QXtaI=s240-rw',
 'Promociona', 'Producto destacado', 'Ver producto',
 'https://planluxury.lemora.lat/producto.html?id=9', 2, true),

('https://lh3.googleusercontent.com/d/1wBBfRuFVHx3tQYlREsmztDab8ZGANisu=s1200-rw',
 '', 'Promociona', 'Ofertas o promociones en la tienda con banners', 'Ver producto',
 'https://planluxury.lemora.lat/producto.html?id=16', 3, true),

('https://lh3.googleusercontent.com/d/1RVlmPcd8SsV8S_KYgdCzfknadfJSoOck=s1200-rw',
 '', 'Aprovecha', 'Pagando con tarjeta VISA hasta 3 cuotas sin interés', 'Ver producto',
 'https://planluxury.lemora.lat/producto.html?id=16', 4, true)
) as v(imagen_url, logo_url, badge, titulo, boton, link, position, activo)
where not exists (select 1 from public.banners);

-- ----------------------------------------------------------------------------
-- RESEÑAS (12 reales)
-- ----------------------------------------------------------------------------
insert into public.reviews (nombre, valoracion, resena, fecha, external_url, position, activo)
select * from (values
('Agusto Ramirez',   5, 'Excelente servicio, la verdad toda la gestión se realizó impecable. Agradezco la transparencia de la tienda y la velocidad de gestión de mi pedido.', '2026-08-19'::date, 'https://lh3.googleusercontent.com/d/1CzxBARJXCzOJvAxvmhkRay-gyagVFGyD=s150-rw', 0, true),
('Lucía Benítez',    4, 'Excelente atención, todo el proceso fue muy sencillo y rápido. Agradezco la amabilidad de la tienda y la rapidez con la que recibí mi pedido final.', '2026-08-19'::date, 'https://lh3.googleusercontent.com/d/1tDYXJTtTDumULYvYzm40RW1cH3pdoyKQ=s150-rw', 1, true),
('Martín Ferreyra',  3, 'Muy buena experiencia, todo fue claro desde el comienzo. Destaco la atención de la tienda, la confianza que transmite y la entrega de mi pedido ya.', '2026-08-19'::date, 'https://lh3.googleusercontent.com/d/1eONorirxudiYj_PROgDrkT_XdY2fHY2w=s150-rw', 2, true),
('Santiago Molina',  4, 'Quedé conforme con la compra, todo salió perfecto. Agradezco la rapidez de la tienda, la atención recibida y el cuidado con el que llegó mi pedido.', '2026-08-19'::date, 'https://lh3.googleusercontent.com/d/13m-FAMOHiE_NcEb9YxNXQtdL27dMDxx-=s150-rw', 3, true),
('Camila Pereyra',   5, 'Excelente servicio, todo se gestionó de manera ágil y ordenada. Agradezco la atención de la tienda y la puntualidad con la que recibí mi pedido.', '2026-08-19'::date, 'https://lh3.googleusercontent.com/d/1aw2XPjBLqqjoHe6vTEE-sha_mmkUrnUO=s150-rw', 4, true),
('Nicolás Acosta',   5, 'Excelente experiencia, el proceso fue simple y transparente. La tienda fue muy atenta y mi pedido llegó en perfectas condiciones, a tiempo y sin demoras.', '2026-08-19'::date, 'https://lh3.googleusercontent.com/d/1uqYVBefenPMNOcv2WR3KYo7Xu94yNC83=s150-rw', 5, true),
('Valentina Sosa',   4, 'Todo salió perfecto, desde la atención inicial hasta la entrega. Agradezco la buena atención de la tienda, la rapidez de gestión y el cuidado de mi pedido.', '2026-08-19'::date, 'https://lh3.googleusercontent.com/d/1AXlYHVR0U9Fzj7reOxdDiPzHMv6t9wAF=s150-rw', 6, true),
('Tomás Herrera',    5, 'Muy conforme con la atención, todo resultó sencillo y rápido. Destaco la amabilidad de la tienda y lo bien que llegó mi pedido, tal como esperaba. Sin.', '2026-08-19'::date, 'https://lh3.googleusercontent.com/d/1GuLLcf6ba-ybY6U3tti_uhT7xHx-0wXK=s150-rw', 7, true),
('Julieta Navarro',  4, 'Servicio impecable, todo fue rápido y sin complicaciones. La atención de la tienda fue excelente y mi pedido llegó perfectamente, en el plazo previsto.', '2026-08-19'::date, 'https://lh3.googleusercontent.com/d/1utNNJ71bUrdwH6BzQuHQMya5GowoASGT=s150-rw', 8, true),
('Federico Ríos',    3, 'Excelente compra, todo fue muy claro y rápido. Agradezco la buena atención de la tienda y la rapidez con la que gestionaron mi pedido a tiempo, sin demoras.', '2026-08-19'::date, 'https://lh3.googleusercontent.com/d/19buWi4U7w0adCGOgDqXdkerCbUy2VFvN=s150-rw', 9, true),
('Agustina Castro',  4, 'Excelente servicio, todo se realizó de forma rápida y clara. La tienda fue muy amable y mi pedido llegó perfectamente, sin demoras y en perfecto estado.', '2026-08-19'::date, 'https://lh3.googleusercontent.com/d/1KIk4qISvlmLds_fNQ5MdE0F3OGDxvMDF=s150-rw', 10, true),
('Matías Correa',    4, 'Muy buena experiencia, el proceso fue sencillo, rápido y transparente. Agradezco la atención de la tienda y la rapidez con la que llegó mi pedido, sin dudas.', '2026-08-19'::date, 'https://lh3.googleusercontent.com/d/1DMCl2AtTNL7RegGrLX-MUoOTgiIJNpsA=s150-rw', 11, true)
) as v(nombre, valoracion, resena, fecha, external_url, position, activo)
where not exists (select 1 from public.reviews);

-- ----------------------------------------------------------------------------
-- CONFIGURACIÓN (fila única — valores actuales hardcodeados en el código)
-- ----------------------------------------------------------------------------
insert into public.settings (
    id, site_name, whatsapp_number, whatsapp_default_message,
    discount_threshold, discount_percent,
    transfer_alias, transfer_entity, transfer_holder,
    social_facebook, social_instagram, social_tiktok
) values (
    1, 'Mi Tienda Online', '543515957014', 'Hola, quería consultar ',
    100000, 10,
    'hola.mundo.2023', 'Mercado Pago', 'Nombre completo',
    'https://www.facebook.com/p/', 'https://www.instagram.com/', 'https://www.tiktok.com/@'
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Ajustar secuencias identity al máximo id sembrado
-- ----------------------------------------------------------------------------
select setval(pg_get_serial_sequence('public.categories', 'id'),                (select max(id) from public.categories));
select setval(pg_get_serial_sequence('public.products', 'id'),                  (select max(id) from public.products));
select setval(pg_get_serial_sequence('public.product_options', 'id'),           (select max(id) from public.product_options));
select setval(pg_get_serial_sequence('public.product_option_values', 'id'),     (select max(id) from public.product_option_values));
select setval(pg_get_serial_sequence('public.product_images', 'id'),            (select max(id) from public.product_images));
select setval('public.orders_numero_seq', 1, false);