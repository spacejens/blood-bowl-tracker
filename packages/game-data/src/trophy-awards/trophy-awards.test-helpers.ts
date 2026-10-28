import { DrizzleQueryError } from '@blood-bowl-tracker/db/test-helpers';

/**
 * The shape production actually throws: a real `DrizzleQueryError` (imported
 * from drizzle-orm itself, so a future release that moves the driver error
 * breaks this test rather than silently hiding a regression) wrapping the
 * `postgres` driver's error, which is the only place `code`, `table_name` and
 * `constraint_name` live. The classifier under test unwraps that `.cause`
 * chain, so the mock has to reproduce it rather than throwing a bare
 * postgres-shaped error, which nothing issued through drizzle ever does.
 * Mirrors the same helper in `../shared/upsert-by-external-ids.spec.ts`.
 */
export function uniqueViolation(
  tableName = 'trophy_awards',
  constraintName = 'trophy_awards_trophy_competition_team_era_player_unique',
): Error {
  const pgError = Object.assign(
    new Error('duplicate key value violates unique constraint'),
    {
      code: '23505',
      table_name: tableName,
      constraint_name: constraintName,
    },
  );
  return new DrizzleQueryError('insert into "trophy_awards" ...', [], pgError);
}
