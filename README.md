# Simtura Leads — EMS Partnership Outreach System

A complete lead generation automation system for Simtura.ai. Manages email sequences to EMS agencies and teaching schools, detects replies, drafts LinkedIn content, and shows everything in a live dashboard.

---

## What This Does

- **5-step email drip** over 21 days per prospect, personalized by Claude AI
- **Reply detection** by polling your Outlook inbox via Microsoft Graph
- **LinkedIn post drafts** (4 posts/week: hook, education, community, proof) — you approve before anything is posted
- **Daily digest email** summarizing what happened that day
- **Web dashboard** to manage everything: pipeline kanban, sequences, replies, LinkedIn queue, bulk CSV import

---

## Setup: Step-by-Step

### 1. Prerequisites

- **Node.js 18 or higher** — check with `node --version`. Download at https://nodejs.org if needed.
- A **Microsoft 365 account** with a mailbox you want to send from (your work email or a dedicated outreach account)
- An **Anthropic API key** — get one at https://console.anthropic.com

---

### 2. Register an Azure App (for Outlook email)

You need to give this app permission to send/read your Outlook inbox. This takes about 5 minutes.

1. Go to https://portal.azure.com → search "App registrations" → click **New registration**
2. Name it `Simtura Leads`, choose "Accounts in this organizational directory only", click Register
3. On the app page, note your **Application (client) ID** and **Directory (tenant) ID** — you'll need both
4. Go to **Certificates & secrets** → **New client secret** → name it anything, set expiry (24 months is fine) → click Add → **copy the Value immediately** (it disappears after you leave)
5. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions** → search and add:
   - `Mail.Send`
   - `Mail.ReadWrite`
6. Click **Grant admin consent** (the blue button at the top of the permissions list) — your admin may need to do this
7. If you're the admin: click the "Grant admin consent for [your org]" button and confirm

---

### 3. Configure Environment Variables

Copy the example file:

```bash
cp .env.example .env
```

Open `.env` in any text editor and fill in:

```
ANTHROPIC_API_KEY=sk-ant-...          # From console.anthropic.com
MS_CLIENT_ID=xxxxxxxx-...             # From Azure App Registration
MS_CLIENT_SECRET=your-secret-value   # The secret Value you copied
MS_TENANT_ID=xxxxxxxx-...            # From Azure App Registration
MS_USER_EMAIL=you@yourdomain.com     # The mailbox to send FROM and read replies FROM
OPERATOR_EMAIL=you@yourdomain.com    # Where daily digests are sent (can be same as above)
BASE_URL=https://your-app.onrender.com  # Your Render URL (update after deploying)
PORT=3000
```

---

### 4. Install and Run Locally

```bash
cd simtura-leads
npm install
node src/index.js
```

Open http://localhost:3000 in your browser. You should see the dashboard with 5 pre-loaded starter prospects.

---

### 5. Deploy to Render

Render is a cloud platform that runs your app. The free/starter tier works fine.

1. Push this project to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/simtura-leads.git
   git push -u origin main
   ```

2. Go to https://dashboard.render.com → click **New** → **Blueprint**

3. Connect your GitHub account and select the `simtura-leads` repo

4. Render reads `render.yaml` automatically and creates **two services**:
   - `simtura-leads-dashboard` — the web dashboard (runs 24/7)
   - `simtura-leads-scheduler` — a cron job that runs daily at 8am ET

5. For each service, click **Add environment variable** and add all variables from your `.env` file

6. Click **Apply** — Render deploys both services (takes 2–3 minutes)

7. Once deployed, copy your dashboard URL (e.g., `https://simtura-leads-dashboard.onrender.com`) and set it as `BASE_URL` in both Render services' environment variables, then re-deploy. This makes unsubscribe links in emails point to the right URL.

---

### 6. Test the Setup

In the dashboard:
1. Go to **Settings** — verify Microsoft Graph shows "● Connected" and Anthropic shows "● Key present"
2. Click **▶ Run Daily Job Now** — this sends step 1 emails to the 5 starter prospects, checks for replies, and sends you a digest email
3. Check your inbox for the digest email within a minute or two

