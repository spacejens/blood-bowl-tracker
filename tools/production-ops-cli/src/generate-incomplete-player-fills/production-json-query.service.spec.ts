import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { RunProductionQueryService } from '../run-production-query/run-production-query.service';
import { ProductionJsonQueryService } from './production-json-query.service';

const ok = (stdout: string) => ({
  exitCode: 0,
  stdout,
  stderr: '',
  timedOut: false,
});

describe('ProductionJsonQueryService', () => {
  let service: ProductionJsonQueryService;
  let query: MockProxy<RunProductionQueryService>;

  beforeEach(async () => {
    query = mock<RunProductionQueryService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductionJsonQueryService,
        { provide: RunProductionQueryService, useValue: query },
      ],
    }).compile();
    service = moduleRef.get(ProductionJsonQueryService);
  });

  it('aggregates the query into one JSON array, read tuples-only', async () => {
    query.run.mockResolvedValue(ok('[]\n'));

    await service.rows('SELECT 1 AS a');

    expect(query.run).toHaveBeenCalledWith(
      "SELECT coalesce(json_agg(q), '[]'::json) FROM (SELECT 1 AS a) q;",
      { tuplesOnly: true },
    );
  });

  it('parses a multi-line array after stripping the transaction chatter', async () => {
    query.run.mockResolvedValue(
      ok('BEGIN\nSET\n[{"a":1}, \n {"a":2}]\nCOMMIT\n'),
    );

    await expect(service.rows('SELECT 1 AS a')).resolves.toEqual([
      { a: 1 },
      { a: 2 },
    ]);
  });

  it('returns an empty array for an empty result', async () => {
    query.run.mockResolvedValue(ok('[]\n'));

    await expect(service.rows('SELECT 1 AS a')).resolves.toEqual([]);
  });

  it('reports a failed query with its stderr', async () => {
    query.run.mockResolvedValue({
      exitCode: 3,
      stdout: '',
      stderr: 'ERROR:  relation "x" does not exist\n',
      timedOut: false,
    });

    await expect(service.rows('SELECT 1 AS a')).rejects.toThrow(
      'Production query failed (exit 3): ERROR:  relation "x" does not exist',
    );
  });

  it('reports a timed-out query', async () => {
    query.run.mockResolvedValue({
      exitCode: 124,
      stdout: '',
      stderr: '',
      timedOut: true,
    });

    await expect(service.rows('SELECT 1 AS a')).rejects.toThrow(
      'Production query timed out',
    );
  });

  it('refuses output that holds no JSON', async () => {
    query.run.mockResolvedValue(ok('BEGIN\nCOMMIT\n'));

    await expect(service.rows('SELECT 1 AS a')).rejects.toThrow(
      'Production query printed no JSON',
    );
  });

  it('refuses output that is not JSON', async () => {
    query.run.mockResolvedValue(ok('not json\n'));

    await expect(service.rows('SELECT 1 AS a')).rejects.toThrow(
      'Production query output is not JSON: not json',
    );
  });

  it('refuses JSON that is not an array', async () => {
    query.run.mockResolvedValue(ok('{"a":1}\n'));

    await expect(service.rows('SELECT 1 AS a')).rejects.toThrow(
      'Production query output is not a JSON array',
    );
  });
});
