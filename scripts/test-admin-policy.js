const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function listRouteFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listRouteFiles(fullPath);
    return entry.name === 'route.js' ? [fullPath] : [];
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNotContains(source, pattern, label) {
  const found = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
  assert(!found, `${label} must not contain ${pattern.toString()}`);
}

const adminRouteRoot = path.join(root, 'app', 'api', 'admin');
for (const filePath of listRouteFiles(adminRouteRoot)) {
  const source = fs.readFileSync(filePath, 'utf8');
  const label = path.relative(root, filePath);
  assertNotContains(source, 'verifyAdminOrManager', label);
  assertNotContains(source, "['admin', 'manager']", label);
  assertNotContains(source, 'Admin or manager privileges', label);
}

const adminLayout = read('app/admin/layout.js');
assert(
  adminLayout.includes("result.user.role !== 'admin'"),
  'app/admin/layout.js must reject non-admin users explicitly'
);
assertNotContains(adminLayout, "['admin', 'manager']", 'app/admin/layout.js');
assertNotContains(adminLayout, "role === 'manager'", 'app/admin/layout.js');
assertNotContains(adminLayout, 'Manager (Read-Only)', 'app/admin/layout.js');

const middleware = read('middleware.js');
assert(
  middleware.includes("isAdmin(pathname) && payload.role !== 'admin'"),
  'middleware.js must keep /api/admin admin-only'
);
assert(
  middleware.includes("!payload || payload.role !== 'admin'"),
  'middleware.js must keep /admin pages admin-only'
);

console.log('admin policy checks passed.');
