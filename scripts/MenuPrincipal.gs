// =====================================================
// MENÚ PRINCIPAL UNIFICADO
// Gestiona todos los menús de la aplicación
// =====================================================

/**
 * Función que se ejecuta automáticamente al abrir Google Sheets
 * Crea todos los menús personalizados
 */
function onOpen() {
    const ui = SpreadsheetApp.getUi();
    
    // Menú principal de Productos
    ui.createMenu('🚀 Actualizar Web')
        .addItem('📤 Publicar Web (GitHub)', 'actualizarProductosEnGitHub')
        .addItem('📝 Sincronizar Reseñas', 'sincronizarResenas')
        .addItem('🎞️ Sincronizar Slider', 'sincronizarSlider')
        .addItem('🖼️ Sincronizar Banners', 'sincronizarBanners')
        .addSeparator()
        .addItem('📁 Crear Carpetas Drive', 'crearCarpetasProductos')
        .addSeparator()
        .addItem('📊 Ver Estadísticas', 'mostrarEstadisticas')
        .addItem('⚙️ Ver Configuración', 'mostrarConfiguracion')
        .addItem('📋 Ver estructura de Drive', 'mostrarEstructuraDrive')
        .addItem('❓ Ayuda', 'mostrarAyuda')
        .addToUi();
    
    // Menú de Gestión de Pedidos
    ui.createMenu('📦 Gestión de Pedidos')
        .addSubMenu(ui.createMenu('🔄 Cambiar Estado')
            .addItem('⏳ Pendiente', 'menuMarcarPendiente')
            .addItem('⚙️ Procesando', 'menuMarcarProcesando')
            .addItem('🚚 Enviado', 'menuMarcarEnviado')
            .addItem('✅ Entregado', 'menuMarcarEntregado')
            .addItem('❌ Cancelado', 'menuMarcarCancelado'))
        .addSeparator()
        .addItem('🔧 Reparar/Crear hoja de pedidos', 'repararHojaPedidos')
        .addToUi();
}

// ============ FUNCIONES PUENTE PARA EL MENÚ ============

function menuMarcarPendiente() { cambiarEstadoSeleccionado('Pendiente'); }
function menuMarcarProcesando() { cambiarEstadoSeleccionado('Procesando'); }
function menuMarcarEnviado() { cambiarEstadoSeleccionado('Enviado'); }
function menuMarcarEntregado() { cambiarEstadoSeleccionado('Entregado'); }
function menuMarcarCancelado() { cambiarEstadoSeleccionado('Cancelado'); }

/**
 * Detecta el N° de Pedido de la fila activa y cambia su estado
 */
function cambiarEstadoSeleccionado(nuevoEstado) {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getActiveSheet();

        if (sheet.getName() !== CONFIG.PEDIDOS_SHEET_NAME) {
            SpreadsheetApp.getUi().alert('⚠️ Error', 'Debes estar en la hoja "Pedidos" para usar esta función.', SpreadsheetApp.getUi().ButtonSet.OK);
            return;
        }

        const fila = sheet.getActiveCell().getRow();
        if (fila < 2) return; // Evitar cabeceras

        const nPedido = sheet.getRange(fila, 1).getValue(); // Columna A: N° Pedido
        if (!nPedido) return;

        actualizarEstadoPedido(nPedido, nuevoEstado);
    } catch (error) {
        Logger.log(`❌ Error en cambiarEstadoSeleccionado: ${error.message}`);
        SpreadsheetApp.getUi().alert('⚠️ Error', 'Ocurrió un error al cambiar el estado del pedido.', SpreadsheetApp.getUi().ButtonSet.OK);
    }
}

function repararHojaPedidos() {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        garantizarHojaPedidos(ss);
        SpreadsheetApp.getUi().alert('🚀 Estructura Verificada', 'Se han validado las 20 columnas y el formato de la hoja de Pedidos.', SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (error) {
        Logger.log(`❌ Error en repararHojaPedidos: ${error.message}`);
        SpreadsheetApp.getUi().alert('⚠️ Error', 'Ocurrió un error al reparar la hoja de Pedidos.', SpreadsheetApp.getUi().ButtonSet.OK);
    }
}
