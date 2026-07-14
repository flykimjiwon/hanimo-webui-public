const fs = require('fs');
const path = require('path');

function normalizePort(value, label) {
  const serialized = typeof value === 'number' ? String(value) : value;
  if (typeof serialized !== 'string' || !/^[0-9]+$/.test(serialized)) {
    throw new Error(`${label} must be an integer between 1 and 65535.`);
  }
  const port = Number(serialized);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535.`);
  }
  return port;
}

function buildDockerE2eContext(input) {
  const appPort = normalizePort(input.appPort, 'appPort');
  const mockPort = normalizePort(input.mockPort, 'mockPort');
  const suffix = String(input.suffix || '');
  if (!/^[a-z0-9]+$/i.test(suffix)) {
    throw new Error('suffix must contain only letters and digits.');
  }

  const baseUrl = `http://127.0.0.1:${appPort}`;
  return {
    baseUrl,
    requestOrigin: baseUrl,
    projectName: `hanimo-e2e-${input.processId}-${suffix}`,
    adminEmail: `admin-${suffix}@hanimo.test`,
    adminPassword: input.adminPassword,
    env: {
      PORT: String(appPort),
      POSTGRES_USER: `hanimo_${suffix}`,
      POSTGRES_PASSWORD: input.postgresPassword,
      POSTGRES_DB: `hanimo_${suffix}`,
      JWT_SECRET: input.jwtSecret,
      HANIMO_SETUP_TOKEN: input.setupToken,
      HANIMO_CREDENTIAL_ENCRYPTION_KEY: input.credentialEncryptionKey,
      HANIMO_ADMIN_EMAIL: `admin-${suffix}@hanimo.test`,
      HANIMO_ADMIN_PASSWORD: input.adminPassword,
      HANIMO_ADMIN_NAME: 'Hanimo E2E Admin',
      HANIMO_ENABLE_DESTRUCTIVE_ADMIN: 'false',
      HANIMO_ENABLE_LABS: 'false',
      HANIMO_PUBLIC_URL: baseUrl,
      OLLAMA_ENDPOINTS: `http://host.docker.internal:${mockPort}`,
    },
  };
}

function serviceBlock(composeSource, serviceName) {
  const marker = `  ${serviceName}:`;
  const start = composeSource.indexOf(marker);
  if (start < 0) throw new Error(`Compose service is missing: ${serviceName}.`);
  const remainder = composeSource.slice(start + marker.length);
  const nextService = remainder.search(/^  [a-zA-Z0-9_-]+:/m);
  return nextService < 0 ? remainder : remainder.slice(0, nextService);
}

function assertStaticComposeConfiguration(composeSource, context) {
  if (context.requestOrigin !== context.baseUrl || context.env.HANIMO_PUBLIC_URL !== context.baseUrl) {
    throw new Error('Generated request Origin and HANIMO_PUBLIC_URL must match the dynamic app URL.');
  }

  const dbBlock = serviceBlock(composeSource, 'db');
  if (/^    ports:/m.test(dbBlock)) {
    throw new Error('PostgreSQL must not publish a host port by default.');
  }

  const appBlock = serviceBlock(composeSource, 'app');
  const forwardsPublicUrl = /^      HANIMO_PUBLIC_URL:\s*\$\{HANIMO_PUBLIC_URL:-[^}]+\}\s*$/m;
  if (!forwardsPublicUrl.test(appBlock)) {
    throw new Error('Compose HANIMO_PUBLIC_URL must be forwarded from the generated E2E environment.');
  }
}

function findExecutableOnPath(command, envPath = process.env.PATH || '') {
  const candidates = envPath.split(path.delimiter).filter(Boolean);
  return candidates.some((directory) => {
    const candidate = path.join(directory, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

module.exports = {
  assertStaticComposeConfiguration,
  buildDockerE2eContext,
  findExecutableOnPath,
  normalizePort,
};
