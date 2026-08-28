import { z } from 'zod';

/**
 * The JSON array `post-review-questions` reads from stdin: one entry per
 * inline review question. `line` is a 1-based file line. The caller turns a
 * failure into its usage message, naming the failing element's index.
 */
export const reviewQuestionsSchema = z.array(
  z.object({
    file: z.string().min(1),
    line: z.number().int().min(1),
    body: z.string().min(1),
  }),
);
