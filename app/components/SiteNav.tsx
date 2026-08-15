'use client';

import Link from 'next/link';
import { useI18n } from '../i18n';
import BrandWordmark from './BrandWordmark';
import { ThemeSwitcher, type ThemeSwitcherLabels } from './theme';

type SiteNavProps = {
  active?: 'home' | 'physics' | 'engineering' | 'control' | 'diagnostics' | 'ai' | 'facilities' | 'prototype' | 'knowledge' | 'account' | 'platform';
};

const links = [
  ['home', '/', 'nav.home'],
  ['physics', '/physics', 'nav.physics'],
  ['engineering', '/engineering', 'nav.engineering'],
  ['control', '/control', 'nav.control'],
  ['diagnostics', '/diagnostics', 'nav.diagnostics'],
  ['ai', '/ai', 'nav.ai'],
  ['knowledge', '/knowledge-graph', 'nav.knowledge'],
  ['facilities', '/facilities', 'nav.facilities'],
  ['prototype', '/#prototype-workspace', 'nav.prototype'],
] as const;

export default function SiteNav({active = 'home'}: SiteNavProps) {
  const { locale, setLocale, t } = useI18n();
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
  >{locale === 'zh-CN' ? 'EN' : '中'}</button>;

  return <nav className="siteNav" aria-label={t('nav.main')}>
    <Link className="siteBrand" href="/" aria-label={t('nav.brandHome')}>
      <img src="/fusiondigital-mark.png" alt="" />
      <span className="siteBrandCopy"><BrandWordmark /><small>FUSION DIGITAL TWIN COMMUNITY</small></span>
    </Link>
    <div className="siteLinks">
      {links.map(([key, href, label]) => <Link className={active === key ? 'active' : ''} href={href} key={key}>{t(label)}</Link>)}
      <Link href="/#resources">{t('nav.resources')}</Link>
      <Link href="/#roadmap">{t('nav.roadmap')}</Link>
    </div>
    <div className="siteDesktopPreferences" aria-label={t('preferences.group')}>
      {localeButton()}
      <ThemeSwitcher labels={themeLabels} compact />
    </div>
    <Link className={`siteAccountAccess${active === 'account' ? ' active' : ''}`} href="/account" aria-label={t('nav.accountCenter')}>{t('nav.account')}</Link>
    <details className="mobileNav">
      <summary aria-label={t('nav.open')}>{t('nav.menu')}</summary>
      <div>{links.map(([key, href, label]) => <Link className={active === key ? 'active' : ''} href={href} key={key}>{t(label)}</Link>)}<Link href="/#resources">{t('nav.resources')}</Link><Link href="/#roadmap">{t('nav.roadmap')}</Link><Link className={active === 'account' ? 'active' : ''} href="/account">{t('nav.accountCenter')}</Link><div className="siteMobilePreferences" aria-label={t('preferences.group')}>{localeButton('siteLocaleSwitch siteLocaleSwitch--mobile')}<ThemeSwitcher labels={themeLabels} compact /></div></div>
    </details>
  </nav>;
}
