import type { PlayerKillEntry } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { PlayerKillsSectionService } from './player-kills-section.service';

const gougedEye = {
  teamId: 12,
  teamName: 'Gouged Eye',
  raceId: 5,
  raceName: 'Orc',
  coachId: 22,
  coachName: 'Grimly',
};
const championsOfDeath = {
  teamId: 13,
  teamName: 'Champions of Death',
  raceId: 6,
  raceName: 'Undead',
  coachId: 23,
  coachName: 'Mortis',
};
const chaosAllStars = {
  teamId: 14,
  teamName: 'Chaos All-Stars',
  raceId: 7,
  raceName: 'Chaos',
  coachId: 24,
  coachName: 'Nurgle',
};

const namedVictim: PlayerKillEntry = {
  kind: 'player',
  playerId: 88,
  playerName: 'Griff Oberwald',
  positionName: 'Blitzer',
  ...gougedEye,
  viaFoul: false,
};

describe('PlayerKillsSectionService', () => {
  let service: PlayerKillsSectionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PlayerKillsSectionService],
    }).compile();
    service = moduleRef.get(PlayerKillsSectionService);
  });

  /** The section for the given kills, with a roomy budget. */
  function build(kills: PlayerKillEntry[], killsTotal = kills.length) {
    return service.build({ kills, killsTotal, otherLines: ['Team: Reavers'] });
  }

  it('renders nothing at all when the player has killed nobody', () => {
    expect(build([])).toEqual({ lines: [], entries: [] });
  });

  it('renders a heading and one row per kill', () => {
    expect(build([namedVictim]).lines).toEqual([
      '',
      'Kills:',
      'Griff Oberwald (Blitzer, Gouged Eye, Orc, Grimly)',
    ]);
  });

  it('names the team when the victim is unidentified', () => {
    const kill: PlayerKillEntry = {
      kind: 'team',
      ...gougedEye,
      viaFoul: false,
    };

    expect(build([kill]).lines[2]).toBe(
      'An unidentified player from Gouged Eye (Orc, Grimly)',
    );
  });

  it('joins two candidate teams with "or"', () => {
    const kill: PlayerKillEntry = {
      kind: 'ambiguousTeams',
      teams: [gougedEye, championsOfDeath],
      viaFoul: false,
    };

    expect(build([kill]).lines[2]).toBe(
      'An unidentified player from Gouged Eye (Orc, Grimly) or Champions of Death (Undead, Mortis)',
    );
  });

  it('uses an Oxford comma for three or more candidate teams', () => {
    const kill: PlayerKillEntry = {
      kind: 'ambiguousTeams',
      teams: [gougedEye, championsOfDeath, chaosAllStars],
      viaFoul: false,
    };

    expect(build([kill]).lines[2]).toBe(
      'An unidentified player from Gouged Eye (Orc, Grimly), Champions of Death (Undead, Mortis), or Chaos All-Stars (Chaos, Nurgle)',
    );
  });

  it('falls back to mysterious circumstances when nothing is known', () => {
    const kill: PlayerKillEntry = { kind: 'unknown', viaFoul: false };

    expect(build([kill]).lines[2]).toBe(
      'An opponent, in mysterious circumstances',
    );
  });

  it('notes a kill inflicted by a foul', () => {
    expect(build([{ ...namedVictim, viaFoul: true }]).lines[2]).toBe(
      'Griff Oberwald (Blitzer, Gouged Eye, Orc, Grimly) (via a foul)',
    );
  });

  it('describes a death prevented by an apothecary', () => {
    const kill: PlayerKillEntry = {
      kind: 'prevented',
      ...gougedEye,
      avoidedBy: 'apothecary',
      viaFoul: false,
    };

    expect(build([kill]).lines[2]).toBe(
      'An unidentified player from Gouged Eye (Orc, Grimly), saved by an apothecary',
    );
  });

  it('describes a death prevented by regeneration', () => {
    const kill: PlayerKillEntry = {
      kind: 'prevented',
      ...gougedEye,
      avoidedBy: 'regeneration',
      viaFoul: false,
    };

    expect(build([kill]).lines[2]).toBe(
      'An unidentified player from Gouged Eye (Orc, Grimly), saved by regeneration',
    );
  });

  it('notes a foul-caused prevented death', () => {
    const kill: PlayerKillEntry = {
      kind: 'prevented',
      ...gougedEye,
      avoidedBy: 'apothecary',
      viaFoul: true,
    };

    expect(build([kill]).lines[2]).toBe(
      'An unidentified player from Gouged Eye (Orc, Grimly), saved by an apothecary (via a foul)',
    );
  });

  it('offers a player button for an identified victim', () => {
    expect(build([namedVictim]).entries).toEqual([
      {
        customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '88',
        label: 'Griff Oberwald',
      },
    ]);
  });

  it('offers a team button when only the victim side is known', () => {
    const kill: PlayerKillEntry = {
      kind: 'team',
      ...gougedEye,
      viaFoul: false,
    };

    expect(build([kill]).entries).toEqual([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '12',
        label: 'Gouged Eye',
      },
    ]);
  });

  it('offers one team button per candidate when the victim side is ambiguous', () => {
    const kill: PlayerKillEntry = {
      kind: 'ambiguousTeams',
      teams: [gougedEye, championsOfDeath],
      viaFoul: false,
    };

    expect(build([kill]).entries).toHaveLength(2);
  });

  it('offers no button at all for a fully unknown victim', () => {
    expect(build([{ kind: 'unknown', viaFoul: false }]).entries).toEqual([]);
  });

  it('offers a team button for a prevented death', () => {
    const kill: PlayerKillEntry = {
      kind: 'prevented',
      ...gougedEye,
      avoidedBy: 'apothecary',
      viaFoul: false,
    };

    expect(build([kill]).entries).toEqual([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '12',
        label: 'Gouged Eye',
      },
    ]);
  });

  it('adds an exact overflow note for kills beyond the fetched rows', () => {
    const section = build([namedVictim], 34);

    expect(section.lines[section.lines.length - 1]).toBe(
      '…and 33 more not shown.',
    );
  });

  it('trims rows that do not fit the remaining description budget, and counts them in the note', () => {
    // A near-full description leaves room for no kill rows at all; the section
    // must still say how many kills there were rather than reading as none.
    const section = service.build({
      kills: [namedVictim, namedVictim],
      killsTotal: 2,
      otherLines: ['x'.repeat(4050)],
    });

    expect(section.lines).toEqual(['', 'Kills:', '…and 2 more not shown.']);
    expect(section.entries).toEqual([]);
  });

  it('offers buttons only for the rows that survived trimming', () => {
    const section = service.build({
      kills: [namedVictim, namedVictim],
      killsTotal: 2,
      otherLines: ['x'.repeat(3958)],
    });

    expect(section.entries).toHaveLength(1);
    expect(section.lines[section.lines.length - 1]).toBe(
      '…and 1 more not shown.',
    );
  });
});
