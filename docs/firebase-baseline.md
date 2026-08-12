# Firebase Baseline

Captured on 2026-08-12 before the preseason player-preferences work.

## Project Configuration

- Production/default project alias: `ff-draft-board`
- Development project alias: `ff-draft-board-dev`
- Client database: Firebase Realtime Database
- Production database URL: `https://ff-draft-board-default-rtdb.firebaseio.com`
- Cloud Functions region: `us-central1`
- Hosting serves `dist` and rewrites the player-news API routes to Cloud Functions.
- The web client uses Firebase application configuration from Vite environment variables with a checked-in production fallback.

The root `package.json` now declares Node.js 20.19 or newer. The Functions package declares Node.js 20.

## Configuration Findings

- The deployed Realtime Database rules were downloaded and reviewed. They currently allow unauthenticated reads and writes to the entire database with root-level `.read: true` and `.write: true`.
- The deployed rules baseline is preserved in `docs/deployed-database-rules-baseline.json`.
- A matching `database.rules.json` and local Emulator Suite configuration were added during Phase 0 so future rule changes can be tested and versioned.
- Firebase Authentication has not been initialized; the console currently presents the initial `Get started` state with no configured providers.
- The production Firebase project is on the Blaze plan and is eligible for the planned paid-tier backup and scheduled backend capabilities.
- A compatible Firebase CLI can be run through `npx`; it is not installed as a project dependency.
- Authentication and Functions emulator smoke tests pass with the supported Node runtime.
- The Realtime Database emulator requires a local Java runtime, which is not currently installed; its smoke test remains blocked.

The database currently does not protect commissioner or team-specific writes. The existing shared league access gate is a browser-side front door only; it does not establish Firebase identity or authorization. Replacing these public rules is a release prerequisite for team PIN authentication.

## Current Top-Level Database Shape

The following shape is derived from all database reads and writes in the current source.

```text
draft
  leagueName
  status: setup | lobby | active | paused | complete
  nominationOrderIds: teamId[]
  nominationIndex
  currentNomination
    playerId
    nominatingTeamId
    startedAt
  createdAt
  startedAt
  timerEnabled
  timerDuration
  timerStartedAt

teams/{teamId}
  name
  ownerName
  nominationOrder
  budgetRemaining
  connected
  lastSeen
  roster/{playerId}
    playerName
    position
    nflTeam
    slotType
    pricePaid
    projectedValue

players/{playerId}
  name
  position
  nflTeam
  positionalRank
  overallRank
  projectedValue
  sleeperPlayerId
  headshotUrl
  injuryStatus
  injuryBodyPart
  status: available | nominated | sold
  soldTo
  soldPrice

playerCatalog/{stablePlayerId}
  name
  position
  positionalRank
  overallRank
  sharedTier
  nflTeam
  sleeperPlayerId
  headshotUrl
  catalogMatchStatus
  catalogStatus: active | inactive
  catalogCreatedAt
  catalogUpdatedAt

catalogMetadata
  schemaVersion
  sourceFileName
  sourceSha256
  sleeperSourceUrl
  importedAt
  summary

log/{logId}
  type: sold | undo
  timestamp
  playerId
  playerName
  teamId
  teamName
  pricePaid
  projectedValue
  slotType

watchlists/{teamId}/{playerId}
  watched: true

personalRanks/{teamId}/{playerId}: number
```

The planned `personalTiers`, authentication/access, backup metadata, and audit structures do not exist yet. The stable `playerCatalog` and `catalogMetadata` structures were established on 2026-08-12.

## Current Read Paths

- `draft/status` controls application routing.
- `draft`, `teams`, `players`, and `log` are synchronized on live draft screens.
- `.info/connected` drives the Firebase connection indicator.
- `watchlists/{selectedTeamId}` and `personalRanks/{selectedTeamId}` are synchronized for the selected owner team.

## Current Write Paths

### Setup and restore

- Setup replaces the complete `players`, `teams`, and `draft` trees and clears `log`.
- Restore replaces `draft`, `teams`, `players`, and `log` from uploaded JSON.

### Owner/device operations

- The selected device updates `teams/{selectedTeamId}/connected` and `lastSeen`.
- The selected owner updates `watchlists/{selectedTeamId}`.
- The selected owner updates `personalRanks/{selectedTeamId}`.
- Owner nomination currently updates shared draft and player state directly from the browser.

### Commissioner operations

- Commissioner controls timer and nomination state under `draft`.
- Commissioner adds and updates players.
- Selling a player updates the player, team roster, team budget, log, and draft state through several separate writes.
- Undo reverses those records through several separate writes.
- End/resume/reset operations write or remove shared top-level data directly from the browser.

## Reliability and Security Findings

- Team identity is currently a `localStorage` team ID, not an authenticated Firebase identity.
- Selecting `commissioner` is currently sufficient to expose commissioner controls in the UI.
- Critical sale and undo workflows use multiple independent database writes rather than one atomic root update or trusted backend transaction.
- Client timestamps use `Date.now()` rather than Firebase server timestamps.
- Presence cleanup uses browser unload handlers; it does not currently register server-side `onDisconnect` operations.
- The current automatic backup is a commissioner-browser `localStorage` snapshot created after a sale.
- The current downloadable backup includes only `draft`, `teams`, `players`, and `log`.
- The current reset and completed-draft reset do not remove watchlists or personal ranks.
- The pre-migration production snapshot was saved locally at `backups/pre-migration-2026-08-12.json`. It is ignored by Git because it contains private league data.
- The snapshot is valid JSON with six top-level trees: `draft`, `log`, `personalRanks`, `players`, `teams`, and `watchlists`.
- Snapshot SHA-256: `fcd1a08f945f34a791331c8b45b21e617f40ca4e81f0bc49a0b530b3ef6ae20d`.

These findings are baseline observations, not scope additions. Authentication, rules, stable player identity, and expanded recovery are already represented in the implementation plan. Atomic draft operations and server timestamps should be addressed before production authorization rules are finalized.

## Baseline Verification

### Build

- Production build succeeds with a modern Node runtime.
- Vite reports a large JavaScript chunk warning; this is non-blocking for Phase 0.

### Lint

The pre-Phase-0 baseline produced 23 errors and 2 warnings under a modern Node runtime. After the Phase 0 fixes, the project reports 19 errors and 2 warnings. The Phase 0 work fixes:

- The conditional React hooks in `MyTeamPanel`.
- The new access-gate Fast Refresh violations by moving storage helpers out of the component module.

The remaining legacy lint findings are tracked as baseline debt and should not be increased by new work.

## Phase 0 Follow-up

- Install a local Java runtime and complete the Realtime Database emulator smoke test.

The Firebase CLI login allowed read-only project, rules, and database export access. The authenticated Firebase console confirmed the Authentication and billing state without changing project configuration.
