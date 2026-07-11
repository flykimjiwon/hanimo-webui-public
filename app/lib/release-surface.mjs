export const STABLE_CORE_PATHS = Object.freeze([
  '/',
  '/board',
  '/notice',
  '/my-api-keys',
  '/my-api-tokens',
  '/profile',
]);

export const EXPERIMENTAL_PATH_PREFIXES = Object.freeze([
  '/workflow',
  '/screen-builder',
  '/s',
  '/rag',
  '/mcp',
  '/community',
]);

export const LABS_ROUTE_PREFIXES = Object.freeze([
  ...EXPERIMENTAL_PATH_PREFIXES,
  '/api/workflows',
  '/api/screens',
  '/admin/agents',
  '/api/admin/agents',
]);

function pathMatchesPrefix(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isLabsPath(pathname = '') {
  const path = String(pathname);
  return LABS_ROUTE_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix));
}

export function areLabsEnabled(env = process.env) {
  return env.HANIMO_ENABLE_LABS === 'true';
}

export function isStableCorePath(pathname = '') {
  const path = String(pathname);
  if (!path.startsWith('/')) return true;
  if (EXPERIMENTAL_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix))) return false;
  return STABLE_CORE_PATHS.some((prefix) => pathMatchesPrefix(path, prefix));
}

export function filterStableMenus(menus = []) {
  return (Array.isArray(menus) ? menus : []).flatMap((menu) => {
    const children = filterStableMenus(menu.children || []);
    const linkIsStable = !menu.link || isStableCorePath(menu.link);
    if (children.length === 0 && (!menu.link || !linkIsStable)) return [];
    return [{ ...menu, children }];
  });
}
