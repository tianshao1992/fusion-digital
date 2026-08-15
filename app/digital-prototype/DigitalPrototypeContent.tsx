'use client';

import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import { useI18n } from '../i18n';
import type { DeviceCatalog } from './deviceCatalog';
import MultiDeviceWorkspace from './MultiDeviceWorkspace';

export default function DigitalPrototypeContent({ catalog }: { catalog: DeviceCatalog }) {
  const { t } = useI18n();
  return <main className="prototypePage">
    <SiteNav active="prototype" />

    <header className="prototypeHero prototypeHero--compact">
      <div className="prototypeHeroCopy">
        <p>DIGITAL PROTOTYPE / 3D + EFIT</p>
        <h1>{t('prototype.title')}</h1>
        <div className="prototypeLead">{t('prototype.lead')}</div>
        <div className="prototypeHeroActions"><a href="#prototype-workspace">{t('prototype.enter')}</a><a href="/platform#contracts">{t('prototype.contract')}</a></div>
      </div>
      <div className="prototypeHeroStatus" aria-label={t('prototype.capabilities')}>
        <span><b>03</b>{t('prototype.deviceEntries')}</span>
        <span><b>10</b>{t('prototype.shots')}</span>
        <span><b>2 LOD</b>{t('prototype.exl3d')}</span>
      </div>
    </header>

    <MultiDeviceWorkspace catalog={catalog} />

    <section className="prototypePlatformLink" aria-labelledby="prototype-platform-title">
      <div><p>PLATFORM INTEGRATION</p><h2 id="prototype-platform-title">{t('prototype.integrationTitle')}</h2></div>
      <p>{t('prototype.integrationCopy')}</p>
      <a href="/platform#contracts">{t('prototype.integrationLink')} <span>→</span></a>
    </section>

    <SiteFooter />
  </main>;
}
