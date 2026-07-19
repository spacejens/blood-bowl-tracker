/**
 * Escapes Postgres LIKE/ILIKE metacharacters (`%`, `_`) and the default
 * escape character (`\`) so a user-supplied prefix is matched literally
 * rather than interpreted as a wildcard pattern. The backslash must be
 * escaped first so escaping `%`/`_` afterwards doesn't double-escape it.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
