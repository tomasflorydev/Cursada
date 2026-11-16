try {
  var storedScheme = localStorage.getItem('color-scheme');
  var theme =
    storedScheme === 'light' || storedScheme === 'dark' || storedScheme === 'system'
      ? storedScheme
      : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.content = theme === 'system' ? 'light dark' : theme;
  }
  var storedNoteSize = localStorage.getItem('cursada-note-size');
  if (
    storedNoteSize === 'small' ||
    storedNoteSize === 'normal' ||
    storedNoteSize === 'large'
  ) {
    document.documentElement.setAttribute('data-note-size', storedNoteSize);
  }
} catch (_) {
  // Ignore localStorage access restrictions in sandboxed environments
}
