# AI-native research sources

This directory contains the maintainable source records for the FusionDigital AI-native landscape.

## Files

- `sources/core_control_diagnostics.json`
- `sources/engineering_energy_aux.json`
- `sources/data_hmi_integration.json`
- `sources/*_notes.md`: research decisions, evidence boundaries and known gaps

The three JSON files use slightly different historical envelopes, but every work is normalized by `scripts/research/build_landscape.py`. Do not combine them manually into the generated website JSON.

## Canonical identity

- `id` identifies a source record.
- `projectId` identifies one unique work across source files.
- `primaryDomain` owns the canonical presentation.
- `relatedDomains` records cross-domain relevance without creating duplicate works.
- `parentProjectId` describes a related parent initiative; it does not automatically merge two projects.

## Generated outputs

Run:

```bash
npm run research:ai
```

This updates:

- `public/data/fusion-ai-native-landscape.json`
- `public/fusion-ai-native-paper-code-index.csv`
- `app/ai/aiResearch.ts`

The command then runs the structural audit. Review every generated diff before committing.

See `CONTRIBUTING.md` and `docs/CONTENT_MAINTENANCE.md` for the scientific evidence and code-status rules.
