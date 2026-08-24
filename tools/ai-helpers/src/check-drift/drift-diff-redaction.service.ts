import { Injectable } from '@nestjs/common';

/** Splits a `diff` content line into its `< `/`> ` prefix and its body. */
const DIFF_CONTENT_LINE = /^([<>] )(.*)$/;

/** `.env`-style assignment, e.g. `DATABASE_URL=postgres://...`. */
const ENV_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/;

/** JSON5-style key, quoted or bare, e.g. `apiToken:` or `'apiToken':`. */
const JSON5_KEY = /^\s*(['"]?)([A-Za-z_][\w.-]*)\1\s*:/;

/**
 * JSON5 punctuation that opens or closes a structure. Such a line can never
 * hold a leaf value, so it is safe to show as-is and keeps the diff readable.
 */
const STRUCTURAL_BODIES = new Set(['{', '}', '[', ']', '},', '],', '']);

/**
 * Rewrites `diff` output over gitignored config files so no secret value
 * survives into the caller's output. A recognized key/value line keeps its
 * key and loses its value; anything else that carries file content is
 * replaced wholesale, since it may continue a secret. Only hunk headers,
 * separators, and structural punctuation pass through verbatim.
 */
@Injectable()
export class DriftDiffRedactionService {
  redact(diff: string): string {
    return diff
      .split('\n')
      .map((line) => this.redactLine(line))
      .join('\n');
  }

  private redactLine(line: string): string {
    const parts = DIFF_CONTENT_LINE.exec(line);
    if (parts === null) {
      // Hunk header (`2c2`), separator (`---`): never file content.
      return line;
    }
    const [, prefix, body] = parts;
    if (STRUCTURAL_BODIES.has(body.trim())) {
      return line;
    }
    const envKey = ENV_ASSIGNMENT.exec(body);
    if (envKey !== null) {
      return `${prefix}${envKey[1]} (value changed)`;
    }
    const jsonKey = JSON5_KEY.exec(body);
    if (jsonKey !== null) {
      return `${prefix}${jsonKey[2]} (value changed)`;
    }
    // Fail closed: an unrecognized line may continue a secret value.
    return `${prefix}(content changed)`;
  }
}
