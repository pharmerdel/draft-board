# Preseason Player Preferences Implementation Plan

## Purpose

Extend Draft Board into a lightweight preseason workspace where league owners can securely claim their team, prepare a private player order, optionally create positional tiers in bulk, and carry those preferences into the live auction draft.

This document is the working implementation checklist. Items should be completed in dependency order, and a phase should not be considered complete until its acceptance criteria pass.

## Confirmed Product Decisions

- The FantasyPros CSV generated with this league's settings remains the source for shared player rankings.
- Sleeper enriches imported players with stable identity, headshots, injuries, statistics, and projections where available.
- Owners authenticate to a team with a PIN they choose after using a one-time team activation code.
- Multiple devices may be signed into the same team.
- Personal tiers are optional and position-specific.
- The initial tier structure is Tier 1 through Tier 5 plus `Avoid`.
- Personal tiers do not automatically change personal rank order.
- Personal rankings, tiers, and watchlists remain editable during the live draft.
- Firebase Realtime Database remains the sole source of truth.
- Owner devices are not competing authoritative data stores.
- Backups consist of server-side snapshots, audit history, a commissioner recovery mirror, and manual exports.
- Commissioner access uses a separately protected commissioner role.

## Product Principles

- Preserve owner preference data across player-catalog refreshes.
- Prefer stable, recoverable operations over destructive replacement.
- Enforce access in Firebase Security Rules, not only in the interface.
- Keep tiers completely optional; owners who do not use them retain the existing ranked-list experience.
- Treat mobile as a first-class preseason and draft-day interface.
- Provide visible sync and backup status so users know their work is saved.
- Avoid expanding this into a general-purpose multi-league platform.

## Proposed Lifecycle

```text
setup -> preseason -> lobby -> active <-> paused -> complete
```

- `setup`: Commissioner establishes league and team configuration.
- `preseason`: Owners claim teams and prepare rankings, tiers, and watchlists.
- `lobby`: Draft-day waiting room.
- `active`: Live auction draft.
- `paused`: Draft temporarily suspended without closing preseason preferences.
- `complete`: Final results and exports.

## Proposed Data Model

The exact schema may be refined during implementation, but these ownership boundaries should remain.

```text
players/{stablePlayerId}
  name
  position
  nflTeam
  overallRank
  positionalRank
  sourceTier
  sleeperPlayerId
  headshotUrl
  injuryStatus
  catalogStatus
  updatedAt

personalRanks/{teamId}/{stablePlayerId}: number
personalTiers/{teamId}/{stablePlayerId}: 1 | 2 | 3 | 4 | 5 | "avoid"
watchlists/{teamId}/{stablePlayerId}
  watched: true

teamAccess/{teamId}
  pinHash
  activationCodeHash
  activationExpiresAt
  claimedAt
  failedAttempts
  lockedUntil

catalogMetadata
  source
  sourceDate
  importedAt
  schemaVersion
```

`teamAccess` must never be readable by browser clients. PIN and activation-code verification must occur in trusted backend code.

## Phase 0: Baseline and Safeguards

### Repository and tooling

- [x] Review the existing uncommitted access-gate and deployment changes.
- [x] Decide whether those changes form the baseline for this project.
- [x] Commit or otherwise preserve the baseline before beginning migration work. Preserved on the feature branch; commit intentionally deferred pending review.
- [x] Create a `codex/preseason-preferences` feature branch.
- [x] Add a supported Node version declaration compatible with Vite 8 and ESLint 10.
- [x] Confirm clean production builds using the declared Node version.
- [x] Record the existing lint failures and prevent new work from increasing them.
- [x] Fix the existing conditional-hook violation in `MyTeamPanel` before modifying that component.

### Firebase baseline

- [x] Document the current Realtime Database schema.
- [x] Locate and review the deployed Realtime Database Security Rules. The deployed root rules currently allow all unauthenticated reads and writes.
- [x] Record the current Firebase Authentication and billing-plan configuration. Authentication is not initialized; the project is on the Blaze plan.
- [x] Export a complete pre-migration Firebase backup. The ignored local snapshot is recorded in `docs/firebase-baseline.md`.
- [ ] Confirm Firebase Emulator Suite support for database, authentication, and functions testing. Auth and Functions pass; the Database emulator is blocked until Java is installed.

### Phase 0 acceptance criteria

- [x] The current app builds reliably with the declared toolchain.
- [x] Existing source changes are safely preserved.
- [x] A restorable pre-migration Firebase snapshot exists.
- [x] Current schema and security assumptions are documented.

## Phase 1: Stable Player Catalog

### Import and identity

