import { CliSharedModule } from '@blood-bowl-tracker/cli-shared';
import { Global, Module } from '@nestjs/common';

import {
  LOCAL_DATABASE_ENV,
  LocalDatabaseUrlService,
} from './local-database-url.service';

/**
 * Global so DbModule.forRootAsync's URL factory can inject
 * LocalDatabaseUrlService from its own module.
 */
@Global()
@Module({
  imports: [CliSharedModule],
  providers: [
    { provide: LOCAL_DATABASE_ENV, useValue: process.env },
    LocalDatabaseUrlService,
  ],
  exports: [LocalDatabaseUrlService],
})
export class LocalDatabaseModule {}
