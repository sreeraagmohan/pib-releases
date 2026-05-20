# PIB Alerts

Instant email alerts and an 8 PM daily digest for significant Indian government press releases, powered by Claude AI.

- **Breaking alerts** — email within 30 minutes of a high-importance release (opt-in)
- **Evening brief** — 8 PM IST digest of everything that mattered that day (default on)
- **AI-filtered** — Claude scores every release 1–10; only 7+ triggers a breaking alert

---

## How it works

```
PIB RSS feeds → GitHub Actions (every 30 min)
                    ↓
              Claude API — scores 1–10, writes headline
                    ↓
              Supabase — stores articles + subscribers
                    ↓
         score ≥ 7? → Resend API → breaking alert email
         8 PM IST  → Resend API → digest email
```

Everything runs free or near-free:

| Component | Service | Cost |
|-----------|---------|------|
| Frontend hosting | GitHub Pages | Free |
| Cron jobs | GitHub Actions | Free (2000 min/month) |
| Database | Supabase | Free tier |
| Email delivery | Resend | Free (3,000 emails/month) |
| AI | Anthropic Claude API | ~$0.01–0.05/day |

---

## One-time setup (~25 minutes)

### 1. Get a Claude API key
Sign up at **console.anthropic.com** → create an API key → add $5 of credits (lasts months).

### 2. Create a Supabase project
1. Sign up at **supabase.com** → New project
2. Go to **SQL Editor** → paste and run `supabase/schema.sql`
3. Go to **Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon / public key** → `SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_KEY` *(keep this secret)*

### 3. Generate a Gmail App Password
1. Go to **myaccount.google.com → Security** and make sure 2-Step Verification is on
2. Search for **"App Passwords"** in the search bar → Create one (name it "PIB Alerts")
3. Copy the 16-character password — you'll paste it as a GitHub secret

### 4. Fill in the frontend config
Open `public/config.js` and paste your Supabase URL and anon key.

### 5. Create a GitHub repo and push
```bash
git init
git add .
git commit -m "Initial commit"
# Create a new repo at github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/pib-alerts.git
git push -u origin main
```

### 6. Add GitHub repository secrets
Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Value |
|--------|-------|
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `SUPABASE_URL` | From Supabase Settings → API |
| `SUPABASE_SERVICE_KEY` | Service role key (not the anon key) |
| `GMAIL_USER` | Your Gmail address (e.g. `you@gmail.com`) |
| `GMAIL_APP_PASSWORD` | The 16-char App Password from step 3 |
| `SITE_URL` | e.g. `https://YOUR_USERNAME.github.io/pib-alerts` |

### 7. Enable GitHub Pages
Go to your repo → **Settings → Pages**:
- Source: **Deploy from a branch**
- Branch: `main`, folder: `/public`
- Save → site goes live at `https://YOUR_USERNAME.github.io/pib-alerts/`

### 8. Update manifest.json and unsubscribe links
Once you know your GitHub Pages URL, update `"start_url"` and `"scope"` in `public/manifest.json` to `/pib-alerts/`.

The unsubscribe URL in emails is built from the `SITE_URL` secret — no manual changes needed.

### 9. Test immediately
Go to **Actions → Fetch PIB Releases → Run workflow** — this runs the script right away without waiting for the 30-minute cron.

Check the Actions log to confirm it's fetching articles and classifying them.

---

## Verifying the RSS feed URLs

PIB has per-ministry RSS feeds. The defaults in `scripts/fetch-and-classify.js` cover PMO, MEA, Finance, and Defence. Confirm they work by opening them in a browser. If PIB changes their URL structure, update the `PIB_RSS_FEEDS` array.

Find more feeds at **pib.gov.in** — look for the RSS icon on any ministry page.

---

## What gets flagged as important (score 7+)

- PM Modi foreign visits, bilateral summits, joint statements, MoUs signed
- Trade deals, tariffs, RBI decisions, major budget items
- Defence agreements, military exercises, arms procurement
- Foreign policy shifts, diplomatic incidents, expulsions, sanctions
- Major cabinet decisions with national economic impact
- G20, SCO, BRICS, UN, WTO multilateral outcomes

Routine administrative releases (scheme launches, award ceremonies, event announcements) score below 7 and are stored but don't trigger breaking alerts.

---

## Keeping the Actions alive

GitHub pauses scheduled workflows if a repo has **no activity for 60 days**. Just push a small commit (edit the README, for example) to re-enable them.
