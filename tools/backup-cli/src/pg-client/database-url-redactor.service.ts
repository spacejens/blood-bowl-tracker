import { Injectable } from '@nestjs/common';

const PASSWORD_PLACEHOLDER = '<password>';
const UNPARSEABLE_PLACEHOLDER = '<database-url>';
// The URL setter percent-encodes angle brackets, so a bracket-free token is
// set first and swapped for the readable placeholder in the serialized URL.
const PASSWORD_TOKEN = 'PASSWORD_TOKEN_TO_REPLACE';

/**
 * Scrubs a database connection string from text bound for an error message.
 * Postgres client tools can echo the URL, password included. Each occurrence
 * is replaced by the same URL with its password masked, in the userinfo and in
 * a `password` query parameter (which libpq also accepts), so host, user and
 * database stay readable.
 */
@Injectable()
export class DatabaseUrlRedactorService {
  /**
   * Replaces every occurrence of `databaseUrl` in `text`. The replacement
   * always carries a masked userinfo password, even when the URL has none, so
   * the original string never survives; a `password` query parameter is
   * masked only when present. A string that is not a URL becomes a
   * fixed placeholder.
   */
  redact(text: string, databaseUrl: string): string {
    return text.split(databaseUrl).join(this.mask(databaseUrl));
  }

  private mask(databaseUrl: string): string {
    if (!URL.canParse(databaseUrl)) {
      return UNPARSEABLE_PLACEHOLDER;
    }
    const masked = new URL(databaseUrl);
    masked.password = PASSWORD_TOKEN;
    if (masked.searchParams.has('password')) {
      masked.searchParams.set('password', PASSWORD_TOKEN);
    }
    return masked.href.replaceAll(PASSWORD_TOKEN, PASSWORD_PLACEHOLDER);
  }
}
