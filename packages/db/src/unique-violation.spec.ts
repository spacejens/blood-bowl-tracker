import { describe, expect, it } from 'vitest';

import * as db from './index';
import { isUniqueViolationOn } from './unique-violation';

/** The `postgres` driver's error shape for a unique violation. */
function violation(
  tableName: string,
  constraintName = `${tableName}_natural_key_unique`,
): Error {
  return Object.assign(new Error('duplicate key value'), {
    code: '23505',
    table_name: tableName,
    constraint_name: constraintName,
  });
}

/** Wraps `inner` in `levels` nested `.cause` links, like DrizzleQueryError. */
function wrap(inner: unknown, levels: number): unknown {
  let current = inner;
  for (let level = 0; level < levels; level++) {
    current = Object.assign(new Error(`wrapper ${level}`), { cause: current });
  }
  return current;
}

describe('isUniqueViolationOn', () => {
  it('matches a bare unique violation on the table', () => {
    expect(isUniqueViolationOn(violation('guilds'), 'guilds')).toBe(true);
  });

  it('matches a violation wrapped one level deep, as drizzle-orm wraps it', () => {
    expect(isUniqueViolationOn(wrap(violation('guilds'), 1), 'guilds')).toBe(
      true,
    );
  });

  it('matches a violation wrapped three levels deep', () => {
    expect(isUniqueViolationOn(wrap(violation('guilds'), 3), 'guilds')).toBe(
      true,
    );
  });

  it('does not match a violation wrapped four levels deep', () => {
    expect(isUniqueViolationOn(wrap(violation('guilds'), 4), 'guilds')).toBe(
      false,
    );
  });

  it('does not match a different SQLSTATE on the same table', () => {
    const notNull = Object.assign(new Error('null value'), {
      code: '23502',
      table_name: 'guilds',
    });
    expect(isUniqueViolationOn(wrap(notNull, 1), 'guilds')).toBe(false);
  });

  it('does not match a unique violation on a different table', () => {
    expect(isUniqueViolationOn(wrap(violation('users'), 1), 'guilds')).toBe(
      false,
    );
  });

  it('does not match a violation of the table primary key', () => {
    const pkey = violation('guilds', 'guilds_pkey');
    expect(isUniqueViolationOn(wrap(pkey, 1), 'guilds')).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'boom'],
    ['a number', 42],
    ['an error without cause', new Error('plain')],
  ])('returns false for %s', (_label, value) => {
    expect(isUniqueViolationOn(value, 'guilds')).toBe(false);
  });

  it('stops at a null cause', () => {
    expect(
      isUniqueViolationOn(
        Object.assign(new Error('x'), { cause: null }),
        'guilds',
      ),
    ).toBe(false);
  });

  it('is re-exported from the package entry point', () => {
    expect(db.isUniqueViolationOn).toBe(isUniqueViolationOn);
  });
});
