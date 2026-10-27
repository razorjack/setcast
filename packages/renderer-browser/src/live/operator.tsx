import { useEffect, useState } from 'react';
import type { Report } from '../player/report.ts';

/** React keeps capture in the output window; only its controls move into this document. */
export function useOperatorWindow(report: Report) {
  const [operator, setOperator] = useState<Window | null>(null);
  const open = () => {
    if (operator && !operator.closed) {
      operator.focus();
      return true;
    }
    const popup = window.open('', '', 'popup,width=1000,height=720');
    if (!popup) {
      report('Operator window was blocked. Allow popups for this player and retry.');
      return false;
    }
    popup.document.title = 'Setcast / Operator';
    const stylesheet = popup.document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('/player.css', location.href).href;
    popup.document.head.append(stylesheet);
    popup.document.body.className = 'sc-operator sc-live sc-player';
    setOperator(popup);
    return true;
  };
  useEffect(() => {
    if (!operator) return;
    const timer = setInterval(() => {
      if (operator.closed) setOperator(null);
    }, 500);
    const close = () => operator.close();
    window.addEventListener('beforeunload', close);
    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', close);
      operator.close();
    };
  }, [operator]);
  return { target: operator?.document.body ?? null, open, close: () => setOperator(null) };
}

export type OperatorWindow = ReturnType<typeof useOperatorWindow>;
