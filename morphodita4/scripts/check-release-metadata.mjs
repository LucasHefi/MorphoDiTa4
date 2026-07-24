#!/usr/bin/env node
import { readReleaseMetadata, validateReleaseMetadata } from './releaseMetadata.mjs';

try {
  const metadata = await readReleaseMetadata();
  const report = validateReleaseMetadata(metadata);
  console.log(JSON.stringify({ status: 'PASS', ...report }, null, 2));
  if (report.openGates.length > 0) {
    console.error(`OPEN release gates: ${report.openGates.join(', ')}`);
  }
} catch (error) {
  console.error(JSON.stringify({
    status: 'FAIL',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
}
