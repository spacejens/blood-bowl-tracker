import type { QueryChain, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { PgDialect } from '@blood-bowl-tracker/db/test-helpers';

/** A captured drizzle condition rendered to SQL text with its bound params. */
export interface RenderedSql {
  sql: string;
  params: unknown[];
}

/** Renders a captured condition or select expression. Test-only. */
export function renderSql(condition: unknown): RenderedSql {
  const query = new PgDialect().sqlToQuery(condition as SQL);
  return { sql: query.sql, params: query.params };
}

/** The condition a mocked query's `.where()` got, rendered. */
export function renderedWhere(chain: QueryChain, callIndex = 0): RenderedSql {
  return renderSql(chain.where.mock.calls[callIndex][0]);
}
