# Draft Board Scope of Work

## Product Intent

This app is a private fantasy football auction draft utility for one league. It is not intended to become a general-purpose fantasy product right now. The core job is to make draft day trustworthy, calm, and easy for the commissioner and all owners.

The league drafts live, usually with most owners in the same room. The commissioner screen is broadcast to a large TV and remains visible to everyone. Owners use their own phones, tablets, or laptops to track their own budget, roster, player list, watchlist, ranks, and player information. Absentee owners join through Zoom or FaceTime and still use their personal draft view.

The app does not run bidding. Bidding happens verbally in the room or over the call. The commissioner records nominations, winning teams, and sale prices.

## Current League Assumptions

- 12 teams.
- $200 auction budget.
- 13 roster spots.
- Roster format: QB, RB, RB, WR, WR, TE, FLEX, FLEX, BN, BN, BN, BN, BN.
- Standard league except half-PPR scoring.
- Rankings are imported from a FantasyPros rankings CSV.
- Custom league configuration can come later, but it is not a near-term priority.

## Primary Goal

The app should be reliable and user friendly on draft day. If there is a tradeoff between flashiness and reliability, choose reliability.

The key promise is that every person can trust what they see:

- Commissioner can quickly and safely record the draft.
- Owners can instantly understand their own budget, max bid, roster, and current player context.
- The big TV view clearly communicates the current nomination and latest sale.
- The app degrades gracefully when external player stats or news are unavailable.

## Roles and Views

### Commissioner

The commissioner operates a central board that everyone can see. This view needs to optimize for speed, clarity, and correction.

Important commissioner workflows:

- Nominate a player.
- Select the winning team.
- Enter the winning price.
- Record the sale.
- Undo entry mistakes.
- End or resume the draft.
- Export CSV/XLS results for ESPN entry.
- Download or restore backup data if needed.

Commissioner actions should feel safe. Destructive or high-impact actions should have clear confirmations or guardrails, especially reset, end draft, undo, and sale recording.

### Owners

Each owner uses a private team view without affecting the commissioner display.

Important owner workflows:

- See current player on the block.
- See budget remaining.
- See max bid.
- See roster and open roster needs.
- Browse/search players.
- Open player stats/news.
- Maintain watchlist.
- Maintain personal rankings.
- Nominate when it is their turn.
- Check other teams' budgets, max bids, and roster construction.

Owners may use phones, tablets, or laptops. All views need to work properly, with mobile treated as a first-class draft-day experience.

## Advice Scope

The near-term "advice" feature is player information, especially the stats and news modal. More advanced strategy helpers are not currently the priority.

Near-term focus:

- Player stats and projections should be easy to scan.
- Recent news should load gracefully.
- Missing stats/news should show calm empty states, not broken UI.
- Player modal should remain useful even if external APIs fail.

Lower-priority or future possible advice:

- Positional scarcity.
- Budget pacing.
- Nomination recommendations.
- Opponent-needs analysis.
- Draft grade or post-draft comedy comments.

## Persistence and Data

Firebase is the shared real-time source of truth. A Firebase outage would be the most serious draft-day risk, even if the probability is low.

Current behavior worth preserving:

- Team selection is local to each device.
- Watchlists are stored in Firebase by team.
- Personal ranks are stored in Firebase by team.
- Draft backups exist for recovery.

Reliability improvements to consider:

- Commissioner-only sync/health indicator.
- Clear "last saved" or "live" status.
- More visible backup state.
- Continued graceful operation around failed player-data calls.

## Export and Post-Draft

Post-draft output is mainly practical:

- CSV/XLS export so the commissioner can enter rosters into ESPN.
- Historical draft record.

AI-generated team comments or draft reviews are a fun possible add-on, but not central unless they become easy and low-risk.

## UX Principles

- Trust over flash.
- Speed over novelty.
- Clear states over cleverness.
- Big tap targets, especially on mobile.
- No hidden critical information.
- Commissioner workflow should minimize hunting and hesitation.
- Owner workflow should answer "Can I buy this player?" and "What do I still need?" quickly.
- External API failure should never make the app feel broken.
- Keep league-specific assumptions hardcoded until configurability is truly needed.

## Recommended Next Direction

The highest-value next phase is a draft-day trust audit and hardening pass.

Focus areas:

- Commissioner sale, undo, end, resume, reset, backup, and export flows.
- Firebase/live-sync visibility.
- Mobile owner usability.
- Player stats/news modal reliability.
- Clear sold-player state on commissioner and owner views.
- Confirmations and warnings around high-impact actions.

The end state should feel like a dependable draft cockpit: quiet, fast, readable, and hard to misuse.
