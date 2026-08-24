import { Injectable } from '@nestjs/common';

import { PostReviewQuestionsInput } from './post-review-questions.service';
import { reviewQuestionsSchema } from './review-questions.schema';

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

    const questions = reviewQuestionsSchema.safeParse(parsed);
    if (!questions.success) {
      const issue = questions.error.issues[0];
      throw new Error(
        issue.path.length === 0
          ? `${POST_REVIEW_QUESTIONS_USAGE} (not an array)`
          : `${POST_REVIEW_QUESTIONS_USAGE} (bad question at index ${String(issue.path[0])})`,
      );
    }

    return { prNumber, questions: questions.data };
  }
}
