import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/app/components/SiteFooter';
import SiteNav from '@/app/components/SiteNav';
import PhaseOneRoadmap from '@/app/components/PhaseOneRoadmap';
import '../knowledge-graph.css';

export const metadata: Metadata = { title: '十模块建设路线｜FusionDigital Knowledge' };

export default function KnowledgeRoadmapPage() {
  return <main className="kgPage knowledgeViewPage"><SiteNav active="knowledge" /><header className="knowledgeViewHeader"><Link href="/knowledge-graph#modules">← 返回知识模块</Link><p>KNOWLEDGE / ROADMAP</p><h1>十模块建设路线</h1></header><PhaseOneRoadmap /><SiteFooter /></main>;
}
