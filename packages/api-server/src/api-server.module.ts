import {
  CoachesModule,
  CompetitionGroupsModule,
  CompetitionsModule,
  ErasModule,
  ExternalSystemsModule,
  KeywordsModule,
  LeaguesModule,
  MatchesModule,
  MatchEventsModule,
  PlayerSkillsModule,
  PlayersModule,
  PositionRulesSetKeywordsModule,
  PositionRulesSetSkillsModule,
  PositionRulesSetsModule,
  PositionsModule,
  RacesModule,
  RulesSetsModule,
  SkillRulesSetsModule,
  SkillsModule,
  SppModule,
  TeamsModule,
  TrophiesModule,
  TrophyAwardsModule,
} from '@blood-bowl-tracker/game-data';
import {
  TpCompetitionModule,
  TpMatchModule,
  TpRosterModule,
} from '@blood-bowl-tracker/import-tp-live';
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
    PositionRulesSetsModule,
    PositionRulesSetSkillsModule,
    PositionRulesSetKeywordsModule,
    PlayerSkillsModule,
    SkillsModule,
    SkillRulesSetsModule,
    KeywordsModule,
    SppModule,
    TrophiesModule,
    TrophyAwardsModule,
    TpRosterModule,
    TpMatchModule,
    TpCompetitionModule,
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
