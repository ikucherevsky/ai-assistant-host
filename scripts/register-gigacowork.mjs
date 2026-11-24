import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const file = resolve(process.argv[2] ?? join(homedir(), '.config', 'gigatool', 'opencode.json'));
const pluginUrl = pathToFileURL(resolve(import.meta.dirname, '../server/gigacowork-plugin.mjs')).href;

async function readConfig() {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

const original = await readConfig();
const config = JSON.parse((original ?? '{}').replace(/^\uFEFF/, ''));
if (!config || typeof config !== 'object' || Array.isArray(config)) {
  throw new Error('Конфигурация GigaCowork должна быть JSON-объектом.');
}
const plugins = config.plugin === undefined ? [] : config.plugin;
if (!Array.isArray(plugins)) throw new Error('Поле plugin должно быть массивом.');

if (!plugins.some(entry => (Array.isArray(entry) ? entry[0] : entry) === pluginUrl)) {
  const suffix = randomUUID();
  const pending = file + '.ai-assistant-host-' + suffix + '.tmp';
  await mkdir(dirname(file), { recursive: true });
  try {
    await writeFile(pending, JSON.stringify({ ...config, plugin: [...plugins, pluginUrl] }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    if (original !== null) {
      await writeFile(file + '.before-ai-assistant-host-' + suffix, original, { flag: 'wx', mode: 0o600 });
    }
    if (await readConfig() !== original) throw new Error('Конфигурация изменилась. Повторите регистрацию.');
    await rename(pending, file);
  } finally {
    await unlink(pending).catch(() => {});
  }
}

console.log('AI Assistant Host зарегистрирован. Перезапустите GigaCowork и вызовите r7_ai_host_listen.');
