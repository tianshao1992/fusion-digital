import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/app/components/SiteFooter';
import SiteNav from '@/app/components/SiteNav';
import FusionTwinSystemMap from '@/app/components/FusionTwinSystemMap';
import '../knowledge-graph.css';

export const metadata: Metadata = { title: '十模块系统图｜FusionDigital Knowledge' };

export default function KnowledgeSystemMapPage() {
  return <main className="kgPage knowledgeViewPage"><SiteNav active="knowledge" /><header className="knowledgeViewHeader"><Link href="/knowledge-graph#modules">← 返回知识模块</Link><p>KNOWLEDGE / SYSTEM MAP</p><h1>十模块系统关系图</h1></header><FusionTwinSystemMap /><SiteFooter /></main>;
}

