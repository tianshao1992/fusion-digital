'use client';

import Link from 'next/link';
import { useI18n } from '../i18n';
import BrandWordmark from './BrandWordmark';

export default function SiteFooter() {
  const { t } = useI18n();
  return <footer className="siteFooter" id="about">
    <div className="footerBrand">
      <img src="/fusiondigital-mark.png" alt="" />
      <div><BrandWordmark className="footerBrandName" /><p>{t('footer.tagline')}</p></div>
    </div>
    <div><b>{t('footer.team')}</b><p>{t('footer.teamName')}</p></div>
    <div><b>{t('footer.contact')}</b><p><a href="mailto:tianshao1992@gmail.com">tianshao1992@gmail.com</a></p></div>
    <div><b>{t('footer.platform')}</b><p><Link href="/platform">{t('footer.platformLink')}</Link><br/>{t('footer.updated')}</p></div>
  </footer>;
}
