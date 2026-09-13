# Setup

Two things to do once: get a Google OAuth client ID so the app can talk to your Drive, and
put the site somewhere your phone can reach it.

---

## 1. Google OAuth client ID (10 minutes, free)

The app asks Google for permission to touch **only the files it creates** — the
`drive.file` scope. It cannot see the rest of your Drive, and there is no server in the
middle, so your data never passes through anyone else's machine.

1. Go to <https://console.cloud.google.com/> and create a project — call it `996 Rebuild`.
2. **APIs & Services → Library** → search "Google Drive API" → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **Internal** (you have Workspace, so this works and skips Google's
     verification review entirely). If Internal isn't offered, pick External and add your
     own address as a test user.
   - App name `996 Rebuild`, your email for support and developer contact. Save.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `996 Rebuild web`
   - **Authorized JavaScript origins** — add both:
     - `http://localhost:5173`
     - `https://jacksquare914.github.io`
   - Create. Copy the client ID (it ends in `.apps.googleusercontent.com`).
5. In the repo:
   ```bash
   cp .env.example .env
   ```
   Paste the client ID into `.env` as `VITE_GOOGLE_CLIENT_ID=...`

> The client ID is not a secret — it ships in the built JavaScript, which is normal and
> fine for this OAuth flow. What protects the data is the origin allowlist you just set and
> the consent screen. `.env` is gitignored anyway.

Run it locally to check:

```bash
npm install
npm run dev          # http://localhost:5173
```

Click **Connect Drive**, approve, and confirm a `Porsche 996 Rebuild` folder appears in
your Drive with `rebuild-state.json` inside it.

---

## 2. Put it on GitHub Pages

```bash
git remote add origin git@github.com:jacksquare914/porsche-996-rebuild.git
git push -u origin main
```

Then in the repo on GitHub: **Settings → Pages → Source: GitHub Actions**.

For the client ID to reach the build, add it as a repository variable:
**Settings → Secrets and variables → Actions → Variables → New repository variable**
- Name: `VITE_GOOGLE_CLIENT_ID`
- Value: your client ID

Push to `main` and the workflow in `.github/workflows/deploy.yml` builds and publishes to
<https://jacksquare914.github.io/porsche-996-rebuild/>.

### On your phone

Open that URL in Safari or Chrome → Share → **Add to Home Screen**. It launches full
screen with no browser chrome, and the photo button goes straight to the camera.

---

## 3. Hosting it somewhere else instead

Any static host works. Build with the base path at the root:

```bash
BASE_PATH=/ npm run build     # dist/ is the whole site
```

Then add that host's origin to the Authorized JavaScript origins list in step 1.4.

---

## Troubleshooting

**"Error 400: redirect_uri_mismatch" or the popup closes immediately**
The origin you're on isn't in the Authorized JavaScript origins list. Exact match matters:
`https://jacksquare914.github.io` with no path and no trailing slash.

**"Access blocked: this app has not been verified"**
The consent screen is set to External and your address isn't a test user. Switch to
Internal, or add yourself under Audience → Test users.

**It says "Local" and won't connect**
`VITE_GOOGLE_CLIENT_ID` wasn't set at build time. Locally that's `.env`; on Pages it's the
repository variable from step 2.

**Signed out every hour**
Expected — Google access tokens last an hour and this app has no backend to refresh them
silently forever. It re-authorizes without a prompt when it can. Reload and it reconnects.

**Photos don't show a thumbnail**
Drive takes a few seconds to generate one for a fresh upload. The photo is safe; pull to
refresh.
