import { useEffect, useRef, useState } from 'react';

/**
 * Wraps a markdown-rendered HTML string and decorates every <pre> with a
 * copy-to-clipboard button (rendered into the DOM after mount, since the
 * markdown is set via dangerouslySetInnerHTML).
 */
export function MarkdownBody({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copiedFor, setCopiedFor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const cleanups: Array<() => void> = [];

    for (const pre of Array.from(root.querySelectorAll<HTMLPreElement>('pre'))) {
      if (pre.querySelector(':scope > .copy-code-btn')) continue;
      pre.classList.add('code-block');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-code-btn';
      btn.textContent = '复制';
      const onClick = async (e: MouseEvent) => {
        e.preventDefault();
        const code = pre.querySelector('code')?.innerText ?? pre.innerText;
        try {
          await navigator.clipboard.writeText(code);
          setCopiedFor(btn);
          window.setTimeout(() => setCopiedFor((c) => (c === btn ? null : c)), 1400);
        } catch {
          /* clipboard may be unavailable on insecure origins */
        }
      };
      btn.addEventListener('click', onClick);
      pre.appendChild(btn);
      cleanups.push(() => btn.removeEventListener('click', onClick));
    }

    return () => cleanups.forEach((fn) => fn());
  }, [html]);

  useEffect(() => {
    if (!copiedFor) return;
    const prev = copiedFor.textContent;
    copiedFor.textContent = '已复制';
    copiedFor.classList.add('copied');
    return () => {
      if (copiedFor.isConnected) {
        copiedFor.textContent = prev;
        copiedFor.classList.remove('copied');
      }
    };
  }, [copiedFor]);

  return <div ref={containerRef} className="bubble md" dangerouslySetInnerHTML={{ __html: html }} />;
}
