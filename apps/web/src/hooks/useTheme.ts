import { useEffect } from 'react';
import { useStore } from '../store';

export function useTheme() {
  const { theme, setTheme } = useStore((s) => ({ theme: s.theme, setTheme: s.setTheme }));

  useEffect(() => {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const applyTheme = (t: 'light' | 'dark' | 'system') => {
      const dark = t === 'dark' || (t === 'system' && systemDark);
      root.classList.toggle('dark', dark);
    };

    applyTheme(theme);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  return { theme, setTheme };
}
