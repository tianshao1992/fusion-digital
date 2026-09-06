'use client';

import Link from 'next/link';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { SITES_WORKSPACE_ORIGIN } from '../agent/capabilities';
import { knowledgeModules } from '../data/knowledge-modules';
import { useI18n } from '../i18n';
import { isPublicAnonymousMode } from '../deployment-mode';
import BrandWordmark from './BrandWordmark';
import { selectVisibleNavigationKeys } from './site-nav-layout';
import { ThemeSwitcher, type ThemeSwitcherLabels } from './theme';

type SiteNavProps = {
  active?: 'home' | 'physics' | 'engineering' | 'control' | 'diagnostics' | 'data' | 'fusionData' | 'ai' | 'facilities' | 'prototype' | 'knowledge' | 'roadmap' | 'account' | 'platform';
};

const links = [
  { key: 'home', href: '/', label: 'nav.home', priority: 0 },
  { key: 'facilities', href: '/facilities', label: 'nav.facilities', priority: 1 },
  { key: 'prototype', href: '/#prototype-workspace', label: 'nav.prototype', priority: 1 },
  { key: 'fusionData', href: '/fusion-data', label: 'nav.fusionData', priority: 1 },
  { key: 'roadmap', href: '/roadmap', label: 'nav.roadmap', priority: 1 },
] as const;

type NavigationLink = (typeof links)[number];

export function closeOpenDisclosuresOutside<TTarget>(
  target: TTarget,
  disclosures: ReadonlyArray<{
    open: boolean;
    contains: (candidate: TTarget) => boolean;
  } | null>,
) {
  for (const disclosure of disclosures) {
    if (disclosure?.open && !disclosure.contains(target)) disclosure.open = false;
  }
}

