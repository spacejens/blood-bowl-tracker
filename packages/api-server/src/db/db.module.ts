import { Global, Module } from '@nestjs/common';
import { createDb } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

export const DB = Symbol('DB');
export type { Db };

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: () => createDb(process.env.DATABASE_URL!),
    },
  ],
  exports: [DB],
})
export class DbModule {}
