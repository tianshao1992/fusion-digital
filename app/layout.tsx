import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ThemeBootScript, ThemeProvider } from './components/theme';
import { I18nProvider } from './i18n';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, localeRegistry, resolveLocale } from './i18n/config';
import './globals.css';
import './components/platform-inline-link.css';
export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE;
  const en = locale === 'en';
  const title = en
    ? 'FusionDigital | A Full-Lifecycle Digital Twin Community for Fusion Power Plants'
    : 'FusionDigital｜聚变电厂全生命周期数字孪生社区';
  const description = en
    ? 'Connecting fusion physics, engineering simulation, integrated control, diagnostics and sensing, energy conversion, auxiliary systems, data foundations, whole-plant integration and AI-native workflows through a traceable evidence graph.'
    : '连接聚变物理、工程、集成控制、诊断感知、能量转化、辅机模拟、人机交互、数据基座、总体集成与智能原生，并以可追溯知识图谱组织证据，服务聚变电厂成本可控、高效运行、可靠可用与安全可证。';
  const socialDescription = en
    ? 'Evidence-linked specialist digital twins for lifecycle cost control, efficient operation, dependable availability and defensible safety in future fusion power plants.'
    : '以总体集成、智能原生与可追溯知识图谱连接专业孪生，服务成本可控、高效运行、可靠可用与安全可证的未来聚变电厂。';
  const imageAlt = en
    ? 'FusionDigital fusion digital-twin and AI-native community overview'
    : 'FusionDigital 聚变数字孪生与智能原生社区';
  return {
    metadataBase: new URL('https://fusiondigital.club'),
    alternates: { canonical: '/' },
    title: { default: title, template: '%s | FusionDigital' },
    description,
    icons: { icon: '/fusiondigital-mark.png' },
    openGraph: {
      title,
      description: socialDescription,
      url: '/',
      siteName: 'FusionDigital',
      locale: en ? 'en_US' : 'zh_CN',
      type: 'website',
      images: [{ url: '/figures/fusion-twin-ai-native-overview.png', width: 1536, height: 1024, alt: imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: en
        ? 'An open technical community for fusion physics, engineering, diagnostics, integrated control, AI and traceable knowledge.'
        : '聚变物理、工程、诊断感知、总体集成、人工智能与可追溯知识图谱的开放技术社区。',
      images: ['/figures/fusion-twin-ai-native-overview.png'],
    },
  };
}
export default async function RootLayout({children}:{children:React.ReactNode}) {
  const cookieStore = await cookies();
  const initialLocale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE;
  const localeDefinition = localeRegistry[initialLocale];

  return <html lang={localeDefinition.htmlLang} dir={localeDefinition.dir} suppressHydrationWarning>
    <head><ThemeBootScript /></head>
    <body><ThemeProvider><I18nProvider initialLocale={initialLocale}>{children}</I18nProvider></ThemeProvider></body>
  </html>;
}
