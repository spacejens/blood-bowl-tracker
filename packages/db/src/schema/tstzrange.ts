import { customType } from 'drizzle-orm/pg-core';

export const tstzrange = customType<{ data: string }>({
  dataType() {
    return 'tstzrange';
  },
});
