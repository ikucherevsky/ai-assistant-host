(function () {
  'use strict';
  // Logical payload size, not HTTP/MCP wire bytes. Never store document contents.
  const encoder = new TextEncoder(), outbound = new Set(), inbound = new Set();
  let sent = 0, received = 0;
  function size(value) { return encoder.encode(JSON.stringify(value)).byteLength; }
  function format(value) {
    const units = ['Б', 'КиБ', 'МиБ', 'ГиБ'];
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return value.toLocaleString('ru-RU', {maximumFractionDigits: unit ? 1 : 0}) + ' ' + units[unit];
  }
  function render() {
    document.getElementById('trafficSent').textContent = format(sent);
    document.getElementById('trafficReceived').textContent = format(received);
    document.getElementById('trafficTasks').textContent = 'Задачи: ' + outbound.size + ' / ' + inbound.size;
    document.getElementById('trafficTasks').title = 'Отправлено / получено за время открытия панели';
  }
  window.AITraffic = {
    sent(task) {
      if (outbound.has(task.id)) return;
      // Export snapshots stay inside the Bridge; credentials and HTTP polling are excluded.
      const payload = {};
      for (const key of ['scenario', 'scope', 'text', 'prompt', 'style', 'formatting']) {
        if (task[key] !== undefined) payload[key] = task[key];
      }
      sent += size(payload);
      outbound.add(task.id);
      render();
    },
    received(task) {
      if (!outbound.has(task.id) || inbound.has(task.id) || !task.result || !['ready', 'applied'].includes(task.state)) return;
      received += size(task.result);
      inbound.add(task.id);
      render();
    }
  };
})();
