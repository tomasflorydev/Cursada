import { Menu, type MenuItemConstructorOptions } from 'electron';

/**
 * Builds the native macOS application menu template translated into Spanish.
 */
export function buildSpanishMenuTemplate(
  appName = 'Cursada'
): MenuItemConstructorOptions[] {
  return [
    {
      label: appName,
      submenu: [
        { role: 'about', label: `Acerca de ${appName}` },
        { type: 'separator' },
        { role: 'services', label: 'Servicios' },
        { type: 'separator' },
        { role: 'hide', label: `Ocultar ${appName}` },
        { role: 'hideOthers', label: 'Ocultar otros' },
        { role: 'unhide', label: 'Mostrar todo' },
        { type: 'separator' },
        { role: 'quit', label: `Salir de ${appName}` },
      ],
    },
    {
      label: 'Archivo',
      submenu: [{ role: 'close', label: 'Cerrar ventana' }],
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'pasteAndMatchStyle', label: 'Pegar con el mismo estilo' },
        { role: 'delete', label: 'Eliminar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Forzar recarga' },
        {
          role: 'toggleDevTools',
          label: 'Alternar herramientas de desarrollo',
        },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño real' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'zoom', label: 'Zoom' },
        { type: 'separator' },
        { role: 'front', label: 'Traer todo al frente' },
      ],
    },
  ];
}

export function setupApplicationMenu(appName = 'Cursada'): void {
  const menu = Menu.buildFromTemplate(buildSpanishMenuTemplate(appName));
  Menu.setApplicationMenu(menu);
}