---

## Understanding the Email Sequence

Each prospect goes through a 5-step sequence:

| Step | Day | Purpose |
|------|-----|---------|
| 1    | Day 1  | Warm introduction to Simtura.ai |
| 2    | Day 4  | Specific pain point + how we solve it |
| 3    | Day 8  | Social proof / use case |
| 4    | Day 14 | Different angle / genuine question |
| 5    | Day 21 | Graceful breakup email |

- If someone **replies**, their sequence pauses automatically and they show up in the Replies tab
- If someone **unsubscribes** (clicks the link in any email), they're permanently removed from all future sends
- You can manually **pause/resume** any prospect's sequence from the Sequences tab

---

## Adding Prospects

Two options:

**Manual (one at a time):**
Go to **Add Prospects** → fill in the form → click Add

**Bulk via CSV:**
Paste a CSV into the bulk import area. Required headers:
```
name, organization, type, email, contact_name, contact_title, notes
```
- `type` must be `agency` or `school`
- Each row becomes one prospect

---

## LinkedIn Posts

Every Monday, the system drafts 4 posts (hook, education, community, proof) targeting EMS directors and program directors. They appear in the **LinkedIn Queue** tab as drafts.

You review and edit each post, then click **Approve**. Approved posts sit in the Approved section until you manually copy and paste them into LinkedIn. **Nothing is auto-posted.**

---

## Dashboard Views

| View | What it shows |
|------|---------------|
| Overview | 4 KPI cards, pipeline funnel, recent activity feed |
| Pipeline | Kanban board — drag cards between stages |
| Sequences | All active email sequences with step tracking and pause toggle |
| Replies | Prospects who replied, suggested responses from Claude, action buttons |
| LinkedIn Queue | This week's draft posts with edit/approve workflow |
| Add Prospects | Manual form + CSV bulk import |
| Settings | Config, API connection status, Run Now button |

---

## Troubleshooting

**"MS Graph error" in the sidebar status dot:**
- Double-check your Azure app has `Mail.Send` and `Mail.ReadWrite` application permissions
- Make sure admin consent was granted (the Grant admin consent button in Azure portal)
- Verify `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`, and `MS_USER_EMAIL` are all set correctly

**Emails aren't sending:**
- Check the Settings page → "Run Daily Job Now" → watch for errors in the Render logs
- Make sure `next_send_date` is set for prospects (check the Sequences view)
- Verify you haven't hit the daily send limit (default 50)

**Not getting the digest email:**
- Check `OPERATOR_EMAIL` is set correctly
- The digest is only sent if the Microsoft Graph connection works

**Render cron job isn't running:**
- Render cron jobs require a paid plan (Starter, $7/month). The web dashboard works on the free tier.
- Alternatively, the dashboard has an embedded cron that runs alongside it — the cron service is an extra for reliability

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for email personalization |
| `MS_CLIENT_ID` | Yes | Azure app client ID |
| `MS_CLIENT_SECRET` | Yes | Azure app client secret |
| `MS_TENANT_ID` | Yes | Azure tenant ID |
| `MS_USER_EMAIL` | Yes | Mailbox to send from / read replies from |
| `OPERATOR_EMAIL` | Yes | Where daily digests are sent |
| `BASE_URL` | Yes | Your deployed app URL (for unsubscribe links) |
| `PORT` | No | Server port (default: 3000) |
| `CLAUDE_MODEL` | No | Claude model to use (default: claude-sonnet-4-6) |
| `HUNTER_API_KEY` | No | Hunter.io key (reserved for future email enrichment) |

---

## Tech Stack

- **Node.js + Express** — server and API
- **better-sqlite3** — embedded database (no external DB needed)
- **node-cron** — in-process scheduler
- **@anthropic-ai/sdk** — Claude API for email + LinkedIn generation
- **node-fetch** — Microsoft Graph API calls
- **Vanilla JS + Pure CSS** — zero-dependency frontend

---

Built for Simtura.ai · EMS Partnership Outreach
