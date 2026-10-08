'use client';

import { useEffect, useState } from 'react';

export const storyChapters = [
  ['top', '数字孪生', 'Digital twin'], ['power-plant', '未来电厂', 'Future plant'],
  ['architecture', '三层架构', 'Architecture'], ['twin-value', '核心价值', 'Core value'],
  ['exl50u-case', '装置实证', 'In operation'], ['agent-future', '新的可能', 'New possibilities'],
] as const;

export default function StoryProgress({ en }: { en: boolean }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>('[data-story]')];
    const visible = new Map<Element, number>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) visible.set(entry.target, entry.intersectionRatio);
      const current = [...visible].sort((a, b) => b[1] - a[1])[0];
      if (!current || current[1] === 0) return;
      const index = Number((current[0] as HTMLElement).dataset.story);
      setActive(index);
      for (const section of sections) section.classList.toggle('is-current', Number(section.dataset.story) === index);
    }, { rootMargin: '-76px 0px -10% 0px', threshold: [0, .1, .25, .4, .6, .8] });
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  return <nav className="ssProgress" aria-label={en ? 'Story chapters' : '首页章节'}>
    {storyChapters.map(([id, zh, english], i) => <a href={'#' + id} key={id} aria-label={`${i + 1}. ${en ? english : zh}`} aria-current={i === active ? 'step' : undefined}><span>{en ? english : zh}</span><i aria-hidden="true">{String(i + 1).padStart(2, '0')}</i></a>)}
  </nav>;
}
