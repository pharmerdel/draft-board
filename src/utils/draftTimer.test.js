import assert from 'node:assert/strict';
import test from 'node:test';

import { resumedTimerStartedAt, timerRemainingMs } from './draftTimer.js';

test('timer remaining time freezes at the pause instant', () => {
  assert.equal(timerRemainingMs({ timerEnabled: true, timerDuration: 60, timerStartedAt: 10_000 }, 25_000), 45_000);
  assert.equal(timerRemainingMs({ timerEnabled: true, timerDuration: 60, timerStartedAt: 10_000 }, 75_000), 0);
  assert.equal(timerRemainingMs({ timerEnabled: false, timerDuration: 60, timerStartedAt: 10_000 }, 25_000), null);
});

test('resume reconstructs a start time that preserves remaining time', () => {
  const resumedAt = resumedTimerStartedAt({
    timerEnabled: true,
    timerDuration: 60,
    pausedTimerRemainingMs: 45_000,
  }, 100_000);
  assert.equal(resumedAt, 85_000);
  assert.equal(timerRemainingMs({ timerEnabled: true, timerDuration: 60, timerStartedAt: resumedAt }, 100_000), 45_000);
});

test('an idle or disabled timer stays idle after resume', () => {
  assert.equal(resumedTimerStartedAt({ timerEnabled: true, pausedTimerRemainingMs: null }, 100_000), null);
  assert.equal(resumedTimerStartedAt({ timerEnabled: false, pausedTimerRemainingMs: 30_000 }, 100_000), null);
});
