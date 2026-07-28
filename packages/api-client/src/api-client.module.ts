import { DynamicModule, FactoryProvider, Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ApiClientConfigService } from './api-client-config.service';
import { createApiClient } from './client';

export const API_CLIENT = Symbol('API_CLIENT');
const API_CLIENT_OPTIONS = Symbol('API_CLIENT_OPTIONS');

export interface ApiClientModuleOptions {
  baseUrl: string;
  apiToken: string;
}

export interface ApiClientModuleAsyncOptions {
  useFactory: FactoryProvider<ApiClientModuleOptions>['useFactory'];
  inject?: FactoryProvider<ApiClientModuleOptions>['inject'];
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
          useFactory: () => createApiClient(options.baseUrl, options.apiToken),
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
          provide: API_CLIENT_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        {
          provide: API_CLIENT,
          useFactory: (connection: ApiClientModuleOptions) =>
            createApiClient(connection.baseUrl, connection.apiToken),
          inject: [API_CLIENT_OPTIONS],
        },
      ],
      exports: [API_CLIENT],
    };
  }
}
