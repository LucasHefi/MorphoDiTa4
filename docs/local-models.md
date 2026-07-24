# Local model inventory and import

The local model inventory is deliberately separate from bundled Tauri resources.

- Bundled resources are resolved with `resolveResource('models')` and are used by the packaged offline sidecar.
- User-managed models are stored below Tauri `appDataDir()/models`.
- Inventory scans only direct child directories of that app-data `models` directory. It does not recursively scan arbitrary user files.

Typical user-model locations are:

- Linux: `${XDG_DATA_HOME:-$HOME/.local/share}/cz.ufal.morphodita/models`
- Windows: `%LOCALAPPDATA%\cz.ufal.morphodita\models`
- macOS: `$HOME/Library/Application Support/cz.ufal.morphodita/models`

The Tauri-resolved path is authoritative on each platform.

## Model directory contract

An importable model directory contains:

- `model.json` with `schemaVersion: 1`, `id`, `version`, `language`, and `artifact`;
- `sourceUrl`, SPDX `license` metadata, a non-empty `notices` file list, and
  `serverCompatibility` with a minimum and optional maximum server version;
- exactly one non-empty `.mor` artifact named by `artifact`;
- declared root-level `README*`, `LICENSE*`, or `NOTICE*` files.

The manifest `id` and artifact name must be safe single path components. Directory traversal, control characters, symlinks, nested directories, malformed JSON, an unsupported manifest schema, a missing artifact, multiple `.mor` artifacts, or an empty artifact are rejected.

Inventory returns valid models with:

- model id, language and description;
- manifest version;
- artifact size in bytes;
- SHA-256 artifact hash;
- source URL, license/notices, and supported server-version range;
- resolved model path and manifest data.

Invalid existing directories are returned as explicit rejected entries with a reason; they are not silently treated as valid models.

## Atomic import

`importLocalModel(sourceDirectory)` reads only the selected source directory. It validates the complete model before publishing anything, copies only the manifest, declared artifact, and supported notice files to an app-data temporary directory, and publishes the directory with a same-parent rename.

An existing target model id is rejected by `importLocalModel`. `updateLocalModel`
is the explicit update path: it accepts only a strictly newer semantic version,
stages the new files first, swaps the old directory through a rollback directory,
and removes the rollback copy only after the new directory is published. Failed
copies restore the old directory where possible. Consequently, a partial or
corrupt import cannot appear in the local inventory, and an existing model is
not overwritten implicitly.

`assertModelCompatible` and the optional `serverVersion` arguments to inventory
and import reject activation/use when the declared server version is outside the
manifest range. Unknown or malformed versions fail closed.

The current slices verify inventory, successful atomic publication, rejected
partial input, hash/size reporting, provenance/license/notices, duplicate
rejection, newer-version update, incompatible-server rejection, and exclusion
of unrelated files. Runtime sidecar version discovery and UI presentation remain
separate integration work.
