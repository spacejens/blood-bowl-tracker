import { Module } from '@nestjs/common';
import { RaceRulesSetsController } from './race-rules-sets.controller';
import { RaceRulesSetsService } from './race-rules-sets.service';

@Module({ controllers: [RaceRulesSetsController], providers: [RaceRulesSetsService] })
export class RaceRulesSetsModule {}
