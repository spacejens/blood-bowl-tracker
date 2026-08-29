import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CheckDependencyDashboardService } from './check-dependency-dashboard.service';

/** One issue in the shape `gh issue view --json number,title,author` prints. */
function issue(title: string, login: string): Record<string, unknown> {
  return { number: 518, title, author: { login } };
}

describe('CheckDependencyDashboardService', () => {
  let service: CheckDependencyDashboardService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CheckDependencyDashboardService],
    }).compile();
    service = moduleRef.get(CheckDependencyDashboardService);
  });

  it('flags a single issue matching both the title and the author', () => {
    const input = issue('Dependency Dashboard', 'app/renovate');
    expect(service.run(JSON.stringify(input))).toEqual({
      number: 518,
      title: 'Dependency Dashboard',
      author: { login: 'app/renovate' },
      isDependencyDashboard: true,
    });
  });

  it('does not flag a matching title written by someone else', () => {
    const input = issue('Dependency Dashboard', 'spacejens');
    expect(service.run(JSON.stringify(input))).toMatchObject({
      isDependencyDashboard: false,
    });
  });

  it('does not flag another issue written by Renovate', () => {
    const input = issue('Update dependency zod to v4', 'app/renovate');
    expect(service.run(JSON.stringify(input))).toMatchObject({
      isDependencyDashboard: false,
    });
  });

  it('does not flag near-miss titles', () => {
    const nearMisses = [
      'Dependency Dashboard ',
      'dependency dashboard',
      'Renovate Dependency Dashboard',
    ];
    for (const title of nearMisses) {
      const input = issue(title, 'app/renovate');
      expect(service.run(JSON.stringify(input))).toMatchObject({
        isDependencyDashboard: false,
      });
    }
  });

  it('does not flag a near-miss author login', () => {
    const input = issue('Dependency Dashboard', 'renovate');
    expect(service.run(JSON.stringify(input))).toMatchObject({
      isDependencyDashboard: false,
    });
  });

  it('flags each item of an array independently, preserving order', () => {
    const input = [
      {
        number: 1,
        title: 'Add stats endpoint',
        author: { login: 'spacejens' },
      },
      {
        number: 2,
        title: 'Dependency Dashboard',
        author: { login: 'app/renovate' },
      },
      {
        number: 3,
        title: 'Dependency Dashboard',
        author: { login: 'someone' },
      },
    ];
    const output = service.run(JSON.stringify(input)) as Record<
      string,
      unknown
    >[];
    expect(output.map((item) => item.number)).toEqual([1, 2, 3]);
    expect(output.map((item) => item.isDependencyDashboard)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('returns an empty array for an empty array', () => {
    expect(service.run('[]')).toEqual([]);
  });

  it('passes extra fields through untouched, so callers keep identifying data', () => {
    const input = {
      number: 518,
      title: 'Dependency Dashboard',
      author: { login: 'app/renovate' },
      url: 'https://github.com/spacejens/blood-bowl-tracker/issues/518',
      state: 'OPEN',
    };
    expect(service.run(JSON.stringify(input))).toEqual({
      number: 518,
      title: 'Dependency Dashboard',
      author: { login: 'app/renovate' },
      url: 'https://github.com/spacejens/blood-bowl-tracker/issues/518',
      state: 'OPEN',
      isDependencyDashboard: true,
    });
  });

  it('rejects malformed JSON', () => {
    expect(() => service.run('{not json')).toThrow(/bad JSON/);
  });

  it('rejects empty stdin', () => {
    expect(() => service.run('')).toThrow(/bad JSON/);
  });

  it('rejects an issue missing its title', () => {
    const input = { author: { login: 'app/renovate' } };
    expect(() => service.run(JSON.stringify(input))).toThrow(
      /unexpected shape/,
    );
  });

  it('rejects an issue missing its author', () => {
    const input = { title: 'Dependency Dashboard' };
    expect(() => service.run(JSON.stringify(input))).toThrow(
      /unexpected shape/,
    );
  });

  it('rejects an author without a login', () => {
    const input = { title: 'x', author: {} };
    expect(() => service.run(JSON.stringify(input))).toThrow(
      /unexpected shape/,
    );
  });

  it('rejects a non-string title', () => {
    const input = { title: 7, author: { login: 'a' } };
    expect(() => service.run(JSON.stringify(input))).toThrow(
      /unexpected shape/,
    );
  });

  it('rejects a bare JSON string', () => {
    expect(() => service.run('"Dependency Dashboard"')).toThrow(
      /unexpected shape/,
    );
  });

  it('rejects an array containing a malformed item', () => {
    const input = [
      {
        number: 1,
        title: 'Dependency Dashboard',
        author: { login: 'app/renovate' },
      },
      { title: 'no author here' },
    ];
    expect(() => service.run(JSON.stringify(input))).toThrow(
      /unexpected shape/,
    );
  });
});
