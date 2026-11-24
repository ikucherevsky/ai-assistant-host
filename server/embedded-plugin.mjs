// Workspaces in the same GigaCowork process share the R7 listener and its sessions.
let runtime;
let shuttingDown;

export function createGigaCoworkPlugin({ port } = {}) {
  return {
    id: 'r7-ai-assistant-embedded-host',
    async server(context, options) {
      // The installed GigaCowork loader needs to register the plugin before loading the server dependencies.
      let start, createHostHooks, stopWindowsHelper;
      try {
        ({ start } = await import('./main.mjs'));
        ({ createHostHooks } = await import('./host-tools.mjs'));
        ({ stopWindowsHelper } = await import('./windows.mjs'));
      } catch (error) {
        throw new Error('AI Assistant Host: ' + String(error.stack ?? error).replace(/\r?\n\s*/g, ' | '));
      }

      while (shuttingDown) await shuttingDown;

      const entry = runtime ??= { app: start({ port }), users: 0, listenerSlot: {} };
      entry.users++;
      let released = false;
      async function release() {
        if (released) return;
        released = true;
        if (--entry.users) return;

        runtime = undefined;
        shuttingDown = entry.app.then(async app => {
          await app.close();
          await stopWindowsHelper();
        }, () => {}).finally(() => {
          shuttingDown = undefined;
        });
        await shuttingDown;
      }

      try {
        const app = await entry.app;
        const hooks = await createHostHooks(context, () => app, { ...options, listenerSlot: entry.listenerSlot });
        const dispose = hooks.dispose;
        return { ...hooks, async dispose() {
          try {
            await dispose();
          } finally {
            await release();
          }
        } };
      } catch (error) {
        await release();
        throw error;
      }
    }
  };
}
