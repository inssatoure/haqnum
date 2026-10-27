'use client';

// Rendu Markdown minimal (titres, listes, gras, citations), avec les sources [Auteur, type HH:MM] en couleur.

import { Fragment, type ReactNode } from 'react';

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]\n]{2,60}?\b\d{1,2}[:h]\d{2}\]|\[[^\]\n]*(?:fiche|contact|photo|vidéo|audio|vocal|note|commentaire)[^\]\n]*\]|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('[')) {
      const lower = t.toLowerCase();
      const cls = lower.startsWith('[moctar') ? 'bg-moctar/20 text-moctar' : lower.startsWith('[issa') ? 'bg-issa/20 text-issa' : 'bg-nuit-700 text-nuit-200';
      out.push(<span key={`${key}-${i++}`} className={`mx-0.5 whitespace-nowrap rounded px-1 text-[0.8em] font-semibold ${cls}`}>{t}</span>);
    } else out.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flushList = (k: number) => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${k}`}>
        {list.map((l, j) => <li key={j}>{inline(l, `li-${k}-${j}`)}</li>)}
      </ul>,
    );
    list = [];
  };
  lines.forEach((raw, k) => {
    const l = raw.trimEnd();
    const li = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (li) {
      list.push(li[1]);
      return;
    }
    flushList(k);
    if (!l.trim()) return;
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const content = inline(h[2], `h-${k}`);
      blocks.push(lvl === 1 ? <h1 key={k}>{content}</h1> : lvl === 2 ? <h2 key={k}>{content}</h2> : <h3 key={k}>{content}</h3>);
    } else if (l.startsWith('>')) blocks.push(<blockquote key={k}>{inline(l.replace(/^>\s?/, ''), `q-${k}`)}</blockquote>);
    else blocks.push(<p key={k}>{inline(l, `p-${k}`)}</p>);
  });
  flushList(lines.length);
  return <div className="prose-report">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
