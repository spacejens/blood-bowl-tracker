import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  ApiClientModule,
  ApiClientConfigService,
} from '@blood-bowl-tracker/api-client';
import { BblModule } from './bbl/bbl.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ApiClientModule.forRootAsync({
          useFactory: (config: ApiClientConfigService) =>
            config.getApiBaseUrl(),
          inject: [ApiClientConfigService],
        }),
        BblModule,
      ],
    };
  }
}
