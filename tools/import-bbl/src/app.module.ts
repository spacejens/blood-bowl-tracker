import { DynamicModule, Module } from '@nestjs/common';
import { ApiClientModule } from '@blood-bowl-tracker/api-client';
import { BblModule } from './bbl/bbl.module';

@Module({})
export class AppModule {
  static register(baseUrl: string): DynamicModule {
    return {
      module: AppModule,
      imports: [ApiClientModule.forRoot({ baseUrl }), BblModule],
    };
  }
}
