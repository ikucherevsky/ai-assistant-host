import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import registeredPlugin from '../server/gigacowork-plugin.mjs';
import { createGigaCoworkPlugin } from '../server/embedded-plugin.mjs';

test('GigaCowork owns the R7 listener and releases it after the last workspace', async () => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise(resolve => probe.close(resolve));

  const plugin = createGigaCoworkPlugin({ port });
  assert.equal(registeredPlugin.id, plugin.id);
  assert.equal(typeof registeredPlugin.server, 'function');
  const url = 'http://127.0.0.1:' + port;
  let first, second;
  try {
    [first, second] = await Promise.all([
      plugin.server({ directory: 'first' }),
      plugin.server({ directory: 'second' })
    ]);
    const initial = await (await fetch(url + '/health')).json();
    assert.equal(initial.service, 'r7-ai-assistant-host');
    assert.equal(initial.pid, process.pid);

    const listen = async (hooks, sessionID) =>
      JSON.parse(await hooks.tool.r7_ai_host_listen.execute({}, { sessionID }));
    assert.equal((await listen(first, 'first-chat')).ok, true);
    assert.match((await listen(second, 'second-chat')).error, /Другая рабочая область/);
    await first.dispose();
    assert.equal((await (await fetch(url + '/health')).json()).instanceId, initial.instanceId);
    assert.equal((await listen(second, 'second-chat')).ok, true);
  } finally {
    await Promise.all([first?.dispose(), second?.dispose()]);
  }

  await assert.rejects(fetch(url + '/health'));
  const reloaded = await plugin.server({ directory: 'reloaded' });
  await reloaded.dispose();
});
