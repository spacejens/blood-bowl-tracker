import {
  CoachesModule,
  CompetitionGroupsModule,
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
  SppModule,
  TeamsModule,
  TrophiesModule,
} from '@blood-bowl-tracker/game-data';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ApiTokenAuthService } from './api-token-auth.service';
import { RpcMiddleware } from './rpc.middleware';
import { RPC_ROUTER } from './rpc-router.token';
import { RpcRouterFactoryService } from './rpc-router-factory.service';
import { UpsertHandlerService } from './upsert-handler.service';

@Module({
  imports: [
    ConfigModule,
    CoachesModule,
    ExternalSystemsModule,
    LeaguesModule,
    RacesModule,
    RulesSetsModule,
    ErasModule,
    PositionsModule,
    TeamsModule,
    CompetitionGroupsModule,
    CompetitionsModule,
    MatchesModule,
    PlayersModule,
    MatchEventsModule,
    SppModule,
    TrophiesModule,
  ],
  providers: [
    ApiTokenAuthService,
    RpcRouterFactoryService,
    UpsertHandlerService,
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
