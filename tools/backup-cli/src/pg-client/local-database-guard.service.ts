import { Injectable } from '@nestjs/common';

/** `URL.hostname` keeps the brackets around an IPv6 address. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Guards every subcommand that writes into a database it is pointed at
 * (`verify`, `restore`): the target must be on this machine, with no
 * override, so a mistyped URL can never restore over a real database.
 */
@Injectable()
export class LocalDatabaseGuardService {
  /**
   * Refuses anything but a postgres URL naming only this machine. libpq's
   * `host`/`hostaddr` query parameters override the URL's host, so their
   * presence is refused too. Messages never echo the URL.
   */
  assertLocal(databaseUrl: string): void {
    const url = URL.canParse(databaseUrl) ? new URL(databaseUrl) : undefined;
    if (url === undefined || !/^postgres(ql)?:$/.test(url.protocol)) {
      throw new Error(
        'The target database must be a postgres:// or postgresql:// connection string.',
      );
    }
    if (
      !LOCAL_HOSTS.has(url.hostname) ||
      url.searchParams.has('host') ||
      url.searchParams.has('hostaddr')
    ) {
      throw new Error(
        'Refusing to restore into a non-local database: the target host must be localhost, 127.0.0.1 or ::1.',
      );
    }
  }
}
