// Adds an "Upcoming" tab to the right edge of Toddle pages. Clicking it slides
// in the same list the toolbar popup shows. Also hands the background worker
// the logged-in session Toddle keeps in this page's localStorage.

(() => {
  if (window.__tuPanelLoaded) return;
  window.__tuPanelLoaded = true;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== "tu:session" || sender.id !== chrome.runtime.id) return false;
    sendResponse({
      userInfo: localStorage.getItem("userInfo"),
      program: localStorage.getItem("currentCurriculumProgram"),
    });
    return false;
  });

  const KEYS = ["tasks", "courses", "sync", "syncedAt", "settings"];
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  const PANEL_CSS = `
    :host { all: initial; }
    .tab {
      position: fixed; top: 50%; right: 0; z-index: 2147483000;
      transform: translateY(-50%);
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 12px 7px; border: 0; border-radius: 10px 0 0 10px;
      background: #c7394f; color: #fff; cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,.18);
      font: 600 12px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      letter-spacing: .02em;
    }
    .tab:hover { padding-right: 10px; }
    .tab:focus-visible { outline: 2px solid #2f6fdb; outline-offset: 2px; }
    .tab-label { writing-mode: vertical-rl; transform: rotate(180deg); }
    .tab-count {
      min-width: 18px; padding: 3px 4px; border-radius: 9px;
      background: #fff; color: #c7394f; font-size: 11px; text-align: center;
    }
    .tab-count:empty { display: none; }
    .panel {
      position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483001;
      width: min(400px, 100vw);
      background: #fff;
      box-shadow: -8px 0 30px rgba(0,0,0,.16);
      transform: translateX(105%);
      transition: transform .22s ease;
      visibility: hidden;
    }
    .panel.open { transform: none; visibility: visible; }
    @media (prefers-reduced-motion: reduce) { .panel { transition: none; } }
  `;

  let host, shadow, tab, tabCount, panel, view;
  let data = {};

  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch {
      // Extension was reloaded; this old content script can no longer talk to it.
    }
  }

  async function saveSettings(patch) {
    try {
      const { settings = {} } = await chrome.storage.local.get("settings");
      await chrome.storage.local.set({ settings: { ...settings, ...patch } });
    } catch {
      // Extension was reloaded; the change still applies until the page reloads.
    }
  }

  function setOpen(open) {
    panel.classList.toggle("open", open);
    tab.setAttribute("aria-expanded", String(open));
    if (open) {
      view.render();
      send({ type: "sync" });
    }
  }

  function build() {
    host = document.createElement("div");
    host.id = "tu-upcoming-host";
    shadow = host.attachShadow({ mode: "open" });

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("lib/view.css");
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;

    tab = document.createElement("button");
    tab.className = "tab";
    tab.type = "button";
    tab.title = "Upcoming assignments";
    tab.setAttribute("aria-expanded", "false");
    tabCount = document.createElement("span");
    tabCount.className = "tab-count";
    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = "Upcoming";
    tab.append(tabCount, label);
    tab.addEventListener("click", () => setOpen(!panel.classList.contains("open")));

    panel = document.createElement("aside");
    panel.className = "panel";
    panel.setAttribute("aria-label", "Upcoming assignments");

    view = TUView.mount(panel, {
      variant: "panel",
      theme: "light",
      onRefresh: () => send({ type: "sync", force: true }),
      onClose: () => setOpen(false),
      onSettingsChange: saveSettings,
      onOpenTask: (task) => {
        setOpen(false);
        if (task.url) location.assign(task.url);
      },
    });

    shadow.append(link, style, tab, panel);
    document.documentElement.append(host);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.classList.contains("open")) setOpen(false);
    });
    document.addEventListener("mousedown", (e) => {
      if (panel.classList.contains("open") && !e.composedPath().includes(host)) setOpen(false);
    });
    setInterval(() => {
      if (panel.classList.contains("open")) view.render();
      updateTab();
    }, 60 * 1000);
  }

  function updateTab() {
    if (!tabCount) return;
    const now = Date.now();
    const n = (data.tasks || []).filter((t) => t.dueAt && t.dueAt >= now && t.dueAt - now <= WEEK_MS).length;
    tabCount.textContent = n ? String(n) : "";
    tab.title = n ? `${n} due in the next 7 days` : "Upcoming assignments";
  }

  function apply(next) {
    data = { ...data, ...next };
    const show = (data.settings || {}).showOnPage !== false;
    if (show && !host) build();
    if (host) host.style.display = show ? "" : "none";
    if (view) view.update(next);
    updateTab();
  }

  chrome.storage.local.get(KEYS).then((initial) => {
    apply(initial);
    // Being on Toddle is the best moment to refresh: the session is fresh.
    send({ type: "sync" });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const next = {};
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (KEYS.includes(key)) next[key] = newValue;
    }
    if (Object.keys(next).length) apply(next);
  });
})();