- [ ] Preserve the current FantasyPros CSV parser as the basis of the import pipeline.
- [ ] Parse shared FantasyPros tier data when the CSV contains it.
- [ ] Enrich imported players with Sleeper data.
- [ ] Use Sleeper player IDs as stable keys for matched players.
- [ ] Create persistent fallback IDs for unmatched players.
- [ ] Normalize names, suffixes, positions, and NFL team abbreviations before matching.
- [ ] Detect ambiguous matches rather than silently choosing one.
- [ ] Retain a mapping registry so corrected matches remain stable across future imports.

### Safe catalog refresh

- [ ] Build an admin-only import/refresh command or interface.
- [ ] Preview additions, changes, deactivations, ambiguous matches, and unmatched players before writing.
- [ ] Merge shared ranking and enrichment changes into existing player records.
- [ ] Never replace or delete personal rankings, tiers, or watchlists during refresh.
- [ ] Mark missing players inactive or unavailable instead of immediately deleting them.
- [ ] Record catalog source date, import time, and schema version.
- [ ] Produce an import summary suitable for commissioner review.
- [ ] Remove the FantasyPros upload requirement from draft-day setup.
- [ ] Retain an intentional admin path for later preseason CSV refreshes.

### Phase 1 acceptance criteria

- [ ] Importing the same CSV twice produces the same player IDs.
- [ ] Importing a newer CSV updates shared rankings without losing owner data.
- [ ] Unmatched and ambiguous players are visible for manual review.
- [ ] Shared FantasyPros tiers and private owner tiers remain distinct.
- [ ] Draft setup can proceed without a commissioner CSV upload.

## Phase 2: Team PIN Authentication

### Team activation

- [ ] Enable and configure Firebase Authentication for custom-token sign-in.
- [ ] Add a trusted backend endpoint to generate one-time team activation codes.
- [ ] Store only cryptographic hashes of activation codes and PINs.
- [ ] Let an owner select a team and submit its activation code.
- [ ] Let the owner choose and confirm a PIN after activation succeeds.
- [ ] Invalidate the activation code after successful claim.
- [ ] Add clear states for unclaimed, claimed, locked, and reset-required teams.

### Returning login and session handling

- [ ] Add team selection plus PIN login for claimed teams.
- [ ] Mint a Firebase custom token with trusted `teamId` and role claims.
- [ ] Persist authenticated sessions across browser visits.
- [ ] Allow simultaneous sessions on multiple devices.
- [ ] Add sign-out and switch-team controls.
- [ ] Add generic error messages that do not leak credential details.
- [ ] Add server-side attempt throttling and temporary lockout.
- [ ] Add commissioner-controlled PIN reset.
- [ ] Revoke existing sessions when the commissioner requests a full access reset.

### Commissioner identity

- [ ] Add a separately authenticated commissioner role.
- [ ] Ensure selecting `commissioner` in the UI is no longer sufficient for commissioner authority.
- [ ] Restrict activation, reset, catalog, draft, and restore operations to the commissioner role.

### Phase 2 acceptance criteria

- [ ] An unclaimed owner can activate their assigned team and choose a PIN.
- [ ] A returning owner can sign in on a new device with team plus PIN.
- [ ] Two devices can use one team without invalidating each other.
- [ ] Repeated incorrect attempts cause a temporary lockout.
- [ ] Commissioner reset invalidates the old PIN and, when selected, existing sessions.
- [ ] PINs, PIN hashes, and activation-code hashes are not exposed to browser reads or build artifacts.

## Phase 3: Firebase Authorization Rules

### Team-scoped permissions

- [ ] Permit authenticated owners to read the shared player catalog and league state.
- [ ] Permit a team to write only its own personal rankings.
- [ ] Permit a team to write only its own personal tiers.
- [ ] Permit a team to write only its own watchlist.
- [ ] Permit a team to update only its allowed presence fields.
- [ ] Validate rank and tier value shapes in rules.

### Commissioner permissions

- [ ] Restrict player-catalog writes to commissioner/admin code.
- [ ] Restrict draft-state changes to the commissioner role, except explicitly authorized owner nominations.
- [ ] Restrict team, roster, sale, undo, reset, and restore operations appropriately.
- [ ] Prevent clients from assigning their own role or `teamId` claim.

### Emulator tests

- [ ] Test every allowed owner operation.
- [ ] Test cross-team reads of private preferences if preferences are intended to remain private.
- [ ] Test and reject every cross-team write path.
- [ ] Test and reject unauthenticated writes.
- [ ] Test and reject owner writes to commissioner-controlled data.
- [ ] Test commissioner operations.

### Phase 3 acceptance criteria

- [ ] Authorization is enforced when the UI is bypassed and the database is accessed directly.
- [ ] Every protected path has an emulator test covering success and rejection.
- [ ] Team-private preferences cannot be read or modified by other teams.

## Phase 4: Preseason Owner Workspace

### Routing and lifecycle

