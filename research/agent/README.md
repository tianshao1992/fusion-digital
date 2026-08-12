# Daily research agent

This directory is the versioned control plane for the candidate-only research
agent. `config.json` is the source allowlist. `cursors.json` records committed
source checkpoints. Generated run bundles are written under `artifacts/` and
are ignored by Git except when a workflow intentionally uploads them.

The agent does not have a publish operation. Its output contract is a research
run plus `add`, `update`, or `retire` candidates. An accepted candidate is still
not public content; a separate, admin-owned release process must apply it.

Run a deterministic offline rehearsal with:

```sh
node scripts/research/agent/discover.mjs --dry-run --scope diagnostics
```

Use `--fixture path/to/records.json` to exercise candidate classification. The
fixture must contain an array of records with `sourceId`, `sourceUrl`,
`externalId`, `targetType`, `title`, and optional `content`, `targetId`,
`existingHash`, or `retired` fields. Live network discovery is deliberately not
implemented in this first stage.
