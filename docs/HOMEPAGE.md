# Homepage narrative and evidence contract

## Experience

The homepage communicates the AI4Fusion thesis: learn within constraints, validate before operation, and evolve with evidence. It is a narrative entry to existing applications, not a browser control system.

Homepage order: proton–boron energy concept and product thesis → FusionEvolve / FusionDigital / FusionControl architecture → EXL-50U reported results and stage chart → digital-twin / RL feedback loop → six direct workspace links → contact.

The homepage does not mount the CAD workspace, full research map or VR tour. Independent routes remain: /digital-prototype, /explore, /vision and /control/exl50u. The full case route reuses the same chart and metrics, adding the progression narrative and VR context.

HomeLegacyRedirect preserves old CAD/domain bookmarks. Architecture, case and learning-loop anchors now stay on the homepage. Language and light/dark theme controls remain available. The selector .portalPage.fusionHome must retain precedence over the global portal theme bridge.

## Three-layer relationship

- FusionEvolve: experts define goals and boundaries; agents propose experiments and orchestrate tools across devices.
- FusionDigital: experiment-calibrated models provide virtual experiments, reinforcement-learning training and policy evaluation. It connects proposals to verifiable evidence and updates models using device feedback.
- FusionControl: independent real-time execution of reviewed policies within limits, interlocks and fallback; returns actual signals and residuals to the twin and agent knowledge loop.

Architectural roles and timescales are a roadmap, not a certification that all capabilities are deployed. The website has no actuator write path.

## Energy concept

The hero is a functional energy-flow diagram, not reactor artwork, simulation output or a device reconstruction. It shows p + ¹¹B → 3α, confinement, external heating, alpha energy deposition/self-heating, radiation and transport losses, energy conversion, plant loads and future electricity.

Do not reintroduce the former D–T neutron/blanket chain. Do not promise zero radiation or absence of side reactions. Do not choose a direct-conversion or thermal-generation route without a reviewed engineering design. Burning plasma and electricity generation are future research goals, not demonstrated EXL-50U achievements. Net generation requires a verified energy balance.

Primary scientific background (not evidence for the supplied control statistics):
- ENN roadmap: https://arxiv.org/html/2401.11338v2 ; DOI https://doi.org/10.1063/5.0199112
- Burning-plasma definition: https://www.energy.gov/science/doe-explainsburning-plasma

Motion is optional: pause and stage controls, reduced-motion support and off-screen suspension. Narrow screens use readable HTML flow labels instead of shrinking SVG labels.

## Experimental results: supplied 2026-10-01

The current user-supplied summary is **700+ device discharges using the controller**, not 700+ successful takeovers. Reported shape error ≤2 cm; current error <10 kA; covered current plateaus 400–600 kA. The team reports support for locked-mode studies, high ion temperature and proton–boron fusion experiments. No unretrieved figure 3/4/6 or raw trace is fabricated. Error definitions, windows and shot-level coverage await supporting data; these metrics are not guarantees for every discharge.

| Source stage | Total | Success | Failed | Operation | Source rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2025 Q2 | 15 | 8 | 7 | 0 | 53% |
| 2025 Q4 | 70 | 44 | 19 | 7 | 70% |
| 2026 Q1 | 95 | 64 | 21 | 10 | 73% (unreconciled) |
| 2026 Q3 | 606 | 562 | 33 | 11 | 94% |
| Sum | 786 | 678 | 80 | 28 | not asserted |

The prior 750+ successful headline and 634 residual estimate are superseded. All figures are supplied evidence, not independently audited shot records. Received date is not the experimental cutoff. Operation retains its source name pending a definition.

Q1: 64/(64+21)=75.3%, not the source's 73%. Preserve reportedRate=73 and ratePending=true. Omit this point from the displayed rate line, do not connect across it, and show the discrepancy visibly. Other points reproduce source rates, not newly certified ratios. The source's 2025 Q2 initial label conflicts with an earlier July account; the progression narrative therefore does not assert a precise first-shot date. Growth does not establish a scaling law.

The user-authorized original chart is preserved at public/images/exl50u-control-20261001.png and displayed in an expandable source section with an accessible count table. Editable data live in home-content.ts; shared metrics/chart in ControlEvidence.tsx. Update homepage and case together.

## Design references

Previously reviewed for narrative structure, not copied assets/layouts: Addepar, Veloalpha, Proxima Fusion, Helion, CFS, Type One Energy and Linear. User chart is the only newly added raster asset; no social image or dependency change.

## Acceptance and release

- Chinese/English SSR, single h1, meaningful links, no heavy CAD or research application on home.
- Shared data totals 786/678/80/28, explicit Q1 discrepancy, no superseded placeholder.
- Source image, no-JS chart/table fallback, keyboard controls and mobile layout.
- Preserve public-anonymous boundaries, original science assets and CAD navigation.
- Exact-SHA check and asset validation, Codeup/GitHub synchronization, separate HK/Sites builds, source/HTTP/DNS/three-carrier checks and final pair gate follow AGENTS.md.
- All local test/release outputs remain outside release checkouts, under the main checkout's ignored work/local-ops directory.
