/**
 * A lasting-injury payload that disagrees with its own shape: a partial
 * all-or-nothing group, or a negative count where a nonnegative integer is
 * required. Thrown by `PlayerLastingInjuryValidationService.validate`
 * (`PlayersService.upsert`'s lasting-injury counterpart to
 * `CharacteristicFormatMismatchError`).
 *
 * Authored-data feedback, not a server fault — the API maps it to BAD_REQUEST
 * so an importer reports it against the offending entry.
 */
export class LastingInjuryValidationError extends Error {}
