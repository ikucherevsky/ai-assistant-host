(function () {
  'use strict';
  const guid = 'asc.{B23577B0-9BD5-45E7-A218-1D2F22057BF4}';
  const id = 'left-btn-ai-assistant-host';
  const owner = 'AI_ASSISTANT_HOST_SIDEBAR';
  let host, button, timer;

  function context() {
    const controller = host.DE?.getController('Common.Controllers.Plugins');
    const app = controller?.getApplication();
    const model = app?.getCollection('Common.Collections.Plugins')?.findWhere({guid});
    const left = app?.getController('LeftMenu');
    return {controller, model, left};
  }

  function running() {
    const frame = host.document.querySelector('#current-plugin-frame iframe');
    return !!frame?.src.toUpperCase().includes('B23577B0-9BD5-45E7-A218-1D2F22057BF4');
  }

  function open() {
    const {controller, model, left} = context();
    if (!model || button.disabled) return;
    if (running()) {
      const menu = left?.leftMenu;
      if (!menu) return;
      if (menu.btnPlugins.pressed) menu.close();
      else {
        left.tryToShowLeftMenu();
        menu.btnPlugins.toggle(true);
        menu.onBtnMenuClick(menu.btnPlugins);
      }
    } else controller.api.asc_pluginRun(guid, 0, '');
    sync();
  }

  function sync() {
    const doc = host.document, anchor = doc.getElementById('left-btn-plugins');
    const {controller, model, left} = context();
    if (!anchor || !controller?.api || !model || !left?.leftMenu) {
      if (button) button.hidden = true;
      return;
    }
    if (!button?.isConnected) {
      doc.getElementById(id)?.remove();
      button = doc.createElement('button');
      button.id = id;
      button.type = 'button';
      button.className = 'btn btn-category';
      button.title = 'AI Assistant Host';
      button.setAttribute('aria-label', 'AI Assistant Host');
      const icon = doc.createElement('img');
      icon.src = new URL('assets/icon.svg', new URL(model.get('baseUrl'), host.location.href)).href;
      icon.alt = '';
      icon.width = icon.height = 24;
      icon.style.cssText = 'display:block;margin:auto;pointer-events:none';
      button.append(icon);
      button.addEventListener('click', open);
      anchor.after(button);
    }
    button.hidden = false;
    button.disabled = !!left.leftMenu.btnPlugins.isDisabled() || !model.get('visible');
    const active = running() && !!left.leftMenu.btnPlugins.pressed;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }

  function dispose() {
    clearInterval(timer);
    button?.remove();
    if (host?.[owner]?.dispose === dispose) delete host[owner];
  }

  window.Asc.plugin.init = function () {
    host = window.parent;
    try {
      host[owner]?.dispose();
      host[owner] = {dispose};
      sync();
      timer = setInterval(function () {
        try { sync(); } catch (_) { dispose(); }
      }, 500);
    } catch (_) { dispose(); }
  };
  window.addEventListener('unload', dispose, {once: true});
})();
