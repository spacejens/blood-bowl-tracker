import { Injectable } from '@nestjs/common';

import {
  PostReviewQuestionsInput,
  ReviewQuestion,
} from './post-review-questions.service';

/** Shared with `main.ts`'s pre-Nest stdin gate, so both failure paths report identical wording. */
export const POST_REVIEW_QUESTIONS_USAGE =
  'Usage: node dist/main.js post-review-questions <pr-number> ' +
  '(a JSON array of {file, line, body} questions is read from stdin)';

/**
 * Turns `post-review-questions`'s argv and stdin into its input object.
 * Split out of `main.ts` so the parsing and its validation are
 * unit-testable — argv and stdin come in as parameters rather than being
 * read from `process` here.
 */
@Injectable()
export class PostReviewQuestionsArgsService {
  parse(argv: readonly string[], stdin: string): PostReviewQuestionsInput {
    const prNumber = argv[3];
    if (
      argv.length !== 4 ||
      prNumber === undefined ||
      !/^[1-9]\d*$/.test(prNumber)
    ) {
      throw new Error(POST_REVIEW_QUESTIONS_USAGE);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdin);
    } catch {
      throw new Error(`${POST_REVIEW_QUESTIONS_USAGE} (bad JSON)`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`${POST_REVIEW_QUESTIONS_USAGE} (not an array)`);
    }

    const questions = parsed.map((element, index) =>
      this.parseQuestion(element, index),
    );

    return { prNumber, questions };
  }

  private parseQuestion(element: unknown, index: number): ReviewQuestion {
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
        `${POST_REVIEW_QUESTIONS_USAGE} (bad question at index ${index})`,
      );
    }
    const question = element as { file: string; line: number; body: string };
    return { file: question.file, line: question.line, body: question.body };
  }
}
