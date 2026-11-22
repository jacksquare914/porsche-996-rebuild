import { useEffect, type ReactNode } from 'react';

export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    build: <><path d="M4 6h16M4 12h10M4 18h13" /><circle cx="18" cy="12" r="1.6" /></>,
    manual: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Z" /><path d="M5 17h14M9 8h6M9 11h4" /></>,
    parts: <><path d="M20 7 12 3 4 7v10l8 4 8-4V7Z" /><path d="m4 7 8 4 8-4M12 11v10" /></>,
    log: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    price: <><path d="M12 2v20" /><path d="M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.8 5 3.3 5 1.4 5 3.3-2.2 3-5 3-5-1.1-5-3" /></>,
    content: <><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="12" cy="12" r="3.6" /><circle cx="17" cy="7" r="1" /></>,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    chev: <path d="m9 5 7 7-7 7" />,
    check: <path d="m5 12 5 5L19 7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    ext: <><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
    camera: <><path d="M3 8a2 2 0 0 1 2-2h2.5l1.2-2h6.6l1.2 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><circle cx="12" cy="13" r="3.6" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Sheet({
  title, sub, onClose, children,
}: { title: string; sub?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>{title}</h3>
            {sub && <div className="mono dim" style={{ marginTop: 5 }}>{sub}</div>}
          </div>
          <button className="btn sm ghost" onClick={onClose} aria-label="Close"
            style={{ width: 30, height: 30, padding: 0, display: 'grid', placeItems: 'center' }}>
            <span style={{ width: 15, height: 15, display: 'block' }}><Icon name="close" /></span>
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Stat({ n, l }: { n: ReactNode; l: string }) {
  return (
    <div className="stat">
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  );
}
