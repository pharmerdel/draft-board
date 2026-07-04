import { fetchFantasyProsPlayerNews, fantasyProsNewsUrl } from '../src/utils/fantasyProsNews.js';

const players = [
  'Justin Jefferson',
  'Bijan Robinson',
  'Jayden Daniels',
  'Bucky Irving',
  'Tucker Kraft',
  'D\'Andre Swift',
  'Amon-Ra St. Brown',
  'Brian Thomas Jr.',
  'CeeDee Lamb',
  'De\'Von Achane',
  'Jaxon Smith-Njigba',
  'Marvin Harrison Jr.',
];

for (const playerName of players) {
  const expectedUrl = fantasyProsNewsUrl(playerName);

  try {
    const items = await fetchFantasyProsPlayerNews(playerName);
    const sourcePageUrl = items[0]?.sourcePageUrl || expectedUrl;
    const redirected = sourcePageUrl !== expectedUrl;

    console.log(`\n=== ${playerName} ===`);
    console.log(`URL: ${sourcePageUrl}${redirected ? ` (guessed ${expectedUrl})` : ''}`);
    console.log(`Items: ${items.length}`);

    for (const item of items.slice(0, 2)) {
      console.log(`- ${item.headline}`);
      console.log(`  ${item.author || 'Unknown'} | ${item.timestamp || 'No timestamp'}`);
      console.log(`  News: ${item.news || 'No news text'}`);
      console.log(`  Impact: ${item.fantasyImpact || 'No fantasy impact'}`);
    }
  } catch (error) {
    console.log(`\n=== ${playerName} ===`);
    console.log(`URL: ${expectedUrl}`);
    console.log(`Error: ${error.message}`);
  }
}
