import { z } from 'zod';

/**
 * Schemas for the JSON5 settings both review tools' config services read.
 * Deliberately independent of packages/import: the review tools do not
 * depend on the importer packages, and that boundary is not worth crossing
 * for four one-line shapes.
 */

/**
 * A top-level group. Total by design: an absent or non-object value yields
 * an empty object, so each getter can raise its own per-field error rather
 * than one opaque "the file is wrong" failure.
 */
export const configGroupSchema = z.looseObject({}).catch({});

/** A required, non-empty string setting. */
export const nonEmptyStringSchema = z.string().min(1);

/** A positive-integer setting, such as a per-stratum sample size. */
export const positiveIntegerSchema = z.number().int().min(1);

/** An `overrides.<source>` list; entries are stringified by the caller. */
export const overrideIdsSchema = z.array(z.unknown());
