# Draft Board

Private fantasy football auction draft utility for one league.

## Local Development

Node.js 20.19 or newer is required. If you use `nvm`, run `nvm use` before installing dependencies.

```bash
npm install
npm run dev
```

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
