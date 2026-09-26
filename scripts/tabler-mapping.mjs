// ============================================================================
// tabler-mapping.mjs — Correspondencia Font Awesome → Tabler Icons.
//
// Fuente de verdad de la migración. La consumen:
//   - scripts/migrate-fa-tabler.mjs  (codemod sobre el código)
//   - scripts/build-tabler-icons.mjs (subconjunto de la fuente + CSS)
//
// Cubre EXACTAMENTE las clases que usa el proyecto (verificado con
// scripts/migrate-fa-tabler.mjs --check). Si se agrega un ícono nuevo hay que
// agregarlo acá y volver a correr los dos scripts.
//
// Dónde está cada clase:
//   Font Awesome distingue por PREFIJO de familia: `fa-solid fa-truck`,
//   `fa-regular fa-heart`, `fa-brands fa-google`. Tabler NO usa prefijo: es
//   siempre `ti ti-truck`, y los brand tienen su propio nombre `ti-brand-*`.
//
// Solid vs regular: Tabler es outline por defecto y las variantes rellenas son
// SVG aparte (@tabler/icons-filled), sin webfont. Acá no se usa relleno: el
// estado activo del corazón y de las estrellas ya se marca por COLOR (ver
// .btn-favorito.active i y .testimonio-stars en css/styles.css), que es lo que
// se conserva.
//
// Iconos que FA no tiene: `fa-icons` y `fa-rotate` se usan en el panel pero no
// existen en FA 6.5.1, así que hoy se renderizan VACÍOS. Con este mapeo
// empiezan a verse (`ti-icons`, `ti-rotate`).
//
// `fa-marca` aparece sólo en un comentario de css/styles.css: no es una clase
// de FA ni un icono, y no se mapea.
// ============================================================================

/** Clases que sólo son prefijos de familia o utilidades de estilo de FA. */
export const NO_ES_ICONO = new Set([
    'fa-solid', 'fa-regular', 'fa-brands',
    'fa-fw', 'fa-spin', 'fa-2xs', 'fa-xs', 'fa-sm', 'fa-lg', 'fa-xl',
    'fa-1x', 'fa-2x', 'fa-3x', 'fa-4x', 'fa-5x', 'fa-li', 'fa-ul',
    'fa-border', 'fa-pull-left', 'fa-pull-right'
]);

/** Clase propia que reemplaza a .fa-spin (Tabler no trae la utilidad). */
export const CLASE_SPIN = 'ti-spin';

