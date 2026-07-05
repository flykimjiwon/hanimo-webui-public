#!/usr/bin/env node

try { require('dotenv').config(); } catch {}

const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PORT = 3100;

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (error) => {
      if (error && error.code === 'EADDRINUSE') {
        resolve(true);
        return;
      }
      resolve(true);
    });

    server.once('listening', () => {
      server.close(() => resolve(false));
    });

    server.listen(port, '0.0.0.0');
  });
}

function cleanupStaleDevTmpFiles() {
  const nextDir = path.join(process.cwd(), '.next');
  if (!fs.existsSync(nextDir)) return;

  const walk = (targetDir) => {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.name.includes('.tmp.')) continue;
      try {
        fs.unlinkSync(fullPath);
      } catch {
      }
    }
  };

  walk(nextDir);

  const vendorChunkDir = path.join(nextDir, 'server', 'vendor-chunks');
  if (fs.existsSync(vendorChunkDir)) {
    try {
      fs.rmSync(vendorChunkDir, { recursive: true, force: true });
    } catch {
    }
  }
}

async function main() {
  const busy = await isPortInUse(DEFAULT_PORT);

  if (busy) {
    console.error(
      `\n[dev-safe] Port ${DEFAULT_PORT} is already in use.\n` +
        'To avoid .next manifest race issues, this command stops instead of launching another dev server.\n' +
        `Please stop the existing process on port ${DEFAULT_PORT} and run again.\n`
    );
    process.exit(1);
  }

  cleanupStaleDevTmpFiles();

  const args = ['next', 'dev', '--port', String(DEFAULT_PORT)];
  const child = spawn('npx', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code || 0);
  });
}

main().catch((error) => {
  console.error('[dev-safe] failed to start:', error?.message || error);
  process.exit(1);
});
