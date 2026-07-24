import { describe, expect, it } from 'vitest';
import {
  DATABASE_PAGE_SIZE,
  canEditDatabaseColumn,
  hasExpectedAffectedRows,
} from './databaseEditorContracts';

describe('database editor contracts', () => {
  it('uses bounded server-side pages', () => {
    expect(DATABASE_PAGE_SIZE).toBe(50);
  });

  it('allows inline editing only for explicitly editable columns', () => {
    expect(canEditDatabaseColumn(true)).toBe(true);
    expect(canEditDatabaseColumn(false)).toBe(false);
    expect(canEditDatabaseColumn(undefined)).toBe(false);
  });

  it('accepts only the expected affected-row count', () => {
    expect(hasExpectedAffectedRows(1)).toBe(true);
    expect(hasExpectedAffectedRows(0)).toBe(false);
    expect(hasExpectedAffectedRows(2)).toBe(false);
  });
});
