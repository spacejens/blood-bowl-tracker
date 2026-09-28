import type { CompetitionType } from '@blood-bowl-tracker/api-contract';
import {
  CompetitionGroupsService,
  CompetitionsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { TpCompetitionGroupMatcherService } from './tp-competition-group-matcher.service';
import { TpCompetitionGroupPrecedentService } from './tp-competition-group-precedent.service';

/**
 * How a brand-new TP competition classifies: into exactly one curated group,
 * with the name and (when the group agrees on one) type derived from it --
 * or not confidently at all.
 */
export type TpCompetitionClassification =
  | {
      kind: 'classified';
      competitionGroupId: number;
      name: string;
      /** Undefined when the group's competitions disagree or there are none. */
      type: CompetitionType | undefined;
    }
  | { kind: 'unmatched' }
  | { kind: 'ambiguous'; groupNames: string[] };

/**
 * Classifies TP competitions against the curated competition groups: reads
 * the groups' name patterns and a group's existing competitions through
 * packages/game-data, and leaves the matching and derivation themselves to
 * the pure matcher and precedent services.
 */
@Injectable()
export class TpCompetitionClassifierService {
  constructor(
    private readonly groups: CompetitionGroupsService,
    private readonly competitions: CompetitionsService,
    private readonly matcher: TpCompetitionGroupMatcherService,
    private readonly precedent: TpCompetitionGroupPrecedentService,
  ) {}

  /**
   * Matches a competition not yet stored, by its raw TP name, to exactly one
   * group; a confident match also names it (numbered from the raw name when
   * possible) and, when the group's existing competitions (from any source)
   * all share one type, types it.
   */
  async classifyNew(rawName: string): Promise<TpCompetitionClassification> {
    const candidates = await this.groups.listWithNamePatterns();
    const match = this.matcher.match(rawName, candidates);
    if (match.kind !== 'matched') {
      return match;
    }
    const siblings = await this.competitions.listNamesAndTypesByGroup(
      match.group.id,
    );
    return {
      kind: 'classified',
      competitionGroupId: match.group.id,
      name: this.precedent.nextName({
        groupName: match.group.name,
        rawName,
        existingNames: siblings.map((sibling) => sibling.name),
      }),
      type: this.precedent.sharedType(siblings.map((sibling) => sibling.type)),
    };
  }

  /**
   * The type every OTHER competition in a stored competition's group shares,
   * or undefined when they disagree, there are none, or the competition
   * cannot be found. The competition's own row is excluded so a lone or
   * first group member can still self-correct its type from a widened date
   * range on a later overlay, rather than perpetually echoing its own
   * possibly-wrong stored type.
   */
  async sharedTypeOfCompetitionGroup(
    competitionId: number,
  ): Promise<CompetitionType | undefined> {
    const competitionGroupId =
      await this.competitions.findGroupIdById(competitionId);
    if (competitionGroupId === undefined) {
      return undefined;
    }
    const siblings =
      await this.competitions.listNamesAndTypesByGroup(competitionGroupId);
    const others = siblings.filter((sibling) => sibling.id !== competitionId);
    return this.precedent.sharedType(others.map((sibling) => sibling.type));
  }
}