export default function SiteNav({active = 'home'}: SiteNavProps) {
  const publicAnonymousMode = isPublicAnonymousMode();
  const { locale, setLocale, t } = useI18n();
  const menuId = useId();
  const linksShellRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const knowledgeRef = useRef<HTMLDetailsElement>(null);
  const mobileKnowledgeRef = useRef<HTMLDetailsElement>(null);
  // SSR deliberately exposes every destination. JavaScript then contracts the
  // row after measuring it, while no-script visitors retain a complete nav.
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => links.map(({ key }) => key));
  const [moreOpen, setMoreOpen] = useState(false);
  const themeLabels: ThemeSwitcherLabels = {
    group: t('theme.group'),
    system: t('theme.system'),
    light: t('theme.light'),
    dark: t('theme.dark'),
  };
  const localeButton = (className = 'siteLocaleSwitch') => <button
    type="button"
    className={className}
    aria-label={t('locale.switchTo')}
    title={t('locale.current')}
    onClick={() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')}
  >{locale === 'zh-CN' ? 'EN' : 'ZH'}</button>;

  const visibleItems = useMemo(
    () => links.filter(({ key }) => visibleKeys.includes(key)),
    [visibleKeys],
  );
  const overflowItems = useMemo(
    () => links.filter(({ key }) => !visibleKeys.includes(key)),
    [visibleKeys],
  );
  const overflowContainsActive = overflowItems.some(({ key }) => key === active);

  useEffect(() => {
    const shell = linksShellRef.current;
    const visibleLinks = linksRef.current;
    const measure = measureRef.current;
    if (!shell || !visibleLinks || !measure) return;

    const update = () => {
      const measuredItems = Array.from(measure.querySelectorAll<HTMLElement>('[data-nav-key]'))
        .map((node) => {
          const item = links.find(({ key }) => key === node.dataset.navKey);
          return item ? { key: item.key, priority: item.priority, width: node.getBoundingClientRect().width } : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      const moreWidth = measure.querySelector<HTMLElement>('[data-nav-more]')?.getBoundingClientRect().width ?? 0;
      const styles = window.getComputedStyle(visibleLinks);
      const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
      const nextKeys = selectVisibleNavigationKeys({
        items: measuredItems,
        availableWidth: shell.clientWidth,
        gap,
        moreWidth,
        activeKey: active,
      });
      setVisibleKeys((current) => current.length === nextKeys.length && current.every((key, index) => key === nextKeys[index])
        ? current
        : nextKeys);
    };

    update();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    resizeObserver?.observe(shell);
    if (!resizeObserver) window.addEventListener('resize', update);
    document.fonts?.ready.then(update).catch(() => undefined);
    return () => {
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', update);
    };
  }, [active, locale]);

  useEffect(() => {
    const closeKnowledgeOutside = (event: PointerEvent | FocusEvent) => {
      if (!(event.target instanceof Node)) return;
      closeOpenDisclosuresOutside(event.target, [knowledgeRef.current, mobileKnowledgeRef.current]);
    };
    document.addEventListener('pointerdown', closeKnowledgeOutside);
    document.addEventListener('focusin', closeKnowledgeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeKnowledgeOutside);
      document.removeEventListener('focusin', closeKnowledgeOutside);
    };
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOutside = (event: PointerEvent | FocusEvent) => {
      if (event.target instanceof Node && !moreRef.current?.contains(event.target)) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (overflowItems.length > 0 || !moreOpen) return;
    const frame = requestAnimationFrame(() => setMoreOpen(false));
    return () => cancelAnimationFrame(frame);
  }, [moreOpen, overflowItems.length]);

  const focusOverflowItem = (index: number) => {
    requestAnimationFrame(() => {
      const items = moreRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (!items?.length) return;
      items[(index + items.length) % items.length]?.focus();
    });
  };

  const handleMoreButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setMoreOpen(true);
    focusOverflowItem(event.key === 'ArrowDown' ? 0 : -1);
  };

  const handleMoreMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = currentIndex + 1;
    else if (event.key === 'ArrowUp') nextIndex = currentIndex - 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = items.length - 1;
    else if (event.key === 'Escape') {
      event.preventDefault();
      setMoreOpen(false);
      moreRef.current?.querySelector<HTMLButtonElement>('.siteMoreButton')?.focus();
      return;
    }
    if (nextIndex === null || items.length === 0) return;
    event.preventDefault();
    items[(nextIndex + items.length) % items.length]?.focus();
  };

  const renderLink = (item: NavigationLink, menuItem = false) => <Link
    className={active === item.key ? 'active' : ''}
    href={item.href}
    key={item.key}
    aria-current={active === item.key ? 'page' : undefined}
    role={menuItem ? 'menuitem' : undefined}
    tabIndex={menuItem ? -1 : undefined}
    data-primary-nav={item.key}
    onClick={menuItem ? () => setMoreOpen(false) : undefined}
  >{t(item.label)}</Link>;

  const renderKnowledgeMenu = (mobile = false) => <details
    className={mobile ? 'mobileKnowledgeNav' : 'siteKnowledgeNav'}
    data-primary-nav="knowledge"
    ref={mobile ? mobileKnowledgeRef : knowledgeRef}
  >
    <summary className={active === 'knowledge' ? 'active' : ''} aria-label={t('nav.knowledgeModules')}>
      {t('nav.knowledge')}<span aria-hidden="true">⌄</span>
    </summary>
    <div className="siteKnowledgeMenu">
      <Link
        className={`siteKnowledgeHome${active === 'knowledge' ? ' active' : ''}`}
        href="/knowledge-graph"
        aria-current={active === 'knowledge' ? 'page' : undefined}
        onClick={() => {
          const disclosure = mobile ? mobileKnowledgeRef.current : knowledgeRef.current;
          if (disclosure) disclosure.open = false;
        }}
      >
        <span aria-hidden="true">←</span><b>{t('nav.knowledgeHome')}</b>
      </Link>
      <p>{t('nav.knowledgeModules')}</p>
      <div className="siteKnowledgeGrid">
        {knowledgeModules.map((item) => <Link
          href={item.href}
          key={item.id}
          data-knowledge-module={item.id}
          className={active === item.id ? 'active' : ''}
          onClick={() => {
            const disclosure = mobile ? mobileKnowledgeRef.current : knowledgeRef.current;
            if (disclosure) disclosure.open = false;
          }}
        ><small>{item.no}</small><span>{locale === 'zh-CN' ? item.zh : item.en}</span></Link>)}
      </div>
    </div>
  </details>;

  const renderAccountAccess = (mobile = false) => publicAnonymousMode
    ? <a
      className={mobile ? undefined : 'siteAccountAccess siteAccountAccess--external'}
      href={`${SITES_WORKSPACE_ORIGIN}/account`}
      target="_blank"
      rel="noreferrer"
      aria-label={t('nav.aiWorkspaceLabel')}
    >{t('nav.aiWorkspace')}</a>
    : <Link
      className={mobile ? (active === 'account' ? 'active' : '') : `siteAccountAccess${active === 'account' ? ' active' : ''}`}
      href="/account"
      aria-current={active === 'account' ? 'page' : undefined}
      aria-label={t('nav.accountCenter')}
    >{mobile ? t('nav.accountCenter') : t('nav.account')}</Link>;

  return <nav className="siteNav" aria-label={t('nav.main')}>
    <Link className="siteBrand" href="/" aria-label={t('nav.brandHome')}>
      <img src="/fusiondigital-mark.png" alt="" />
      <span className="siteBrandCopy"><BrandWordmark /><small>FUSION DIGITAL TWIN COMMUNITY</small></span>
    </Link>
    <div className="siteLinksShell" ref={linksShellRef}>
      <div className="siteLinks" ref={linksRef}>
        {visibleItems.map((item) => renderLink(item))}
        {overflowItems.length > 0 && <div className="siteMoreNav" ref={moreRef}>
          <button
            type="button"
            className={`siteMoreButton${overflowContainsActive ? ' active' : ''}`}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-controls={menuId}
            onClick={() => {
              if (moreOpen) setMoreOpen(false);
              else {
                setMoreOpen(true);
                focusOverflowItem(0);
              }
            }}
            onKeyDown={handleMoreButtonKeyDown}
          >{t('nav.more')}<span aria-hidden="true">⌄</span></button>
          <div className="siteMoreMenu" id={menuId} role="menu" aria-label={t('nav.more')} hidden={!moreOpen} onKeyDown={handleMoreMenuKeyDown}>
            {overflowItems.map((item) => renderLink(item, true))}
          </div>
        </div>}
        {renderKnowledgeMenu()}
      </div>
      <div className="siteLinksMeasure" ref={measureRef} aria-hidden="true">
        {links.map((item) => <span data-nav-key={item.key} data-nav-active={active === item.key ? 'true' : undefined} key={item.key}>{t(item.label)}</span>)}
        <span data-nav-more>{t('nav.more')}<i>⌄</i></span>
      </div>
    </div>
    <div className="siteDesktopPreferences" aria-label={t('preferences.group')}>
      {localeButton()}
      <ThemeSwitcher labels={themeLabels} compact />
    </div>
    {renderAccountAccess()}
    <details className="mobileNav">
      <summary aria-label={t('nav.open')}>{t('nav.menu')}</summary>
      <div>{links.map((item) => renderLink(item))}{renderKnowledgeMenu(true)}{renderAccountAccess(true)}<div className="siteMobilePreferences" aria-label={t('preferences.group')}>{localeButton('siteLocaleSwitch siteLocaleSwitch--mobile')}<ThemeSwitcher labels={themeLabels} compact /></div></div>
    </details>
  </nav>;
}
