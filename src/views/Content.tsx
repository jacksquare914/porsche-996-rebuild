import { useState } from 'react';
import type { ContentDraft, ContentKind } from '../types';
import { useStore, fmtDate } from '../store';
import { driveFileUrl } from '../drive';
import { Sheet, Empty, Stat } from '../ui';

const KIND_LABEL: Record<ContentKind, string> = {
  'ig-post': 'Instagram post',
  reel: 'Reel script',
  'build-log': 'Build log',
};

/**
 * The Sunday batch for Meister Without reads this flag out of rebuild-state.json.
 * Off by default — the batch only mines the rebuild in a week this is switched on.
 */
function SundaySwitch() {
  const { state, update } = useStore();
  const ig = state.instagram ?? { include_in_sunday_batch: false };

  function set(patch: Partial<typeof ig>) {
    update((d) => {
      d.instagram = {
        ...(d.instagram ?? { include_in_sunday_batch: false }),
        ...patch,
        updated_at: new Date().toISOString(),
      };
    });
  }

  return (
    <div className="card pad" style={{ marginBottom: 14 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>Feed the Sunday batch</b>
          <div className="dim small" style={{ marginTop: 4, lineHeight: 1.5 }}>
            Meister Without&rsquo;s Sunday run drafts five posts a week. Switch this on and it
            mines this rebuild for them too — both accounts. It stays off until you say so, and
            it resets to off after a batch runs.
          </div>
        </div>
        <button
          className={`btn sm ${ig.include_in_sunday_batch ? 'primary' : ''}`}
          onClick={() => set({ include_in_sunday_batch: !ig.include_in_sunday_batch })}
          aria-pressed={ig.include_in_sunday_batch}
        >
          {ig.include_in_sunday_batch ? 'On' : 'Off'}
        </button>
      </div>
      {ig.include_in_sunday_batch && (
        <label className="field" style={{ marginTop: 12, marginBottom: 0 }}>
          <span>Steer this week (optional)</span>
          <input
            type="text"
            value={ig.focus ?? ''}
            placeholder="lead with the bore scoring / keep it to the IMS decision"
            onChange={(e) => set({ focus: e.target.value })}
          />
        </label>
      )}
    </div>
  );
}

export default function Content() {
  const { state, update } = useStore();
  const [open, setOpen] = useState<ContentDraft | null>(null);
  const [filter, setFilter] = useState<ContentKind | 'all'>('all');

  const drafts = state.content
    .filter((c) => filter === 'all' || c.kind === filter)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const unposted = state.content.filter((c) => c.status !== 'posted').length;
  const photoCount = state.log.reduce((s, l) => s + l.photos.length, 0);
  const heroes = state.log.reduce((s, l) => s + l.photos.filter((p) => p.hero).length, 0);
  const ig = state.instagram;

  return (
    <>
      <div className="card pad" style={{ marginBottom: 14 }}>
        <div className="statrow">
          <Stat n={state.content.length} l="drafts" />
          <Stat n={unposted} l="not posted" />
          <Stat n={photoCount} l="photos" />
          <Stat n={heroes} l="hero shots" />
        </div>
      </div>

      <div className="banner info">
        Ask Claude <span className="mono">“write up this week”</span> — the content agent reads your
        log entries and photos, picks the strongest shots, and drops captions, reel scripts and
        build-log entries here for you to approve.
      </div>

      <SundaySwitch />

      {ig?.include_in_sunday_batch && photoCount === 0 && (
        <div className="banner warn">
          Nothing to draw on yet — log a session with photos and Sunday&rsquo;s batch will have
          something to work with.
        </div>
      )}

      <div className="filters">
        {(['all', 'ig-post', 'reel', 'build-log'] as const).map((k) => (
          <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {k === 'all' ? 'All' : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {drafts.length === 0 ? (
        <Empty>
          Nothing drafted yet.<br />
          Log a session with a few photos first, then ask Claude to write it up.
        </Empty>
      ) : (
        <div className="card">
          {drafts.map((c) => (
            <div className="logentry" key={c.id} onClick={() => setOpen(c)} style={{ cursor: 'pointer' }}>
              <div className="row">
                <span className="chip">{KIND_LABEL[c.kind]}</span>
                <span className={`chip ${c.status === 'posted' ? 'done' : c.status === 'approved' ? 'active' : ''}`}>
                  {c.status}
                </span>
                <div className="spacer" style={{ flex: 1 }} />
                <span className="when">{fmtDate(c.created_at)}</span>
              </div>
              <h4>{c.title}</h4>
              <div className="notes" style={{
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {c.body}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Sheet title={open.title} onClose={() => setOpen(null)}
          sub={`${KIND_LABEL[open.kind]} · ${fmtDate(open.created_at)}`}>
          <div className="row wrap">
            {(['draft', 'approved', 'posted'] as const).map((s) => (
              <button key={s} className={`btn sm ${open.status === s ? 'primary' : ''}`}
                onClick={() => {
                  update((d) => {
                    const i = d.content.findIndex((c) => c.id === open.id);
                    if (i >= 0) d.content[i] = { ...d.content[i], status: s };
                  });
                  setOpen({ ...open, status: s });
                }}>
                {s}
              </button>
            ))}
            <div className="spacer" style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => {
              const text = [open.body, (open.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n');
              navigator.clipboard?.writeText(text);
            }}>
              Copy
            </button>
          </div>

          <textarea value={open.body} style={{ minHeight: 260 }}
            onChange={(e) => {
              const body = e.target.value;
              setOpen({ ...open, body });
              update((d) => {
                const i = d.content.findIndex((c) => c.id === open.id);
                if (i >= 0) d.content[i] = { ...d.content[i], body };
              });
            }} />

          {open.hashtags?.length ? (
            <div>
              <h2 className="section">Hashtags</h2>
              <div className="notes mono">{open.hashtags.join(' ')}</div>
            </div>
          ) : null}

          {open.photo_picks?.length ? (
            <div>
              <h2 className="section">Photo picks, in order</h2>
              <div className="photogrid">
                {open.photo_picks.map((id) => (
                  <a key={id} href={driveFileUrl(id)} target="_blank" rel="noreferrer" className="ph">
                    <span className="mono dim" style={{
                      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 10,
                    }}>
                      open
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <button className="btn" onClick={() => {
            update((d) => { d.content = d.content.filter((c) => c.id !== open.id); });
            setOpen(null);
          }}>
            Delete draft
          </button>
        </Sheet>
      )}
    </>
  );
}
