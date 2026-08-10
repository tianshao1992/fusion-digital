import Link from 'next/link';
import BrandWordmark from './BrandWordmark';

type SiteNavProps = {
  active?: 'home' | 'physics' | 'engineering' | 'control' | 'ai' | 'facilities';
};

const links = [
  ['home', '/', '总览'],
  ['physics', '/physics', '物理模拟'],
  ['engineering', '/engineering', '工程仿真'],
  ['control', '/control', '集成控制'],
  ['ai', '/ai', '智能原生'],
  ['facilities', '/facilities', '全球装置'],
] as const;

export default function SiteNav({active = 'home'}: SiteNavProps) {
  return <nav className="siteNav" aria-label="主导航">
    <Link className="siteBrand" href="/" aria-label="FusionDigital 首页">
      <img src="/fusiondigital-mark.png" alt="" />
      <span className="siteBrandCopy"><BrandWordmark /><small>FUSION DIGITAL TWIN COMMUNITY</small></span>
    </Link>
    <div className="siteLinks">
      {links.map(([key, href, label]) => <Link className={active === key ? 'active' : ''} href={href} key={key}>{label}</Link>)}
      <Link href="/#resources">工具链条</Link>
      <Link href="/#roadmap">路线图</Link>
    </div>
    <details className="mobileNav">
      <summary aria-label="打开导航">菜单</summary>
      <div>{links.map(([key, href, label]) => <Link className={active === key ? 'active' : ''} href={href} key={key}>{label}</Link>)}<Link href="/#resources">工具链条</Link><Link href="/#roadmap">路线图</Link></div>
    </details>
  </nav>;
}
