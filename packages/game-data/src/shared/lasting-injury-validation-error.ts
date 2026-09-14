/**
 * A lasting-injury payload that disagrees with its own shape: a partial
 * all-or-nothing group, or a negative count where a nonnegative integer is
 * required. Thrown by `PlayerLastingInjuryValidationService.validate`
 * (`PlayersService.upsert`'s lasting-injury counterpart to
 * `CharacteristicFormatMismatchError`).
 *
 * Unlike `CharacteristicFormatMismatchError`, this error is not exported from
 * this package's index and is not classified by
 * `UpsertHandlerService` — it is only reachable from a direct in-process
 * `PlayersService.upsert` call, since `UpsertPlayerSchema`'s zod schema
 * already rejects both failure shapes (negative counts via
 * `.int().nonnegative()`, and the all-or-nothing violation via its
 * `superRefine`) at the RPC boundary before this validator is ever reached
 * from that path.
 */
export class LastingInjuryValidationError extends Error {}