export const MAPA = {
    // --- Marcas y redes: Tabler las tiene todas ----------------------------
    'fa-facebook': 'ti-brand-facebook',
    'fa-facebook-f': 'ti-brand-facebook',
    'fa-instagram': 'ti-brand-instagram',
    'fa-x-twitter': 'ti-brand-x',
    'fa-tiktok': 'ti-brand-tiktok',
    'fa-youtube': 'ti-brand-youtube',
    'fa-linkedin': 'ti-brand-linkedin',
    'fa-linkedin-in': 'ti-brand-linkedin',
    'fa-google': 'ti-brand-google',
    'fa-whatsapp': 'ti-brand-whatsapp',
    'fa-pinterest': 'ti-brand-pinterest',
    'fa-pinterest-p': 'ti-brand-pinterest',
    'fa-snapchat': 'ti-brand-snapchat',
    'fa-telegram': 'ti-brand-telegram',

    // --- Marcas de pago ---------------------------------------------------
    // Tabler no tiene amex / apple-pay / google-pay: se usa el logo de la marca
    // matriz (Apple, Google) o la tarjeta genérica.
    'fa-cc-visa': 'ti-brand-visa',
    'fa-cc-mastercard': 'ti-brand-mastercard',
    'fa-cc-paypal': 'ti-brand-paypal',
    'fa-paypal': 'ti-brand-paypal',
    'fa-cc-amex': 'ti-credit-card',
    'fa-apple-pay': 'ti-brand-apple',
    'fa-google-pay': 'ti-brand-google',
    'fa-btc': 'ti-currency-bitcoin',

    // --- Navegación y acciones -------------------------------------------
    'fa-chevron-down': 'ti-chevron-down',
    'fa-chevron-up': 'ti-chevron-up',
    'fa-chevron-left': 'ti-chevron-left',
    'fa-chevron-right': 'ti-chevron-right',
    'fa-plus': 'ti-plus',
    'fa-minus': 'ti-minus',
    'fa-check': 'ti-check',
    'fa-check-double': 'ti-checks',
    'fa-check-to-slot': 'ti-checkbox',
    'fa-xmark': 'ti-x',
    'fa-bars': 'ti-menu-2',
    'fa-list': 'ti-list',
    'fa-list-check': 'ti-list-check',
    'fa-square-check': 'ti-checkbox',
    'fa-circle-check': 'ti-circle-check',
    'fa-circle-info': 'ti-info-circle',
    'fa-circle-question': 'ti-help-circle',
    'fa-circle-exclamation': 'ti-alert-circle',
    'fa-arrow-right': 'ti-arrow-right',
    'fa-arrow-trend-up': 'ti-trending-up',
    'fa-arrow-up-right-from-square': 'ti-external-link',
    'fa-right-from-bracket': 'ti-logout',
    'fa-copy': 'ti-copy',
    'fa-print': 'ti-printer',
    'fa-share-nodes': 'ti-share',
    'fa-link': 'ti-link',
    'fa-paper-plane': 'ti-send',
    'fa-spinner': 'ti-loader-2',
    'fa-arrows-rotate': 'ti-refresh',
    'fa-recycle': 'ti-recycle',
    'fa-rotate': 'ti-rotate',
    'fa-rotate-left': 'ti-arrow-back-up',
    'fa-stopwatch': 'ti-stopwatch',
    'fa-clock': 'ti-clock',
    'fa-calendar-check': 'ti-calendar-check',
    'fa-bell': 'ti-bell',
    'fa-infinity': 'ti-infinity',
    'fa-bullseye': 'ti-target',
    'fa-magnifying-glass': 'ti-search',
    'fa-magnifying-glass-plus': 'ti-zoom-in',

    // --- Commerce ---------------------------------------------------------
    'fa-cart-shopping': 'ti-shopping-cart',
    'fa-bag-shopping': 'ti-shopping-bag',
    'fa-basket-shopping': 'ti-basket',
    'fa-cart-plus': 'ti-shopping-cart-plus',
    'fa-cart-flatbed': 'ti-trolley',
    'fa-cash-register': 'ti-cash-register',
    'fa-credit-card': 'ti-credit-card',
    'fa-money-bill-1': 'ti-currency-dollar',
    'fa-money-bill-transfer': 'ti-currency-dollar',
    'fa-money-bill-wave': 'ti-currency-dollar',
    'fa-hand-holding-dollar': 'ti-cash',
    'fa-sack-dollar': 'ti-cash',
    'fa-coins': 'ti-coins',
    'fa-piggy-bank': 'ti-pig-money',
    'fa-wallet': 'ti-wallet',
    'fa-receipt': 'ti-receipt',
    'fa-percent': 'ti-percentage',
    'fa-tag': 'ti-tag',
    'fa-tags': 'ti-tags',
    'fa-ticket': 'ti-ticket',
    'fa-gift': 'ti-gift',
    'fa-gifts': 'ti-gift',
    'fa-store': 'ti-building-store',
    'fa-shop': 'ti-building',
    'fa-warehouse': 'ti-building-warehouse',
    'fa-box': 'ti-box',
    'fa-box-open': 'ti-package',
    'fa-box-archive': 'ti-archive',
    'fa-boxes-stacked': 'ti-packages',
    'fa-cube': 'ti-cube',
    'fa-barcode': 'ti-barcode',
    'fa-qrcode': 'ti-qrcode',

    // --- Envíos y transporte ---------------------------------------------
    'fa-truck': 'ti-truck',
    'fa-truck-fast': 'ti-truck',
    'fa-truck-arrow-right': 'ti-truck-delivery',
    'fa-truck-moving': 'ti-truck-loading',
    'fa-truck-ramp-box': 'ti-truck-loading',
    'fa-truck-medical': 'ti-ambulance',
    'fa-van-shuttle': 'ti-caravan',
    'fa-car': 'ti-car',
    // Tabler no tiene un auto de perfil; se usa el 4x4, que es la silueta más
    // parecida que no está tomada por otro ícono del catálogo.
    'fa-car-side': 'ti-car-4wd',
    'fa-bus': 'ti-bus',
    'fa-train-subway': 'ti-train',
    'fa-motorcycle': 'ti-motorbike',
    'fa-bicycle': 'ti-bike',
    'fa-plane': 'ti-plane',
    'fa-plane-arrival': 'ti-plane-arrival',
    'fa-plane-departure': 'ti-plane-departure',
    'fa-ship': 'ti-ship',
    'fa-route': 'ti-route',
    'fa-map': 'ti-map',
    'fa-map-pin': 'ti-map-pin',
    'fa-location-dot': 'ti-map-pin',
    'fa-globe': 'ti-world',
    'fa-compass': 'ti-compass',

    // --- Usuario y formularios --------------------------------------------
    'fa-user': 'ti-user',
    'fa-users': 'ti-users',
    'fa-people-group': 'ti-users',
    'fa-users-gear': 'ti-users-group',
    'fa-user-check': 'ti-user-check',
    'fa-user-lock': 'ti-lock-access',
    'fa-user-shield': 'ti-user-shield',
    'fa-hand': 'ti-hand-finger',
    'fa-hands': 'ti-users',
    'fa-hand-holding': 'ti-hand-stop',
    'fa-hand-holding-heart': 'ti-heart-handshake',
    'fa-handshake': 'ti-friends',
    'fa-id-card': 'ti-id',
    'fa-phone': 'ti-phone',
    'fa-phone-flip': 'ti-phone',
    'fa-envelope': 'ti-mail',
    'fa-comment': 'ti-message',
    'fa-message': 'ti-message',
    'fa-comment-dots': 'ti-message-dots',
    'fa-comments': 'ti-messages',
    'fa-key': 'ti-key',
    'fa-lock': 'ti-lock',
    'fa-lock-open': 'ti-lock-open',
    'fa-eye': 'ti-eye',
    'fa-fingerprint': 'ti-fingerprint',
    'fa-pen': 'ti-edit',
    'fa-floppy-disk': 'ti-device-floppy',
    'fa-folder': 'ti-folder',
    'fa-folder-open': 'ti-folder-open',
    'fa-file-lines': 'ti-file-text',
    'fa-file-circle-check': 'ti-file-check',
    'fa-file-export': 'ti-file-export',
    'fa-clipboard-check': 'ti-clipboard-check',
    'fa-clipboard-list': 'ti-clipboard-list',

    // --- Equipos / técnica -----------------------------------------------
    'fa-computer': 'ti-device-desktop',
    'fa-desktop': 'ti-device-desktop',
    'fa-display': 'ti-device-desktop',
    'fa-laptop': 'ti-device-laptop',
    'fa-tablet': 'ti-device-tablet',
    'fa-mobile-screen': 'ti-device-mobile',
    'fa-mobile-screen-button': 'ti-device-mobile',
    'fa-headphones': 'ti-headphones',
    'fa-headset': 'ti-headset',
    'fa-video': 'ti-video',
    'fa-terminal': 'ti-terminal',
    'fa-code': 'ti-code',
    'fa-database': 'ti-database',
    'fa-network-wired': 'ti-network',
    'fa-wifi': 'ti-wifi',
    'fa-signal': 'ti-antenna',
    'fa-plug': 'ti-plug',
    'fa-battery-full': 'ti-battery-4',
    'fa-camera': 'ti-camera',
    'fa-cloud-arrow-up': 'ti-cloud-upload',
    'fa-download': 'ti-download',

    // --- Navegación del panel --------------------------------------------
    'fa-gauge-high': 'ti-gauge',
    'fa-sitemap': 'ti-sitemap',
    'fa-sliders': 'ti-adjustments',
    'fa-gear': 'ti-settings',
    'fa-screwdriver-wrench': 'ti-tools',
    'fa-wrench': 'ti-tool',
    'fa-toolbox': 'ti-hammer',
    'fa-chart-column': 'ti-chart-bar',
    'fa-chart-line': 'ti-chart-line',
    'fa-chart-pie': 'ti-chart-pie',
    'fa-bolt': 'ti-bolt',
    'fa-palette': 'ti-palette',
    'fa-icons': 'ti-icons',
    'fa-puzzle-piece': 'ti-puzzle',
    'fa-wand-magic-sparkles': 'ti-wand',

    // --- Estilo, evaluation y contenido -----------------------------------
    'fa-star': 'ti-star',
    'fa-heart': 'ti-heart',
    'fa-thumbs-up': 'ti-thumb-up',
    'fa-award': 'ti-award',
    'fa-medal': 'ti-medal',
    'fa-trophy': 'ti-trophy',
    'fa-gem': 'ti-diamond',
    'fa-crown': 'ti-crown',
    'fa-certificate': 'ti-certificate',
    'fa-lightbulb': 'ti-bulb',
    'fa-bookmark': 'ti-bookmark',
    'fa-flag': 'ti-flag',
    'fa-face-smile': 'ti-mood-smile',
    'fa-face-grin-stars': 'ti-mood-smile',
    'fa-heart-pulse': 'ti-heartbeat',
    'fa-heart-circle-check': 'ti-heart-check',
    'fa-leaf': 'ti-leaf',
    'fa-seedling': 'ti-seedling',
    'fa-sun': 'ti-sun',
    'fa-moon': 'ti-moon',
    'fa-fire': 'ti-flame',
    'fa-life-ring': 'ti-lifebuoy',
    'fa-rocket': 'ti-rocket',
    'fa-shield': 'ti-shield',
    'fa-shield-halved': 'ti-shield-half',
    'fa-shield-heart': 'ti-shield-heart',
    'fa-shield-virus': 'ti-shield-check',
    'fa-image': 'ti-photo',
    'fa-images': 'ti-photo-plus',
    'fa-hospital': 'ti-hospital',
    'fa-kit-medical': 'ti-first-aid-kit',
    'fa-first-aid': 'ti-first-aid-kit',
    'fa-cake-candles': 'ti-cake',
    'fa-mug-hot': 'ti-coffee',
    'fa-utensils': 'ti-tools-kitchen-2',
    'fa-champagne-glasses': 'ti-glass-cocktail',
    'fa-bottle-water': 'ti-bottle',
    'fa-house': 'ti-home',
    'fa-bank': 'ti-building-bank',
    'fa-suitcase': 'ti-briefcase',
    'fa-trash': 'ti-trash',
    'fa-trash-can': 'ti-trash'
};
