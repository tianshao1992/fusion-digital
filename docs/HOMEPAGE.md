# Homepage narrative and evidence contract

## Design and scope

The homepage connects the AI4Fusion product thesis to an experimental case: **learn within constraints, extend capability through validation, and evolve through operational feedback**. It does not expose a device-control API.

Page order: fusion-energy concept → three principles → three-layer architecture → six existing capabilities → expandable research workspace → EXL-50U case → digital-twin/RL feedback loop → contact.

White/ink surfaces, restrained violet plasma geometry, thin chart axes and clear typographic hierarchy replace a dense opening screen. Existing CAD/EFIT workspaces, ten knowledge domains, roadmap, VR tour, language/theme controls and anonymous-access boundaries remain available. The original `/#prototype-workspace` and knowledge-domain anchors are preserved inside a disclosure which opens on deep linking.

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

The last column includes the missing Q2 interval; do not relabel it as Q3 alone. It has a distinct dashed/hatched rendering, a visible warning and an accessible data table. No failure counts or success rates are fabricated. The four unequal periods do not establish a scaling law. The page explicitly calls that a research hypothesis and attributes operational progress to the team.

Editable numbers live in `app/components/home/home-content.ts`; bilingual narrative and chart behavior in `FusionLanding.tsx`. Replace source identity, cutoff, verification status, all stage totals and the associated disclaimer **together**, with shot-level deduplication, eligibility and success criteria. Never just remove the estimate label.

## Acceptance and release

- Chinese and English server rendering; a single main heading.
- Six real capability links, old device/domain anchors, photo credits and VR tour preserved.
- Chart remains readable before JavaScript, on import failure and with assistive technology.
- Pause/step controls; reduced-motion support and off-screen animation suspension.
- Responsive layouts and existing theme controls; no new dependency or external image/font runtime.
- Only homepage, contact, metadata and directly affected tests change. Existing independent work is not included.
- Formal release follows `AGENTS.md`, `docs/RELEASE.md` and `deploy/aliyun-hk/README.md`: exact-SHA checks, both Git remotes, isolated paired builds, Hong Kong source verification, DNS gates, Sites mirror and formal evidence gate. Local evidence remains outside the release checkout in the main checkout's ignored `work/local-ops` tree.
