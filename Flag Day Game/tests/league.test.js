import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateEvent, summarizeEvent, getAchievements } from '../league.js';

const initial = JSON.parse(await readFile(new URL('../data/event.json', import.meta.url), 'utf8'));
function fixture() {
  const data = structuredClone(initial);
  data.status = 'live';
  data.finalSnapshot = null;
  data.updatedAt = '2026-10-06T18:00:00+08:00';
  data.deadline = null;
  data.groups.forEach(g => Object.assign(g, { verifiedSold: 0, treasuryReceived: 0, handoffComplete: false }));
  return data;
}
function group(data, id) { return data.groups.find(g => g.id === id); }

test('published data is valid', () => { assert.doesNotThrow(() => validateEvent(initial)); });
test('Team A includes groups 1–3, Team B includes 4–7; F5 remains independent', () => {
  const data = fixture();
  group(data, '1').verifiedSold = 20;
  group(data, '3').verifiedSold = 10;
  group(data, '4').verifiedSold = 30;
  group(data, '7').verifiedSold = 5;
  group(data, 'f5').verifiedSold = 100;
  const summary = summarizeEvent(data);
  assert.deepEqual(summary.teams.map(team => [team.id, team.verifiedSold, team.totalValue]), [['a', 30, 150], ['b', 35, 175]]);
  assert.equal(summary.totalSold, 165);
});
test('zero sales are valid with no invented champions or milestones', () => {
  const data = fixture(); data.updatedAt = null;
  const summary = summarizeEvent(data);
  assert.equal(summary.totalSold, 0);
  assert.equal(summary.totalValue, 0);
  assert.equal(summary.treasuryReceived, 0);
  assert.equal(summary.milestones, 0);
  assert.equal(summary.nextMilestone, 100);
  assert.ok(summary.rankings.every(g => g.rank === 1 && g.gap === 0));
  assert.deepEqual(summary.champions, []);
});
test('20 stickers mean RM100; treasury transfers never add sales', () => {
  const data = fixture();
  Object.assign(group(data, '1'), { verifiedSold: 20, treasuryReceived: 50 });
  const before = summarizeEvent(data);
  group(data, '1').treasuryReceived = 100;
  const after = summarizeEvent(data);
  assert.equal(before.totalSold, 20); assert.equal(after.totalSold, 20);
  assert.equal(after.totalValue, 100); assert.equal(after.treasuryReceived, 100);
  assert.deepEqual(after.rankings.map(g => g.rank), before.rankings.map(g => g.rank));
});
test('competition ranking handles ties and nearest strictly higher score', () => {
  const data = fixture();
  group(data, '1').verifiedSold = 50;
  group(data, '2').verifiedSold = 50;
  group(data, '3').verifiedSold = 30;
  group(data, '4').verifiedSold = 30;
  group(data, '5').verifiedSold = 10;
  const summary = summarizeEvent(data);
  assert.deepEqual(summary.rankings.map(g => g.rank), [1, 1, 3, 3, 5, 6, 6]);
  assert.deepEqual(summary.rankings.map(g => g.gap), [0, 0, 20, 20, 20, 10, 10]);
});
test('F5 contributes to collective totals and achievements, never rankings', () => {
  const data = fixture();
  group(data, 'f5').verifiedSold = 200;
  const summary = summarizeEvent(data);
  assert.equal(summary.totalSold, 200); assert.equal(summary.totalValue, 1000);
  assert.equal(summary.milestones, 2); assert.equal(summary.nextMilestone, 300);
  assert.equal(summary.milestoneProgress, 0);
  assert.equal(summary.rankings.length, 7); assert.ok(!summary.rankings.some(g => g.id === 'f5'));
  assert.ok(getAchievements(summary.f5).every(a => a.unlocked));
});
test('milestone boundaries use cumulative 100-sticker stations', () => {
  for (const [sold, stations, next, progress] of [[99, 0, 100, 99], [100, 1, 200, 0], [101, 1, 200, 1], [250, 2, 300, 50]]) {
    const data = fixture(); group(data, '1').verifiedSold = sold;
    const summary = summarizeEvent(data);
    assert.deepEqual([summary.milestones, summary.nextMilestone, summary.milestoneProgress], [stations, next, progress]);
  }
});
test('data correction recomputes rank, totals and unlocked achievements', () => {
  const data = fixture();
  group(data, '1').verifiedSold = 50;
  group(data, '2').verifiedSold = 25;
  assert.equal(summarizeEvent(data).rankings[0].id, '1');
  group(data, '1').verifiedSold = 9;
  const summary = summarizeEvent(data);
  assert.equal(summary.rankings[0].id, '2'); assert.equal(summary.totalSold, 34);
  assert.ok(getAchievements(group(data, '1')).every(a => !a.unlocked));
});
test('each sales achievement unlocks exactly at threshold', () => {
  for (const threshold of [10, 25, 50, 100]) {
    const g = { verifiedSold: threshold - 1 };
    assert.equal(getAchievements(g).find(a => a.threshold === threshold).unlocked, false);
    g.verifiedSold++;
    assert.equal(getAchievements(g).find(a => a.threshold === threshold).unlocked, true);
  }
});
test('handoff achievement requires all corresponding money received', () => {
  const data = fixture();
  Object.assign(group(data, '1'), { verifiedSold: 20, treasuryReceived: 50, handoffComplete: true });
  assert.throws(() => validateEvent(data), /财政须收齐/);
  group(data, '1').treasuryReceived = 100;
  assert.doesNotThrow(() => validateEvent(data));
});
test('final snapshot preserves final rankings, money, dates and tied champions', () => {
  const data = fixture();
  group(data, '1').verifiedSold = 50; group(data, '2').verifiedSold = 50;
  data.status = 'final';
  data.finalSnapshot = { confirmedAt: '2026-10-30T18:00:00+08:00', deadline: '2026-10-30T17:00:00+08:00', groups: structuredClone(data.groups) };
  group(data, '7').verifiedSold = 999; group(data, '7').treasuryReceived = 4000;
  data.deadline = '2026-10-31T17:00:00+08:00';
  const summary = summarizeEvent(data);
  assert.deepEqual(summary.champions.map(g => g.id), ['1', '2']);
  assert.equal(summary.totalSold, 100); assert.equal(summary.treasuryReceived, 0);
  assert.deepEqual(summary.teams.map(team => team.verifiedSold), [100, 0]);
  assert.equal(summary.deadline, data.finalSnapshot.deadline);
  assert.equal(summary.updatedAt, data.finalSnapshot.confirmedAt);
});
test('zero-sale final has no champion; final state must have a valid snapshot', () => {
  const data = fixture(); data.status = 'final';
  assert.throws(() => validateEvent(data), /快照/);
  data.finalSnapshot = { confirmedAt: data.updatedAt, deadline: null, groups: structuredClone(data.groups) };
  assert.deepEqual(summarizeEvent(data).champions, []);
});
test('invalid, incomplete or implausible input is rejected, never coerced into zeros', () => {
  const mutations = [
    d => { d.groups.pop(); },
    d => { d.groups[1].id = '1'; },
    d => { d.groups[0].verifiedSold = -1; },
    d => { d.groups[0].verifiedSold = '20'; },
    d => { d.groups[0].verifiedSold = 1.5; },
    d => { d.groups[0].treasuryReceived = NaN; },
    d => { d.groups[0].treasuryReceived = 1; },
    d => { d.groups[0].handoffComplete = 'false'; },
    d => { d.updatedAt = '2026-10-06'; },
    d => { d.deadline = '2026-02-30T18:00:00+08:00'; },
    d => { d.updatedAt = null; d.groups[0].verifiedSold = 1; },
    d => { d.finalSnapshot = {}; },
  ];
  mutations.forEach(mutate => { const data = fixture(); mutate(data); assert.throws(() => summarizeEvent(data)); });
});
