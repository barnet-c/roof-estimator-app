# Deploying to Azure App Service (Linux, Node 20)

This app is a full-stack Node app (Express backend + built React frontend). It
must run on a host that runs Node continuously and has a persistent disk. Azure
**App Service** fits; Azure **Static Web Apps** does NOT (no always-on server /
no persistent disk) — don't use the Static Web App token for this.

Your data (`data/data.json`) and uploaded photos (`uploads/`) are stored on the
App Service's persistent `/home` disk, so they survive restarts. No database
setup needed.

---

## What you need before starting
- An Azure account with an active subscription (the same one you made the
  Static Web App in is fine).
- The secret values listed in **Step 3** (most are ready below; add your
  Anthropic key if you want live AI analysis).

---

## Option 1 — Deploy from VS Code (easiest, no terminal)

1. **Install the extension:** In VS Code, open Extensions (Ctrl+Shift+X), search
   **"Azure App Service"** (publisher: Microsoft), install it. Sign in to Azure
   when prompted (the Azure icon appears in the left sidebar).

2. **Create the web app:**
   - Click the **Azure** icon → under **Resources**, find **App Services**.
   - Click **+** (Create Web App... *Advanced* if offered).
   - Name: something globally unique, e.g. `chicago-roof-estimator` → this becomes
     `https://chicago-roof-estimator.azurewebsites.net`.
   - Runtime stack: **Node 20 LTS**.
   - Operating System: **Linux**.
   - Pricing/SKU: **B1 (Basic)** for an always-on app (~$13/mo), or **F1 (Free)**
     to try it (sleeps when idle, limited hours).

3. **Add your secrets (Application settings):**
   - In the Azure sidebar, expand your new app → right-click **Application
     Settings** → **Add New Setting** for each row in the table in Step 3 below.
   - (Or do it in the Azure Portal: your App Service → **Settings → Environment
     variables → App settings**.)

4. **Deploy the code:**
   - Right-click your web app in the Azure sidebar → **Deploy to Web App...**
   - Choose this project folder (`roof-estimator-app`).
   - When it asks *"Always deploy this workspace?"* you can say yes.
   - If it asks whether to **run `npm install` / build (Oryx) on the server**,
     say **Yes** (this builds the frontend on Azure).
   - Wait for "Deployment successful."

5. **Set the startup command (once):**
   - Portal → your App Service → **Settings → Configuration → General settings →
     Startup Command** → enter: `npm start` → Save (this restarts the app).

6. **Open it:** Browse to `https://<your-app-name>.azurewebsites.net`.

---

## Option 2 — Deploy from the terminal (Azure CLI)

1. Install the Azure CLI: https://aka.ms/installazurecli then:
   ```bash
   az login
   ```
2. From this project folder, one command creates everything and deploys:
   ```bash
   az webapp up \
     --name chicago-roof-estimator \
     --runtime "NODE:20-lts" \
     --sku B1 \
     --os-type Linux
   ```
3. Set the secrets (replace values), then the startup command, then restart:
   ```bash
   az webapp config appsettings set --name chicago-roof-estimator --resource-group <rg-it-created> --settings \
     NODE_ENV=production \
     APP_SECRET="yzizxMPAbx2RQRiWoVLynYxNac9zH2MKxlNbc_0az9dsjWgpk9SaDmuaUkY07VsH" \
     ANTHROPIC_API_KEY="<your-claude-key-or-leave-out>" \
     OPENAI_API_KEY="<your-openai-key>" \
     IMAGE_MODEL="gpt-image-1" \
     EMAIL_PROVIDER="smtp" \
     EMAIL_FROM="isha.test888@gmail.com" \
     SMTP_HOST="smtp.gmail.com" \
     SMTP_PORT="465" \
     SMTP_USER="isha.test888@gmail.com" \
     SMTP_PASS="<your-gmail-app-password>"

   az webapp config set --name chicago-roof-estimator --resource-group <rg-it-created> --startup-file "npm start"
   az webapp restart --name chicago-roof-estimator --resource-group <rg-it-created>
   ```
   (`az webapp up` prints the resource group name it created — use it above.)

---

## Step 3 — Application settings (environment variables)

Set these on the App Service (never commit them; `.env` is gitignored and is NOT
uploaded).

| Name | Value | Required? |
|------|-------|-----------|
| `NODE_ENV` | `production` | Yes |
| `APP_SECRET` | `yzizxMPAbx2RQRiWoVLynYxNac9zH2MKxlNbc_0az9dsjWgpk9SaDmuaUkY07VsH` | **Yes** — signs login tokens |
| `ANTHROPIC_API_KEY` | your Claude API key | For real AI roof analysis (else a mock is used) |
| `OPENAI_API_KEY` | your OpenAI key | For AI "after" images (else offline preview) |
| `IMAGE_MODEL` | `gpt-image-1` | Optional |
| `EMAIL_PROVIDER` | `smtp` | Yes, for email |
| `EMAIL_FROM` | `isha.test888@gmail.com` | Yes, for email |
| `SMTP_HOST` | `smtp.gmail.com` | Yes, for email |
| `SMTP_PORT` | `465` | Yes, for email |
| `SMTP_USER` | `isha.test888@gmail.com` | Yes, for email |
| `SMTP_PASS` | your 16-char Gmail App Password | Yes, for email |

Do **not** set `WEBSITE_RUN_FROM_PACKAGE` — it makes the filesystem read-only and
would break saving estimates/uploads.

---

## After deploying — quick checks
- Visit the site — the homepage loads.
- Create a company account, submit a test roof with a photo.
- Send the estimate to yourself and confirm the email arrives with the PDF.
- Azure Portal → App Service → **Log stream** shows the startup banner and any
  errors.

## Security reminders
- **Rotate the Static Web App deployment token** you shared earlier (Azure Portal
  → that Static Web App → Manage deployment token → Reset). It was exposed in
  plain text and isn't used here.
- Gmail free SMTP sends ~500 emails/day — fine for this use.
