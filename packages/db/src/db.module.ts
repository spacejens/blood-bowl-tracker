import {
  DynamicModule,
  FactoryProvider,
  Global,
  Logger,
  Module,
} from '@nestjs/common';
import { createDb } from './db';

export const DB = Symbol('DB');
export const DATABASE_URL = Symbol('DATABASE_URL');

export interface DbModuleAsyncOptions {
  useFactory: FactoryProvider<string>['useFactory'];
  inject?: FactoryProvider<string>['inject'];
}

const logger = new Logger('DbModule');

@Global()
@Module({})
export class DbModule {
  static forRootAsync(options: DbModuleAsyncOptions): DynamicModule {
    return {
      module: DbModule,
      providers: [
        {
          provide: DATABASE_URL,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        {
          provide: DB,
          useFactory: async (url: string) => {
            logger.log('Running migrations...');
            const db = await createDb(url, (msg) => logger.log(msg));
            logger.log('Migrations complete.');
            return db;
          },
          inject: [DATABASE_URL],
        },
      ],
      exports: [DB],
    };
  }
}
