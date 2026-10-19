const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../planner-core.js');
const task = (extra = {}) => ({ id: 'reading', title: 'Lire, rêver; écrire', planDate: '2026-10-19', importance: 1, state: 'inprogress', repeat: 'daily', ...extra });

test('dates use local civil days and reject impossible dates', () => {
  assert.equal(C.validDay('2026-02-30'), false);
  assert.equal(C.validDay('2028-02-29'), true);
  assert.equal(C.addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(C.daysBetween('2026-10-26', '2026-10-24'), 2);
});
test('daily repeat handles intervals, end dates and daylight saving', () => {
  const t = task({ repeatEvery: 2, repeatUntil: '2026-10-27' });
  assert.equal(C.occurs(t, '2026-10-18'), false);
  assert.equal(C.occurs(t, '2026-10-25'), true);
  assert.equal(C.occurs(t, '2026-10-26'), false);
  assert.equal(C.occurs(t, '2026-10-29'), false);
});
test('weekly and weekday patterns do not drift', () => {
  assert.equal(C.occurs(task({ repeat: 'weekly' }), '2026-10-26'), true);
  assert.equal(C.occurs(task({ repeat: 'weekly' }), '2026-10-27'), false);
  assert.equal(C.occurs(task({ repeat: 'weekdays' }), '2026-10-24'), false);
  assert.equal(C.occurs(task({ repeat: 'weekdays' }), '2026-10-26'), true);
});
test('monthly repeat skips missing dates rather than silently moving them', () => {
  const t = task({ planDate: '2026-01-31', repeat: 'monthly' });
  assert.equal(C.occurs(t, '2026-02-28'), false);
  assert.equal(C.occurs(t, '2026-03-31'), true);
});
test('legacy deadline-only tasks appear on the correct day', () => {
  const t = { id: 'old', deadlineTs: new Date('2026-10-20T18:00:00').getTime(), state: 'completed' };
  assert.equal(C.forDay([t], '2026-10-20').length, 1);
  assert.equal(C.status(t, '2026-10-20'), 'done');
});
test('skip and complete affect just one occurrence; repeated clicks do not farm progress', () => {
  const t = task();
  assert.equal(C.mark(t, '2026-10-19', 'skipped'), true);
  assert.equal(C.status(t, '2026-10-19'), 'skipped');
  assert.equal(C.status(t, '2026-10-20'), 'open');
  C.mark(t, '2026-10-19', 'done'); C.mark(t, '2026-10-19', 'done');
  assert.equal(Object.keys(t.occurrences).length, 1);
  assert.equal(t.state, 'inprogress');
  C.mark(t, '2026-10-19', 'open');
  assert.equal(C.status(t, '2026-10-19'), 'open');
});
test('appointments and essential tasks cannot be skipped', () => {
  assert.equal(C.canSkip(task({ kind: 'appointment' })), false);
  assert.equal(C.mark(task({ importance: 3, effort: 'quick' }), '2026-10-19', 'skipped'), false);
  assert.equal(C.canSkip(task({ importance: 2, effort: 'quick' })), true);
});
test('completed one-off tasks remain interoperable with legacy goals', () => {
  const t = task({ repeat: 'none' }); C.mark(t, '2026-10-19', 'done', 42);
  assert.equal(t.state, 'completed'); assert.equal(t.completedAt, 42);
  C.mark(t, '2026-10-19', 'open'); assert.equal(t.state, 'inprogress');
});
test('personal and professional filtering preserves both collections', () => {
  const tasks = [task(), task({ id: 'work', lifeMode: 'pro' })];
  assert.equal(C.forDay(tasks, '2026-10-19', 'personal').length, 1);
  assert.equal(C.forDay(tasks, '2026-10-19', 'pro')[0].task.id, 'work');
  assert.equal(C.forDay(tasks, '2026-10-19', 'all').length, 2);
});
test('departure reminder includes manual travel, arrival buffer and lead time', () => {
  const t = task({ kind: 'appointment', planTime: '15:00', travelMinutes: 30, arrivalBuffer: 10, remindBefore: 15 });
  assert.equal(C.timestamp(t, '2026-10-19') - C.reminderAt(t, '2026-10-19'), 55 * 60000);
  assert.equal(C.reminderAt(task({ remindBefore: -1 }), '2026-10-19'), null);
  assert.equal(C.reminderAt(task(), '2026-10-19'), null);
});
test('reminder window handles tomorrow reminders due today and ignores completed occurrences', () => {
  const now = new Date('2026-10-19T14:46:00').getTime();
  const t = task({ planDate: '2026-10-20', planTime: '15:00', repeat: 'none', remindBefore: 1455 });
  assert.equal(C.upcomingReminders([t], now).length, 1);
  C.mark(t, '2026-10-20', 'done'); assert.equal(C.upcomingReminders([t], now).length, 0);
});
test('calendar exports escape text, omit skipped dates, include alarms and fold UTF-8 safely', () => {
  const t = task({ planTime: '15:00', remindBefore: 15, description: 'é'.repeat(120) + '\nBEGIN:VEVENT', repeatUntil: '2026-10-20' });
  C.mark(t, '2026-10-19', 'skipped');
  const ics = C.calendarICS([t], new Date('2026-10-19T10:00:00').getTime());
  assert.match(ics, /UID:reading-2026-10-20@solo.local/);
  assert.doesNotMatch(ics, /UID:reading-2026-10-19/);
  assert.match(ics, /SUMMARY:Lire\\, rêver\\; écrire/);
  assert.match(ics, /TRIGGER:-PT15M/);
  assert.equal(ics.split('BEGIN:VEVENT').length - 1, 2); // one event plus escaped description text
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
});
test('recurring exports keep wall-clock times across the DST transition', () => {
  const t = task({ planDate: '2026-10-24', planTime: '09:00', repeatUntil: '2026-10-26' });
  const ics = C.calendarICS([t], new Date('2026-10-24T01:00:00').getTime());
  for (const key of ['2026-10-24','2026-10-25','2026-10-26']) {
    const expected = new Date(`${key}T09:00:00`).toISOString().replace(/[-:]/g, '').replace(/\.000Z/, 'Z');
    assert.ok(ics.includes(`DTSTART:${expected}`));
  }
});
