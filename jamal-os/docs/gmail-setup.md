# Connecting Gmail to Jamal OS (read-only)

A self-contained walkthrough. About 10 minutes, done once. Everything
here happens on your laptop where Jamal OS runs.

Jamal OS only ever requests read-only access to Gmail. It cannot send,
delete, or modify anything. Your OAuth tokens are encrypted on disk and
never leave your machine.

---

## Before you start

You need Jamal OS running locally at least once:

```bash
cd jamal-os
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Confirm http://localhost:3000 loads, then continue.

---

## Step 1: Local encryption key

This key encrypts your Gmail token at rest. Generate one:

```bash
openssl rand -hex 32
```

Copy the 64-character output. Open (or create) `jamal-os/.env.local`
and add:

```
LOCAL_ENCRYPTION_KEY=paste_the_64_characters_here
```

`.env.local` is gitignored, so this never gets committed.

---

## Step 2: Create a Google Cloud project

1. Go to https://console.cloud.google.com
2. Top bar, project dropdown, "New Project". Name it anything
   (e.g. `jamal-os`). Create it and make sure it is selected.

---

## Step 3: Enable the Gmail API

1. Left menu: "APIs & Services" → "Library"
2. Search for **Gmail API**
3. Click it, then click **Enable**

---

## Step 4: Configure the OAuth consent screen

1. "APIs & Services" → "OAuth consent screen"
2. User type: **External**. Click Create.
3. Fill the required fields: App name (`Jamal OS`), your email for both
   the support email and developer contact. Leave the rest blank.
   Save and continue.
4. Scopes: skip (click Save and continue). The app requests its scope
   at sign-in time.
5. **Test users**: click "Add users" and add **your own Gmail
   address**. Save and continue.

You do NOT need to publish or verify the app. Leaving it in "Testing"
mode is correct, because you are the only user.

---

## Step 5: Create OAuth credentials

1. "APIs & Services" → "Credentials"
2. "Create Credentials" → "OAuth client ID"
3. Application type: **Web application**
4. Name: anything (`Jamal OS local`)
5. Under **Authorised redirect URIs**, click "Add URI" and paste
   exactly, with no trailing slash:

   ```
   http://localhost:3000/api/oauth/google/callback
   ```

6. Click Create. A dialog shows your **Client ID** and **Client
   secret**. Keep it open for the next step.

---

## Step 6: Put the credentials in .env.local

Add these three lines to `jamal-os/.env.local` (alongside the
encryption key from Step 1):

```
GOOGLE_CLIENT_ID=your_client_id_ending_in.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/oauth/google/callback
```

Save the file.

---

## Step 7: Connect

1. Restart the dev server (stop with Ctrl+C, then `npm run dev`).
   Environment variables are only read at startup.
2. Open http://localhost:3000/email
3. Click **Connect Gmail (read-only)**
4. Google asks you to choose your account and approve read-only access.
   Because the app is in Testing mode you may see a "Google hasn't
   verified this app" screen: click **Advanced**, then **Go to Jamal OS
   (unsafe)**. This warning is expected for your own unverified test
   app; you are approving your own software.
5. You land back on the Email page with a "connected" confirmation.
6. Click **Sync Gmail** to pull your unread messages into triage.

That's it. Use **Sync Gmail** whenever you want to refresh.

---

## Same credentials also unlock Google Calendar

If you want the calendar connector too, you already did the hard part.
Just enable one more API and connect:

1. Google Cloud console → "APIs & Services" → "Library" → enable
   **Google Calendar API** (same project)
2. In Jamal OS, open http://localhost:3000/calendar and click
   **Connect Google Calendar (read-only)**, then **Sync**

No new credentials or redirect URIs needed.

---

## Troubleshooting

- **"redirect_uri_mismatch"**: the URI in Step 5 must match exactly:
  `http://localhost:3000/api/oauth/google/callback`, no trailing slash,
  `http` not `https`, port 3000. Edit the credential and try again.
- **"access_blocked" / "app not verified" with no way past**: confirm
  your Gmail address is listed under Test users (Step 4.5).
- **The Connect button is missing**: the three `GOOGLE_*` values are
  not loaded. Check they are in `jamal-os/.env.local` (not the repo
  root) and that you restarted the server.
- **Sync stops working after about a week**: Google expires test-mode
  refresh tokens after 7 days of inactivity. Just click **Connect
  Gmail** again to refresh. (Publishing the app removes this limit, but
  it is unnecessary for personal use.)
- **Connection failed: state check**: start the flow again from the
  Connect button; the sign-in attempt timed out.

---

## What this does and does not do

- Scope requested: `https://www.googleapis.com/auth/gmail.readonly`
  only. No send, no modify, ever.
- Stores unread message snippets (sender, subject, a short preview) for
  triage. Full email bodies stay in Gmail.
- Drafted replies are written locally and copied by hand. Jamal OS
  never sends email on your behalf.
- Your token is AES-256-GCM encrypted on disk under your
  `LOCAL_ENCRYPTION_KEY`. Nothing is sent anywhere except Google's own
  API.
