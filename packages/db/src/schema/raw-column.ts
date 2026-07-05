import { customType } from 'drizzle-orm/pg-core';

export const rawColumn = customType<{
  data: unknown;
  config: { sqlType: string };
  configRequired: true;
}>({
  dataType(config) {
    return config.sqlType;
  },
});
