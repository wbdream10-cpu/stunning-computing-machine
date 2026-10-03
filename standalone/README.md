# Master7 independent platform preview

This separate deployment serves the customer presentation at `/` and an independently authenticated owner console at `/admin`. It does not modify the existing company website.

Node 24 is required. Run `node --test standalone/test-server.mjs` then `node standalone/server.mjs` from the repository root. Assets and UI are served only from their explicit allowlisted paths. There are no runtime dependencies.

## Initial deployment

The first deployment uses `DEMO_READ_ONLY=true`. Configuration, membership, real wallet balances, real transactions, game-provider connections, payment services, APK distribution, and AI connections are not enabled. The local SQLite file is preview data only; a free instance's filesystem must not be used for durable business records. No wallet IP or payment callback is provisioned by this preview.

The owner entry is fail-closed until a private `ADMIN_PASSWORD_HASH` is configured. Do not commit credentials or personal contact information. The password hash format and environment settings are documented by the server and tests. The server never trusts identity headers from visitors.

Before enabling writes, provision durable storage, complete account management and recovery, and validate the required integrations. Do not use the preview for real financial activity.
