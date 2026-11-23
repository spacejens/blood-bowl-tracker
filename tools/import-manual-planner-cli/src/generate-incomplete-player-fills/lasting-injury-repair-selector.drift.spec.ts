import type {
  PositionCharacteristicsContext,
  ReductionsInput,
} from '@blood-bowl-tracker/game-data';
import {
  PlayerFillReductionsService,
  PositionRulesSetsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import type {
  CharacteristicFormats,
  CharacteristicKey,
  LastingInjuryRepairCandidate,
  RepairRulesSetContext,
} from './fill-plan.types';
import { LastingInjuryRepairSelectorService } from './lasting-injury-repair-selector.service';

const BB2020: CharacteristicFormats = {
  ma: 'bare',
  st: 'bare',
  ag: 'plus',
  pa: 'plus',
  av: 'plus',
};
const BB2016: CharacteristicFormats = {
  ma: 'bare',
  st: 'bare',
  ag: 'bare',
  pa: 'absent',
  av: 'bare',
};
const START = { ma: 6, st: 3, ag: 3, pa: 4, av: 9 };

const SERVER_INCREASE = {
  ma: 'MA',
  st: 'ST',
  ag: 'AG',
  pa: 'PA',
  av: 'AV',
} as const;

interface Case {
  name: string;
  candidate: LastingInjuryRepairCandidate;
}

function candidate(
  line: LastingInjuryRepairCandidate['line'],
  increases: CharacteristicKey[],
  context: RepairRulesSetContext | null = {
    formats: BB2020,
    baseline: { ...START },
  },
): LastingInjuryRepairCandidate {
  return {
    player: { system: 'tourplay.net', id: '1' },
    line,
    increases,
    context,
  };
}

const CASES: Case[] = [
  { name: 'unchanged', candidate: candidate({ ...START }, []) },
  { name: 'AV one worse', candidate: candidate({ ...START, av: 8 }, []) },
  { name: 'MA increase undone', candidate: candidate({ ...START }, ['ma']) },
  {
    name: 'ST increase kept',
    candidate: candidate({ ...START, st: 4 }, ['st']),
  },
  {
    name: 'AG target worse and PA increase undone',
    candidate: candidate({ ...START, ag: 4 }, ['pa']),
  },
  {
    name: 'PA target one worse',
    candidate: candidate({ ...START, pa: 5 }, []),
  },
  {
    name: 'PA target improved by its increase',
    candidate: candidate({ ...START, pa: 3 }, ['pa']),
  },
  {
    name: 'PA target better than start under plus_zero_legal',
    candidate: candidate({ ...START, pa: 3 }, [], {
      formats: { ...BB2020, pa: 'plus_zero_legal' },
      baseline: { ...START },
    }),
  },
  {
    name: 'AG better than start',
    candidate: candidate({ ...START, ag: 2 }, []),
  },
  {
    name: 'bare AG worse under BB2016',
    candidate: candidate({ ...START, ag: 2, pa: null }, [], {
      formats: BB2016,
      baseline: { ...START, pa: null },
    }),
  },
  {
    name: 'two increases, one undone',
    candidate: candidate({ ...START, av: 10 }, ['av', 'av']),
  },
  {
    name: 'no start line',
    candidate: candidate({ ...START, av: 8 }, [], {
      formats: BB2020,
      baseline: null,
    }),
  },
  {
    name: 'null start PA',
    candidate: candidate({ ...START, pa: 5 }, [], {
      formats: BB2020,
      baseline: { ...START, pa: null },
    }),
  },
  {
    name: 'null PA with a PA increase',
    candidate: candidate({ ...START, pa: null }, ['pa']),
  },
  {
    name: 'absent AV format',
    candidate: candidate({ ...START, av: 8 }, [], {
      formats: { ...BB2020, av: 'absent' },
      baseline: { ...START },
    }),
  },
  {
    name: 'no rules set',
    candidate: candidate({ ...START, av: 8 }, [], null),
  },
];

/** The context PositionRulesSetsService would resolve for the candidate. */
function serverContext(
  context: RepairRulesSetContext | null,
): PositionCharacteristicsContext | undefined {
  if (context === null) return undefined;
  const { baseline, formats } = context;
  return {
    rulesSetId: 7,
    moveFormat: formats.ma,
    strengthFormat: formats.st,
    agilityFormat: formats.ag,
    passingFormat: formats.pa,
    armourFormat: formats.av,
    baseline:
      baseline === null
        ? undefined
        : {
            move: baseline.ma,
            strength: baseline.st,
            agility: baseline.ag,
            passing: baseline.pa,
            armour: baseline.av,
          },
  };
}

function serverInput(row: LastingInjuryRepairCandidate): ReductionsInput {
  return {
    positionId: 30,
    eraId: 4,
    line: {
      move: row.line.ma,
      strength: row.line.st,
      agility: row.line.ag,
      passing: row.line.pa,
      armour: row.line.av,
    },
    increases: row.increases.map((key) => SERVER_INCREASE[key]),
  };
}

describe('LastingInjuryRepairSelectorService against game-data', () => {
  let selector: LastingInjuryRepairSelectorService;
  let server: PlayerFillReductionsService;
  let positionRulesSets: MockProxy<PositionRulesSetsService>;

  beforeEach(async () => {
    positionRulesSets = mock<PositionRulesSetsService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        LastingInjuryRepairSelectorService,
        PlayerFillReductionsService,
        { provide: PositionRulesSetsService, useValue: positionRulesSets },
      ],
    }).compile();
    selector = moduleRef.get(LastingInjuryRepairSelectorService);
    server = moduleRef.get(PlayerFillReductionsService);
  });

  it.each(CASES)(
    'derives the counts the server records: $name',
    async ({ candidate: row }) => {
      positionRulesSets.findCharacteristicsContext.mockResolvedValue(
        serverContext(row.context),
      );
      const derived = await server.derive(serverInput(row));

      expect(selector.derive(row)).toEqual({
        ma: derived.moveReductionCount,
        st: derived.strengthReductionCount,
        ag: derived.agilityReductionCount,
        pa: derived.passingReductionCount,
        av: derived.armourReductionCount,
      });
    },
  );
});
