import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from '../i18n/config';

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const en = (resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE) === 'en';
  return {
    title: en
      ? 'Tokamak Engineering Simulation Atlas | Loads, Tools and Experimental Validation'
      : 'Tokamak 工程仿真图谱｜物理载荷、工程工具与实验闭环',
    description: en
      ? 'A tokamak engineering atlas covering CAD/PLM, electromagnetics, structures, magnets, thermal fluids, neutronics, blankets, tritium, safety and maintenance, with physics-to-experiment digital-twin interfaces.'
      : 'Tokamak CAD/PLM、电磁、结构、磁体、热流体、中子、包层、氚、安全、维护工具及其与物理和实验的接口与数字孪生路线。',
  };
}
export default function EngineeringLayout({children}:{children:React.ReactNode}){return children;}
