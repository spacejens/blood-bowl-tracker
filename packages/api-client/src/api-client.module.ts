import { DynamicModule, Global, Module } from '@nestjs/common';
import { createApiClient } from './client';

export const API_CLIENT = Symbol('API_CLIENT');

export interface ApiClientModuleOptions {
  baseUrl: string;
}

@Global()
@Module({})
export class ApiClientModule {
  static forRoot(options: ApiClientModuleOptions): DynamicModule {
    return {
      module: ApiClientModule,
      providers: [
        {
          provide: API_CLIENT,
          useFactory: () => createApiClient(options.baseUrl),
        },
      ],
      exports: [API_CLIENT],
    };
  }
}
