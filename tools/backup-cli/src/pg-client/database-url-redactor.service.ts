import { Injectable } from '@nestjs/common';

/**
 * Scrubs a database connection string from text bound for an error message.
 * Postgres client tools can echo the URL, password included, and a
 * connection failure can name the password on its own.
 */
@Injectable()
export class DatabaseUrlRedactorService {
  /** Replaces the database URL, and then its bare password, in `text`. */
  redact(text: string, databaseUrl: string): string {
    let redacted = text.split(databaseUrl).join('<database-url>');
    const password = URL.canParse(databaseUrl)
      ? new URL(databaseUrl).password
      : '';
    if (password !== '') {
      redacted = redacted.split(password).join('<password>');
    }
    return redacted;
  }
}
