import { Module } from '@nestjs/common';
import { RulesSetsController } from './rules-sets.controller';
import { RulesSetsService } from './rules-sets.service';

@Module({ controllers: [RulesSetsController], providers: [RulesSetsService] })
export class RulesSetsModule {}
