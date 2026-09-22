# Release lifecycle

This repository keeps immutable contracts under top-level SchemaVer directories. The initial HFP v3 payload contract now lives under `3-0-0/`; shared tools default to that version. No active `draft/` exists until the next contract change starts. Each subsequent development cycle uses one mutable draft.

## Identity And Distribution

Each release has separate identity, source, and retrieval locations:

| Purpose                        | Form                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Canonical JSON Schema identity | `https://hsl.fi/schema/hfp/<SchemaVer>/hfp.schema.json`                        |
| Repository source              | `https://github.com/HSLdevcom/hfp-specification/tree/v<SchemaVer>/<SchemaVer>` |
| Schema download                | GitHub release asset under tag `v<SchemaVer>`                                  |
| Optional editor discovery      | SchemaStore catalog entry pointing to the immutable GitHub release asset       |

The canonical `$id` acts as an identifier. HSL does not need to serve content from that URI. Validators should download or package the schema separately, register it locally under its `$id`, and disable network retrieval during message validation.

For example, release `3-1-0` uses:

```text
$id: https://hsl.fi/schema/hfp/3-1-0/hfp.schema.json
tag: v3-1-0
asset: https://github.com/HSLdevcom/hfp-specification/releases/download/v3-1-0/hfp.schema.json
```

The `3-0-0/` directory contains the frozen schema, its source, examples, version documentation, automated `release-evidence.json`, and `manifest.json`. The manifest's `files` object maps sorted relative paths to SHA-256 digests of every version-local file except `manifest.json` itself. Local promotion does not create a Git tag, publish GitHub assets, or establish producer acceptance. Human semantic review, operational verification, and publication remain separate requirements; evidence must distinguish performed checks from unverified scope.

## Draft Development

The mutable contract always uses:

```text
draft/
```

Its event bodies require:

```json
{
  "schemaVersion": "DRAFT"
}
```

`DRAFT` deliberately does not match the released SchemaVer grammar. Draft payloads must never enter production or vendor output. The draft omits a canonical `$id`.

Work on short-lived branches. Recreate `draft/` only when the next contract change starts, and select it explicitly with `HFP_CONTRACT_DIRECTORY=draft`. Linear release history and one mutable draft remove any need for numbered candidate directories or multiple candidate levels.

## SchemaVer Classification

After changing the draft, replay the approved conforming historical corpus against it. Change only each historical payload's `schemaVersion` to `DRAFT`; preserve every other field and value.

HSL selected `3-0-0` for the first HFP v3 payload contract. Its promotion changes the draft identity to that exact version without changing the payload rules. Historical replay classifies subsequent contract changes.

Starting from `3-0-0`:

| Historical replay result      | Classification | Next version |
| ----------------------------- | -------------- | ------------ |
| Every eligible payload passes | ADDITION       | `3-0-1`      |
| Some pass and some fail       | REVISION       | `3-1-0`      |
| No eligible payload passes    | MODEL          | `4-0-0`      |

Replay supports classification but cannot detect changed meanings, units, time bases, identifier namespaces, or null semantics. Human semantic review and release approval remain mandatory. An empty or materially incomplete corpus does not establish compatibility by itself.

## Promotion

After approving the final SchemaVer, use the steps below. The first-promotion examples use `3-0-0`; substitute the approved exact version for subsequent promotions:

