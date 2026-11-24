import { RunProductionQueryService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

/**
 * The command tags psql prints for the read-only transaction around the
 * query. `--quiet` already suppresses them; they are stripped as well so a
 * psql that prints them anyway cannot break the JSON parse.
 */
const TRANSACTION_CHATTER = new Set(['BEGIN', 'SET', 'COMMIT']);

/** How much of unparseable output an error quotes. */
const QUOTED_OUTPUT_LENGTH = 200;

/**
 * Runs one read-only SELECT against production and returns its rows as
 * parsed JSON. The query is wrapped in `json_agg`, so the result is a single
 * JSON array value however many rows there are, and psql prints it
 * tuples-only and unaligned.
 */
@Injectable()
export class ProductionJsonQueryService {
  constructor(private readonly query: RunProductionQueryService) {}

  async rows(sql: string): Promise<unknown[]> {
    const result = await this.query.run(
      `SELECT coalesce(json_agg(q), '[]'::json) FROM (${sql}) q;`,
      { tuplesOnly: true },
    );
    if (result.timedOut) {
      const stderr = result.stderr.trim();
      throw new Error(
        stderr === ''
          ? 'Production query timed out'
          : `Production query timed out: ${stderr}`,
      );
    }
    if (result.exitCode !== 0) {
      throw new Error(
        `Production query failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
      );
    }
    return this.parse(result.stdout);
  }

  private parse(stdout: string): unknown[] {
    const body = stdout
      .split('\n')
      .filter((line) => !TRANSACTION_CHATTER.has(line.trim()))
      .join('\n')
      .trim();
    if (body === '') {
      throw new Error('Production query printed no JSON');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (error: unknown) {
      throw new Error(
        `Production query output is not JSON: ${body.slice(0, QUOTED_OUTPUT_LENGTH)}`,
        { cause: error },
      );
    }
    if (!Array.isArray(parsed)) {
      throw new Error('Production query output is not a JSON array');
    }
    return parsed;
  }
}
