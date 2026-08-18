# Draft Board

Private fantasy football auction draft utility for one league.

## Local Development

Node.js 20.19 or newer is required. If you use `nvm`, run `nvm use` before installing dependencies.

```bash
npm install
```

Development fails closed unless an execution mode is explicit. The normal
workflow uses the isolated Emulator Suite:

```bash
# Terminal 1: start local Auth, Realtime Database, and Functions emulators
cp functions/.secret.local.example functions/.secret.local
npm run firebase:emulators

# Terminal 2: seed the ignored local catalog snapshots, then start Vite
npm run firebase:seed
npm run dev
```

The emulator client uses the `demo-draft-board-stress` project and connects all
Firebase SDKs to `127.0.0.1`. If an emulator is unavailable, the app fails locally;
it does not fall back to a configured Firebase project. The seed command refuses
non-`demo-` project IDs. Override its ignored snapshot paths when needed:

```bash
npm run firebase:seed -- --catalog /absolute/path/player-catalog.json --metadata /absolute/path/catalog-metadata.json
```

The example emulator secrets are intentionally local-only test values. They must
never be reused for a deployed Firebase project. The local commissioner setup
code is `LOCAL-COMM-2026`.

To intentionally use the remote development project configured by
`.env.development`, run `npm run dev:remote`. Production builds are unchanged.

## League Access Gate

The app shows a password screen before connecting to Firebase. This is a lightweight front-door gate to keep casual strangers out of the hosted draft board without requiring owner logins.

Set one of these Vite environment variables before production deploy:

```bash
VITE_LEAGUE_PASSWORD=your-league-password
```

Or use the stronger option and store only a SHA-256 hash in the built app:

```bash
VITE_LEAGUE_PASSWORD_SHA256=your-password-sha256-hash
```

When neither variable is set, local/dev builds fall back to `draftday` for convenience. Do not rely on that fallback for production.

Owners only need to enter the password once per browser/device unless they clear site data.

## Owner Preseason Backups

Authenticated owners can use **Download my backup** from the preseason workspace to
save their private ranks, tiers, notes, and starred players as a team-bound JSON
file. **Restore my backup** validates the file, previews its item counts in a
confirmation, and atomically replaces only that team's private preparation.

Owner restore controls are available only while the league is in preseason. They
are intentionally separate from the commissioner's live-draft backup and restore
workflow. Owner backup files never contain PINs, activation codes, authentication
records, rosters, budgets, or another team's preferences.
