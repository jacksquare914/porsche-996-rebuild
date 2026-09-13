import { useEffect, useRef, useState } from 'react';
import type { LogEntry, PhotoRef } from '../types';
import { PHASE_LABEL } from '../types';
import { STEP_INDEX, allLeaves, useStore, uid, DEFAULT_STEP } from '../store';
import { uploadPhoto, refreshThumbs, driveFileUrl, isSignedIn } from '../drive';
import { Icon, Sheet, Empty } from '../ui';

export default function Log() {
  const { state, update } = useStore();
  const [composing, setComposing] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<LogEntry | null>(null);

  const entries = [...state.log].sort((a, b) => b.at.localeCompare(a.at));
  const allPhotoIds = entries.flatMap((e) => e.photos.map((p) => p.fileId));

  useEffect(() => {
    if (!isSignedIn() || allPhotoIds.length === 0) return;
    const missing = allPhotoIds.filter((id) => !thumbs[id]);
    if (missing.length === 0) return;
    refreshThumbs(missing.slice(0, 60)).then((t) =>
      setThumbs((prev) => ({ ...prev, ...t })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPhotoIds.join(',')]);

  return (
    <>
      <button className="btn primary" style={{ width: '100%', marginBottom: 14 }}
        onClick={() => setComposing(true)}>
        <span style={{ width: 15, height: 15, display: 'inline-block', verticalAlign: -2, marginRight: 7 }}>
          <Icon name="camera" />
        </span>
        New log entry
      </button>

      {entries.length === 0 ? (
        <Empty>
          Nothing logged yet.<br />
          Open this on your phone in the garage — every entry can carry photos
          straight from the camera into your Drive folder.
        </Empty>
      ) : (
        <div className="card">
          {entries.map((e) => (
            <div className="logentry" key={e.id}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div className="when">
                    {new Date(e.at).toLocaleString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                    {e.hours ? ` · ${e.hours}h` : ''}
                  </div>
                  <h4>{e.title || 'Untitled'}</h4>
                  {e.step_id && STEP_INDEX[e.step_id] && (
                    <span className="chip">{STEP_INDEX[e.step_id].title}</span>
                  )}
                </div>
                <button className="btn sm ghost" onClick={() => setEditing(e)}>Edit</button>
              </div>
              {e.body && <div className="notes" style={{ marginTop: 8 }}>{e.body}</div>}
              {e.photos.length > 0 && (
                <div className="photogrid" style={{ marginTop: 10 }}>
                  {e.photos.map((p) => (
                    <a key={p.fileId} href={driveFileUrl(p.fileId)} target="_blank" rel="noreferrer">
                      {thumbs[p.fileId] ? (
                        <img src={thumbs[p.fileId]} alt={p.caption ?? p.name} loading="lazy"
                          referrerPolicy="no-referrer" />
                      ) : (
                        <span className="ph" />
                      )}
                      {p.hero && <span className="hero-badge">HERO</span>}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {composing && (
        <Compose onClose={() => setComposing(false)}
          onSave={(entry) => { update((d) => { d.log.push(entry); }); setComposing(false); }} />
      )}
      {editing && (
        <Compose existing={editing} onClose={() => setEditing(null)}
          onSave={(entry) => {
            update((d) => {
              const i = d.log.findIndex((l) => l.id === entry.id);
              if (i >= 0) d.log[i] = entry;
            });
            setEditing(null);
          }}
          onDelete={() => {
            update((d) => { d.log = d.log.filter((l) => l.id !== editing.id); });
            setEditing(null);
          }} />
      )}
    </>
  );
}

function Compose({
  existing, onClose, onSave, onDelete,
}: {
  existing?: LogEntry;
  onClose: () => void;
  onSave: (e: LogEntry) => void;
  onDelete?: () => void;
}) {
  const { state } = useStore();
  const [entry, setEntry] = useState<LogEntry>(
    existing ?? { id: uid('log'), at: new Date().toISOString(), photos: [], title: '', body: '' },
  );
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const leaves = allLeaves();
  const suggested = leaves.filter((l) => (state.steps[l.id] ?? DEFAULT_STEP).status === 'active');

  useEffect(() => {
    const ids = entry.photos.map((p) => p.fileId).filter((id) => !thumbs[id]);
    if (ids.length) refreshThumbs(ids).then((t) => setThumbs((p) => ({ ...p, ...t })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.photos.length]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    setBusy(files.length);
    const added: PhotoRef[] = [];
    for (const f of Array.from(files)) {
      try {
        const up = await uploadPhoto(f);
        added.push({ fileId: up.id, name: up.name });
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setBusy((b) => b - 1);
      }
    }
    setEntry((p) => ({ ...p, photos: [...p.photos, ...added] }));
  }

  return (
    <Sheet title={existing ? 'Edit entry' : 'New log entry'} onClose={onClose}
      sub={new Date(entry.at).toLocaleString()}>
      {err && <div className="banner bad">{err}</div>}

      <label className="field">
        <span>What happened</span>
        <input type="text" value={entry.title ?? ''} placeholder="Cracked the case / IMS out"
          onChange={(e) => setEntry((p) => ({ ...p, title: e.target.value }))} />
      </label>

      <label className="field">
        <span>Step</span>
        <select value={entry.step_id ?? ''}
          onChange={(e) => setEntry((p) => ({ ...p, step_id: e.target.value || undefined }))}>
          <option value="">— not tied to a step —</option>
          {suggested.length > 0 && (
            <optgroup label="In progress">
              {suggested.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </optgroup>
          )}
          <optgroup label="All steps">
            {leaves.map((s) => (
              <option key={s.id} value={s.id}>{PHASE_LABEL[s.phase]} — {s.title}</option>
            ))}
          </optgroup>
        </select>
      </label>

      <label className="field">
        <span>Notes</span>
        <textarea value={entry.body ?? ''} style={{ minHeight: 110 }}
          placeholder="Measurements, what surprised you, what you'd tell someone doing this next…"
          onChange={(e) => setEntry((p) => ({ ...p, body: e.target.value }))} />
      </label>

      <label className="field">
        <span>Hours on the clock</span>
        <input type="number" step="0.5" value={entry.hours ?? ''}
          onChange={(e) => setEntry((p) => ({
            ...p, hours: e.target.value === '' ? undefined : Number(e.target.value),
          }))} />
      </label>

      <div>
        <h2 className="section">Photos → Drive</h2>
        <input ref={fileRef} type="file" accept="image/*" multiple capture="environment"
          style={{ display: 'none' }} onChange={(e) => addFiles(e.target.files)} />
        <button className="dropzone" onClick={() => fileRef.current?.click()}>
          {busy > 0 ? `Uploading ${busy}…` : 'Take a photo or pick from the roll'}
        </button>
        {entry.photos.length > 0 && (
          <div className="photogrid" style={{ marginTop: 10 }}>
            {entry.photos.map((p) => (
              <div className="ph" key={p.fileId} onClick={() => setEntry((prev) => ({
                ...prev,
                photos: prev.photos.map((x) => x.fileId === p.fileId ? { ...x, hero: !x.hero } : x),
              }))} style={{ cursor: 'pointer' }}>
                {thumbs[p.fileId] && <img src={thumbs[p.fileId]} alt="" referrerPolicy="no-referrer" />}
                {p.hero && <span className="hero-badge">HERO</span>}
              </div>
            ))}
          </div>
        )}
        {entry.photos.length > 0 && (
          <div className="dim small" style={{ marginTop: 6 }}>
            Tap a photo to mark it a hero shot — the content agent picks those first.
          </div>
        )}
      </div>

      <div className="row" style={{ marginTop: 18 }}>
        {onDelete && <button className="btn" onClick={onDelete}>Delete</button>}
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy > 0} onClick={() => onSave(entry)}>
          Save
        </button>
      </div>
    </Sheet>
  );
}
