/** One backup object in the bucket, as `list` reports it. */
export interface StoredBackup {
  readonly key: string;
  readonly sizeBytes: number;
  /** ISO-8601 UTC upload time, as the bucket reports it. */
  readonly lastModified: string;
}
