import { useEffect, useRef } from 'react';
import { useStore } from '../store';

type ShortcutHandler = (e: KeyboardEvent) => void;

const shortcuts: Record<string, string> = {
  c: 'Compose new email',
  '/': 'Focus search',
  '?': 'Show keyboard shortcuts',
  j: 'Next thread',
  k: 'Previous thread',
  o: 'Open thread',
  r: 'Reply',
  a: 'Reply all',
  f: 'Forward',
  e: 'Archive',
  s: 'Star/Unstar',
  'Shift+i': 'Mark as read',
  'Shift+u': 'Mark as unread',
  Delete: 'Delete selected emails',
  Escape: 'Close / go back',
};

export function useKeyboard(handlers: Partial<Record<keyof typeof shortcuts | string, ShortcutHandler>>) {
  const me = useStore((s) => s.me);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (me?.preferences.shortcutsEnabled === false) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs/textareas
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow Escape from inputs
        if (e.key !== 'Escape') return;
      }

      let key = e.key;
      if (e.shiftKey && key.length === 1 && key !== '?') key = `Shift+${key.toLowerCase()}`;
      else if (e.shiftKey && key.length > 1) key = `Shift+${key}`;
      else if (key.length === 1 && /[A-Za-z]/.test(key)) key = key.toLowerCase();

      const handler = handlersRef.current[key];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [me?.preferences.shortcutsEnabled]);
}

export { shortcuts };
