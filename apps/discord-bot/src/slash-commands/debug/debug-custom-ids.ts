/**
 * Routing prefix for the `/debuginteractions` retrigger buttons. The dynamic
 * remainder is the `interaction_events.id` of the row the button sits under —
 * nothing else is encoded, because the kind, name and parameters are re-read
 * from the database when the button is clicked.
 *
 * Must not overlap any other registered prefix: `DiscordClientService` matches
 * component handlers by `startsWith`, first registered wins. The `debug:`
 * namespace keeps it clear of the `deepdive/button-custom-ids.ts` entity
 * prefixes.
 */
export const DEBUG_RETRIGGER_CUSTOM_ID_PREFIX = 'debug:retrigger:';
