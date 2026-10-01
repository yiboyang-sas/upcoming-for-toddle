// Renders the upcoming-tasks list. Shared by the toolbar popup and the panel
// injected into Toddle pages. Data comes from chrome.storage via the caller.

(() => {
  if (globalThis.TUView) return;

  const DAY = 24 * 60 * 60 * 1000;
  const OVERDUE_PREVIEW = 3;
  const STALE_SYNCING_MS = 90 * 1000;

  const GROUPS = [
    { key: "overdue", label: "Overdue" },
    { key: "today", label: "Today" },
    { key: "tomorrow", label: "Tomorrow" },
    { key: "week", label: "Next 7 days" },
    { key: "later", label: "Later" },
    { key: "nodue", label: "No due date" },
  ];

  const FALLBACK_COLORS = ["#2f6fdb", "#0f8a6a", "#b4541a", "#8a3fd1", "#c2255c", "#1c7c8c", "#7a6a12", "#4a5ad6"];

  const ICONS = {
    refresh:
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v3.8h-3.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    open:
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 4h5v5M16 4l-7.5 7.5M14 11.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close:
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    chat:
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3h0A1.5 1.5 0 0 1 4 11.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    chevron:
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 8l4.5 4.5L14.5 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    upload:
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V4M6.5 7.5L10 4l3.5 3.5M4 12.5V15a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  // ---------- helpers ----------

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v; // static icon markup only
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (k === "style") node.setAttribute("style", v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function startOfDay(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function dayDiff(t, now) {
    return Math.round((startOfDay(t) - startOfDay(now)) / DAY);
  }

  function groupOf(task, now) {
    if (!task.dueAt) return "nodue";
    if (task.dueAt < now) return "overdue";
    const diff = dayDiff(task.dueAt, now);
    if (diff <= 0) return "today";
    if (diff === 1) return "tomorrow";
    if (diff <= 7) return "week";
    return "later";
  }

  const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const fmtWeekday = (t) => new Date(t).toLocaleDateString([], { weekday: "short" });
  const fmtDate = (t, withYear) =>
    new Date(t).toLocaleDateString([], { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
  }

  function untilText(ms) {
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `in ${Math.max(mins, 1)} min`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `in ${hours} h`;
    return `in ${plural(Math.round(hours / 24), "day")}`;
  }

  // "late" only when something was owed; otherwise it's just in the past.
  function pastDueText(ms, owed) {
    const hours = Math.floor(ms / 3600000);
    const suffix = owed ? "late" : "ago";
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours} h ${suffix}`;
    return `${plural(Math.floor(hours / 24), "day")} ${suffix}`;
  }

  function agoText(t, now) {
    const mins = Math.round((now - t) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    return fmtDate(t);
  }

  function dueLabels(task, group, now) {
    const t = task.dueAt;
    const time = task.allDay ? "All day" : fmtTime(t);
    switch (group) {
      case "overdue":
        return [
          fmtDate(t, new Date(t).getFullYear() !== new Date(now).getFullYear()),
          pastDueText(now - t, task.requiresSubmission !== false),
        ];
      case "today":
        return [time, task.allDay ? "" : untilText(t - now)];
      case "tomorrow":
        return [time, ""];
      case "week":
        return [fmtWeekday(t), task.allDay ? fmtDate(t) : time];
      case "later":
        return [fmtDate(t, new Date(t).getFullYear() !== new Date(now).getFullYear()), untilText(t - now)];
      default:
        return ["", ""];
    }
  }

  function hashColor(key) {
    let h = 0;
    for (const ch of String(key || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
  }

  function courseColor(task, courses) {
    const c = courses?.[task.courseId]?.color;
    if (c && globalThis.CSS?.supports?.("color", c)) return c;
    return hashColor(task.courseId || task.courseTitle);
  }

  // ---------- component ----------

  function mount(container, opts = {}) {
    const ui = { course: "all", showAllOverdue: false };
    let data = {};

    const root = el("div", { class: "tu", "data-variant": opts.variant || "popup" });
    if (opts.theme) root.setAttribute("data-theme", opts.theme);
    container.append(root);

    const refreshBtn = el("button", {
      class: "tu-icon-btn",
      type: "button",
      title: "Refresh",
      "aria-label": "Refresh",
      html: ICONS.refresh,
      onclick: () => opts.onRefresh?.(),
    });

    const head = el(
      "header",
      { class: "tu-head" },
      el(
        "div",
        { class: "tu-head-row" },
        el("h1", { class: "tu-title" }, "Upcoming"),
        el(
          "div",
          { class: "tu-actions" },
          el("div", { class: "tu-filter-slot" }),
          refreshBtn,
          opts.onOpenToddle &&
            el("button", {
              class: "tu-icon-btn",
              type: "button",
              title: "Open Toddle",
              "aria-label": "Open Toddle",
              html: ICONS.open,
              onclick: () => opts.onOpenToddle(),
            }),
          opts.onClose &&
            el("button", {
              class: "tu-icon-btn",
              type: "button",
              title: "Close",
              "aria-label": "Close",
              html: ICONS.close,
              onclick: () => opts.onClose(),
            })
        )
      ),
      el("p", { class: "tu-meta" })
    );
    const banner = el("div", { class: "tu-banner", hidden: true });
    const list = el("div", { class: "tu-list" });
    root.append(head, banner, list);
    if (opts.footer) root.append(opts.footer);

    function isSyncing() {
      return data.sync?.state === "syncing" && Date.now() - (data.sync.at || 0) < STALE_SYNCING_MS;
    }

    function renderMeta(tasks, now) {
      const meta = head.querySelector(".tu-meta");
      const parts = [];
      const overdue = tasks.filter((t) => t.dueAt && t.dueAt < now).length;
      const week = tasks.filter((t) => t.dueAt && t.dueAt >= now && dayDiff(t.dueAt, now) <= 7).length;
      if (data.syncedAt) {
        if (week) parts.push(`${week} due this week`);
        else parts.push(tasks.length ? `${tasks.length} to do` : "Nothing to do");
        if (overdue) parts.push(`${overdue} overdue`);
      }
      parts.push(isSyncing() ? "Syncing…" : data.syncedAt ? `Synced ${agoText(data.syncedAt, now)}` : "");
      meta.textContent = parts.filter(Boolean).join(" · ");
      refreshBtn.classList.toggle("is-spinning", isSyncing());
      refreshBtn.disabled = isSyncing();
    }

    function renderFilter(allTasks) {
      const slot = head.querySelector(".tu-filter-slot");
      slot.replaceChildren();
      const byCourse = new Map();
      for (const t of allTasks) {
        const key = t.courseId || `title:${t.courseTitle}`;
        if (!t.courseTitle) continue;
        byCourse.set(key, t.courseTitle);
      }
      if (byCourse.size < 2) {
        ui.course = "all";
        return;
      }
      if (ui.course !== "all" && !byCourse.has(ui.course)) ui.course = "all";
      const select = el(
        "select",
        {
          class: "tu-select",
          "aria-label": "Filter by class",
          onchange: (e) => {
            ui.course = e.target.value;
            render();
          },
        },
        el("option", { value: "all" }, "All classes"),
        [...byCourse.entries()]
          .sort((a, b) => a[1].localeCompare(b[1]))
          .map(([key, title]) => el("option", { value: key }, title))
      );
      select.value = ui.course;
      slot.append(select);
    }

    function renderBanner(hasData, now) {
      const s = data.sync || {};
      banner.hidden = true;
      banner.replaceChildren();
      if (!hasData || isSyncing() || (s.state !== "error" && s.state !== "signed-out")) return;
      const text =
        s.state === "signed-out"
          ? `You're signed out of Toddle. Showing tasks from ${agoText(data.syncedAt, now)}.`
          : `Last refresh failed: ${s.error || "unknown error"}`;
      banner.className = `tu-banner tu-banner-${s.state}`;
      banner.append(
        el("span", {}, text),
        el(
          "button",
          {
            class: "tu-link-btn",
            type: "button",
            onclick: () => (s.state === "signed-out" ? opts.onOpenToddle?.() : opts.onRefresh?.()),
          },
          s.state === "signed-out" ? "Log in" : "Retry"
        )
      );
      banner.hidden = false;
    }

    function emptyState(now) {
      const s = data.sync || {};
      if (!data.syncedAt) {
        if (isSyncing() || !s.state) {
          return el(
            "div",
            { class: "tu-empty" },
            el("div", { class: "tu-spinner", "aria-hidden": "true" }),
            el("p", { class: "tu-empty-title" }, "Loading your tasks…")
          );
        }
        if (s.state === "signed-out") {
          return el(
            "div",
            { class: "tu-empty" },
            el("p", { class: "tu-empty-title" }, "Log in to Toddle"),
            el("p", { class: "tu-empty-body" }, s.error || "Open Toddle and log in. Your tasks will show up here."),
            opts.onOpenToddle &&
              el("button", { class: "tu-btn", type: "button", onclick: () => opts.onOpenToddle() }, "Open Toddle")
          );
        }
        return el(
          "div",
          { class: "tu-empty" },
          el("p", { class: "tu-empty-title" }, "Couldn't load your tasks"),
          el("p", { class: "tu-empty-body tu-error-text" }, s.error || "Unknown error"),
          el("button", { class: "tu-btn", type: "button", onclick: () => opts.onRefresh?.() }, "Try again")
        );
      }
      return el(
        "div",
        { class: "tu-empty" },
        el("div", { class: "tu-empty-mark", "aria-hidden": "true" }, "✓"),
        el("p", { class: "tu-empty-title" }, ui.course === "all" ? "You're all caught up" : "Nothing due for this class"),
        el("p", { class: "tu-empty-body" }, `Checked ${agoText(data.syncedAt, now)}.`)
      );
    }

    function renderItem(task, group, now) {
      const [primary, secondary] = dueLabels(task, group, now);
      const chips = [];
      if (task.isNew) chips.push(el("span", { class: "tu-chip tu-chip-new" }, "New"));
      if (task.requiresSubmission === true) {
        chips.push(
          el(
            "span",
            { class: "tu-chip tu-chip-submit" },
            el("span", { class: "tu-chip-icon", html: ICONS.upload }),
            "Needs submission"
          )
        );
      } else if (task.requiresSubmission === false) {
        chips.push(el("span", { class: "tu-chip tu-chip-nosubmit" }, "No submission"));
      }
      if (task.status) chips.push(el("span", { class: "tu-chip" }, task.status));
      if (task.locked) chips.push(el("span", { class: "tu-chip" }, "Locked"));
      else if (task.closesAt && task.closesAt < now) chips.push(el("span", { class: "tu-chip" }, "Closed"));
      if (task.unread) {
        chips.push(
          el(
            "span",
            { class: "tu-chip tu-chip-msg", title: `${plural(task.unread, "unread message")}` },
            el("span", { class: "tu-chip-icon", html: ICONS.chat }),
            String(task.unread)
          )
        );
      }
      const sub = [...new Set([task.courseTitle, task.type].filter(Boolean))];
      return el(
        "li",
        {
          class: "tu-item",
          "data-group": group,
          "data-nosubmit": task.requiresSubmission === false,
          style: `--course:${courseColor(task, data.courses)}`,
        },
        el(
          opts.onOpenTask ? "button" : "div",
          opts.onOpenTask
            ? { class: "tu-item-btn", type: "button", title: "Open in Toddle", onclick: () => opts.onOpenTask(task) }
            : { class: "tu-item-btn is-static" },
          el("span", { class: "tu-bar", "aria-hidden": "true" }),
          el(
            "span",
            { class: "tu-main" },
            el("span", { class: "tu-item-title" }, task.title),
            sub.length ? el("span", { class: "tu-item-sub" }, sub.join(" · ")) : null,
            chips.length ? el("span", { class: "tu-chips" }, chips) : null
          ),
          primary
            ? el(
                "span",
                { class: "tu-due" },
                el("span", { class: "tu-due-primary" }, primary),
                secondary ? el("span", { class: "tu-due-secondary" }, secondary) : null
              )
            : null
        )
      );
    }

    function render() {
      const now = Date.now();
      const allTasks = Array.isArray(data.tasks) ? data.tasks : [];
      renderFilter(allTasks);
      const tasks =
        ui.course === "all"
          ? allTasks
          : allTasks.filter((t) => (t.courseId || `title:${t.courseTitle}`) === ui.course);

      renderMeta(tasks, now);
      renderBanner(!!data.syncedAt, now);
      // Re-rendering rebuilds the list, so keep the reader's place and focus.
      const scrollTop = list.scrollTop;
      const active = root.getRootNode().activeElement;
      const focusedGroup = active?.matches?.(".tu-group-toggle") ? active.closest(".tu-group")?.dataset.group : null;
      list.replaceChildren();

      if (!tasks.length) {
        list.append(emptyState(now));
        return;
      }

      const buckets = Object.fromEntries(GROUPS.map((g) => [g.key, []]));
      for (const t of tasks) buckets[groupOf(t, now)].push(t);
      for (const [key, arr] of Object.entries(buckets)) {
        if (key === "overdue") arr.sort((a, b) => b.dueAt - a.dueAt);
        else if (key === "nodue") arr.sort((a, b) => a.title.localeCompare(b.title));
        else arr.sort((a, b) => a.dueAt - b.dueAt || a.title.localeCompare(b.title));
      }

      // Upcoming work first; overdue sits below it so a long tail of stale
      // items never pushes this week's work out of view.
      const order = ["today", "tomorrow", "week", "later", "overdue", "nodue"];
      const collapsedGroups = new Set(data.settings?.collapsed || []);
      for (const key of order) {
        const items = buckets[key];
        if (!items.length) continue;
        const group = GROUPS.find((g) => g.key === key);
        const isCollapsed = collapsedGroups.has(key);
        const truncated = key === "overdue" && !ui.showAllOverdue && items.length > OVERDUE_PREVIEW;
        const shown = truncated ? items.slice(0, OVERDUE_PREVIEW) : items;
        list.append(
          el(
            "section",
            { class: "tu-group", "data-group": key, "data-collapsed": isCollapsed },
            el(
              "h2",
              { class: "tu-group-title" },
              el(
                "button",
                {
                  class: "tu-group-toggle",
                  type: "button",
                  "aria-expanded": String(!isCollapsed),
                  title: isCollapsed ? `Show ${group.label.toLowerCase()}` : `Hide ${group.label.toLowerCase()}`,
                  onclick: () => toggleGroup(key),
                },
                el("span", { class: "tu-chevron", html: ICONS.chevron }),
                el("span", {}, group.label),
                el("span", { class: "tu-count" }, String(items.length))
              )
            ),
            !isCollapsed && el("ul", { class: "tu-items" }, shown.map((t) => renderItem(t, key, now))),
            !isCollapsed &&
              truncated &&
              el(
                "button",
                {
                  class: "tu-link-btn tu-more",
                  type: "button",
                  onclick: () => {
                    ui.showAllOverdue = true;
                    render();
                  },
                },
                `Show ${items.length - OVERDUE_PREVIEW} more`
              )
          )
        );
      }
      list.scrollTop = scrollTop;
      if (focusedGroup) {
        list
          .querySelector(`.tu-group[data-group="${focusedGroup}"] .tu-group-toggle`)
          ?.focus({ preventScroll: true });
      }
    }

    // Collapsed sections are a setting, shared by the popup and the panel.
    function toggleGroup(key) {
      const collapsed = new Set(data.settings?.collapsed || []);
      if (collapsed.has(key)) collapsed.delete(key);
      else collapsed.add(key);
      data = { ...data, settings: { ...(data.settings || {}), collapsed: [...collapsed] } };
      render();
      opts.onSettingsChange?.({ collapsed: [...collapsed] });
    }

    return {
      root,
      update(next) {
        data = { ...data, ...next };
        render();
      },
      render,
    };
  }

  globalThis.TUView = { mount };
})();
