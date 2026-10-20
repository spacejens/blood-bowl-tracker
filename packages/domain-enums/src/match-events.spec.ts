import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  ActionType,
  ConsequenceAvoidedBy,
  ConsequenceType,
  EventType,
  SecretObjective,
  SppEarningActionType,
  UnidentifiedParticipantKind,
  WeatherType,
} from './match-events';
import {
  ACTION_TYPES,
  CONSEQUENCE_AVOIDED_BY_VALUES,
  CONSEQUENCE_TYPES,
  EVENT_TYPES,
  SECRET_OBJECTIVES,
  SPP_EARNING_ACTION_TYPES,
  UNIDENTIFIED_PARTICIPANT_KINDS,
  WEATHER_TYPES,
} from './match-events';

describe('ACTION_TYPES', () => {
  it('lists every action type in schema order', () => {
    expect(ACTION_TYPES).toEqual([
      'touchdown',
      'completion',
      'interception',
      'deflection',
      'foul',
      'mvp_award',
      'casualty',
      'badly_hurt',
      'serious_injury',
      'death',
      'inducements',
      'winnings',
      'fan_factor',
      'journeymen_signings',
      'prayers_to_nuffle',
      'secret_objective',
      'successful_landing',
      'throw_team_mate',
      'catch',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(ACTION_TYPES).size).toBe(ACTION_TYPES.length);
  });

  it('types ActionType as exactly its listed values', () => {
    expectTypeOf<ActionType>().toEqualTypeOf<
      | 'touchdown'
      | 'completion'
      | 'interception'
      | 'deflection'
      | 'foul'
      | 'mvp_award'
      | 'casualty'
      | 'badly_hurt'
      | 'serious_injury'
      | 'death'
      | 'inducements'
      | 'winnings'
      | 'fan_factor'
      | 'journeymen_signings'
      | 'prayers_to_nuffle'
      | 'secret_objective'
      | 'successful_landing'
      | 'throw_team_mate'
      | 'catch'
    >();
  });
});

describe('CONSEQUENCE_TYPES', () => {
  it('lists every consequence type in schema order', () => {
    expect(CONSEQUENCE_TYPES).toEqual([
      'casualty',
      'badly_hurt',
      'serious_injury',
      'miss_next_game',
      'niggling_injury',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
      'death',
      'sent_off',
      'expensive_mistake',
      'concession',
      'dedicated_fans',
      'casualty_avoided',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(CONSEQUENCE_TYPES).size).toBe(CONSEQUENCE_TYPES.length);
  });

  it('types ConsequenceType as exactly its listed values', () => {
    expectTypeOf<ConsequenceType>().toEqualTypeOf<
      | 'casualty'
      | 'badly_hurt'
      | 'serious_injury'
      | 'miss_next_game'
      | 'niggling_injury'
      | 'stat_reduction_ma'
      | 'stat_reduction_st'
      | 'stat_reduction_ag'
      | 'stat_reduction_av'
      | 'stat_reduction_pa'
      | 'death'
      | 'sent_off'
      | 'expensive_mistake'
      | 'concession'
      | 'dedicated_fans'
      | 'casualty_avoided'
    >();
  });
});

describe('UNIDENTIFIED_PARTICIPANT_KINDS', () => {
  it('lists every unidentified participant kind in schema order', () => {
    expect(UNIDENTIFIED_PARTICIPANT_KINDS).toEqual([
      'journeyman',
      'mercenary',
      'mercenary_or_star',
      'fans_or_random_event',
      'mercenary_or_fans_or_random_event',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(UNIDENTIFIED_PARTICIPANT_KINDS).size).toBe(
      UNIDENTIFIED_PARTICIPANT_KINDS.length,
    );
  });

  it('types UnidentifiedParticipantKind as exactly its listed values', () => {
    expectTypeOf<UnidentifiedParticipantKind>().toEqualTypeOf<
      | 'journeyman'
      | 'mercenary'
      | 'mercenary_or_star'
      | 'fans_or_random_event'
      | 'mercenary_or_fans_or_random_event'
    >();
  });
});

describe('CONSEQUENCE_AVOIDED_BY_VALUES', () => {
  it('lists every way a casualty can be avoided, in schema order', () => {
    expect(CONSEQUENCE_AVOIDED_BY_VALUES).toEqual([
      'apothecary',
      'regeneration',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(CONSEQUENCE_AVOIDED_BY_VALUES).size).toBe(
      CONSEQUENCE_AVOIDED_BY_VALUES.length,
    );
  });

  it('types ConsequenceAvoidedBy as exactly its listed values', () => {
    expectTypeOf<ConsequenceAvoidedBy>().toEqualTypeOf<
      'apothecary' | 'regeneration'
    >();
  });
});

describe('EVENT_TYPES', () => {
  it('lists every event type in schema order', () => {
    expect(EVENT_TYPES).toEqual(['weather']);
  });

  it('has no duplicate values', () => {
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length);
  });

  it('types EventType as exactly its listed values', () => {
    expectTypeOf<EventType>().toEqualTypeOf<'weather'>();
  });
});

describe('WEATHER_TYPES', () => {
  it('lists every weather type in schema order', () => {
    expect(WEATHER_TYPES).toEqual([
      'dungeon',
      'sweltering_heat',
      'very_sunny',
      'nice',
      'pouring_rain',
      'blizzard',
      'morning_dew',
      'blossoming_flowers',
      'misty_morning',
      'high_winds',
      'perfect_conditions',
      'melting_astrogranite',
      'blinding_rays',
      'monsoon',
      'leaf_strewn_pitch',
      'autumnal_chill',
      'strong_winds',
      'cold_winds',
      'freezing',
      'heavy_snow',
      'unknown',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(WEATHER_TYPES).size).toBe(WEATHER_TYPES.length);
  });

  it('types WeatherType as exactly its listed values', () => {
    expectTypeOf<WeatherType>().toEqualTypeOf<
      | 'dungeon'
      | 'sweltering_heat'
      | 'very_sunny'
      | 'nice'
      | 'pouring_rain'
      | 'blizzard'
      | 'morning_dew'
      | 'blossoming_flowers'
      | 'misty_morning'
      | 'high_winds'
      | 'perfect_conditions'
      | 'melting_astrogranite'
      | 'blinding_rays'
      | 'monsoon'
      | 'leaf_strewn_pitch'
      | 'autumnal_chill'
      | 'strong_winds'
      | 'cold_winds'
      | 'freezing'
      | 'heavy_snow'
      | 'unknown'
    >();
  });
});

describe('SECRET_OBJECTIVES', () => {
  it('lists every secret objective in schema order', () => {
    expect(SECRET_OBJECTIVES).toEqual([
      'red_card',
      'didnt_need_them_anyway',
      'going_alone',
      'fouling_frenzy',
      'going_surfing',
      'ganging_up',
      'whoops',
      'not_so_fast',
      'timely_tackle',
      'precision_passing',
      'hit_em_hard',
      'just_a_little_further',
      'go_long',
      'nuffle_favors_the_bold',
      'all_according_to_plan',
      'headtaker',
      'unknown',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(SECRET_OBJECTIVES).size).toBe(SECRET_OBJECTIVES.length);
  });

  it('types SecretObjective as exactly its listed values', () => {
    expectTypeOf<SecretObjective>().toEqualTypeOf<
      | 'red_card'
      | 'didnt_need_them_anyway'
      | 'going_alone'
      | 'fouling_frenzy'
      | 'going_surfing'
      | 'ganging_up'
      | 'whoops'
      | 'not_so_fast'
      | 'timely_tackle'
      | 'precision_passing'
      | 'hit_em_hard'
      | 'just_a_little_further'
      | 'go_long'
      | 'nuffle_favors_the_bold'
      | 'all_according_to_plan'
      | 'headtaker'
      | 'unknown'
    >();
  });
});

describe('SPP_EARNING_ACTION_TYPES', () => {
  it('lists every action type that earns SPP under the standardised table', () => {
    expect(SPP_EARNING_ACTION_TYPES).toEqual([
      'touchdown',
      'completion',
      'interception',
      'deflection',
      'mvp_award',
      'casualty',
      'badly_hurt',
      'serious_injury',
      'death',
    ]);
  });

  it('is a subset of ACTION_TYPES', () => {
    for (const type of SPP_EARNING_ACTION_TYPES) {
      expect(ACTION_TYPES).toContain(type);
    }
  });

  it('excludes foul, which earns no SPP', () => {
    expect(SPP_EARNING_ACTION_TYPES).not.toContain('foul');
  });

  it('has no duplicate values', () => {
    expect(new Set(SPP_EARNING_ACTION_TYPES).size).toBe(
      SPP_EARNING_ACTION_TYPES.length,
    );
  });

  it('types SppEarningActionType as exactly its listed values', () => {
    expectTypeOf<SppEarningActionType>().toEqualTypeOf<
      | 'touchdown'
      | 'completion'
      | 'interception'
      | 'deflection'
      | 'mvp_award'
      | 'casualty'
      | 'badly_hurt'
      | 'serious_injury'
      | 'death'
    >();
  });
});
