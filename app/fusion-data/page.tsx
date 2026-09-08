import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from '../i18n/config';
import FusionDataWorkspace from './FusionDataWorkspace';
import './fusion-data.css';

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const en = (resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE) === 'en';
  return {
    title: en ? 'Fusion Data Workspace' : '聚变数据工作台',
    description: en
      ? 'EXL-50U public snapshots: shot comparison, diagnostic time series, equilibrium scalars and IMAS provenance.'
      : 'EXL-50U 公开数据快照：炮次对比、诊断时序、平衡重建标量与 IMAS 数据溯源。',
  };
}

export default async function FusionDataPage() {
  const store = await cookies();
  const en = (resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE) === 'en';
  return <main className="fusionDataPage">
      <SiteNav active="fusionData" />
    <header className="fusionDataIntro">
      <div>
        <p><Link href="/data-foundation">{en ? 'Data foundation' : '数据基座'}</Link><span>/</span> {en ? 'Data workspace' : '数据工作台'}</p>
        <h1>Fusion Data Workspace <b>EXL-50U SNAPSHOT</b></h1>
      </div>
      <p>{en ? 'Explore EXL-50U experiments by shot: diagnostic currents, probe measurements and equilibrium reconstruction, with independently timed signals and traceable IMAS dataset versions.' : '按炮次浏览 EXL-50U 实验：诊断电流、探针测量与平衡重建，保留独立采样时间基和可追溯的 IMAS 数据版本。'}</p>
    </header>
    <FusionDataWorkspace />
    <SiteFooter />
  </main>;
}
