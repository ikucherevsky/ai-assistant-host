(function () {
  const host = parent.document.body;
  function sync() {
    const theme = host.classList.contains('theme-contrast-dark') ? 'contrast-dark' :
      host.classList.contains('theme-type-dark') || host.classList.contains('theme-dark') ? 'dark' : 'light';
    document.documentElement.dataset.editorTheme = theme;
    document.dispatchEvent(new Event('ai-editor-theme'));
  }
  const observer = new MutationObserver(sync);
  observer.observe(host, {attributes: true, attributeFilter: ['class']});
  window.addEventListener('beforeunload', () => observer.disconnect());
  sync();
})();
