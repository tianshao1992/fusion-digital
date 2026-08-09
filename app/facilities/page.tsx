'use client';
import {useMemo, useState} from 'react';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import {facilities} from './data';
import './facilities.css';

export default function FacilitiesPage(){
  const [filter,setFilter]=useState('全部');
  const filters=['全部','建设中','运行中','维护增强','维护/开机准备','初步设计','退役过渡'];
  const visible=useMemo(()=>filter==='全部'?facilities:facilities.filter(item=>item.status===filter),[filter]);
  return <main className="facilitiesPage">
    <SiteNav active="facilities" />
    <header className="facilitiesHero"><div><p>GLOBAL FUSION FACILITIES / STATUS OBSERVATORY</p><h1>全球聚变装置<br/><span>建设与运行观测台</span></h1><div>以官方项目页面、机构报告和原始论文为证据，记录装置当前阶段、公开里程碑及其对数字孪生技术路线的意义。</div></div><aside><span><b>{facilities.length}</b>重点装置/项目</span><span><b>6</b>生命周期状态</span><span><b>2026-08-09</b>本页核验截止</span></aside></header>
    <section className="facilityContext"><div><p>如何阅读</p><h2>状态不是排名，而是模型需求的生命周期坐标。</h2></div><div><p>建设阶段强调 CAD/PLM、装配、供应链、测试与配置控制；运行阶段强调实验同步、状态估计和控制；维护与退役阶段则强调资产履历、辐射、机器人与知识保全。</p><p>项目公开计划会变化。每张卡片都保留核验日期和来源链接，时间性结论以来源为准。</p></div></section>
    <section className="facilityAtlas"><div className="facilityFilters" aria-label="按状态筛选">{filters.map(item=><button className={filter===item?'active':''} key={item} onClick={()=>setFilter(item)}>{item}</button>)}</div><div className="facilityGrid">{visible.map((item,index)=><article key={item.name}><header><span>{String(index+1).padStart(2,'0')}</span><b className={item.statusClass}>{item.status}</b></header><p className="facilityPlace">{item.country} · {item.type}</p><h2>{item.name}</h2><h3>{item.phase}</h3><p>{item.summary}</p><dl><div><dt>公开里程碑</dt><dd>{item.milestone}</dd></div><div><dt>孪生价值</dt><dd>{item.twinValue}</dd></div><div><dt>核验日期</dt><dd>{item.updated}</dd></div></dl><footer><a href={item.url} target="_blank" rel="noreferrer">{item.source} ↗</a>{item.secondSource&&<a href={item.secondSource} target="_blank" rel="noreferrer">补充来源 ↗</a>}</footer></article>)}</div></section>
    <section className="facilityMethod"><div><p>STATUS METHOD</p><h2>纳入与核验规则</h2></div><ol><li><b>来源优先级</b><span>装置/机构官网、项目报告、同行评议论文、IAEA/EUROfusion 会议材料。</span></li><li><b>状态口径</b><span>区分设施建设、主机装配、系统调试、运行、维护升级、设计和退役，不以营销目标代替工程进度。</span></li><li><b>更新时间</b><span>卡片中的日期是该条结论所依赖的公开证据日期，不代表站点实时遥测。</span></li><li><b>持续维护</b><span>后续将加入时间轴、参数对比、模型/代码关系和社区纠错入口。</span></li></ol></section>
    <SiteFooter />
  </main>;
}
