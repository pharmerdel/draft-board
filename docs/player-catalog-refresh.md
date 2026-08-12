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
