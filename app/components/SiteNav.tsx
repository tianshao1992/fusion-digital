type SiteNavProps = {
  active?: 'home' | 'physics' | 'engineering' | 'facilities';
};

const links = [
  ['home', '/', '总览'],
  ['physics', '/physics', '物理模拟'],
  ['engineering', '/engineering', '工程仿真'],
  ['facilities', '/facilities', '全球装置'],
] as const;

export default function SiteNav({active = 'home'}: SiteNavProps) {
  return <nav className="siteNav" aria-label="主导航">
    <a className="siteBrand" href="/" aria-label="FusionDigital 首页">
      <img src="/fusiondigital-mark.png" alt="" />
      <span><b>Fusion</b>Digital<small>FUSION DIGITAL TWIN COMMUNITY</small></span>
    </a>
    <div className="siteLinks">
      {links.map(([key, href, label]) => <a className={active === key ? 'active' : ''} href={href} key={key}>{label}</a>)}
      <a href="/#resources">工具与证据</a>
      <a href="/#roadmap">路线图</a>
    </div>
    <details className="mobileNav">
      <summary aria-label="打开导航">菜单</summary>
      <div>{links.map(([key, href, label]) => <a className={active === key ? 'active' : ''} href={href} key={key}>{label}</a>)}<a href="/#resources">工具与证据</a><a href="/#roadmap">路线图</a></div>
    </details>
  </nav>;
}
