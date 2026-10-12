import { ArrowUpRight, ArrowRight, Check, Copy, AlertCircle, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
export function Eyebrow({ children }: { children: ReactNode }) { return <p className="eyebrow">{children}</p>; }
export function Badge({ children, tone = 'purple' }: { children: ReactNode; tone?: 'purple' | 'neutral' | 'amber' | 'green' }) { return <span className={`badge ${tone}`}><span className="badge-dot" />{children}</span>; }
export function ActionLink({ to, children, secondary = false }: { to: string; children: ReactNode; secondary?: boolean }) { return <Link to={to} className={`button ${secondary ? 'secondary' : ''}`}>{children}<ArrowUpRight size={17} /></Link>; }
export function PageTitle({ eyebrow, title, body, children }: { eyebrow: string; title: ReactNode; body: string; children?: ReactNode }) { return <div className="page-heading"><div><Eyebrow>{eyebrow}</Eyebrow><h1>{title}</h1><p className="lede">{body}</p></div>{children}</div>; }
export function Note({ children }: { children: ReactNode }) { return <div className="note"><AlertCircle size={17} /><div>{children}</div></div>; }
export function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="empty"><span className="empty-mark">∅</span><h2>{title}</h2>{children}</div>; }
export function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState('');
  return <div className="copy-value"><code>{value}</code><button className="icon-button" aria-label={`Copy ${label}`} onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setError(''); } catch { setError('Copy unavailable; select the value manually.'); } }}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>{error && <small role="status">{error}</small>}</div>;
}
export function TextLink({ to, children }: { to: string; children: ReactNode }) { return <Link to={to} className="text-link">{children}<ArrowRight size={16} /></Link>; }
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)') ?? []);
        if (!items.length) { e.preventDefault(); return; }
        if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0].focus(); }
      }
    };
    document.addEventListener('keydown', handle);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handle); prior?.focus(); };
  }, []);
  return createPortal(<div className="modal-shade" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="modal-head"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>{children}</div></div>, document.body);
}
