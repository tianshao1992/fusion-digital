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

function trustedViewerUrl(raw: string | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return url.toString();
  } catch {
    return null;
  }
  return null;
}

export default async function FusionDataPage() {
  const store = await cookies();
  const en = (resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE) === 'en';
  const paraViewUrl = trustedViewerUrl(process.env.NEXT_PUBLIC_PARAVIEW_TRAME_URL);
  return <main className="fusionDataPage">
      <SiteNav active="fusionData" />
    <header className="fusionDataIntro">
      <div>
        <p><Link href="/data-foundation">{en ? 'Data foundation' : '数据基座'}</Link><span>/</span> {en ? 'Data workspace' : '数据工作台'}</p>
        <h1>Fusion Data Workspace <b>MOCK</b></h1>
      </div>
      <p>{en ? 'Pulses, signals, IMAS semantics, quality and CAE results share one traceable time context.' : '炮次、信号、IMAS 语义、质量和 CAE 结果共用一个可追溯时间上下文。'}</p>
    </header>
    <FusionDataWorkspace paraViewUrl={paraViewUrl} />
    <SiteFooter />
  </main>;
}
