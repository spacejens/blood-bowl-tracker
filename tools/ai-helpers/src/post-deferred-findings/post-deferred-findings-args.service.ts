import { Injectable } from '@nestjs/common';

import {
  DeferredFinding,
  PostDeferredFindingsInput,
} from './post-deferred-findings.service';

/** Shared with `main.ts`'s pre-Nest stdin gate, so both failure paths report identical wording. */
export const POST_DEFERRED_FINDINGS_USAGE =
  'Usage: node dist/main.js post-deferred-findings <pr-number> ' +
  '(a JSON array of {file, line, body} findings is read from stdin)';

/**
 * Turns `post-deferred-findings`'s argv and stdin into its input object.
 * Split out of `main.ts` so the parsing and its validation are
 * unit-testable — argv and stdin come in as parameters rather than being
 * read from `process` here.
 */
@Injectable()
export class PostDeferredFindingsArgsService {
  parse(argv: readonly string[], stdin: string): PostDeferredFindingsInput {
    const prNumber = argv[3];
    if (
      argv.length !== 4 ||
      prNumber === undefined ||
      !/^[1-9]\d*$/.test(prNumber)
    ) {
      throw new Error(POST_DEFERRED_FINDINGS_USAGE);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdin);
    } catch {
      throw new Error(`${POST_DEFERRED_FINDINGS_USAGE} (bad JSON)`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`${POST_DEFERRED_FINDINGS_USAGE} (not an array)`);
    }

    const findings = parsed.map((element, index) =>
      this.parseFinding(element, index),
    );

    return { prNumber, findings };
  }

  private parseFinding(element: unknown, index: number): DeferredFinding {
    if (
      typeof element !== 'object' ||
      element === null ||
      !('file' in element) ||
      !('line' in element) ||
      !('body' in element) ||
      typeof (element as { file: unknown }).file !== 'string' ||
      (element as { file: string }).file === '' ||
      typeof (element as { line: unknown }).line !== 'number' ||
      !Number.isInteger((element as { line: number }).line) ||
      (element as { line: number }).line < 1 ||
      typeof (element as { body: unknown }).body !== 'string' ||
      (element as { body: string }).body === ''
    ) {
      throw new Error(
        `${POST_DEFERRED_FINDINGS_USAGE} (bad finding at index ${index})`,
      );
    }
    const finding = element as { file: string; line: number; body: string };
    return { file: finding.file, line: finding.line, body: finding.body };
  }
}