1. Format the draft and run every check with `HFP_CONTRACT_DIRECTORY=draft`.
2. Move `draft/` to the exact version directory, for example `git mv draft 3-0-0`.
3. Replace every `DRAFT` discriminator with `3-0-0`. Keep wrong-version examples invalid by assigning a different exact version and updating their registry entries.
4. Add `$id: https://hsl.fi/schema/hfp/3-0-0/hfp.schema.json`.
5. Update version titles, descriptions, examples, registries, and documentation. Set the TypeScript and Python tools' defaults to the newly promoted version; do not recreate a draft yet.
6. Regenerate `hfp.schema.json` with `HFP_CONTRACT_DIRECTORY=3-0-0 npm run bundle`.
7. Confirm that no `DRAFT` marker remains in the version directory.
8. Run reference and independent validators and exercise the documented producer workflow. Perform semantic checks, approved historical replay, and producer/consumer interoperability checks before claiming complete producer acceptance or publication readiness. Raw HFP v2 captures do not substitute for an approved conforming corpus.
9. Generate public `release-evidence.json`, recording performed checks, their provenance, and unverified scope. Generate `manifest.json` with sorted SHA-256 digests of every other version-local file. Human release review must consider the evidence and unresolved operational questions.
10. Merge the frozen release through the linear `main` history.
11. Create annotated tag `v3-0-0`.
12. Create an immutable GitHub release and attach at least `hfp.schema.json`, `manifest.json`, and release evidence.
13. Submit or update the optional SchemaStore catalog entry.
14. Recreate `draft/` from the new release only when the next contract change starts. Replace its exact discriminator with `DRAFT`, remove its canonical `$id` and release-only evidence/manifest, restore draft status, update wrong-version example expectations as needed, and regenerate the draft bundle. Never change the released directory.

Shared schema commands default to `3-0-0`. Validate that exact directory before tagging with:

```sh
HFP_CONTRACT_DIRECTORY=3-0-0 npm run check
HFP_CONTRACT_DIRECTORY=3-0-0 npm run bundle:check
HFP_CONTRACT_DIRECTORY=3-0-0 npm test
HFP_CONTRACT_DIRECTORY=3-0-0 npm run validate:examples
HFP_CONTRACT_DIRECTORY=3-0-0 npm run validate:independent
```

The exact-version directory does not move after promotion. Never edit its schema, source modules, examples, README, manifest, or other normative bytes after release. Publish nonnormative clarification outside the directory or as errata. A change in normative interpretation requires another SchemaVer.

## Git Tags

Use annotated tags that preserve SchemaVer's hyphenated spelling:

```text
v3-0-0
v3-0-1
v3-1-0
v4-0-0
```

Avoid dotted tags such as `v3.1.0`, which imply Semantic Versioning. Drafts use branches, pull requests, and commit hashes rather than prerelease wire versions.

## SchemaStore

SchemaStore can provide editor discovery while GitHub remains the authoritative distribution location. The preferred catalog entry points each exact version directly to its immutable GitHub release asset and uses an empty `fileMatch` because HFP messages arrive over MQTT rather than conventional files.

Illustrative catalog entry:

```json
{
  "name": "HSL High-frequency positioning messages",
  "description": "JSON Schema for HSL HFP MQTT message payloads",
  "fileMatch": [],
  "url": "https://github.com/HSLdevcom/hfp-specification/releases/download/v3-1-0/hfp.schema.json",
  "versions": {
    "3-0-0": "https://github.com/HSLdevcom/hfp-specification/releases/download/v3-0-0/hfp.schema.json",
    "3-1-0": "https://github.com/HSLdevcom/hfp-specification/releases/download/v3-1-0/hfp.schema.json"
  }
}
```

This lets editors obtain the schema through SchemaStore's catalog without creating another normative copy. A SchemaStore-hosted copy remains an acceptable fallback only when it preserves the released schema and HSL `$id` byte-for-byte.

SchemaStore currently recommends Draft 7 for broad editor support; Draft 2020-12 schemas require its newer-dialect configuration and may receive less uniform editor support. Submit each released schema with tests and preserve HFP's Draft 2020-12 contract rather than weakening it for catalog inclusion.

SchemaStore review runs independently from HFP publication. A delayed or rejected catalog update must not delay, rename, or redefine an HFP release.

## Retirement

Keep released directories, Git tags, GitHub release assets, and canonical `$id` assignments permanently. Operational support for an old version may end separately, but artifact history must remain available for delayed messages, audit, and consumer maintenance.
