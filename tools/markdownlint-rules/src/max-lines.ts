/**
 * Maximum number of lines a markdown file may contain. Matches the 500-line
 * ceiling ESLint's built-in `max-lines` rule enforces for TypeScript source
 * files in `eslint.config.ts`.
 */
export const MAX_MARKDOWN_LINES = 500;

/** The subset of markdownlint's rule-function parameters this rule reads. */
export interface MarkdownlintRuleParams {
  readonly name: string;
  readonly lines: readonly string[];
}

/** The error shape markdownlint's `onError` callback accepts. */
export interface MarkdownlintRuleErrorInfo {
  readonly lineNumber: number;
  readonly detail: string;
}

export type MarkdownlintRuleOnError = (
  error: MarkdownlintRuleErrorInfo,
) => void;

/**
 * A markdownlint custom rule. Declared locally rather than imported from the
 * `markdownlint` package so this package needs no runtime dependency of its
 * own — it is loaded by `markdownlint-cli2` at lint time, never imported by
 * application code.
 */
export interface MarkdownlintRule {
  readonly names: readonly string[];
  readonly description: string;
  readonly tags: readonly string[];
  readonly parser: 'none';
  readonly function: (
    params: MarkdownlintRuleParams,
    onError: MarkdownlintRuleOnError,
  ) => void;
}

/**
 * The number of lines in the file markdownlint split into `lines`.
 *
 * markdownlint splits file content on newlines, so a file that ends with a
 * newline — as every well-formed markdown file does — yields one extra,
 * empty trailing entry. Dropping it makes the count match `wc -l`, so a file
 * of exactly the limit is not reported as one line over.
 */
export function countLines(lines: readonly string[]): number {
  const hasTrailingNewline = lines.length > 0 && lines[lines.length - 1] === '';
  return hasTrailingNewline ? lines.length - 1 : lines.length;
}

/**
 * The violation for an oversized file, or `undefined` when the file is within
 * the limit. Reported against the first line past the limit, so the message
 * points at where the file should have ended.
 */
export function checkMaxLines(
  lines: readonly string[],
): MarkdownlintRuleErrorInfo | undefined {
  const lineCount = countLines(lines);
  if (lineCount <= MAX_MARKDOWN_LINES) {
    return undefined;
  }
  return {
    lineNumber: MAX_MARKDOWN_LINES + 1,
    detail:
      `File has ${lineCount} lines, over the ${MAX_MARKDOWN_LINES}-line maximum. ` +
      `Split it into several files rather than raising the limit.`,
  };
}

export const maxLinesRule: MarkdownlintRule = {
  names: ['BBT001', 'max-file-lines'],
  description: `Markdown file is longer than ${MAX_MARKDOWN_LINES} lines`,
  tags: ['length'],
  parser: 'none',
  function: (params, onError) => {
    const error = checkMaxLines(params.lines);
    if (error) {
      onError(error);
    }
  },
};
