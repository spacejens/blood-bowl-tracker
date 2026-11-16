import type { PlayerStatus } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type {
  CandidateRow,
  CharacteristicLine,
  FillAdvancement,
  FillEntry,
  PositionProfile,
  StoredAdvancementRow,
} from './fill-plan.types';

export interface EntryParts {
  candidate: CandidateRow;
  line: CharacteristicLine;
  profile: PositionProfile;
  sppTotal: number;
  unspentSpp: number;
  status: PlayerStatus;
  advancements: FillAdvancement[];
}

export interface ContradictionCheck {
  candidate: CandidateRow;
  stored: readonly StoredAdvancementRow[];
  profile: PositionProfile;
  /** The line the entry writes. */
  line: CharacteristicLine;
  /** The unspent SPP the entry writes. */
  unspentSpp: number;
}

/**
 * Builds a fill entry, says whether anything already stored would make the
 * server refuse it, and settles the status a fill writes.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class FillEntryBuilderService {
  build(parts: EntryParts): FillEntry {
    const { candidate, line, profile } = parts;
    return {
      player: { system: 'tourplay.net', id: candidate.tpId },
      ...(candidate.isJourneyman ? { journeyman: true as const } : {}),
      status: parts.status,
      characteristics: {
        ma: line.ma,
        st: line.st,
        ag: line.ag,
        ...(line.pa === null ? {} : { pa: line.pa }),
        av: line.av,
      },
      sppTotal: parts.sppTotal,
      unspentSpp: parts.unspentSpp,
      startingSkills: profile.skills.map((skill) =>
        skill.attributeValue === null
          ? { system: 'Name', id: skill.nameId }
          : {
              skill: { system: 'Name', id: skill.nameId },
              attributeValue: skill.attributeValue,
            },
      ),
      advancements: parts.advancements,
    };
  }

  /**
   * Whether anything already stored would make the server refuse the entry:
   * a non-zero MA/ST/AG/AV or a stored PA that differs from the line, a
   * stored unspent SPP other than the entry's, a stored gained advancement,
   * or a stored starting skill the position does not list.
   */
  contradicts(check: ContradictionCheck): boolean {
    const { candidate, stored, profile, line } = check;
    const pairs: [number, number][] = [
      [candidate.move, line.ma],
      [candidate.strength, line.st],
      [candidate.agility, line.ag],
      [candidate.armour, line.av],
    ];
    if (pairs.some(([value, entry]) => value !== 0 && value !== entry)) {
      return true;
    }
    if (candidate.passing !== null && candidate.passing !== line.pa) {
      return true;
    }
    if (
      candidate.unspentSpp !== null &&
      candidate.unspentSpp !== check.unspentSpp
    ) {
      return true;
    }
    return stored.some(
      (row) =>
        row.source !== 'starting' ||
        !profile.skills.some(
          (skill) =>
            skill.skillId === row.skillId &&
            skill.attributeValue === row.attributeValue,
        ),
    );
  }

  /**
   * The stored status, else dead when a death is recorded, else retired: a
   * player of a team in no ongoing competition plays no more.
   */
  status(candidate: CandidateRow, dead: boolean): PlayerStatus {
    if (candidate.status !== null) {
      return candidate.status;
    }
    return dead ? 'dead' : 'retired';
  }
}
