import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiServerModule } from '@blood-bowl-tracker/api-server';
import { DbModule } from '@blood-bowl-tracker/db';

@Module({
  imports: [
    DbModule.forRootAsync({
      useFactory: () => process.env.DATABASE_URL!,
    }),
    ApiServerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
