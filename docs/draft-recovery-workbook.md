# Draft recovery workbook

The recovery workbook is a macro-free, offline draft console generated from a commissioner backup. Its sheet order, auction tabs, green/yellow input treatment, team budget table, and draft-prep section mirror the league's 2025 Auction Draft Tool while using the current player pool and snapshot state.

It includes:

- `Nomination List`: the draft-day input sheet. It has searchable player and team dropdowns, an `ON THE BLOCK` panel, bid entry, submit control, validation status, and live maximum bid guidance.
- `Teams`: the familiar team budget table from the 2025 tool followed by a live 3-column by 4-row grid of roster cards with starters, bench, prices, NFL details, and remaining budgets.
- `Best Player Avail.`: a live filterable player list whose status changes among `AVAILABLE`, `ON BLOCK`, and `DRAFTED`.
- `Draft Log`: a live chronological view of every submitted sale.
- `Recovery Summary`: compact live team budgets, roster counts, and maximum legal bids.
- `Draft Ledger`: the hidden formula engine that preserves imported history and calculates future picks.
- `Player Data` and `Team Data`: lookup tables used by formulas and available for auditing.
- `Player Tiers & Rankings`, `Player Auction Values`, and `Historical Bid by Position Rank`: public current-year pool and snapshot data in the familiar draft-prep section.
- `Target & DND List`: a visible safety notice in place of private owner data; owner targets, ranks, tiers, notes, and watchlists are never copied into the commissioner workbook.

## Continue the draft offline

1. Open `Nomination List`. In the first open row, type part of a name in `PLAYER SEARCH`, then choose the matching dropdown result. The player immediately appears in the `ON THE BLOCK` panel.
2. Choose the winning fantasy team from its searchable dropdown. The panel shows that team's current maximum legal bid.
3. Enter the whole-dollar winning bid.
4. Choose `YES` in `SUBMIT PICK`. A valid entry changes to `SOLD` and immediately updates Teams, budgets, Best Player Avail., Draft Log, and Recovery Summary.
5. To undo the latest spreadsheet pick, clear its `SUBMIT PICK` cell. The player returns to `ON BLOCK`; clear `PLAYER SEARCH` to return the player to the remaining pool.

The assigned roster slot is calculated from prior submitted picks using the league limits: QB 1, RB 2, WR 2, TE 1, FLEX 2, and bench 5. The `CHECK` column flags unknown IDs, duplicate players, missing bids or teams, full rosters, and bids above the legal maximum before they can be treated as sold. The maximum bid preserves $1 for every roster slot still open after the pick.

## Safety boundary

The generator reads only `draft`, `teams`, `players`, and `log`. It does not read, modify, restore, or export `personalRanks`, `personalTiers`, `playerNotes`, `watchlists`, `teamAccess`, or authentication data. Workbook edits are local Excel changes; they never write back to Firebase or change the source JSON.

## During the draft

On the commissioner draft screen, use **Backup** to download two files from the exact same in-memory snapshot:

1. The JSON file used to restore the live draft session.
2. The matching human-readable XLSX recovery workbook.

Because the app automatically updates its local backup after every pick, pressing **Backup** periodically captures a paired recovery checkpoint without requiring two separate actions.

## Convert an existing JSON backup

From the setup screen, choose **Convert backup JSON to XLSX**. This only reads the selected local file and downloads a workbook; it does not restore anything.

The same conversion can be run from a development checkout:

```bash
npm run backup:spreadsheet -- /absolute/path/draft-backup.json /absolute/path/recovery.xlsx
```
