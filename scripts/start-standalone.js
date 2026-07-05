const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const standaloneDir = path.join(rootDir, '.next', 'standalone');
const serverPath = path.join(standaloneDir, 'server.js');

if (!fs.existsSync(serverPath)) {
  console.error('Missing .next/standalone/server.js. Run `npm run build` before `npm run start`.');
  process.exit(1);
}

function copyDirIfMissing(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) return;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

copyDirIfMissing(path.join(rootDir, '.next', 'static'), path.join(standaloneDir, '.next', 'static'));
copyDirIfMissing(path.join(rootDir, 'public'), path.join(standaloneDir, 'public'));

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';
process.env.PORT = process.env.PORT || '3000';

process.chdir(standaloneDir);
require(serverPath);
