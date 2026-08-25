import { Injectable } from '@nestjs/common';
import type { ZodError } from 'zod';

/**
 * Renders a failed config parse as the single-line message the config
 * services throw: a caller-supplied location prefix, the failing field's
 * path, and the schema's own message tail. Numeric path segments render as
 * `[n]` and string segments as `.name`, so a schema only has to carry the
 * tail ("must be a non-empty string.") while the prefix stays the config
 * service's business.
 *
 * Pure and dependency-free: no I/O, no external state, no constructor.
 */
@Injectable()
export class ConfigErrorMessageService {
  /** The first issue of `error`, prefixed with `prefix` and its path. */
  format(prefix: string, error: ZodError): string {
    const issue = error.issues[0];
    const location = issue.path.reduce<string>(
      (accumulated, segment) =>
        typeof segment === 'number'
          ? `${accumulated}[${segment}]`
          : `${accumulated}.${String(segment)}`,
      prefix,
    );
    return `${location} ${issue.message}`;
  }
}
