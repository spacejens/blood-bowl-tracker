export interface ColumnShape {
  name: string;
  sqlType: string;
  notNull: boolean;
}

const VARCHAR_PATTERN = /^varchar\((\d+)\)$/;
const NUMERIC_PATTERN = /^numeric\((\d+),\s*(\d+)\)$/;

function widerType(previousType: string, currentType: string): string | undefined {
  if (previousType === currentType) return currentType;

  const previousVarchar = VARCHAR_PATTERN.exec(previousType);
  const currentVarchar = VARCHAR_PATTERN.exec(currentType);
  if (previousVarchar && currentVarchar) {
    const previousLength = Number(previousVarchar[1]);
    const currentLength = Number(currentVarchar[1]);
    return currentLength >= previousLength ? currentType : undefined;
  }

  const previousNumeric = NUMERIC_PATTERN.exec(previousType);
  const currentNumeric = NUMERIC_PATTERN.exec(currentType);
  if (previousNumeric && currentNumeric) {
    const previousPrecision = Number(previousNumeric[1]);
    const currentPrecision = Number(currentNumeric[1]);
    return currentPrecision >= previousPrecision ? currentType : undefined;
  }

  return undefined;
}

export function foldHistoryColumn(
  previous: ColumnShape | undefined,
  current: ColumnShape | undefined,
): ColumnShape | undefined {
  if (!current) {
    return previous ? { ...previous, notNull: false } : undefined;
  }
  if (!previous) {
    return current;
  }
  const widened = widerType(previous.sqlType, current.sqlType);
  return {
    name: current.name,
    sqlType: widened ?? previous.sqlType,
    notNull: current.notNull,
  };
}

export function deriveHistoryColumnShapes(
  currentColumns: ColumnShape[],
  previousColumns: ColumnShape[],
): ColumnShape[] {
  const previousByName = new Map(previousColumns.map((column) => [column.name, column]));
  const currentByName = new Map(currentColumns.map((column) => [column.name, column]));
  const allNames = new Set<string>([...previousByName.keys(), ...currentByName.keys()]);

  const result: ColumnShape[] = [];
  for (const name of allNames) {
    const folded = foldHistoryColumn(previousByName.get(name), currentByName.get(name));
    if (folded) result.push(folded);
  }
  return result;
}
