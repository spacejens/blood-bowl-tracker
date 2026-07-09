import { DynamicModule, FactoryProvider, Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ApiClientConfigService } from './api-client-config.service';
import { createApiClient } from './client';

export const API_CLIENT = Symbol('API_CLIENT');
const API_CLIENT_BASE_URL = Symbol('API_CLIENT_BASE_URL');

export interface ApiClientModuleOptions {
  baseUrl: string;
}

export interface ApiClientModuleAsyncOptions {
  useFactory: FactoryProvider<string>['useFactory'];
  inject?: FactoryProvider<string>['inject'];
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

  static forRootAsync(options: ApiClientModuleAsyncOptions): DynamicModule {
    return {
      module: ApiClientModule,
      imports: [ConfigModule],
      providers: [
        ApiClientConfigService,
        {
          provide: API_CLIENT_BASE_URL,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        {
          provide: API_CLIENT,
          useFactory: (baseUrl: string) => createApiClient(baseUrl),
          inject: [API_CLIENT_BASE_URL],
        },
      ],
      exports: [API_CLIENT],
    };
  }
}
