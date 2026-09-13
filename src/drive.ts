/**
 * Google Drive is the entire backend for this app.
 *
 * There is no server. The browser signs in with Google Identity Services,
 * gets an access token scoped to `drive.file` (which grants access ONLY to
 * files this app itself created — it cannot see the rest of your Drive),
 * and reads/writes:
 *
 *   My Drive/Porsche 996 Rebuild/
 *     rebuild-state.json     <- all steps, parts, quotes, log, content
 *     photos/                <- every photo taken from the phone
 *
 * Because the data is plain JSON in your own Drive, Claude can read and
 * write the same file from a session (see docs/AGENTS.md) — the price agent
 * and the content agent append to `quotes` and `content` respectively.
 */

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'Porsche 996 Rebuild';
const PHOTOS_FOLDER = 'photos';
const STATE_FILE = 'rebuild-state.json';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void;
  callback: (r: TokenResponse) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: unknown) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;
let tokenExpiry = 0;

export class DriveError extends Error {}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gis]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new DriveError('Could not load Google sign-in.')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.dataset.gis = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new DriveError('Could not load Google sign-in.'));
    document.head.appendChild(s);
  });
}

export function isConfigured(): boolean {
  return Boolean(CLIENT_ID);
}

/**
 * @param interactive false attempts a silent token refresh (works once the
 *        user has granted consent in this browser); true always shows the
 *        account chooser.
 */
export async function signIn(interactive = true): Promise<void> {
  if (!CLIENT_ID) {
    throw new DriveError(
      'No Google client ID. Copy .env.example to .env and set VITE_GOOGLE_CLIENT_ID — see docs/SETUP.md.',
    );
  }
  await loadGis();
  if (!tokenClient) {
    tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {},
    });
  }
  await new Promise<void>((resolve, reject) => {
    tokenClient!.callback = (r) => {
      if (r.error || !r.access_token) {
        reject(new DriveError(r.error ?? 'Sign-in was cancelled.'));
        return;
      }
      accessToken = r.access_token;
      tokenExpiry = Date.now() + (r.expires_in - 120) * 1000;
      sessionStorage.setItem('p996_token', accessToken);
      sessionStorage.setItem('p996_token_exp', String(tokenExpiry));
      resolve();
    };
    tokenClient!.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

export function restoreSession(): boolean {
  const t = sessionStorage.getItem('p996_token');
  const e = Number(sessionStorage.getItem('p996_token_exp') ?? 0);
  if (t && e > Date.now()) {
    accessToken = t;
    tokenExpiry = e;
    return true;
  }
  return false;
}

export function signOut(): void {
  if (accessToken) window.google?.accounts.oauth2.revoke(accessToken);
  accessToken = null;
  tokenExpiry = 0;
  sessionStorage.removeItem('p996_token');
  sessionStorage.removeItem('p996_token_exp');
}

export function isSignedIn(): boolean {
  return Boolean(accessToken) && tokenExpiry > Date.now();
}

async function token(): Promise<string> {
  if (accessToken && tokenExpiry > Date.now()) return accessToken;
  await signIn(false);
  if (!accessToken) throw new DriveError('Not signed in.');
  return accessToken;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = await token();
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${t}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new DriveError(`Drive ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  thumbnailLink?: string;
  createdTime?: string;
  webViewLink?: string;
}

async function findChild(name: string, parentId: string | 'root', mime?: string) {
  const clauses = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `'${parentId}' in parents`,
    'trashed = false',
  ];
  if (mime) clauses.push(`mimeType = '${mime}'`);
  const q = encodeURIComponent(clauses.join(' and '));
  const r = await api<{ files: DriveFile[] }>(`files?q=${q}&fields=files(id,name,mimeType)&pageSize=1`);
  return r.files[0] ?? null;
}

async function createFolder(name: string, parentId: string | 'root') {
  return api<DriveFile>('files?fields=id,name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
}

export interface DriveHandles {
  rootId: string;
  photosId: string;
  stateFileId: string;
}

let handles: DriveHandles | null = null;

export async function ensureWorkspace(): Promise<DriveHandles> {
  if (handles) return handles;
  const root =
    (await findChild(FOLDER_NAME, 'root', FOLDER_MIME)) ??
    (await createFolder(FOLDER_NAME, 'root'));
  const photos =
    (await findChild(PHOTOS_FOLDER, root.id, FOLDER_MIME)) ??
    (await createFolder(PHOTOS_FOLDER, root.id));
  let state = await findChild(STATE_FILE, root.id);
  if (!state) {
    state = await uploadJson(null, STATE_FILE, root.id, { bootstrap: true });
  }
  handles = { rootId: root.id, photosId: photos.id, stateFileId: state.id };
  return handles;
}

async function uploadJson(
  fileId: string | null,
  name: string,
  parentId: string,
  data: unknown,
): Promise<DriveFile> {
  const t = await token();
  const boundary = 'p996' + Math.random().toString(36).slice(2);
  const meta: Record<string, unknown> = { name, mimeType: 'application/json' };
  if (!fileId) meta.parents = [parentId];
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${JSON.stringify(data, null, 1)}\r\n` +
    `--${boundary}--`;
  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name';
  const res = await fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${t}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new DriveError(`Drive upload ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as DriveFile;
}

export async function loadState<T>(): Promise<T | null> {
  const h = await ensureWorkspace();
  const t = await token();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${h.stateFileId}?alt=media`,
    { headers: { Authorization: `Bearer ${t}` } },
  );
  if (!res.ok) throw new DriveError(`Drive read ${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  if ('bootstrap' in json) return null;
  return json as T;
}

export async function saveState(state: unknown): Promise<void> {
  const h = await ensureWorkspace();
  await uploadJson(h.stateFileId, STATE_FILE, h.rootId, state);
}

export async function uploadPhoto(file: File): Promise<DriveFile> {
  const h = await ensureWorkspace();
  const t = await token();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `${stamp}_${file.name || 'photo.jpg'}`;
  const boundary = 'p996img' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: [h.photosId] });
  const head = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${file.type || 'image/jpeg'}\r\n\r\n`,
  ]);
  const tail = new Blob([`\r\n--${boundary}--`]);
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,thumbnailLink,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: new Blob([head, file, tail]),
    },
  );
  if (!res.ok) throw new DriveError(`Photo upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as DriveFile;
}

/**
 * Drive thumbnail links expire after a few hours, so they are re-fetched every time
 * the log is shown rather than stored in state.
 *
 * Drive hands back a tiny default (around 220px on the long edge), which is visibly
 * soft on a phone screen at 2-3x pixel density. The trailing `=sNNN` on a
 * googleusercontent URL is a size request, so we ask for something big enough to
 * stay sharp in the grid and when tapped.
 */
export async function refreshThumbs(
  fileIds: string[],
  size = 640,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    fileIds.map(async (id) => {
      try {
        const f = await api<DriveFile>(`files/${id}?fields=id,thumbnailLink`);
        if (f.thumbnailLink) {
          out[id] = /=s\d+(-c)?$/.test(f.thumbnailLink)
            ? f.thumbnailLink.replace(/=s\d+(-c)?$/, `=s${size}`)
            : `${f.thumbnailLink}=s${size}`;
        }
      } catch {
        /* a deleted photo just won't render */
      }
    }),
  );
  return out;
}

export function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

export function currentHandles(): DriveHandles | null {
  return handles;
}
