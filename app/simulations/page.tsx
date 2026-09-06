import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import SiteNav from '../components/SiteNav';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from '../i18n/config';
import SimulationStudio from './SimulationStudio';
import './simulation-studio.css';
export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const en = (resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE) === 'en';
  return { title: en ? 'Simulations · FUSE Studio' : '仿真模拟 · FUSE 工作台', description: en ? 'Explore traceable FUSE physics results and configure simulation studies.' : '查看可追溯的 FUSE 物理结果、配置计算研究，逐步连接物理模拟与工程仿真。', alternates: { canonical: '/simulations' } };
}
export default function SimulationsPage() {
  return <div className="simulationPage"><SiteNav active="simulations" /><SimulationStudio /></div>;
}
