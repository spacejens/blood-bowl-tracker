/** True for both "not supplied" and "explicitly cleared". */
export const absent = (value: unknown): boolean =>
  value === undefined || value === null;
