# Google OAuth Setup for Onemail

## 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project → New project**
3. Name it `Onemail` and click **Create**

## 2. Enable the Gmail API

1. In the left menu, go to **APIs & Services → Library**
2. Search for `Gmail API` and click **Enable**

## 3. Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** (unless your org uses Google Workspace)
3. Fill in:
   - App name: `Onemail`
   - User support email: your email
   - Developer contact information: your email
4. Click **Save and continue**

### Scopes (step 2 of the wizard)

Click **Add or remove scopes** and add:

| Scope | Reason |
|---|---|
| `https://www.googleapis.com/auth/gmail.modify` | Read and modify Gmail messages |
| `openid` | Verify identity |
| `email` | Get account email address |
| `profile` | Get display name and avatar |

> `gmail.modify` is a **restricted scope**. For production use (more than 100 users)
> you must complete Google's [OAuth app verification](https://support.google.com/cloud/answer/9110914).
> During development, add test users instead.

5. Click **Save and continue**

### Test users (development only)

1. On step 3, click **Add users**
2. Add every Google account email you want to test with
3. Click **Save and continue → Back to dashboard**

## 4. Create OAuth credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `Onemail Web`
5. **Authorized redirect URIs** — add both:
   - `http://localhost:8787/auth/google/callback` (development)
   - `https://api.yourdomain.com/auth/google/callback` (production)
6. Click **Create**
7. Copy **Client ID** and **Client secret**

## 5. Add secrets to Onemail

### Local development

Edit `apps/worker/.dev.vars`:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
APP_URL=http://localhost:5173
WORKER_URL=http://localhost:8787
SESSION_SECRET=<output of: openssl rand -hex 32>
TOKEN_ENCRYPTION_KEY=<output of: openssl rand -hex 32>
ENVIRONMENT=development
```

### Production (GitHub Actions)

In your GitHub repo → **Settings → Secrets and variables → Actions**, add:

| Secret name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Worker + Pages + D1 + KV + R2 permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `SESSION_SECRET` | 64 hex chars (`openssl rand -hex 32`) |
| `TOKEN_ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`) |
| `APP_URL` | `https://onemail.yourdomain.com` |
| `WORKER_URL` | `https://api.onemail.yourdomain.com` |

## 6. Cloudflare API token permissions

When creating a Cloudflare API token, grant:

- **Workers Scripts** — Edit
- **Workers KV Storage** — Edit
- **Workers D1** — Edit
- **Cloudflare Pages** — Edit
- **R2 Storage** — Edit

Scope it to your account or a specific zone.

## Notes on OAuth app verification

Google requires verification for apps requesting restricted scopes (`gmail.modify`)
that will have **more than 100 users**. The verification process involves:

- A privacy policy URL
- A homepage URL
- A demo video
- A security assessment (for sensitive/restricted scopes)

During development, keep your app in **Testing** mode and use test users.
