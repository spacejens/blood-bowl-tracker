/**
 * A skill association that does not hold together: the same (skill, rules
 * set) pair supplied twice in one batch, a starting skill naming a skill the
 * rules set does not have, or a starting skill for a position/rules-set pair
 * with no characteristics recorded yet.
 *
 * Authored-data feedback, not a server fault — the API maps it to BAD_REQUEST
 * so an importer reports it against the offending entry, exactly as it does
 * for CharacteristicFormatMismatchError.
 */
export class SkillValidationError extends Error {}