- [ ] Add the `preseason` draft status.
- [ ] Route authenticated owners into an owner workspace during preseason.
- [ ] Route the commissioner into preseason administration controls.
- [ ] Add a commissioner action to transition from preseason to the draft lobby.
- [ ] Preserve owner preferences across lifecycle transitions.

### Owner functionality

- [ ] Reuse personal drag-and-drop ranking on desktop.
- [ ] Reuse personal drag-and-drop ranking on mobile.
- [ ] Reuse position filters and player search.
- [ ] Reuse player details, statistics, projections, and news.
- [ ] Reuse private watchlists.
- [ ] Hide draft-only nomination, sale, timer, budget, and roster controls during preseason.
- [ ] Add team identity, sign-out, and switch-team controls.
- [ ] Add visible live/sync state.
- [ ] Add last-saved feedback for preference changes.
- [ ] Add calm retry/error states for failed writes.

### Phase 4 acceptance criteria

- [ ] Owners can prepare rankings and watchlists before draft day.
- [ ] Preferences synchronize between two devices signed into the same team.
- [ ] Owners can leave and return without losing work.
- [ ] The preseason workspace is usable on phone, tablet, and desktop.
- [ ] Moving into lobby or active draft preserves and continues using preseason preferences.

## Phase 5: Optional Bulk Personal Tiers

### Tier data and behavior

- [ ] Store private tiers independently for each team and player.
- [ ] Keep tiers position-specific in the interface.
- [ ] Treat Tier 1 as implicit when an owner first enables tiering for a position.
- [ ] Support Tier 1 through Tier 5 plus `Avoid`.
- [ ] Do not alter exact rank order merely because a tier changes.
- [ ] Leave tier data absent for owners who do not use the feature.

### Boundary-based tier mode

- [ ] Add a clear `Tier Mode` entry point to a position-filtered list.
- [ ] Allow one click/tap between adjacent players to begin the next tier.
- [ ] Assign the affected contiguous group in one atomic database update.
- [ ] Allow a boundary to be moved.
- [ ] Allow a boundary to be removed.
- [ ] Allow players to be dragged across tier boundaries.
- [ ] Make boundary controls large and touch-friendly on mobile.
- [ ] Clearly distinguish shared FantasyPros tiers from private personal tiers.

### Secondary bulk actions

- [ ] Add contiguous range selection as a secondary workflow.
- [ ] Allow a selected range to be assigned to Tier 1-5 or `Avoid`.
- [ ] Add `Clear tiers for this position` without changing ranks.
- [ ] Add `Clear all personal tiers` with confirmation.

### Normal list presentation

- [ ] Show personal tier labels and boundaries when tiers exist.
- [ ] Keep the ordinary ranked list unchanged when no personal tiers exist.
- [ ] Show personal tier context in the player detail card.
- [ ] Permit single-player tier changes from the player detail card.
- [ ] Decide and document how newly imported players appear in an already-tiered position.

### Phase 5 acceptance criteria

- [ ] An owner can tier a sorted list of roughly 60 RBs with a small number of boundary actions.
- [ ] Tier operations do not unexpectedly reorder players.
- [ ] A player moved across a tier boundary receives the expected rank and tier.
- [ ] Clearing tiers preserves rank order.
- [ ] An owner who never uses tiers experiences no required steps or degraded behavior.

## Phase 6: Backup, Recovery, and Auditability

### Complete backup format

- [ ] Version the backup schema.
- [ ] Include draft state, teams, rosters, players, and draft log.
- [ ] Include personal rankings, personal tiers, and watchlists.
- [ ] Include non-secret catalog and configuration metadata.
- [ ] Exclude PIN hashes, activation-code hashes, tokens, and other credentials from downloadable backups.
- [ ] Validate a backup fully before allowing restoration.

### Automated server-side backups

- [ ] Confirm the Firebase project is eligible for native automated Realtime Database backups.
- [ ] Configure daily Firebase backups to Cloud Storage.
- [ ] Create versioned application snapshots at a preseason interval.
- [ ] Increase snapshot frequency while the draft is active.
- [ ] Snapshot immediately before and after critical commissioner actions.
- [ ] Define retention and cleanup periods for snapshots.
- [ ] Protect backup storage with least-privilege access.

### Audit and commissioner recovery

- [ ] Record append-only events for critical draft and administrative operations.
- [ ] Decide whether private preference edits require full audit events or only periodic snapshots.
- [ ] Maintain a rolling commissioner-side IndexedDB mirror of non-secret league state.
- [ ] Display the last successful Firebase sync time.
- [ ] Display the last successful server snapshot time to the commissioner.
- [ ] Display the last successful local recovery mirror time to the commissioner.
- [ ] Keep and expand the manual commissioner JSON download.
- [ ] Document a Firebase outage and restoration procedure.

