import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('typed locale registry supports Chinese and English with durable fallback', async () => {
  const [config, provider, messages] = await Promise.all([
    source('app/i18n/config.ts'),
    source('app/i18n/I18nProvider.tsx'),
    source('app/i18n/messages.ts'),
  ]);

  assert.match(config, /'zh-CN': \{/);
  assert.match(config, /en: \{/);
  assert.match(config, /DEFAULT_LOCALE: AppLocale = 'zh-CN'/);
  assert.match(config, /fusiondigital_locale/);
  assert.match(config, /fusiondigital:locale:v1/);
  assert.match(provider, /messages\[locale\]\?\.\[key\] \?\? messages\[DEFAULT_LOCALE\]\?\.\[key\] \?\? key/);
  assert.match(provider, /window\.localStorage\.setItem\(LOCALE_STORAGE_KEY, locale\)/);
  assert.match(provider, /document\.documentElement\.lang = definition\.htmlLang/);
  assert.match(provider, /const router = useRouter\(\)/);
  assert.match(provider, /persistClientPreference\(resolved\);[\s\S]*?router\.refresh\(\)/);
  assert.match(messages, /const en: Record<MessageKey, string>/);
  assert.match(messages, /'nav\.prototype': 'Prototype'/);
  assert.match(messages, /'nav\.control': 'Control'/);
  assert.match(messages, /'nav\.home': '\u4e3b\u9875\u6982\u89c8'/);
  assert.match(messages, /'nav\.home': 'Home'/);
  assert.match(messages, /'nav\.knowledge': 'Knowledge'/);
  assert.match(messages, /'nav\.roadmap': '路线规划'/);
  assert.match(messages, /'nav\.roadmap': 'Roadmap'/);
  assert.match(messages, /'nav\.more': 'More'/);
  assert.match(messages, /'efit\.play': 'Play'/);
  assert.match(messages, /'viewer\.fullscreen': 'Fullscreen'/);
});

test('root shell and navigation wire locale and theme preferences without changing routes', async () => {
  const [layout, nav, backLink, modules] = await Promise.all([
    source('app/layout.tsx'),
    source('app/components/SiteNav.tsx'),
    source('app/components/KnowledgeBackLink.tsx'),
    source('app/data/knowledge-modules.ts'),
  ]);

  assert.match(layout, /await cookies\(\)/);
  assert.match(layout, /cookieStore\.get\(LOCALE_COOKIE_NAME\)/);
  assert.match(layout, /<ThemeBootScript \/>/);
  assert.match(layout, /<ThemeProvider><I18nProvider initialLocale=\{initialLocale\}>/);
  assert.match(nav, /ThemeSwitcher/);
  assert.match(nav, /setLocale\(locale === 'zh-CN' \? 'en' : 'zh-CN'\)/);
  assert.match(nav, /t\('theme\.light'\)/);
  assert.match(nav, /key: 'prototype', href: '\/#prototype-workspace', label: 'nav\.prototype'/);
  assert.doesNotMatch(nav, /key: 'prototype', href: '\/digital-prototype'/);
  assert.match(nav, /selectVisibleNavigationKeys/);
  assert.match(nav, /new ResizeObserver\(update\)/);
  assert.match(nav, /window\.addEventListener\('resize', update\)/);
  assert.match(nav, /aria-haspopup="menu"/);
  assert.match(nav, /aria-expanded=\{moreOpen\}/);
  assert.match(nav, /document\.addEventListener\('pointerdown', closeOutside\)/);
  assert.match(nav, /document\.addEventListener\('pointerdown', closeKnowledgeOutside\)/);
  assert.match(nav, /document\.removeEventListener\('pointerdown', closeKnowledgeOutside\)/);
  assert.match(nav, /closeOpenDisclosuresOutside\(event\.target, \[knowledgeRef\.current, mobileKnowledgeRef\.current\]\)/);
  assert.match(nav, /event\.key === 'Escape'/);
  assert.match(nav, /aria-current=\{active === item\.key \? 'page' : undefined\}/);
  assert.match(nav, /data-nav-active=\{active === item\.key \? 'true' : undefined\}/);
  assert.match(nav, /const visibleItems = useMemo\([\s\S]*?links\.filter\(\(\{ key \}\) => visibleKeys\.includes\(key\)\)/);
  assert.match(nav, /const overflowItems = useMemo\([\s\S]*?links\.filter\(\(\{ key \}\) => !visibleKeys\.includes\(key\)\)/);
  assert.match(nav, /\{visibleItems\.map\(\(item\) => renderLink\(item\)\)\}/);
  assert.match(nav, /\{overflowItems\.map\(\(item\) => renderLink\(item, true\)\)\}/);
  assert.match(nav, /<div>\{links\.map\(\(item\) => renderLink\(item\)\)\}\{renderKnowledgeMenu\(true\)\}/);
  assert.match(nav, /import \{ knowledgeModules \} from '\.\.\/data\/knowledge-modules'/);
  assert.equal((modules.match(/no: '0[1-9]'|no: '10'/g) ?? []).length, 10);
  assert.match(nav, /data-knowledge-module=\{item\.id\}/);
  assert.match(nav, /className="siteKnowledgeGrid"/);
  assert.match(nav, /href="\/knowledge-graph"/);
  assert.match(backLink, /className="knowledgeBackLink"/);
  assert.match(backLink, /href="\/knowledge-graph"/);
  const primaryLinks = nav.match(/const links = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
  assert.match(primaryLinks, /key: 'home', href: '\/', label: 'nav\.home', priority: 0/);
  assert.match(primaryLinks, /key: 'facilities'/);
  assert.match(primaryLinks, /key: 'prototype'/);
  assert.match(primaryLinks, /key: 'roadmap'/);
  assert.doesNotMatch(primaryLinks, /key: '(?:physics|engineering|control|diagnostics|ai|resources)'/);
});

test('navigation selected state remains bold orange across page and theme overrides', async () => {
  const globals = await source('app/globals.css');
  assert.match(globals, /\.siteNav\.siteNav \.siteLinks > a\.active\[aria-current='page'\][\s\S]*?color: var\(--color-accent-strong\); font-weight: 900/);
  assert.match(globals, /\.siteNav\.siteNav \.siteMoreMenu a\.active\[aria-current='page'\]/);
  assert.match(globals, /\.siteNav\.siteNav \.mobileNav a\.active\[aria-current='page'\]/);
  assert.match(globals, /\.siteLinksMeasure > span\[data-nav-active='true'\] \{ font-weight: 900; \}/);
});

test('theme registry exposes system, Morandi light and dark modes with pre-hydration persistence', async () => {
  const [config, boot, provider, switcher, css] = await Promise.all([
    source('app/components/theme/theme-config.ts'),
    source('app/components/theme/ThemeBootScript.tsx'),
    source('app/components/theme/ThemeProvider.tsx'),
    source('app/components/theme/ThemeSwitcher.tsx'),
    source('app/theme.css'),
  ]);

  assert.match(config, /\['system', 'light', 'dark'\] as const/);
  assert.match(config, /fusiondigital\.theme/);
  assert.match(boot, /prefers-color-scheme: dark/);
  assert.match(boot, /fusiondigital-theme-init/);
  assert.match(provider, /window\.localStorage\.setItem\(THEME_STORAGE_KEY, nextPreference\)/);
  assert.match(provider, /media\.addEventListener\('change'/);
  assert.match(switcher, /role="radiogroup"/);
  assert.match(switcher, /role="radio"/);
  assert.match(switcher, /event\.key === 'ArrowRight'/);
  assert.match(css, /:root\[data-theme='light'\]/);
  assert.match(css, /--color-canvas: #f7f3ec/);
  assert.match(css, /--color-accent: #c86545/);
  assert.match(css, /--color-info: #718579/);
  assert.match(css, /:root\[data-theme='dark'\]/);
  assert.match(css, /--color-workbench: #070d0b/);
  assert.match(css, /@media \(prefers-contrast:more\)/);
  assert.match(css, /@media \(forced-colors:active\)/);
});

test('Morandi light mode covers legacy heroes, workspaces and filter modules', async () => {
  const [globals, surfaces] = await Promise.all([
    source('app/globals.css'),
    source('app/theme-legacy-surfaces.css'),
  ]);

  assert.match(globals, /@import "\.\/theme-legacy-surfaces\.css"/);
  for (const selector of [
    '.aiHero',
    '.catalogToolbar',
    '.facilitiesHero',
    '.searchConsole',
    '.accountDashboard',
    '.kgWorkspace',
    '.platformPage',
    '.reviewPage',
    '.controlCatalogToolbar',
    '.diagnosticsCatalogToolbar',
  ]) {
    assert.ok(
      surfaces.includes(`:root[data-theme='light'] ${selector}`),
      `${selector} must opt into the light semantic surface layer`,
    );
  }
  assert.match(surfaces, /var\(--color-surface-raised\)/);
  assert.match(surfaces, /var\(--color-info-soft\)/);
  assert.doesNotMatch(surfaces, /:root\[data-theme='dark'\]/);
});

test('knowledge graph explorer has distinct high-contrast light and dark surfaces with semantic tooltip fields', async () => {
  const [css, explorer, tooltip] = await Promise.all([
    source('app/knowledge-graph/knowledge-graph.css'),
    source('app/knowledge-graph/KnowledgeGraphExplorer.tsx'),
    source('app/knowledge-graph/knowledgeGraphTooltip.ts'),
  ]);

  for (const selector of [
    ":root[data-theme='light'] .kgPage",
    ":root[data-theme='light'] .kgFilters",
    ":root[data-theme='light'] .kgCanvasPanel",
    ":root[data-theme='light'] .kgDetail",
    ":root[data-theme='light'] .kgAccessibleList",
  ]) assert.ok(css.includes(selector), `missing light knowledge-graph surface: ${selector}`);
  for (const selector of [
    ":root[data-theme='dark'] .kgPage",
    ":root[data-theme='dark'] .kgFilters",
    ":root[data-theme='dark'] .kgCanvasPanel",
    ":root[data-theme='dark'] .kgDetail",
    ":root[data-theme='dark'] .kgAccessibleList",
  ]) assert.ok(css.includes(selector), `missing dark knowledge-graph surface: ${selector}`);
  assert.match(explorer, /const graphDomainPalettes/);
  assert.match(explorer, /textBorderWidth: 3/);
  assert.match(explorer, /fontWeight: 700/);
  assert.match(explorer, /chartTheme\.mode === 'dark' \? \.48 : \.6/);
  assert.match(explorer, /chartTheme\.mode === 'dark' \? \.42 : \.34/);
  assert.match(explorer, /entityLabel: label/);
  assert.match(explorer, /entityDescription: nodeDescription\(node, locale\)/);
  assert.match(explorer, /formatter: \(params: unknown\) => formatKnowledgeGraphTooltip\(params, locale\)/);
  assert.doesNotMatch(explorer, /node = p\.data as unknown as KnowledgeGraphNode/);
  assert.match(tooltip, /text\(data\.entityLabel/);
});

test('Morandi light mode covers every digital-prototype workspace shell while preserving dark tokens', async () => {
  const [theme, prototype, workspaceLayout, turntable] = await Promise.all([
    source('app/theme.css'),
    source('app/digital-prototype/prototype.css'),
    source('app/digital-prototype/workspace-layout.css'),
    source('app/digital-prototype/turntable.css'),
  ]);
  const prototypeStyles = `${prototype}\n${workspaceLayout}`;

  assert.match(theme, /:root,\s*:root\[data-theme='light'\][\s\S]*?--color-workbench: #eee8de/);
  assert.match(theme, /:root\[data-theme='dark'\][\s\S]*?--color-workbench: #070d0b/);
  assert.match(theme, /html :where\(\.prototypePage,\.portalPage\) \.devicePhysicsPanel[^\n]*background: var\(--color-workbench\)/);

  for (const selector of [
    '.multiDeviceSection',
    '.deviceSelector',
    '.deviceStage',
    '.deviceViewport',
    '.devicePaneSeparator',
    '.devicePhysicsPanel',
    '.controlledDevicePlaceholder',
  ]) {
    assert.ok(
      prototypeStyles.includes(`:root[data-theme='light'] .prototypePage ${selector}`)
        || prototypeStyles.includes(`:root[data-theme='light'] :where(.prototypePage,.portalPage) ${selector}`),
      `${selector} must expose an explicit light workbench surface`,
    );
  }

  assert.match(prototypeStyles, /@media\(max-width:1180px\)[\s\S]*?\.devicePaneSeparator\{display:none\}/);
  assert.match(workspaceLayout, /@media\(max-width:1100px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(workspaceLayout, /@media\(max-width:650px\)[\s\S]*?grid-template-columns:1fr!important/);
  assert.match(turntable, /:root\[data-theme='light'\] \.prototypePage \.turntableCanvas:before/);
  assert.doesNotMatch(turntable, /:root\[data-theme='dark'\]/);
});

test('digital prototype operational UI consumes the shared locale layer', async () => {
  const paths = [
    'app/digital-prototype/MultiDeviceWorkspace.tsx',
    'app/digital-prototype/TurntableDeviceViewer.tsx',
    'app/components/TokamakCadViewer.tsx',
    'app/components/efit/EfitPanel.tsx',
    'app/components/efit/EfitEquilibriumChart.tsx',
    'app/components/efit/EfitSignalsChart.tsx',
    'app/components/efit/EfitTimelineControls.tsx',
  ];
  const files = await Promise.all(paths.map(source));
  for (const [index, file] of files.entries()) {
    assert.match(file, /useI18n/, `${paths[index]} must use the shared locale layer`);
  }
});

test('homepage mounts one full prototype workspace and the legacy route redirects', async () => {
  const [home, legacyPage] = await Promise.all([
    source('app/page.tsx'),
    source('app/digital-prototype/page.tsx'),
  ]);

  assert.match(home, /<div className="prototypePage prototypePage--embedded">\s*<MultiDeviceWorkspace catalog=\{deviceCatalog\} \/>/);
  assert.match(home, /parseDeviceCatalog\(deviceCatalogJson\)/);
  assert.doesNotMatch(home, /<TokamakCadViewer|prototypePortalCta/);
  assert.match(legacyPage, /redirect\('\/#prototype-workspace'\)/);
  assert.doesNotMatch(legacyPage, /MultiDeviceWorkspace|DigitalPrototypeContent/);
});

test('scientific visualizations consume the resolved theme and redraw with semantic palettes', async () => {
  const [theme, scientific, systemMap, roadmap, efitCanvas, efitSignals, efitEquilibrium, roadmapCss] = await Promise.all([
    source('app/components/charts/chart-theme.ts'),
    source('app/components/charts/ScientificChart.tsx'),
    source('app/components/FusionTwinSystemMap.tsx'),
    source('app/components/PhaseOneRoadmap.tsx'),
    source('app/components/efit/EfitCanvasChart.tsx'),
    source('app/components/efit/EfitSignalsChart.tsx'),
    source('app/components/efit/EfitEquilibriumChart.tsx'),
    source('app/components/phase-one-roadmap.css'),
  ]);

  assert.match(theme, /PALETTES: Record<ChartThemePalette\['mode'\], ChartThemePalette>/);
  assert.match(theme, /applyScientificChartTheme/);
  assert.match(theme, /scientific series colours untouched/);
  assert.match(scientific, /useChartTheme\(\)/);
  assert.match(scientific, /chartRef\.current\.setOption\(\{ \.\.\.themedOption/);
  assert.match(scientific, /data-chart-theme=\{chartTheme\.mode\}/);
  assert.match(systemMap, /const chartTheme = useChartTheme\(\)/);
  assert.match(systemMap, /\[chartTheme, isEnglish, locale, phaseIndex, selectedModule, selectedPhase\]/);
  assert.match(roadmap, /chartTheme\.mode === 'dark'/);
  assert.match(roadmap, /\[chartTheme, isEnglish, selectedId\]/);
  assert.match(efitCanvas, /applyScientificChartTheme\(option, chartTheme\)/);
  assert.match(efitSignals, /const signalColors = useMemo\([\s\S]*chartTheme\.mode === 'dark'[\s\S]*\[chartTheme\.mode\]/);
  assert.match(efitEquilibrium, /chartTheme\.mode === 'dark'/);
  assert.match(roadmapCss, /:root\[data-theme='light'\] \.phaseOneRoadmap/);
});
