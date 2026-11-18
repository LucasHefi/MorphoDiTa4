import { readReleaseMetadata, validateReleaseMetadata } from './releaseMetadata.mjs';
const metadata = await readReleaseMetadata();
validateReleaseMetadata(metadata);
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (tag !== `v${metadata.version}`) throw new Error(`Release tag ${tag} must match v${metadata.version}`);
console.log(`PASS: ${tag}`);
