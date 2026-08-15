import { THEME_COOKIE_NAME, THEME_STORAGE_KEY } from './theme-config';

const bootScript = `(()=>{try{const d=document.documentElement,k=${JSON.stringify(THEME_STORAGE_KEY)},c=${JSON.stringify(THEME_COOKIE_NAME)};let p=localStorage.getItem(k);if(!/^(system|light|dark)$/.test(p||'')){const m=document.cookie.match(new RegExp('(?:^|;\\\\s*)'+c+'=([^;]*)'));p=m?decodeURIComponent(m[1]):'system'}if(!/^(system|light|dark)$/.test(p||''))p='system';const t=p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':p==='dark'?'dark':'light';d.dataset.theme=t;d.dataset.themePreference=p;d.style.colorScheme=t}catch{const d=document.documentElement;d.dataset.theme='light';d.dataset.themePreference='system';d.style.colorScheme='light'}})();`;

export function ThemeBootScript({ nonce }: { nonce?: string }) {
  return (
    <script
      id="fusiondigital-theme-init"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: bootScript }}
    />
  );
}
