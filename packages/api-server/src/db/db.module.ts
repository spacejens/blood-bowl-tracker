import { Global, Logger, Module } from '@nestjs/common';
import { createDb } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

export const DB = Symbol('DB');
export type { Db };

const logger = new Logger('DbModule');

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: async () => {
        logger.log('Running migrations...');
        const db = await createDb(process.env.DATABASE_URL!);
        logger.log('Migrations complete.');
        return db;
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
