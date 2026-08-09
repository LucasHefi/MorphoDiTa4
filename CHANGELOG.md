# Changelog

All notable changes to MorphoDiTa Client are recorded here.

## Release policy

- Versions use Semantic Versioning (`MAJOR.MINOR.PATCH`).
- `morphodita4/release-metadata.json` is the canonical release-version source.
- `npm run version:check` must pass before a package is produced.
- Every release entry records user-visible changes, verification evidence, and
  known platform or licensing limitations.
- A Linux `.deb` is a test artifact and is not evidence of Windows readiness.
- Model licenses and application licensing are reported separately.

## [Unreleased]

- Production distribution approval for the CC BY-NC-SA model and Windows
  release evidence remain open.
- The current Linux candidate has fresh frontend/Rust quality-gate, offline
  no-network, packaged-sidecar, and isolated native-launch evidence; see the
  Linux release procedure and Huly MDT-94 for the exact artifact readback.

## [0.1.0] - 2026-07-24

- Established the initial canonical release metadata and Linux test-package
  policy.
- Added explicit model provenance and license separation.
