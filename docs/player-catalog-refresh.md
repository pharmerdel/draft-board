# Player Catalog Refresh

The durable preseason player source is stored in Firebase at:

```text
playerCatalog/{stablePlayerId}
catalogMetadata
```

The live-draft `players` tree remains separate. Catalog refreshes must not write to `players`, `teams`, `draft`, `log`, `watchlists`, `personalRanks`, or `personalTiers`.

## Refresh Workflow

Use a league-configured FantasyPros CSV. The importer keeps only QB, RB, WR, and TE.

1. Generate a fresh read-only FantasyPros/Sleeper preview:

   ```sh
   npm run catalog:dry-run -- /absolute/path/to/FantasyPros.csv
   ```

2. Review `reports/player-catalog/summary.md` and every row in `reports/player-catalog/match-review.csv`. Add confirmed nickname corrections to `data/player-id-overrides.json`, then rerun the dry run.

3. Download the current production catalog:

   ```sh
   npx --yes firebase-tools@13 database:get /playerCatalog --project ff-draft-board --output backups/current-player-catalog.json --pretty
   ```

4. Prepare the isolated multipath update:

   ```sh
   npm run catalog:prepare-update -- --current backups/current-player-catalog.json
   ```

5. Review `reports/player-catalog/firebase-update-summary.json`. Unexpected deactivations, ambiguous matches, or large change counts are stop conditions.

6. Export a complete production backup before applying:

   ```sh
   npx --yes firebase-tools@13 database:get / --project ff-draft-board --output backups/pre-player-catalog-refresh.json --pretty --export
   ```

7. Apply only the prepared root update:

   ```sh
   npx --yes firebase-tools@13 database:update / reports/player-catalog/firebase-update.json --project ff-draft-board --force --disable-triggers
   ```

8. Download `/playerCatalog` again and rerun step 4 against that result. A successful repeat comparison should report every incoming player unchanged.

9. If a preseason workspace already exists, export the full database again and prepare
   the guarded live-player sync:

   ```sh
   npm run catalog:prepare-preseason-sync -- --database backups/post-player-catalog-refresh.json
   ```

   The command refuses to produce an update unless the draft status is `preseason` and
   every current player is still available and unsold. Review the summary, then apply:

   ```sh
   npx --yes firebase-tools@13 database:update / reports/player-catalog/preseason-player-sync.json --project ff-draft-board --force --disable-triggers
   ```

   This replaces only the shared live `players` snapshot and the draft's catalog-version
   markers. It does not write owner ranks, tiers, notes, or watchlists. Owners with no
   personal rank entry inherit the refreshed shared rank; existing personal rank entries
   remain authoritative for customized players.

## Refresh Behavior

- Matched players retain their Sleeper player ID as the Firebase key.
- Unmatched players retain deterministic `fp_*` fallback IDs.
- Players absent from a newer CSV are marked `catalogStatus: inactive`; they are not deleted.
- Only shared catalog records and catalog metadata are included in the generated Firebase update.
- Personal ranks, personal tiers, and watchlists are not part of the catalog payload.

## Initial 2026 Import

- Imported: 2026-08-12
- Source: `FantasyPros_2026_Draft_ALL_Rankings-4.csv`
- Source SHA-256: `97a4c040cce59799de7a0e48de1faae8ad90ab9feee4a34c32b3bfd717a253dd`
- Active players: 776
- Sleeper matches: 774
- Deterministic fallback IDs: 2
- Ambiguous matches: 0
- Pre-import production backup: `backups/pre-player-catalog-2026-08-12-1554Z.json`
- Backup SHA-256: `bd71065ea020ee10a1f3d07a0151849afd697546d9a57015978b7d368b416af2`

## Final Pre-Invite Refresh

- Imported: 2026-08-18
- Source: `FantasyPros_2026_Draft_ALL_Rankings-6.csv`
- Source SHA-256: `72f075c93eb4de08c52fc5b80a2b115ea522b90d1f74e7a330de0df39bd8cbab`
- Active players: 789
- Sleeper matches: 788
- Deterministic fallback IDs: 1 (`Tommy Myers`)
- Ambiguous matches: 0
- Additions: 114
- Updated records: 645
- Deactivated records: 101
- Pre-import production backup: `backups/pre-player-catalog-refresh-2026-08-18-1426Z.json`
- Backup SHA-256: `52ccc0d47fcd72ff72b0f8f9fcda4366bb323637e9b45dd582c73f327f775e4c`
- Existing preseason `players` snapshot synced after the catalog refresh: 789 available, 0 sold
- One-time pre-invite owner-preparation reset completed after verification; ranks, tiers,
  notes, and watchlists were cleared while team access and PIN/auth records were preserved
