import { BblMirrorReaderModule } from '@blood-bowl-tracker/read-bbl-mirror';
import { Module } from '@nestjs/common';

import { BblPlayerAdvancementsReaderService } from './bbl-player-advancements-reader.service';
import { BblPlayerSkillsCellService } from './bbl-player-skills-cell.service';
import { BblRawPlayerPageLoaderService } from './bbl-raw-player-page-loader.service';
import { TpRawPlayerIndexService } from './tp-raw-player-index.service';
import { TpRawPlayerSkillsIndexService } from './tp-raw-player-skills-index.service';
import { TpSkillMasterNamesService } from './tp-skill-master-names.service';

/**
 * Reads each source's downloaded raw files. Loaders only locate and decode —
 * every interpretation of what they return lives in a data-type module.
 */
@Module({
  imports: [BblMirrorReaderModule],
  providers: [
    BblRawPlayerPageLoaderService,
    BblPlayerSkillsCellService,
    BblPlayerAdvancementsReaderService,
    TpRawPlayerIndexService,
    TpRawPlayerSkillsIndexService,
    TpSkillMasterNamesService,
  ],
  exports: [
    BblRawPlayerPageLoaderService,
    BblPlayerSkillsCellService,
    BblPlayerAdvancementsReaderService,
    TpRawPlayerIndexService,
    TpRawPlayerSkillsIndexService,
    TpSkillMasterNamesService,
  ],
})
export class SourceModule {}
