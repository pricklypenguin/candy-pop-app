# Steady sync server

A small Cloudflare Worker + D1 database that lets the Steady app keep a budget in step across devices.
It only ever stores **encrypted** data: the app encrypts the budget with a key derived from the user's
recovery code, and that key never leaves their devices.

What the server keeps:

| Table   | Contents | Kept for |
|---------|----------|----------|
| `vaults` | random vault id, SHA-256 hash of the vault's access key, revision number, encrypted blob, last-updated time | until deleted by the user, or ~18 months without any change |
| `pairs`  | 6-digit code, two public keys, one encrypted payload | 10 minutes (deleted once collected) |
| `hits`   | rate-limit counters keyed by a hash of the IP address | a day |

Request logging is turned off in `wrangler.toml`.

## Deploying (one-time setup)

You need a free Cloudflare account and Node.js.

```sh
cd server
npm install
npx wrangler login                                   # opens a browser to sign in to Cloudflare
npx wrangler d1 create steady-sync --jurisdiction eu  # data stays in the EU
```

Copy the `database_id` it prints into `wrangler.toml`, and set `ALLOWED_ORIGINS` there to your app's
address (e.g. `https://steady.example.com`; comma-separate several). Then:

```sh
npm run db:migrate:remote   # creates the tables
npm run deploy              # publishes the Worker, prints its address (…workers.dev)
```

Optional but recommended: in the Cloudflare dashboard → Workers → steady-sync → Settings → Domains,
add a custom domain such as `sync.steady.example.com`.

Updating later: `npm run deploy` again (and `npm run db:migrate:remote` if a new migration was added).

## Turning sync on in the app

The app reads two build settings (in Cloudflare Pages: Settings → Environment variables):

| Variable | Value |
|----------|-------|
| `VITE_SYNC_URL` | the Worker's address, e.g. `https://sync.steady.example.com` |
| `VITE_SYNC` | `labs` while testing, `on` to release, `off` to hide completely |

- **labs**: sync is hidden. Open the app once with `?labs=sync` at the end of the address to show it in
  that browser (e.g. `https://steady.example.com/?labs=sync`); `?labs=off` hides it again. Other buyers
  never see it.
- **on**: everyone sees Settings → Sync between devices.
- Without `VITE_SYNC_URL`, sync is always hidden.

When sync isn't shown or hasn't been turned on, the app makes no requests to the server.

## Running locally

```sh
cd server && npm run dev:node        # in-memory server on http://localhost:8787
cd app && VITE_SYNC_URL=http://localhost:8787 npm run dev   # then open http://localhost:5173/?labs=sync
```

`npm run dev` (instead of `dev:node`) runs the real Worker with a local D1 database; run
`npm run db:migrate:local` first. `npm test` runs the API tests.

## Before releasing (GDPR checklist, not legal advice)

- [ ] Cloudflare's Data Processing Addendum applies to your account (it's part of their self-serve terms; check it's accepted under Account → Configurations → Privacy/DPA).
- [ ] D1 database created with `--jurisdiction eu`.
- [ ] Privacy policy updated (draft below) and linked from the app/listing.
- [ ] If you're UK-based: ICO data protection fee paid.
- [ ] A short record of processing / risk note kept (what's stored, why, how long, who processes it).

### Draft privacy policy section: Sync

> **Sync between devices (optional).** Sync is off unless you turn it on. When it's on, your budget is
> encrypted on your device before it's sent to our sync server, using a key made from your recovery
> code. We never receive that key or your recovery code, so we can't read your budget. We store the
> encrypted copy, a random identifier for it and a scrambled (hashed) version of its access key.
> Our server provider, Cloudflare, Inc., processes this data for us in the European Union under their
> data processing terms. Like any website, our server sees your device's IP address when it connects;
> we don't keep request logs, and we only keep a scrambled form of the address for up to a day to stop
> abuse. Pairing a new device uses a 6-digit code that expires after 10 minutes. You can delete the
> synced copy at any time in Settings → Sync between devices; copies that haven't changed for 18
> months are deleted automatically. The legal basis is providing the service you asked for.
> Because we can't identify you or read your data, we can't recover it if you lose your recovery code
> and all your devices.
