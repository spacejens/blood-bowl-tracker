import { Global, Logger, Module } from '@nestjs/common';
import { createDb } from './db';

export const DB = Symbol('DB');

const logger = new Logger('DbModule');

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: async () => {
        logger.log('Running migrations...');
        const db = await createDb(process.env.DATABASE_URL!, (msg) =>
          logger.log(msg),
        );
        logger.log('Migrations complete.');
        return db;
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
