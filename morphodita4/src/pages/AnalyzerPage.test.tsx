import { describe, expect, it } from 'vitest';

describe('AnalyzerPage log localization contract', () => {
  it('uses localized messages and operation labels for user-visible logs', () => {
    const nodeProcess = process as typeof process & {
      getBuiltinModule?: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule?.('fs')?.readFileSync(
      `${nodeProcess.cwd()}/src/pages/AnalyzerPage.tsx`,
      'utf8',
    ) ?? '';

    expect(source).toContain("t('analyzer.modelRequired'");
    expect(source).toContain("t('analyzer.inputRequired'");
    expect(source).toContain("t('analyzer.operationUnavailable'");
    expect(source).toContain("t('analyzer.operationStarted'");
    expect(source).toContain("t('analyzer.operationSuccess'");
    expect(source).toContain("t('analyzer.operationError'");
    expect(source).toContain("t('analyzer.exportSuccess'");
    expect(source).toContain('const operationLabel = t(`analyzer.operations.${operation}`)');
    for (const literal of ['Vyberte model pro analýzu.', 'Zadejte text k analýze.', 'Zahajuji operaci:', 'Operace úspěšně dokončena.', 'Chyba:', 'Export do']) {
      expect(source).not.toContain(literal);
    }
  });
});
