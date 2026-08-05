#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, unlinkSync, openSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { spawn, execFileSync } from 'child_process';
import { createServer } from 'net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_SERVER = join(__dirname, '..', 'dist', 'server.js');
const PIXEL_DIR = join(homedir(), '.pixel-agents');
const PID_FILE = join(PIXEL_DIR, '.server.pid');
const BIND_HOST = process.env.PIXEL_AGENTS_BIND_HOST || '127.0.0.1';

// Parse args
const args = process.argv.slice(2);
const FLAGS_TAKING_VALUE = new Set(['--port']);

// A flag's value is not a command: skip it, or `--port 3000` reads as `3000`
const positional = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (FLAGS_TAKING_VALUE.has(arg)) i++;
  else if (!arg.startsWith('-')) positional.push(arg);
}

const command = positional[0] || 'start';
const flags = new Set(args.filter(a => a.startsWith('-')));
const portIdx = args.indexOf('--port');
const PORT = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 9876;
const NO_OPEN = flags.has('--no-open');

// Import platform utilities from the built server
async function getOpenBrowser() {
  try {
    // In production (npx), platform.js is bundled into server.js
    // We inline the logic here to avoid dependency on the build
    const { platform } = await import('os');
    const p = platform();
    return function openBrowser(url) {
      const cmd = p === 'darwin' ? 'open'
                : p === 'linux' ? 'xdg-open'
                : p === 'win32' ? 'start'
                : null;
      if (!cmd) return;
      const spawnArgs = p === 'win32' ? ['', url] : [url];
      const child = spawn(cmd, spawnArgs, { detached: true, stdio: 'ignore', shell: p === 'win32' });
      child.unref();
    };
  } catch { return () => {}; }
}

function checkPort(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => { srv.close(); resolve(true); });
    // Bind the same host as the server: a wildcard bind still succeeds while
    // 127.0.0.1:port is taken, which would report a busy port as free
    srv.listen(port, BIND_HOST);
  });
}

function readPidRecord() {
  if (!existsSync(PID_FILE)) return null;
  try {
    const record = JSON.parse(readFileSync(PID_FILE, 'utf-8'));
    if (record?.owner !== 'office-for-claude-agents'
      || !Number.isInteger(record.pid) || record.pid <= 0
      || !Number.isInteger(record.port) || record.port <= 0
      || typeof record.bindHost !== 'string') return null;
    return record;
  } catch {
    return null;
  }
}

function isOwnedServerProcess(pid) {
  try {
    const command = process.platform === 'win32'
      ? execFileSync('wmic', ['process', 'where', `ProcessId=${pid}`, 'get', 'CommandLine'], { encoding: 'utf-8' })
      : execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf-8' });
    // A foreground start imports the server into this CLI process, so the
    // command line reads as the bin wrapper rather than dist/server.js.
    // The path may also start right after the interpreter, hence \s.
    return /(?:^|[\s\\/])dist[\\/]server\.js(?:\s|$)/.test(command)
      || /(?:^|[\s\\/])server[\\/]index\.ts(?:\s|$)/.test(command)
      || /(?:^|[\s\\/])bin[\\/]cli\.js(?:\s|$)/.test(command)
      || /(?:^|[\s\\/])office-for-claude-agents(?:\s|$)/.test(command);
  } catch {
    return false;
  }
}

function isServerRunning(port) {
  const record = readPidRecord();
  if (!record || record.port !== port || !isOwnedServerProcess(record.pid)) return { running: false };
  try {
    process.kill(record.pid, 0);
    return { running: true, pid: record.pid };
  } catch {
    return { running: false };
  }
}

async function startDaemon() {
  if (!existsSync(DIST_SERVER)) {
    console.error('Error: dist/server.js not found. Run "npm run build" first.');
    process.exit(1);
  }
  const status = isServerRunning(PORT);
  if (status.running) {
    console.log(`Server already running (PID ${status.pid})`);
    console.log(`Open: http://localhost:${PORT}`);
    return;
  }
  const free = await checkPort(PORT);
  if (!free) {
    console.error(`Error: port ${PORT} is already in use.`);
    process.exit(1);
  }

  // Ensure pixel-agents dir exists
  const { mkdirSync } = await import('fs');
  mkdirSync(PIXEL_DIR, { recursive: true });

  const LOG_FILE = join(PIXEL_DIR, 'server.log');
  const logFd = openSync(LOG_FILE, 'a');

  const child = spawn(process.execPath, [DIST_SERVER], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, PORT: String(PORT) },
  });

  writeFileSync(PID_FILE, JSON.stringify({
    pid: child.pid,
    port: PORT,
    bindHost: BIND_HOST,
    owner: 'office-for-claude-agents',
  }));
  child.unref();

  console.log(`Server started in background (PID ${child.pid})`);
  console.log(`Logs: ${LOG_FILE}`);
  console.log(`Open: http://localhost:${PORT}`);

  if (!NO_OPEN) {
    const openBrowser = await getOpenBrowser();
    setTimeout(() => openBrowser(`http://localhost:${PORT}`), 1500);
  }
}

async function startForeground() {
  if (!existsSync(DIST_SERVER)) {
    console.error('Error: dist/server.js not found. Run "npm run build" first.');
    process.exit(1);
  }
  const free = await checkPort(PORT);
  if (!free) {
    const status = isServerRunning(PORT);
    if (status.running) {
      console.log(`Server already running on port ${PORT} (PID ${status.pid})`);
      console.log(`Open: http://localhost:${PORT}`);
      return;
    }
    console.error(`Error: port ${PORT} is already in use.`);
    process.exit(1);
  }

  process.env.PORT = String(PORT);

  if (!NO_OPEN) {
    const openBrowser = await getOpenBrowser();
    // Open browser after a short delay to let server start
    setTimeout(() => openBrowser(`http://localhost:${PORT}`), 1500);
  }

  console.log(`Starting server on http://localhost:${PORT}`);
  await import(DIST_SERVER);
}

function showStatus() {
  const status = isServerRunning(PORT);
  if (status.running) {
    console.log(`Server running (PID ${status.pid}) on port ${PORT}`);
  } else {
    console.log('Server not running');
  }
}

function stopServer() {
  const status = isServerRunning(PORT);
  if (!status.running) {
    console.log('Server not running');
    return;
  }
  try {
    process.kill(status.pid, 'SIGTERM');
    try { unlinkSync(PID_FILE); } catch {}
    console.log(`Server stopped (PID ${status.pid})`);
  } catch (err) {
    console.error(`Failed to stop server: ${err.message}`);
  }
}

// Main
function showHelp() {
  console.log(`Usage: office-for-claude-agents [start|status|stop] [--port N] [--no-open] [--daemon]`);
  console.log(`\nCommands:`);
  console.log(`  start            Start server in foreground (default)`);
  console.log(`  start --daemon   Start server as background daemon`);
  console.log(`  status           Check if server is running`);
  console.log(`  stop             Stop the server`);
  console.log(`\nOptions:`);
  console.log(`  --port N         Set port (default: 9876)`);
  console.log(`  --no-open        Don't open browser`);
  console.log(`  --daemon         Run server in background (survives terminal close)`);
  console.log(`  --help, -h       Show this help`);
}

if (flags.has('--help') || flags.has('-h')) {
  showHelp();
} else {
  switch (command) {
    case 'start':
      if (flags.has('--daemon')) {
        await startDaemon();
      } else {
        await startForeground();
      }
      break;
    case 'status':
      showStatus();
      break;
    case 'stop':
      stopServer();
      break;
    default:
      showHelp();
      break;
  }
}
