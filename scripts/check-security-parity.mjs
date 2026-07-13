import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const SECURITY_MANIFEST = [
  'package.json',
  '.env.example',
  'SECURITY.md',
  'docs/RELEASE_CHECKLIST.md',
  'docs/DONOR_PROVENANCE.md',
  'docs/HANIMO_OFFICIAL_CLIENT_GATEWAY.md',
  'scripts/install.sh',
  'scripts/install-local.sh',
  'scripts/check-docker-install.js',
  'scripts/lib/docker-e2e-config.js',
  'scripts/mock-ollama.js',
  'scripts/public-export-policy.js',
  'scripts/prepare-public-export.js',
  'scripts/check-public-export.js',
  '.dockerignore',
  '.github/workflows/security.yml',
  'docker-compose.yml',
  'app/lib/security/proxy-headers.mjs',
  'app/lib/security/redaction.mjs',
  'app/lib/security/image-magic.mjs',
  'app/lib/security/image-signature.mjs',
  'app/lib/security/outbound-policy.mjs',
  'app/lib/security/outbound-request.mjs',
  'app/lib/security/workflow-endpoint.mjs',
  'app/lib/security/secret-box.mjs',
  'app/lib/security/tokens.mjs',
  'app/lib/security/request-origin.mjs',
  'app/lib/security/rate-limit.mjs',
  'app/lib/security/settings-secrets.mjs',
  'app/lib/openai-gateway.mjs',
  'app/lib/screen-security.mjs',
  'app/lib/release-surface.mjs',
  'middleware.js',
  'app/api/model-servers/chat/route.js',
  'app/api/model-servers/generate/route.js',
  'app/api/upload/image/route.js',
  'app/api/workflows/[id]/endpoints/route.js',
  'app/lib/workflow-engine.js',
  'app/lib/apiTokenUtils.js',
  'app/api/user/api-tokens/route.js',
  'app/api/admin/api-tokens/route.js',
  'app/lib/externalApiLogger.js',
  'app/lib/retryUtils.js',
  'app/components/SiteMenuSelector.js',
  'app/components/chat/Sidebar.js',
  'app/components/chat/SidebarRail.js',
  'scripts/scan-public-release.js',
  'scripts/smoke-routes.js',
  'app/api/screens/[id]/execute/route.js',
  'app/api/screens/share/[shareId]/route.js',
  'app/api/workflows/[id]/execute/route.js',
  'app/api/admin/env/route.js',
  'app/api/v1/chat/completions/route.js',
  'app/api/v1/models/route.js',
  'app/api/admin/settings/route.js',
  'app/api/admin/get-local-models/route.js',
  'app/api/model-servers/models/route.js',
  'app/api/webapp-generate/route.js',
  'app/lib/modelServerMonitor.js',
  'next.config.mjs',
  'app/api/auth/login/route.js',
  'app/api/auth/register/route.js',
  'app/api/auth/refresh/route.js',
  'tests/security',
];

async function digest(path) {
  const hash = createHash('sha256');
  hash.update(await readFile(path));
  return hash.digest('hex');
}

function normalizeForParity(relativePath, content) {
  if (relativePath === '.github/workflows/security.yml') {
    return content
      .replaceAll('flykimjiwon/hanimo-webui-public', '<sibling-repo>')
      .replaceAll('hanimo-webui-public', '<sibling-path>')
      .replaceAll('hanimo-webui', '<sibling-path>');
  }
  return content;
}

async function collect(root, relativePath) {
  const path = resolve(root, relativePath);
  try {
    const stat = await (await import('node:fs/promises')).stat(path);
    if (stat.isDirectory()) {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(path, { withFileTypes: true });
      const entries = [];
      for (const entry of files.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isFile() && entry.name.endsWith('.mjs')) {
          const child = `${relativePath}/${entry.name}`;
        entries.push([child, await digest(resolve(root, child))]);
        }
      }
      return entries;
    }
    const content = await readFile(path);
    const hash = createHash('sha256').update(normalizeForParity(relativePath, content)).digest('hex');
    return [[relativePath, hash]];
  } catch {
    return [[relativePath, null]];
  }
}

export async function manifest(root) {
  const entries = [];
  for (const item of SECURITY_MANIFEST) entries.push(...(await collect(root, item)));
  return entries;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const root = resolve(process.cwd());
  const peerArg = process.argv.indexOf('--peer');
  const peer = peerArg >= 0
    ? resolve(process.cwd(), process.argv[peerArg + 1])
    : ['./hanimo-webui-public', './hanimo-webui', '../hanimo-webui-public', '../hanimo-webui']
        .map((candidate) => resolve(process.cwd(), candidate))
        .find((candidate) => candidate !== root && existsSync(candidate));
  if (!peer) {
    console.error('Usage: node scripts/check-security-parity.mjs [--peer <path>]');
    process.exit(2);
  }
  const [currentEntries, peerEntries] = await Promise.all([manifest(root), manifest(peer)]);
  const current = new Map(currentEntries);
  const other = new Map(peerEntries);
  const paths = [...new Set([...current.keys(), ...other.keys()])].sort();
  const mismatches = paths.filter((path) => current.get(path) !== other.get(path));
  if (mismatches.length) {
    console.error(`security parity failed: ${mismatches.length} mismatch(es)`);
    for (const path of mismatches) console.error(`- ${path}`);
    process.exit(1);
  }
  console.log(`security parity passed: ${paths.length} manifest entries`);
}
