# Master7 platform

Independent, read-only platform preview. The customer page is served at `/`; the separate owner entry is `/admin`. Page names and assets use Master7 branding. No external sign-in service is required.

## Run and verify

Use Node.js 24.19.0. There are no runtime dependencies to install.

```sh
npm test
npm start
```

The HTTP server listens on `0.0.0.0` and the `PORT` environment variable (default `3000`). `/healthz` reports service health and whether owner login is configured.

## Render deployment

Deploy this repository with the included `render.yaml`, or create a Node web service with build command `npm test`, start command `npm start`, and health path `/healthz`. Keep the repository root as the service root directory. The Blueprint selects a free Singapore service and manual deployments.

The first deployment is read-only and uses an in-memory database. Free services can sleep after inactivity; their filesystem must not hold durable business records. This preview provisions no payment callback or fixed wallet IP.

Once Render assigns the actual HTTPS address, set `SITE_ORIGIN` to that exact origin, without a trailing slash or path. A custom domain is configured separately after ownership and DNS are verified; no domain is claimed by this repository.

## Owner login

Owner access stays locked until a private `ADMIN_PASSWORD_HASH` is configured in the service environment. Generate the hash with the exported `hashPassword()` function in `standalone/server.mjs`; its format is `scrypt$16384$8$1$<salt>$<hash>`. Supply the password through a private input mechanism and store only the resulting hash. Do not put passwords, hashes, account contact details or API keys in Git.

The service uses secure, HTTP-only session cookies, validates request origins and CSRF tokens, limits failed login attempts, and rejects identity headers supplied by visitors. Keep `ADMIN_COOKIE_SECURE=true` for HTTPS deployments.

## Current scope

Real member registration and login, game-provider APIs, wallets, transactions, payments, downloads and AI requests remain pending. The initial deployment accepts no configuration mutations. Before enabling writes, implement and validate those services and configure durable storage; `DEMO_READ_ONLY=false`, `PERSISTENT_STORAGE_CONFIRMED=true` and `DATA_DIR` are all required to lift the server's read-only guard.
