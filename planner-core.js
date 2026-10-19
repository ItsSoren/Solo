(function (root) {
  "use strict";
  const pad = value => String(value).padStart(2, "0");
  const dayKey = value => { const d = new Date(value); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const validDay = key => /^\d{4}-\d{2}-\d{2}$/.test(key || "") && dayKey(new Date(`${key}T12:00:00`)) === key;
  const dateOf = key => new Date(`${key}T12:00:00`);
  const addDays = (key, amount) => { const d = dateOf(key); d.setDate(d.getDate() + amount); return dayKey(d); };
  const daysBetween = (a, b) => Math.round((Date.UTC(...a.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0))) - Date.UTC(...b.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0)))) / 86400000);
  const validTime = time => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time || "");
  const anchor = task => validDay(task.planDate) ? task.planDate : Number(task.deadlineTs) > 0 ? dayKey(task.deadlineTs) : "";
  function occurs(task, key) {
    const start = anchor(task);
    if (!validDay(key) || !start || key < start || (validDay(task.repeatUntil) && key > task.repeatUntil)) return false;
    const repeat = task.repeat || "none";
    if (repeat === "none") return start === key;
    if (task.state === "failed") return false;
    const delta = daysBetween(key, start), d = dateOf(key), first = dateOf(start);
    if (repeat === "daily") return delta % Math.max(1, Math.min(365, Number(task.repeatEvery) || 1)) === 0;
    if (repeat === "weekdays") return d.getDay() !== 0 && d.getDay() !== 6;
    if (repeat === "weekly") return delta % 7 === 0;
    if (repeat === "monthly") return d.getDate() === first.getDate();
    return start === key;
  }
  function status(task, key) {
    if (task.occurrences?.[key]?.status) return task.occurrences[key].status;
    return (!task.repeat || task.repeat === "none") && task.state === "completed" ? "done" : "open";
  }
  function timestamp(task, key) {
    return new Date(`${key}T${validTime(task.planTime) ? task.planTime : "18:00"}:00`).getTime();
  }
  function forDay(tasks, key, mode = "all") {
    return tasks.filter(task => task.state !== "failed" && (mode === "all" || (task.lifeMode || "personal") === mode) && occurs(task, key))
      .map(task => ({ task, day: key, status: status(task, key), at: timestamp(task, key) }))
      .sort((a, b) => (a.task.kind !== "appointment") - (b.task.kind !== "appointment") || a.at - b.at || b.task.importance - a.task.importance);
  }
  function monthDays(month) {
    const start=dateOf(`${month}-01`), offset=(start.getDay()+6)%7;
    const last=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();
    const first=addDays(`${month}-01`,-offset);
    return Array.from({length:Math.ceil((offset+last)/7)*7},(_,i)=>addDays(first,i));
  }
  function yearSummary(tasks, year, mode = "all") {
    return Array.from({ length: 12 }, (_, index) => {
      const month = `${year}-${pad(index + 1)}`, result = { month, total: 0, appointments: 0, missions: 0 };
      for (let day = `${month}-01`; day.startsWith(month); day = addDays(day, 1)) {
        for (const entry of forDay(tasks, day, mode)) {
          if (entry.status === "skipped") continue;
          result.total++;
          result[entry.task.kind === "appointment" ? "appointments" : "missions"]++;
        }
      }
      return result;
    });
  }
  const canSkip = task => task.kind !== "appointment" && (Number(task.importance) === 1 || (task.effort === "quick" && Number(task.importance) < 3));
  function mark(task, key, next, now = Date.now()) {
    if (!occurs(task, key) || !["open", "done", "skipped"].includes(next) || (next === "skipped" && !canSkip(task))) return false;
    // Each occurrence has one state. Repeated clicks never accumulate rewards.
    task.occurrences = { ...(task.occurrences || {}), [key]: { status: next, at: now } };
    if (!task.repeat || task.repeat === "none") { task.state = next === "done" ? "completed" : "inprogress"; task.completedAt = next === "done" ? now : null; }
    task.updatedAt = now;
    return true;
  }
  function reminderAt(task, key) {
    if (!validTime(task.planTime) || Number(task.remindBefore) < 0) return null;
    const lead = task.kind === "appointment" ? (Number(task.travelMinutes) || 0) + (Number(task.arrivalBuffer) || 0) : 0;
    return timestamp(task, key) - ((Number(task.remindBefore) || 0) + lead) * 60000;
  }
  function upcomingReminders(tasks, now = Date.now()) {
    const today = dayKey(now), results = [];
    for (let offset = 0; offset <= 7; offset++) for (const entry of forDay(tasks, addDays(today, offset))) {
      const due = reminderAt(entry.task, entry.day);
      if (entry.status === "open" && due !== null && due <= now && due > now - 10 * 60000 && entry.at >= now) results.push({ ...entry, due });
    }
    return results;
  }
  const icsText = text => String(text || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  const utc = value => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  function fold(line) {
    const chunks = []; let current = "", bytes = 0;
    for (const ch of line) { const size = new TextEncoder().encode(ch).length; if (bytes + size > 73) { chunks.push(current); current = " "; bytes = 1; } current += ch; bytes += size; }
    chunks.push(current); return chunks.join("\r\n");
  }
  function calendarICS(tasks, now = Date.now()) {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Solo//Agenda 10//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Sōlo"];
    // Export concrete instances for the next year, with UTC times: recurrence stays
    // at the local wall-clock time through daylight-saving changes.
    const today = dayKey(now), last = addDays(today, 366);
    for (const task of tasks) {
      if (!anchor(task) || task.state === "failed") continue;
      const start = task.repeat && task.repeat !== "none" ? (anchor(task) > today ? anchor(task) : today) : anchor(task);
      if ((!task.repeat || task.repeat === "none") && start < today) continue;
      for (let day = start; day <= last; day = addDays(day, 1)) {
        if (!occurs(task, day) || status(task, day) !== "open") continue;
        const timed = validTime(task.planTime), at = timestamp(task, day);
        lines.push("BEGIN:VEVENT", `UID:${icsText(task.id)}-${day}@solo.local`, `DTSTAMP:${utc(now)}`, `SUMMARY:${icsText(task.title)}`);
        if (timed) lines.push(`DTSTART:${utc(at)}`, `DTEND:${utc(at + (Number(task.durationMinutes) || 30) * 60000)}`);
        else lines.push(`DTSTART;VALUE=DATE:${day.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(day, 1).replace(/-/g, "")}`);
        lines.push(`DESCRIPTION:${icsText(task.description)}`, `LOCATION:${icsText(task.location)}`);
        const reminder = reminderAt(task, day);
        if (timed && reminder !== null) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(task.title)}`, `TRIGGER:-PT${Math.round((at - reminder) / 60000)}M`, "END:VALARM");
        lines.push("END:VEVENT");
        if (!task.repeat || task.repeat === "none") break;
      }
    }
    lines.push("END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }
  root.SoloPlannerCore = { dayKey, validDay, validTime, dateOf, addDays, daysBetween, anchor, occurs, status, timestamp, forDay, monthDays, yearSummary, canSkip, mark, reminderAt, upcomingReminders, calendarICS };
  if (typeof module !== "undefined") module.exports = root.SoloPlannerCore;
})(typeof window !== "undefined" ? window : globalThis);
