import { DB, type Db } from '@blood-bowl-tracker/db';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';

/**
 * Ends the postgres client when the CLI's context closes. DbModule has no
 * shutdown hook, and an open client keeps the event loop, and so the
 * process, alive after the subcommand printed its result.
 */
@Injectable()
export class LocalDatabaseShutdownService implements OnModuleDestroy {
  constructor(@Inject(DB) private readonly db: Db) {}

  async onModuleDestroy(): Promise<void> {
    await this.db.$client.end();
  }
}
