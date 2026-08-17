import { spawn } from 'node:child_process';
import process from 'node:process';

const host = process.env.RELEASE_SMOKE_HOST ?? '127.0.0.1';
const port = Number(process.env.RELEASE_SMOKE_PORT ?? '4199');
const baseUrl = `http://${host}:${port}`;
const timeoutMs = Number(process.env.RELEASE_SMOKE_TIMEOUT_MS ?? '20000');
const logLimit = 100_000;
let logs = '';
let stopped = false;

const child = spawn(process.execPath, ['apps/morro-digital-platform/tooling/dev-server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, HOST: host, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    logs = `${logs}${chunk.toString()}`.slice(-logLimit);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stopRuntime() {
  if (stopped) return;
  stopped = true;
  if (child.exitCode !== null) return;

  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(2000),
  ]);

  if (child.exitCode === null) child.kill('SIGKILL');
}

async function fetchNonEmpty(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, { redirect: 'error' });
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`);
  const body = await response.text();
  if (body.length === 0) throw new Error(`${pathname} returned an empty body`);
  return body;
}

const deadline = Date.now() + timeoutMs;
let lastError;

try {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`runtime exited before readiness with code ${child.exitCode}`);
    }

    try {
      await fetchNonEmpty('/runtime-config.js');
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }

  if (lastError) throw new Error(`runtime did not become ready: ${lastError.message}`);

  await fetchNonEmpty('/runtime-config.js');
  await fetchNonEmpty('/apps/morro-digital-platform/public/index.html');
  console.log(`Release smoke passed on ${baseUrl}`);
} catch (error) {
  console.error(`Release smoke failed: ${error.message}`);
  if (logs) console.error(`\nRuntime diagnostics:\n${logs}`);
  process.exitCode = 1;
} finally {
  await stopRuntime();
}
