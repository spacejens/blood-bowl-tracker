import { Module } from '@nestjs/common';
import { MatchEventsController } from './match-events.controller';
import { MatchEventsService } from './match-events.service';

@Module({ controllers: [MatchEventsController], providers: [MatchEventsService] })
export class MatchEventsModule {}
