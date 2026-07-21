# Advisory Management System

A mobile-first advisory service management app: companies, advisory cycles,
visits, assessment plans, corrective actions, meeting logs, a bipartite
committee register, a CAP recommendation library, user accounts with a
permission matrix, and exportable reports.

## Local development

**Set up Firebase first** — see "Data storage" below. Without a valid
`.env`, the app will load but every screen will show empty/error states
since Firestore calls will fail.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Resize your
browser or open dev tools' device toolbar to see the mobile layout — the
app is designed for a phone-width screen.

## Data storage — Firebase Firestore

This app stores its data (companies, visits, corrective actions, users,
etc.) in a Firestore database via `src/storageShim.js`, so everyone who
opens the deployed site sees and edits the same shared data — not a
separate copy per browser.

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
   and create a new project (Google Analytics is optional, skip it).
2. In the project, go to **Build → Firestore Database → Create database**.
   Choose **production mode** and any region close to your users.
3. Go to **Build → Authentication → Get started**, then enable two sign-in
   providers:
   - **Anonymous** — gives every visitor a Firebase identity before they've
     logged in, so Firestore rules can require "must have opened the app"
     instead of being wide open to the internet. See `src/firebase.js` for
     the full explanation.
   - **Email/Password** — this is the app's real login. User accounts (name,
     role, company, permissions) still live in Firestore, but sign-in
     itself is genuine Firebase Authentication, which is what makes the
     "Forgot password" flow on the login screen send real reset emails.
4. Go to **Project settings → General → Your apps**, click the web icon
   (`</>`) to register a web app, and copy the config values shown
   (`apiKey`, `authDomain`, `projectId`, etc.).

### 2. Set Firestore security rules

In **Firestore Database → Rules**, paste the contents of `firestore.rules`
(included in this project) and click **Publish**. Without this, Firestore
defaults to rejecting all reads/writes and nothing in the app will load.

### 3. Configure your local environment

```bash
cp .env.example .env
```

Fill in the six `VITE_FIREBASE_*` values from step 1.4. `.env` is
gitignored — never commit real config to a public repo (see note below on
why that matters less than it sounds, but still).

### 4. Configure GitHub Actions (for auto-deploy)

The build step needs the same six values at build time. In your GitHub
repo, go to **Settings → Secrets and variables → Actions → New repository
secret** and add each of:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

`.github/workflows/deploy.yml` already passes these into the build.

### A note on "secrets" that aren't really secret

Firebase's web config values (`apiKey` and friends) identify your project;
they aren't secret credentials the way a database password is, and
Firebase's own docs say it's fine for them to end up in client-side
bundles (they will, unavoidably, since the browser needs them to talk to
Firestore). What actually protects your data is the **Firestore security
rules** from step 2, not hiding these values. Still, keeping them out of
git via `.env` + GitHub secrets is good hygiene and avoids leaking them to
search engines/bots that scrape public repos.

### Known limits worth knowing

- **Firestore document size limit is 1 MiB.** Visit photo attachments are
  auto-compressed before saving, but if someone attaches many photos to
  one visit, that visit's `attachments:<id>` document could theoretically
  approach that limit. If you hit it, lower the photo count/quality in
  `compressImageFile()` in `src/App.jsx`, or migrate attachments to
  Firebase Cloud Storage (a bigger change, ask if you want this done).
- **The app's roles (Admin/Manager/Officer/Company User) are enforced in
  the UI, not in Firestore rules.** See the note at the top of
  `firestore.rules` for what that means in practice.
- **Free tier ("Spark plan") limits:** Firestore's free tier is generous
  (50K reads / 20K writes per day) but this app polls storage on every
  save, not on a timer, so normal usage should stay well within it for a
  small team. If you outgrow it, Firebase's paid "Blaze" plan is pay-as-
  you-go.

## Demo accounts

Log in with **email**, not username — the login screen only asks for an
email and a password.

| Email                       | Password   | Role                                           |
|------------------------------|------------|-------------------------------------------------|
| `dara@advisoryco.com`        | admin123   | Administrator                                    |
| `lina@advisoryco.com`        | manager123 | Manager                                          |
| `vichet@advisoryco.com`      | officer123 | Advisory Officer                                 |
| `sokha@meridianapparel.com`  | company123 | Company User (scoped to Meridian Apparel Co.)    |

These ship as legacy plaintext-password records (a holdover from before
real authentication existed) and **migrate themselves automatically the
first time each one logs in**: entering the password above creates a real
Firebase Authentication account behind the scenes, links it to that
profile, and discards the plaintext password — invisibly, in one login, no
separate migration step. Every account created after that point (via User
Accounts → New) is a real Firebase Auth account from the start, with no
password ever set or stored by an admin — a real password-reset email is
sent immediately so the new user sets their own.

## Building for production

```bash
npm run build
```

Outputs a static site to `dist/`. Preview it locally with:

```bash
npm run preview
```

## Deploying to GitHub Pages

Two options — pick one.

### Option A: automatic, via GitHub Actions (recommended)

This repo includes `.github/workflows/deploy.yml`, which builds and
deploys automatically on every push to `main`.

1. Push this project to a GitHub repository.
2. In the repo, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. In `vite.config.js`, set `base` to match your repo name:
   ```js
   base: "/your-repo-name/",
   ```
   (If you're deploying to `https://<username>.github.io/` directly, a
   user/organization site, set `base: "/"` instead.)
4. Push to `main`. Check the **Actions** tab for build progress; once it
   finishes, your site is live at the URL shown in
   **Settings → Pages**.

### Option B: manual, via the `gh-pages` package

Make sure `.env` (step 3 above) is filled in locally first, since this
builds on your machine, not in CI.

```bash
npm run build
npm run deploy
```

This pushes the contents of `dist/` to a `gh-pages` branch. Then in
**Settings → Pages**, set **Source** to **Deploy from a branch** and
pick the `gh-pages` branch.

## Project structure

```
index.html            Vite entry HTML
src/main.jsx           React root, loads the storage shim first
src/App.jsx             The entire application (views, forms, permissions)
src/firebase.js          Firebase init + anonymous auth
src/storageShim.js       Firestore-backed polyfill for window.storage
firestore.rules          Reference security rules (paste into Firebase Console)
.env.example              Firebase config template — copy to .env
vite.config.js         Build config — set `base` for GitHub Pages
.github/workflows/     Auto-deploy workflow (needs repo secrets, see above)
```

## Tech stack

- React 18 + Vite
- Firebase (Firestore + Anonymous Auth) for shared data storage
- [lucide-react](https://lucide.dev/) for icons
- [SheetJS (xlsx)](https://sheetjs.com/) for Excel export
- PDF export via the browser's print dialog (no extra dependency)
- Plain inline styles — no CSS framework
