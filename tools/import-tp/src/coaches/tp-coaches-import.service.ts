import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CoachesImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NAF_EXTERNAL_SYSTEM,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import type { TpCoach } from '@blood-bowl-tracker/parse-tp';
import { InscriptionsParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpSourceReader } from '../source/tp-source-reader';

/** External system db ids resolved during bootstrap, in TP/Name/NAF order. */
interface SystemIds {
  tp: number;
  name: number;
  naf: number;
}

@Injectable()
export class TpCoachesImportService {
  constructor(
    private readonly sourceReader: TpSourceReader,
    private readonly inscriptionsParser: InscriptionsParserService,
    private readonly coachesImport: CoachesImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Import every coach registered to a TP competition. Coaches come from each
   * competition's `inscriptions_<slug>_inscriptions.json` file (streamed via
   * TpSourceReader, filtered to `type === 'inscriptions'`), deduped globally by
   * TP's stable `player.id`, and upserted under three external systems: TP
   * (canonical, keyed by `player.id`), Name (keyed by the coach's name), and —
   * only when a NAF number is present — NAF (keyed by the stringified number).
   * A parse failure on one inscriptions file is recorded and the scan
   * continues; a throw from files() is recorded and coaches found so far are
   * still imported. Idempotent.
   *
   * Also returns `coachIdsByTpId`, mapping each imported coach's TP id to its
   * DB id — unused by this sub-issue, but the hook #196's team import needs to
   * resolve each team's coachId (mirroring competitionIdsByTpId).
   */
  async importCoaches(): Promise<{
    result: ImportResult;
    coachIdsByTpId: Map<string, number>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const coachIdsByTpId = new Map<string, number>();

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const systemNames = [
      { name: tpSystemName, category: 'imported_data_source' as const },
      NAME_EXTERNAL_SYSTEM,
      NAF_EXTERNAL_SYSTEM,
    ];
    const bootstrap = await this.externalSystemBootstrap.bootstrap(systemNames);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        coachIdsByTpId,
      };
    }
    const [tp, name, naf] = bootstrap.ids;
    const systemIds: SystemIds = { tp, name, naf };

    const coaches = await this.collectCoaches(errors);
    const seen = new Set<string>();
    for (const coach of coaches) {
      if (seen.has(coach.id)) {
        continue;
      }
      seen.add(coach.id);
      const upserted = await this.coachesImport.upsertCoach(
        {
          name: coach.name,
          externalIds: this.buildExternalIds(coach, systemIds),
        },
        errors,
      );
      if (upserted) {
        coachIdsByTpId.set(coach.id, upserted.id);
        imported += 1;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      coachIdsByTpId,
    };
  }

  /**
   * Single streaming pass over every source file, parsing each inscriptions
   * file into coaches. A per-file parse failure is recorded and skipped; a
   * throw from files() is recorded and the coaches collected so far returned —
   * mirroring TpCompetitionsImportService.collectGroups.
   */
  private async collectCoaches(errors: ImportError[]): Promise<TpCoach[]> {
    const coaches: TpCoach[] = [];
    try {
      for await (const file of this.sourceReader.files()) {
        if (file.type !== 'inscriptions') {
          continue;
        }
        try {
          coaches.push(...this.inscriptionsParser.parseCoaches(file.content));
        } catch (error) {
          errors.push(
            this.importResults.error({
              item: {
                era: file.era,
                competition: file.competition,
                filename: file.filename,
              },
              message:
                `Could not parse inscriptions file "${file.filename}" in ` +
                `"${file.era}/${file.competition}": ` +
                `${error instanceof Error ? error.message : String(error)}`,
            }),
          );
        }
      }
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { scan: 'inscriptions files' },
          message:
            'Could not complete the inscriptions file scan: ' +
            `${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    }
    return coaches;
  }

  /** TP + Name external ids always; NAF only when the coach has a nafNumber. */
  private buildExternalIds(coach: TpCoach, systemIds: SystemIds) {
    const externalIds = [
      { externalSystemId: systemIds.tp, externalId: coach.id },
      {
        externalSystemId: systemIds.name,
        externalId: this.nameExternalId.forCoach(coach.name),
      },
    ];
    if (coach.nafNumber !== undefined) {
      externalIds.push({
        externalSystemId: systemIds.naf,
        externalId: String(coach.nafNumber),
      });
    }
    return externalIds;
  }
}
