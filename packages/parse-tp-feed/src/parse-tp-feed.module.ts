import { Module } from '@nestjs/common';

import { TpFeedAdvancementParserService } from './tp-feed-advancement-parser.service';

/**
 * Parsing of the TP feed channel's advancement reports, shared by the bot's
 * live TP feed and the production-ops CLI's history reader. Pure, with no
 * I/O.
 */
@Module({
  providers: [TpFeedAdvancementParserService],
  exports: [TpFeedAdvancementParserService],
})
export class ParseTpFeedModule {}
