/**
 * Characteristics that disagree with what their rules set declares: a value
 * supplied for a characteristic the rules set does not have, a missing value
 * for one it does, or a rules set that does not exist at all. Thrown for
 * positions (`PositionRulesSetsService.sync`) and for players
 * (`PlayersService.upsert`) alike.
 *
 * Authored-data feedback, not a server fault — the API maps it to BAD_REQUEST
 * so an importer reports it against the offending entry.
 */
export class CharacteristicFormatMismatchError extends Error {}
