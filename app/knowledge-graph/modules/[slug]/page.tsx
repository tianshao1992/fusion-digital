import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SiteFooter from '@/app/components/SiteFooter';
import SiteNav from '@/app/components/SiteNav';
import { getKnowledgeModule, knowledgeModules } from '../../modules';
import '../../knowledge-graph.css';

type ModulePageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return knowledgeModules.map(({ id }) => ({ slug: id }));
}

export async function generateMetadata({ params }: ModulePageProps): Promise<Metadata> {
  const moduleRecord = getKnowledgeModule((await params).slug);
  if (!moduleRecord) return {};
  return { title: `${moduleRecord.title}｜FusionDigital 知识模块`, description: moduleRecord.summary };
}

export default async function KnowledgeModulePage({ params }: ModulePageProps) {
  const moduleRecord = getKnowledgeModule((await params).slug);
  if (!moduleRecord) notFound();
  const current = knowledgeModules.findIndex((item) => item.id === moduleRecord.id);
  const previous = knowledgeModules[(current - 1 + knowledgeModules.length) % knowledgeModules.length];
  const next = knowledgeModules[(current + 1) % knowledgeModules.length];

  return <main className="kgPage modulePage">
    <SiteNav active="knowledge" />
    <header className="moduleHero">
      <Link href="/knowledge-graph#modules">← 返回十大模块</Link>
      <p>{moduleRecord.number} / {moduleRecord.keyword}</p>
      <div><h1>{moduleRecord.title}</h1><span>{moduleRecord.status}</span></div>
      <h2>{moduleRecord.summary}</h2>
    </header>
    <section className="moduleContent">
      <div className="moduleTopicPanel"><p>研究范围</p><ul>{moduleRecord.topics.map((topic) => <li key={topic}>{topic}</li>)}</ul></div>
      <div className="moduleResourcePanel">
        <header><p>页面与文档</p><span>{moduleRecord.resources.length} 个入口</span></header>
        {moduleRecord.resources.map((resource) => <Link href={resource.href} key={`${resource.kind}-${resource.href}`}><small>{resource.kind}</small><b>{resource.label}</b><span>打开 →</span></Link>)}
      </div>
    </section>
    {moduleRecord.researchPage && <section className="modulePrimaryAction"><div><p>完整研究界面</p><h2>继续访问该模块的可检索目录、图表与证据页面。</h2></div><Link href={moduleRecord.researchPage}>进入完整页面 →</Link></section>}
    <nav className="modulePager" aria-label="切换知识模块"><Link href={`/knowledge-graph/modules/${previous.id}`}>← {previous.number} {previous.title}</Link><Link href="/knowledge-graph#modules">全部模块</Link><Link href={`/knowledge-graph/modules/${next.id}`}>{next.number} {next.title} →</Link></nav>
    <SiteFooter />
  </main>;
}
