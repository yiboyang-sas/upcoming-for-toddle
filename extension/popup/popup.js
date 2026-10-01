const KEYS = ["tasks", "courses", "sync", "syncedAt", "settings"];
const TODDLE_HOME = "https://web.toddleapp.com/";
const TODDLE_TABS = ["https://web.toddleapp.com/*", "https://web.toddleapp.cn/*"];

async function openToddle() {
  const [tab] = await chrome.tabs.query({ url: TODDLE_TABS });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: TODDLE_HOME });
  }
  window.close();
}

// A new tab, so we never navigate away from work in progress in a Toddle tab.
async function openTask(task) {
  if (!task.url) return openToddle();
  await chrome.tabs.create({ url: task.url });
  window.close();
}

function refresh() {
  chrome.runtime.sendMessage({ type: "sync", force: true });
}

async function saveSettings(patch) {
  const { settings = {} } = await chrome.storage.local.get("settings");
  await chrome.storage.local.set({ settings: { ...settings, ...patch } });
}

const toggle = document.createElement("input");
toggle.type = "checkbox";
toggle.addEventListener("change", () => saveSettings({ showOnPage: toggle.checked }));

const toggleLabel = document.createElement("label");
toggleLabel.className = "tu-toggle";
toggleLabel.append(toggle, "Show “Upcoming” tab on Toddle");

const footer = document.createElement("footer");
footer.className = "tu-foot";
const note = document.createElement("span");
note.textContent = `v${chrome.runtime.getManifest().version}`;
note.title = "Refreshes every 30 minutes";
footer.append(toggleLabel, note);

const view = TUView.mount(document.getElementById("app"), {
  variant: "popup",
  onRefresh: refresh,
  onOpenToddle: openToddle,
  onOpenTask: openTask,
  onSettingsChange: saveSettings,
  footer,
});

function apply(data) {
  if ("settings" in data) toggle.checked = (data.settings || {}).showOnPage !== false;
  view.update(data);
}

chrome.storage.local.get(KEYS).then((data) => {
  if (!("settings" in data)) data.settings = {};
  apply(data);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const next = {};
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (KEYS.includes(key)) next[key] = newValue;
  }
  if (Object.keys(next).length) apply(next);
});

// Throttled in the background, so opening the popup often is cheap.
chrome.runtime.sendMessage({ type: "sync" });
setInterval(() => view.render(), 30 * 1000);
