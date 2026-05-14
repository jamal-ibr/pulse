# Setting up GitHub Actions → Google Drive (phone-driven workflow)

Goal: from your phone, tap one button and within 30 minutes a fresh
outreach Sheet appears in your Drive. After this one-time setup,
you never need a laptop for it again.

## What you'll have at the end

- A GitHub Actions workflow (already committed to this branch) that runs
  the full pipeline on GitHub's servers.
- A Google Cloud **service account** with permission only to write to one
  specific Drive folder.
- 5 secrets stored on the GitHub repo (API keys + service account JSON).
- A weekly Monday-morning cron + a manual "Run workflow" button in GitHub
  mobile.

## Step 1 — Create the service account (~5 mins, easier on a laptop)

1. Visit <https://console.cloud.google.com>.
2. Top bar: pick or create a project (e.g. "pulse-leads").
3. APIs & Services → Library → search **Google Drive API** → click
   **Enable**.
4. IAM & Admin → Service Accounts → **+ Create service account**.
   - Name: `pulse-lead-uploader`
   - Grant no roles
   - Click Done.
5. Click the newly created service account → Keys tab → **Add key**
   → Create new key → JSON → Download.
6. Keep that JSON file safe. **You'll paste its full contents into a
   GitHub secret in step 3.**

Note the email of the service account — it looks like
`pulse-lead-uploader@pulse-leads-xxxxx.iam.gserviceaccount.com`. You
need this in step 2.

## Step 2 — Create a Drive folder and share it (~1 min, doable on phone)

1. <https://drive.google.com> → New → Folder → name it "Pulse leads".
2. Right-click the folder → Share → paste the service account's email
   address → set role to **Editor** → Send (or uncheck "notify" if you
   prefer).
3. Open the folder and copy its ID from the URL:

   ```
   https://drive.google.com/drive/folders/1AbCdEf...XYZ
                                          ↑
                                          this is your folder ID
   ```

## Step 3 — Add secrets to GitHub (~3 mins, fine on phone)

GitHub mobile (or desktop): repo → Settings → Secrets and variables →
Actions → **New repository secret**. Add these five:

| Secret name | Value |
|---|---|
| `GOOGLE_PLACES_API_KEY` | Your Places API (New) key |
| `COMPANIES_HOUSE_API_KEY` | Your Companies House API key |
| `APOLLO_API_KEY` | Your Apollo API key |
| `GDRIVE_SERVICE_ACCOUNT_JSON` | **Entire contents** of the JSON file from step 1.6 — paste the whole thing, including the curly braces. |
| `GDRIVE_FOLDER_ID` | The folder ID from step 2.3 |

## Step 4 — Run it from your phone

1. Open the GitHub mobile app (or m.github.com).
2. Navigate to this repo → Actions tab.
3. Pick the **"Lead scrape + Drive upload"** workflow.
4. Tap **Run workflow** → select branch `leads/invisalign-birmingham` →
   confirm.
5. Watch the green check (≈30–40 min). The cron also runs it 07:00 UTC
   every Monday automatically.
6. When done, refresh your Drive folder on your phone. You'll see two
   new files dated today:
   - `outreach-outreach-quality-*.csv` — raw CSV
   - `outreach-outreach-quality-*` — Google Sheet (this is the one to
     tap; you can filter / sort / dial from it directly)

## Troubleshooting

- **Workflow failed at "Run outreach pipeline":** open the workflow run
  in Actions, click the failed step, read the last 30 lines of logs.
  Most likely an API key is missing or wrong — fix the secret and
  re-run.
- **No files appear in Drive:** double-check the folder ID secret and
  that the service account email is actually shared with that folder as
  Editor. The job logs will say `drive: uploaded CSV (xxx) + Sheet (yyy)`
  on success.
- **"GDRIVE_SERVICE_ACCOUNT_JSON is not valid JSON":** the secret got
  truncated or mangled on paste. Open the downloaded JSON in a text
  editor, copy the whole file, paste it as one unbroken string into the
  secret value field.
- **0 leads delivered:** quality mode is strict. Look at the
  `droppedQuality` count in the run logs — it's working as intended,
  the bar just filtered everything out. To inspect what *would* have
  passed, temporarily flip `QUALITY_MODE` to `0` in the workflow file
  for one run.

## Costs

- **GitHub Actions:** free for public repos. Private repos get 2,000
  free min/month (this pipeline takes ~30 min per run; 4 weekly runs +
  a few manual = well under).
- **Google Cloud:** service accounts and Drive API are free.
- **Apollo:** Search calls are free per Apollo's docs. No credits burned
  by the cron or manual runs.
- **Google Places, Companies House:** within free tiers for this volume.
