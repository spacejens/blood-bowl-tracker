import type { PositionCharacteristics } from '@blood-bowl-tracker/game-data';
import { CharacteristicDisplayFormattingService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PositionCharacteristicsLineFormatterService } from './position-characteristics-line-formatter.service';

const bb2020: PositionCharacteristics = {
  rulesSetId: 2,
  rulesSetName: 'BB2020',
  moveFormat: 'bare',
  move: 7,
  strengthFormat: 'bare',
  strength: 3,
  agilityFormat: 'plus',
  agility: 3,
  passingFormat: 'plus',
  passing: 4,
  armourFormat: 'plus',
  armour: 9,
};

const bb2016: PositionCharacteristics = {
  rulesSetId: 1,
  rulesSetName: 'BB2016',
  moveFormat: 'bare',
  move: 7,
  strengthFormat: 'bare',
  strength: 3,
  agilityFormat: 'bare',
  agility: 3,
  passingFormat: 'absent',
  passing: null,
  armourFormat: 'bare',
  armour: 8,
};

describe('PositionCharacteristicsLineFormatterService', () => {
  let service: PositionCharacteristicsLineFormatterService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionCharacteristicsLineFormatterService,
        // Real: a pure, dependency-free formatting service, per CLAUDE.md's
        // carve-out. Mocking it would leave the rendered stat line — the
        // whole output of this service — unasserted.
        CharacteristicDisplayFormattingService,
      ],
    }).compile();
    service = moduleRef.get(PositionCharacteristicsLineFormatterService);
  });

  it("renders every characteristic in that rules set's declared format", () => {
    expect(service.formatLine(bb2020)).toBe(
      'BB2020: MA 7 ST 3 AG 3+ PA 4+ AV 9+',
    );
  });

  it('omits Passing entirely for a rules set that has no Passing characteristic', () => {
    expect(service.formatLine(bb2016)).toBe('BB2016: MA 7 ST 3 AG 3 AV 8');
  });

  it('renders any zero as a dash (uncurated placeholder or a deliberately-hidden real plus_zero_legal value)', () => {
    expect(service.formatLine({ ...bb2020, move: 0 })).toBe(
      'BB2020: MA — ST 3 AG 3+ PA 4+ AV 9+',
    );
  });

  it('renders a null Passing value as a dash when the rules set does have Passing', () => {
    expect(service.formatLine({ ...bb2020, passing: null })).toBe(
      'BB2020: MA 7 ST 3 AG 3+ PA — AV 9+',
    );
  });
});
