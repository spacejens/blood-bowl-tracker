/** Whether the player rolled the advancement or picked it. */
export type TpFeedAdvancementSelection = 'random' | 'chosen';

export type TpFeedAdvancementCategory =
  'primary' | 'secondary' | 'characteristics';

export type TpFeedCharacteristic = 'MA' | 'ST' | 'AG' | 'PA' | 'AV';

/** What the advancement gave the player, as the report words it. */
export type TpFeedAdvancementGain =
  | { readonly skill: string }
  | {
      readonly characteristic: TpFeedCharacteristic;
      /** As the report shows it, e.g. `+1` for `+1 AG`. */
      readonly delta: number;
    };

/** `` `#6` Grimgor Ironhide *(Black Orc)* `` */
export interface TpFeedPlayerLine {
  readonly playerNumber: string;
  readonly playerName: string;
  readonly position: string;
}

/**
 * One parsed advancement report. `gain` is null when the value text is not
 * understood; `selection`, `category` and `sppCost` are null too when none of
 * the value text's shape matched.
 */
export interface TpFeedAdvancement extends TpFeedPlayerLine {
  readonly teamName: string;
  /** The roster page, from the embed author's url. */
  readonly rosterLink: string;
  readonly selection: TpFeedAdvancementSelection | null;
  readonly category: TpFeedAdvancementCategory | null;
  readonly gain: TpFeedAdvancementGain | null;
  /** The number after the star. */
  readonly sppCost: number | null;
  /** The field value with backticks removed and whitespace collapsed. */
  readonly valueText: string;
  /** The field value exactly as TP wrote it. */
  readonly rawValue: string;
}

/** The embed part that was missing or did not match the expected shape. */
export type TpFeedAdvancementFailedField =
  'player field' | 'footer.text' | 'author.url' | 'field value';

export type TpFeedAdvancementParseResult =
  | { readonly ok: true; readonly advancement: TpFeedAdvancement }
  | { readonly ok: false; readonly failedField: TpFeedAdvancementFailedField };
