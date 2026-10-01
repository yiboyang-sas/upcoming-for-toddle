importScripts("lib/queries.js", "lib/toddle.js");

const ALARM = "tu-refresh";
const REFRESH_MINUTES = 30;
const MIN_GAP_MS = 5 * 60 * 1000;
const BADGE_WINDOW_MS = 48 * 60 * 60 * 1000;

let inFlight = null;

function runSync({ force = false } = {}) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const { syncedAt = 0, identity = {} } = await chrome.storage.local.get(["syncedAt", "identity"]);
    if (!force && Date.now() - syncedAt < MIN_GAP_MS) return { ok: true, skipped: true };

    await chrome.storage.local.set({ sync: { state: "syncing", at: Date.now() } });
    try {
      const result = await Toddle.sync(identity);
      const now = Date.now();
      await chrome.storage.local.set({
        tasks: result.tasks,
        courses: result.courses,
        identity: result.identity,
        syncedAt: now,
        sync: { state: "ok", at: now, warnings: result.warnings },
      });
      return { ok: true };
    } catch (e) {
      const state = e instanceof Toddle.AuthError ? "signed-out" : "error";
      await chrome.storage.local.set({ sync: { state, at: Date.now(), error: e.message } });
      return { ok: false, state, error: e.message };
    }
  })().finally(() => {
    inFlight = null;
    updateBadge();
  });
  return inFlight;
}

async function updateBadge() {
  const { tasks = [], sync = {} } = await chrome.storage.local.get(["tasks", "sync"]);
  if (sync.state === "signed-out" && !tasks.length) {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#b7791f" });
    return;
  }
  const now = Date.now();
  const soon = tasks.filter((t) => t.dueAt && t.dueAt >= now && t.dueAt - now <= BADGE_WINDOW_MS).length;
  await chrome.action.setBadgeText({ text: soon ? String(soon) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#c7394f" });
  await chrome.action.setTitle({
    title: soon
      ? `Upcoming for Toddle — ${soon} due in the next 2 days`
      : "Upcoming for Toddle",
  });
}

async function ensureAlarm() {
  if (!(await chrome.alarms.get(ALARM))) {
    chrome.alarms.create(ALARM, { periodInMinutes: REFRESH_MINUTES, delayInMinutes: 1 });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  ensureAlarm();
  // Drop tasks cached by an older version so they're rebuilt with this
  // version's links. The remembered identity is kept.
  await chrome.storage.local.remove(["tasks", "syncedAt", "sync"]);
  runSync({ force: true });
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  runSync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM) return;
  runSync();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "sync") {
    runSync({ force: !!msg.force }).then(sendResponse);
    return true;
  }
  return false;
});
