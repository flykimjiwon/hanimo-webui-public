export const DEPARTMENT_CATALOG = Object.freeze([
  Object.freeze({ value: 'Engineering', labelKey: 'signup.group_digital' }),
  Object.freeze({ value: 'Marketing', labelKey: 'signup.group_global' }),
  Object.freeze({ value: 'Finance', labelKey: 'signup.group_finance' }),
  Object.freeze({ value: 'Operations', labelKey: 'signup.group_info' }),
  Object.freeze({ value: 'Product', labelKey: 'signup.group_tech' }),
  Object.freeze({ value: 'Other', labelKey: 'signup.group_other' }),
]);

export const DEFAULT_DEPARTMENTS = Object.freeze(
  DEPARTMENT_CATALOG.map(({ value }) => value)
);

const LEGACY_DEPARTMENTS = new Map([
  ['개발팀', 'Engineering'],
  ['마케팅팀', 'Marketing'],
  ['재무팀', 'Finance'],
  ['운영팀', 'Operations'],
  ['프로덕트팀', 'Product'],
  ['기타', 'Other'],
  ['Digital Service Development Department', 'Engineering'],
  ['Global Service Development Department', 'Marketing'],
  ['Financial Service Development Department', 'Finance'],
  ['Information Service Development Department', 'Operations'],
  ['Tech Innovation Unit', 'Product'],
  ['Other Department', 'Other'],
]);

export function normalizeDepartment(value) {
  const department = typeof value === 'string' ? value.trim() : '';
  return LEGACY_DEPARTMENTS.get(department) || department;
}

export function getAllowedDepartments(
  env = typeof process === 'undefined' ? {} : process.env
) {
  const configured = String(env.ALLOWED_DEPARTMENTS || '')
    .split(',')
    .map(normalizeDepartment)
    .filter(Boolean);
  return configured.length > 0 ? [...new Set(configured)] : [...DEFAULT_DEPARTMENTS];
}

export function isAllowedDepartment(value, env) {
  return getAllowedDepartments(env).includes(normalizeDepartment(value));
}
