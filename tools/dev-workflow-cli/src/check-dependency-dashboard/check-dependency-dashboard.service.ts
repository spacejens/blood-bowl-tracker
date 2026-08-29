import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/** Renovate's standing status issue carries exactly this title... */
const DEPENDENCY_DASHBOARD_TITLE = 'Dependency Dashboard';

/**
 * ...written by exactly this author login. Both must match: a title alone
 * could false-positive on a coincidentally-named human-authored issue.
 */
const RENOVATE_LOGIN = 'app/renovate';

/** Shared with `main.ts`'s pre-Nest stdin gate, so both failure paths report identical wording. */
export const CHECK_DEPENDENCY_DASHBOARD_USAGE =
  'Usage: node dist/main.js check-dependency-dashboard ' +
  '(a JSON issue object, or an array of them, each shaped ' +
  '{title, author: {login}}, is read from stdin)';

/**
 * One issue as `gh issue view`/`gh issue list` prints it. Unknown keys are
 * kept rather than stripped (`looseObject`), so a caller can carry
 * identifying fields such as `number` or `url` through the check without a
 * second lookup.
 */
const issueSchema = z.looseObject({
  title: z.string(),
  author: z.looseObject({ login: z.string() }),
});

/** `gh issue view` prints one object; `gh issue list` prints an array. */
const inputSchema = z.union([issueSchema, z.array(issueSchema)]);

type Issue = z.infer<typeof issueSchema>;

export type CheckedIssue = Issue & { readonly isDependencyDashboard: boolean };

/**
 * Answers whether issues handed to it are Renovate's Dependency Dashboard —
 * a live status page Renovate rewrites itself, never a piece of work to pick
 * up. Skills call this before claiming, branching, or attaching sub-issues.
 */
@Injectable()
export class CheckDependencyDashboardService {
  run(stdin: string): CheckedIssue | CheckedIssue[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdin);
    } catch {
      throw new Error(`${CHECK_DEPENDENCY_DASHBOARD_USAGE} (bad JSON)`);
    }

    const input = inputSchema.safeParse(parsed);
    if (!input.success) {
      throw new Error(`${CHECK_DEPENDENCY_DASHBOARD_USAGE} (unexpected shape)`);
    }

    return Array.isArray(input.data)
      ? input.data.map((issue) => this.check(issue))
      : this.check(input.data);
  }

  private check(issue: Issue): CheckedIssue {
    return {
      ...issue,
      isDependencyDashboard:
        issue.title === DEPENDENCY_DASHBOARD_TITLE &&
        issue.author.login === RENOVATE_LOGIN,
    };
  }
}
