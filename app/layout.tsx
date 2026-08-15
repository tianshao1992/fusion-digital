import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ThemeBootScript, ThemeProvider } from './components/theme';
import { I18nProvider } from './i18n';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, localeRegistry, resolveLocale } from './i18n/config';
import './globals.css';
import './components/platform-inline-link.css';
export const metadata:Metadata={metadataBase:new URL('https://fusion-physics-atlas-2026.tianyuanliu1992.chatgpt.site'),title:{default:'FusionDigital｜聚变电厂全生命周期数字孪生社区',template:'%s｜FusionDigital'},description:'连接聚变物理、工程、集成控制、诊断感知、能量转化、辅机模拟、人机交互、数据基座、总体集成与智能原生，并以可追溯知识图谱组织证据，服务聚变电厂成本可控、高效运行、可靠可用与安全可证。',icons:{icon:'/fusiondigital-mark.png'},openGraph:{title:'FusionDigital｜聚变电厂全生命周期数字孪生社区',description:'以总体集成、智能原生与可追溯知识图谱连接专业孪生，服务成本可控、高效运行、可靠可用与安全可证的未来聚变电厂。',siteName:'FusionDigital',locale:'zh_CN',type:'website',images:[{url:'/figures/fusion-twin-ai-native-overview.png',width:1536,height:1024,alt:'FusionDigital 聚变数字孪生与智能原生社区'}]},twitter:{card:'summary_large_image',title:'FusionDigital｜聚变电厂全生命周期数字孪生社区',description:'聚变物理、工程、诊断感知、总体集成、人工智能与可追溯知识图谱的开放技术社区。',images:['/figures/fusion-twin-ai-native-overview.png']}};
export default async function RootLayout({children}:{children:React.ReactNode}) {
  const cookieStore = await cookies();
  const initialLocale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE;
  const localeDefinition = localeRegistry[initialLocale];

  return <html lang={localeDefinition.htmlLang} dir={localeDefinition.dir} suppressHydrationWarning>
    <head><ThemeBootScript /></head>
    <body><ThemeProvider><I18nProvider initialLocale={initialLocale}>{children}</I18nProvider></ThemeProvider></body>
  </html>;
}
