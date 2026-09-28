# Homepage narrative and evidence contract

## Design and scope

The homepage connects the AI4Fusion product thesis to an experimental case: **learn within constraints, extend capability through validation, and evolve through operational feedback**. It does not expose a device-control API.

The homepage is a compact entry page, not a combined research application: fusion-energy concept and product thesis → six direct workspace links → a short provisional EXL-50U case teaser → contact. The hero links to the three-layer vision rather than embedding its detailed diagram.

White/ink surfaces, restrained violet plasma geometry and clear typographic hierarchy keep the opening screen concise. Detailed capabilities are preserved on independent pages:

| Route | Responsibility |
| --- | --- |
| `/` | Product thesis, conceptual energy animation, six functional entry links, provisional case teaser and contact |
| `/digital-prototype` | Full multi-device CAD/EFIT/diagnostic workspace; this route no longer redirects to the homepage |
| `/explore` | Ten knowledge domains, toolchains, digital-thread system map, roadmap and credited ITER photograph |
| `/vision` | Core principles and interactive three-layer architecture |
| `/control/exl50u` | Experimental case, statistics and provenance, timeline, VR link and digital-twin/RL feedback loop |

The entry page must not import or mount the CAD workspace, full research map, detailed ECharts case plot or the old expandable research application. Language/theme controls and public-anonymous access boundaries remain available on every route. Canonical capability and primary navigation links point directly to the new pages.

The light homepage palette is scoped by `.portalPage.fusionHome`, not the less-specific `.fusionHome`: it must outrank the existing `html .portalPage` theme bridge, which otherwise replaces `--fd-bg` with the inverse-background token and produces a dark canvas with dark text. Explicit `:root[data-theme='dark'] .fusionHome` still has higher specificity and retains the supported dark appearance. Keep this cascade boundary in the static style regression test and verify both appearances in the browser after CSS changes.

`HomeLegacyRedirect.tsx` preserves existing bookmarks with a small client-side hash compatibility layer: `/#prototype-workspace` → `/digital-prototype#prototype-workspace`; domain/tool anchors → `/explore`; architecture → `/vision`; case/learning anchors → `/control/exl50u`. It does not load the destination application on the homepage. With JavaScript disabled, the homepage still exposes direct links to all destination pages. CAD action runtime and viewer/catalog adapters use `/digital-prototype` as their shared canonical pathname and `/digital-prototype#prototype-workspace` for opening the workspace.

Research references (content structures reviewed 2026-09-28; no layouts or assets copied):

- https://addepar.com/ — value proposition, platform capabilities, evidence, cases, contact.
- https://veloalpha.cn/ — concise scientific narrative and device-oriented motion.
- https://www.proximafusion.com/ — separate engineering evidence from future plants.
- https://www.helionenergy.com/ — staged energy-conversion storytelling; its direct-conversion route is **not** the thermal-cycle schematic used here.
- https://cfs.energy/ — concrete engineering context.
- https://typeoneenergy.com/ — mission, technology and engineering progress.
- https://linear.app/ — coherent workflow and capability presentation.

## Scientific boundaries

The hero is a projected toroidal field-line **concept schematic**, not a reconstruction or a simulation result. It illustrates a future magnetic-confinement D–T thermal-cycle plant: external heating, alpha self-heating, neutron energy deposition in the blanket, heat extraction, thermal generation and net output after plant loads. It does not claim EXL-50U burning-plasma operation or electricity generation. Scientific background: https://www.iter.org/machine/blanket and https://www.iter.org/node/20687/turning-neutrons-electricity.

The architecture is a roadmap: agents propose candidates; twins calibrate and evaluate; approved frozen policies are executed by independent real-time systems. Human authorization, physics constraints, interlocks and fallback remain outside agent discretion. The depicted timescales are architectural roles/targets, not browser latency benchmarks or deployment certifications.

## EXL-50U chart: replace estimates before treating as experimental evidence

Source: four user-supplied presentation images and narrative provided on 2026-09-28. No original slide images or private shot files are redistributed. The user requested a merged Q4 bar and a provisional final estimate.

The user-supplied cumulative headline is **750+ successful takeovers**, with a proposed cutoff of **2026-09-30**. At authoring, this is a future cutoff and is not independently verified. Keep the visible provisional and shot-level-review labels until a reviewed dataset replaces the supplied claim.

| Period | Successful takeovers | Basis |
| --- | ---: | --- |
| 2025.07 | 8 | Approximate reading from the historical chart; period follows the updated user narrative, not its old Q2 label |
| 2025 Q4 | 44 | Merge Q4-1 (18) and Q4-2 (26); original total attempts 29 + 41 = 70 |
| 2026 Q1 | 64 | Historical chart |
| 2026 Q2–Q3 | about 634 | **Residual placeholder**, 750 − 8 − 44 − 64; not a measured stage count |

The last column includes the missing Q2 interval; do not relabel it as Q3 alone. On `/control/exl50u`, it has a distinct dashed/hatched rendering, a visible warning and an accessible data table. No failure counts or success rates are fabricated. The four unequal periods do not establish a scaling law. The case page explicitly calls that a research hypothesis and attributes operational progress to the team. The homepage only shows the 750+ team-reported headline with its provisional/cutoff/unverified label and a link to this detail page.

Editable chart numbers live in `app/components/home/home-content.ts`; bilingual detailed narrative and chart behavior in `FusionLanding.tsx`; the compact teaser lives in `app/page.tsx`. Replace source identity, cutoff, verification status, all stage totals, the homepage teaser and the associated disclaimer **together**, with shot-level deduplication, eligibility and success criteria. Never just remove the estimate label. `FusionHero.tsx` independently owns the conceptual animation so the root entry need not import detailed case charts or VR components.

## Acceptance and release

- Chinese and English server rendering on the entry and all four detail routes; a single main heading per page.
- Six real direct capability links; old device/domain bookmarks redirect to the dedicated pages without mounting their applications on the root.
- Original asset coverage, CAD/EFIT diagnostics, no-script evidence, photo credits and VR access are preserved on their new owning routes; no new direct protected-geometry download links.
- The case chart remains readable before JavaScript, on import failure and with assistive technology.
- Pause/step controls; reduced-motion support and off-screen animation suspension.
- Responsive layouts and existing theme controls; no new dependency or external image/font runtime.
- CAD agent actions navigate from the homepage to the prototype route before using an adapter; stale adapters on the homepage must not execute. Cancellation, receipts and undo behavior retain their existing tests.
- Only the homepage/detail-route split, directly affected navigation, contact and tests change. Existing independent work is not included.
- Formal release follows `AGENTS.md`, `docs/RELEASE.md` and `deploy/aliyun-hk/README.md`: exact-SHA checks, both Git remotes, isolated paired builds, Hong Kong source verification, DNS gates, Sites mirror and formal evidence gate. Local evidence remains outside the release checkout in the main checkout's ignored `work/local-ops` tree.
