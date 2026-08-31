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
      ? 'An interactive workspace for pulses, IMAS IDS, governed MDSplus mappings, data quality and CAE results.'
      : '面向炮次、IMAS IDS、受治理的 MDSplus 映射、数据质量与 CAE 结果的交互式聚变数据工作台。',
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
      <p>{en ? 'Four reviewed EXL-50U shots: authoritative IMAS H5, read-only MDSplus projection, and a hashed public snapshot.' : '4 炮经审核的 EXL-50U 数据：权威 IMAS H5、MDSplus 只读时序投影与可校验的公开快照。'}</p>
    </header>
    <FusionDataWorkspace />
    <SiteFooter />
  </main>;
}