### Phase 6 acceptance criteria

- [ ] A complete backup can restore an empty emulator to the same usable league state.
- [ ] Personal preferences survive backup and restore.
- [ ] No authentication secret is present in exported JSON.
- [ ] The commissioner can identify the freshness of cloud and local recovery copies.
- [ ] The documented outage procedure has been rehearsed in a test environment.

## Phase 7: Migration, Verification, and Rollout

### Existing data migration

- [ ] Build a dry-run migration from `player_N` keys to stable player IDs.
- [ ] Review every uncertain old-to-new player match.
- [ ] Remap player references in rosters and draft history where applicable.
- [ ] Remap personal rankings.
- [ ] Remap watchlists.
- [ ] Remap any other player-keyed data.
- [ ] Preserve a rollback snapshot.
- [ ] Make the migration idempotent or explicitly one-time and guarded.

### End-to-end verification

- [ ] Activate and sign in representative owner accounts.
- [ ] Test all 12 team identities.
- [ ] Test two simultaneous devices for one team.
- [ ] Attempt unauthorized cross-team access directly.
- [ ] Refresh the player catalog after ranks, tiers, and watchlists exist.
- [ ] Test a newly added player in ranked and tiered lists.
- [ ] Test a deactivated or unmatched player.
- [ ] Test owners with ranks but no tiers.
- [ ] Test owners with partial tiers.
- [ ] Test owners with all positions tiered.
- [ ] Test desktop, tablet, and mobile layouts.
- [ ] Run a miniature multi-team auction through completion.
- [ ] Test sale, undo, pause, resume, end, export, backup, and restore.
- [ ] Confirm production build and deployment workflows.

### Rollout

- [ ] Deploy and test against a staging Firebase project.
- [ ] Complete commissioner staging acceptance.
- [ ] Back up production immediately before migration.
- [ ] Run production migration in dry-run mode.
- [ ] Review the migration report.
- [ ] Run the approved production migration.
- [ ] Import the current league-specific FantasyPros CSV.
- [ ] Generate team activation codes.
- [ ] Distribute activation codes privately.
- [ ] Monitor activation, sync errors, and catalog issues during the initial owner rollout.
- [ ] Run a pre-draft recovery rehearsal.

### Phase 7 acceptance criteria

- [ ] Production data is migrated without losing or duplicating player references.
- [ ] All owners can claim and access the correct team.
- [ ] The commissioner can administer access and catalog refreshes.
- [ ] The full preseason-to-complete lifecycle passes staging and production smoke tests.
- [ ] A verified production backup and recovery procedure exists before draft day.

## Deferred or Explicitly Out of Scope

- General-purpose support for multiple unrelated leagues.
- Email, Google, or social login unless team PINs prove inadequate.
- Owners sharing or viewing one another's private rankings or tiers.
- Automatically changing rank order when tiers change.
- Unlimited custom tiers or custom tier names in the first release.
- AI-generated rankings or draft strategy advice.
- Fully writable multi-device operation during an extended Firebase outage.
- Replacing FantasyPros as the league-specific rankings source.
- Replacing Realtime Database with Firestore solely for this feature set.

## Open Implementation Questions

These should be resolved during the relevant phase rather than blocking the entire project.

- [ ] Where are the currently deployed Realtime Database Security Rules maintained?
- [ ] Is the Firebase project already on the Blaze plan?
- [ ] Should one-time activation codes expire automatically, and after how long?
- [ ] Should a commissioner PIN reset always revoke every existing team session, or make that optional?
- [ ] How long should automated preseason and draft snapshots be retained?
- [ ] Should private preference changes receive detailed audit events or rely on frequent snapshots?
- [ ] When a new player is imported, should they appear at the bottom of their position or according to the new shared FantasyPros rank?
- [ ] Should `Avoid` sort below all numbered tiers automatically while preserving exact internal order?

## Progress Log

Add dated entries here when a phase begins, a decision changes, or a material migration occurs.

- 2026-08-12: Initial implementation plan created from agreed product and architecture decisions.
- 2026-08-12: Phase 0 started. Existing access-gate work accepted as the working baseline; feature branch and Node toolchain declaration added; current Firebase schema and configuration gaps documented.
- 2026-08-12: Production database rules confirmed fully public. A valid ignored production snapshot was exported, and matching versioned rules plus local emulator configuration were added.
- 2026-08-12: Authentication and Functions emulator smoke tests passed. Realtime Database emulator startup is blocked by the missing local Java runtime.
- 2026-08-12: Firebase Console inspection confirmed Authentication has not been initialized and the production project is on the Blaze plan.
- 2026-08-12: Production access-gate smoke test passed with a temporary SHA-256 password: rejection, successful unlock, dark theme, Firebase-backed lobby load, and refresh persistence all verified.
