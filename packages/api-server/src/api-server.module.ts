import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import {
  CoachesModule,
  ExternalSystemsModule,
  LeaguesModule,
} from '@blood-bowl-tracker/game-data';
import { RpcMiddleware } from './rpc.middleware';

@Module({
  imports: [CoachesModule, ExternalSystemsModule, LeaguesModule],
})
export class ApiServerModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RpcMiddleware).forRoutes('*splat');
  }
}
