/** The import sources this tool can review data from. */
export type ReviewSource = 'bbl' | 'tp';

/** Every source, in the order the report presents them. */
export const REVIEW_SOURCES: readonly ReviewSource[] = ['bbl', 'tp'];
