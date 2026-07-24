export const DATABASE_PAGE_SIZE = 50;

export function canEditDatabaseColumn(editable?: boolean): boolean {
  return editable === true;
}

export function hasExpectedAffectedRows(affectedRows: number, expectedRows = 1): boolean {
  return Number.isSafeInteger(affectedRows) && affectedRows === expectedRows;
}
