# FusionDigital daily research agent — phase-one architecture

> Current rollout: the scheduled workflow produces an offline, candidate-only
> rehearsal bundle. Live discovery, D1 ingestion, and publishing remain disabled
> until source-specific fetchers, reviewer operations, and release credentials
> pass their respective gates.

## Safety invariant

The agent can discover evidence and create `research_run` / `candidate_change`
records. It cannot mutate the public knowledge graph, generated research files,
or site pages. The application deliberately exposes no publish endpoint.
`accepted` means a reviewer agreed with a proposal; it does not mean released.

## Execution path

1. A scheduler starts an isolated run with an idempotency key.
2. Connectors read only sources whose exact HTTPS origin and scope appear in
   `research/agent/config.json`.
3. Each retrieved record is canonicalized and hashed. The connector persists a
   source cursor only after a complete run artifact is written.
4. Unchanged hashes are skipped. New, changed, and retired records become
   `add`, `update`, and `retire` candidates respectively.
5. Candidates enter `candidate`, then are explicitly submitted to
   `needs_review`. Only reviewer/admin principals can decide them.
6. Reviews are immutable and written in the same D1 batch as an optimistic
   candidate version update. The submitter cannot review their own candidate.
7. A future release service—not the research agent—will materialize accepted
   candidates and rebuild public snapshots.

## API boundary

- Every state-changing route requires SIWC authentication, role authorization,
  a same-origin request, bounded JSON, enum validation, and an append-only audit
  event.
- Creation requires an `Idempotency-Key`. Reusing a key with different payload
  semantics is a conflict rather than silently returning unrelated data.
- Review and submit requests require `expectedVersion`. Stale requests fail
  with 409 and never overwrite newer decisions.
- Listing is restricted to reviewer/admin and returns `Cache-Control: no-store`.
- D1 absence produces an explicit 503. The review page does not fabricate local
  data or crash during server rendering.

## Current scheduler

`.github/workflows/nightly-research.yml` runs an offline dry-run and uploads a
candidate bundle artifact. It has read-only repository permissions and verifies
that production research data did not change. Network discovery is intentionally
not enabled in phase one; fixture mode validates contracts without unbounded web
access. The workflow becomes operational only in a repository where scheduled
GitHub Actions are enabled.

## Long-running evolution

The hosted site request path should not perform long research jobs. The next
stage should deploy a separate Cloudflare Worker with Cron Triggers, Workflows
and Queues. Each source connector gets a queue, per-origin rate policy, timeout,
retry budget and dead-letter queue. Durable workflow state stores cursor leases,
while D1 remains the authoritative run/candidate/review store. Large snapshots
belong in R2 and are referenced by immutable hashes.

The worker should authenticate to one candidate-ingestion endpoint with a
rotatable, narrow-scoped service credential, never a reviewer credential.
Outbound requests should resolve only configured hosts, reject redirects to
unlisted origins, cap decompressed bytes, and record retrieval metadata. LLM
extraction remains untrusted: its structured output is schema-validated,
deduplicated and converted only to a candidate.

Before adding release automation, require: two-person review for high-risk
retire/unlink/safety/control changes; source snapshot retention; deterministic
rebuilds; signed release manifests; rollback/tombstone semantics; and monitored
SLOs for queue lag, connector errors, duplicate rate and reviewer latency.
