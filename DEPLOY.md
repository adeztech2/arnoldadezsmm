# Deploying ADEZ SMM outside Lovable

This app keeps using the Lovable Cloud database and login. You only host the website.

## 1. Install & build
```
npm install        # or bun install
npm run build
```
The app is TanStack Start, built for Cloudflare Workers (`wrangler deploy`). Other hosts need a Node/edge adapter.

## 2. Environment variables (set these on your host)

Public — already filled in `.env`:
```
VITE_SUPABASE_URL=https://ktdixahusxgvbidjidoh.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_2kGBRR5gUPtUXXIJyV2O-w_48Mg2wwI
VITE_SUPABASE_PROJECT_ID=ktdixahusxgvbidjidoh
SUPABASE_URL=https://ktdixahusxgvbidjidoh.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_2kGBRR5gUPtUXXIJyV2O-w_48Mg2wwI
SUPABASE_PROJECT_ID=ktdixahusxgvbidjidoh
```

Private — you must supply these yourself:
```
SUPABASE_SERVICE_ROLE_KEY=   # not available on Lovable Cloud (see note)
PAYSTACK_SECRET_KEY=         # Paystack Dashboard > Settings > API Keys
SHAKERGAINS_API_KEY=         # your Shakergains account
GIFTEDPAY_API_KEY=           # your GiftedPay account
```

## 3. Notes
- Lovable Cloud does not give out the service role key, so server actions that use admin access (placing orders, wallet updates, admin pages) will not work on outside hosting. Login and normal reads still work.
- Set your Paystack webhook to `https://YOUR-DOMAIN/api/public/webhooks/paystack`.
- Google sign-in goes through Lovable and may not work on another domain. Email/password sign-in works.
