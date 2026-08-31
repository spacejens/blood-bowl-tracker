import {
  checkMaxLines,
  countLines,
  MAX_MARKDOWN_LINES,
  maxLinesRule,
} from './max-lines';

const linesOfLength = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `line ${index + 1}`);

describe('countLines', () => {
  it('ignores the single trailing empty entry a file-ending newline produces', () => {
    expect(countLines([...linesOfLength(3), ''])).toBe(3);
  });

  it('counts every line when the file does not end with a newline', () => {
    expect(countLines(linesOfLength(3))).toBe(3);
  });

  it('returns 0 for an empty file', () => {
    expect(countLines([])).toBe(0);
  });

  it('keeps interior blank lines', () => {
    expect(countLines(['a', '', 'b'])).toBe(3);
  });
});

describe('checkMaxLines', () => {
  it('reports nothing for a file at exactly the limit', () => {
    expect(
      checkMaxLines([...linesOfLength(MAX_MARKDOWN_LINES), '']),
    ).toBeUndefined();
  });

  it('reports nothing for a short file', () => {
    expect(checkMaxLines(linesOfLength(10))).toBeUndefined();
  });

  it('reports an error one line past the limit', () => {
    const error = checkMaxLines(linesOfLength(MAX_MARKDOWN_LINES + 1));

    expect(error?.lineNumber).toBe(MAX_MARKDOWN_LINES + 1);
    expect(error?.detail).toContain(`${MAX_MARKDOWN_LINES + 1} lines`);
    expect(error?.detail).toContain(`${MAX_MARKDOWN_LINES}`);
  });

  it('reports the real count for a file well past the limit', () => {
    const error = checkMaxLines(linesOfLength(665));

    expect(error?.detail).toContain('665 lines');
  });
});

describe('maxLinesRule', () => {
  it('declares the metadata markdownlint needs to load it', () => {
    expect(maxLinesRule.names).toEqual(['BBT001', 'max-file-lines']);
    expect(maxLinesRule.tags).toEqual(['length']);
    expect(maxLinesRule.parser).toBe('none');
    expect(maxLinesRule.description).toContain(`${MAX_MARKDOWN_LINES}`);
  });

  it('calls onError once for an oversized file', () => {
    const onError = vi.fn();

    maxLinesRule.function(
      { name: 'big.md', lines: linesOfLength(MAX_MARKDOWN_LINES + 5) },
      onError,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith({
      lineNumber: MAX_MARKDOWN_LINES + 1,
      detail: expect.stringContaining(
        `${MAX_MARKDOWN_LINES + 5} lines`,
      ) as string,
    });
  });

  it('does not call onError for a file within the limit', () => {
    const onError = vi.fn();

    maxLinesRule.function(
      { name: 'small.md', lines: linesOfLength(10) },
      onError,
    );

    expect(onError).not.toHaveBeenCalled();
  });
});
