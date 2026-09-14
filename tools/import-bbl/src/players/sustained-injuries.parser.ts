import { Injectable } from '@nestjs/common';

/**
 * A player's currently outstanding lasting injuries, as BBL's own player page
 * states them. Field names match the `players` columns and the contract's
 * lasting-injury group exactly, so the importer can spread this straight into
 * an `UpsertPlayer` payload.
 */
export interface BblLastingInjuries {
  missNextGame: boolean;
  nigglingInjuryCount: number;
  moveReductionCount: number;
  strengthReductionCount: number;
  agilityReductionCount: number;
  passingReductionCount: number;
  armourReductionCount: number;
}

/** Which counter each of BBL's five stat tags feeds. */
const COUNTER_BY_TAG: Readonly<
  Record<
    'MA' | 'ST' | 'AG' | 'PA' | 'AV',
    Exclude<keyof BblLastingInjuries, 'missNextGame' | 'nigglingInjuryCount'>
  >
> = {
  MA: 'moveReductionCount',
  ST: 'strengthReductionCount',
  AG: 'agilityReductionCount',
  PA: 'passingReductionCount',
  AV: 'armourReductionCount',
};

/** BBL's literal miss-next-game sentence. */
const MISS_NEXT_GAME = 'Must miss the next match due to injury';

/**
 * A stat tag and, if present, the suffix saying the rules absorbed it. The
 * suffix is optional and captured, so one pass finds every tag and knows
 * which of them actually moved a characteristic.
 */
const STAT_TAG = /-(MA|ST|AG|PA|AV)(\s*\(no effect\))?/g;

/**
 * The niggling-injury count. The player page spells it "niggling inj.", the
 * `p=mp&act=inj` sub-page abbreviates it "niggl."; both are accepted so this
 * parser is not tied to one of BBL's two renderings of the same field.
 */
const NIGGLING = /(\d+)\s*niggl/;

/**
 * Reads BBL's free-text "Sustained Injuries" field into the six lasting-injury
 * values. The field states the player's LIVE state directly — which is the
 * whole reason it is worth parsing, since a career tally of injury events
 * cannot tell you what is still outstanding under rules sets that let these
 * heal.
 *
 * Deliberately tolerant, because this is scraped prose and an unrecognised
 * fragment is not worth failing a player's whole import over: anything the
 * grammar below does not describe (a legacy named injury such as "Smashed
 * Hip", the DEATH! marker, stray punctuation) is simply not counted. Death in
 * particular is out of scope for this feature by design.
 *
 * A tag suffixed "(no effect)" is NOT counted: it means the stat was already
 * at its floor, or at the rules' cap on reductions, so the stored
 * characteristic never moved — and these columns carry the effective
 * magnitude of the current reduction, not an occurrence tally. It is also not
 * treated as a miss-next-game: BBL prints its own miss-next-game line
 * whenever one applies, and pages exist that carry "(no effect)" without it
 * (e.g. pid 2381), so inferring one would contradict the source.
 *
 * Pure text in, plain object out: no cheerio, no I/O, no collaborators. The
 * caller flattens the cell's markup to text first.
 */
@Injectable()
export class SustainedInjuriesParser {
  parse(text: string): BblLastingInjuries {
    const injuries: BblLastingInjuries = {
      missNextGame: text.includes(MISS_NEXT_GAME),
      nigglingInjuryCount: 0,
      moveReductionCount: 0,
      strengthReductionCount: 0,
      agilityReductionCount: 0,
      passingReductionCount: 0,
      armourReductionCount: 0,
    };

    const niggling = NIGGLING.exec(text);
    if (niggling) {
      injuries.nigglingInjuryCount = Number.parseInt(niggling[1], 10);
    }

    for (const match of text.matchAll(STAT_TAG)) {
      const [, tag, absorbed] = match;
      if (absorbed !== undefined) {
        continue;
      }
      const counter = COUNTER_BY_TAG[tag as 'MA' | 'ST' | 'AG' | 'PA' | 'AV'];
      injuries[counter] += 1;
    }

    return injuries;
  }
}
