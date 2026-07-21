import {
  CoachesModule,
  CompetitionsModule,
  ErasModule,
  ExternalSystemsModule,
  LeaguesModule,
  MatchesModule,
  MatchEventsModule,
  PlayersModule,
  PositionsModule,
  RacesModule,
  RulesSetsModule,
  TeamsModule,
} from '@blood-bowl-tracker/game-data';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { RpcMiddleware } from './rpc.middleware';
import { RPC_ROUTER } from './rpc-router.token';
import { RpcRouterFactoryService } from './rpc-router-factory.service';

@Module({
  imports: [
    CoachesModule,
    ExternalSystemsModule,
    LeaguesModule,
    RacesModule,
    RulesSetsModule,
    ErasModule,
    PositionsModule,
    TeamsModule,
    CompetitionsModule,
    MatchesModule,
    PlayersModule,
    MatchEventsModule,
  ],
  providers: [
    RpcRouterFactoryService,
    {
      provide: RPC_ROUTER,
      useFactory: (factory: RpcRouterFactoryService) => factory.build(),
      inject: [RpcRouterFactoryService],
    },
  ],
})
export class ApiServerModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RpcMiddleware).forRoutes('*splat');
  }
}
