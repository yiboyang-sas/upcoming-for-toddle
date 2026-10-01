// Talks to Toddle's GraphQL API the same way the Toddle web app does.
//
// Auth: the web app keeps a JWT in localStorage.userInfo (key `jwt`) and sends
// it as `Authorization: Bearer <jwt>`. When no Toddle tab is open we rebuild
// the same token from the split cookies Toddle sets on .toddleapp.com:
//   lhst = "<header>.<payload>", rhst = "<payload>.<signature>".
// Endpoint: https://<region>-production-apis.toddleapp.com/graphql, where
// <region> is the JWT's `region` claim (the web app's getBackendUrl).
//
// Loaded into the service worker with importScripts; exposes self.Toddle.

(() => {
  const WEB_URLS = ["https://web.toddleapp.com/*", "https://web.toddleapp.cn/*"];
  const COOKIE_DOMAINS = ["toddleapp.com", "toddleapp.cn"];
  const CHINA_REGIONS = new Set(["cn-north-1", "cn-northwest-1"]);
  const REGION_REMAPS = { "me-central-1": "eu-central-1" };
  const DEFAULT_REGION = "eu-west-1";
  const PAGE_SIZE = 50;
  const MAX_PAGES = 10;
  const REQUEST_GAP_MS = 250;

  // Toddle's To-do screen omits `status` for its "All" view (every TODO item).
  // Its sub-tabs pass one of these instead; we fall back to them if needed.
  const TODO_SUBSTATUSES = ["UPCOMING", "OVERDUE", "NODUE"];

  // Toddle's To-do only lists work the student still owes, so an assignment
  // with nothing to hand in moves to "Done" once its due date passes. We read
  // the most recent Done items and bring those back for this many days.
  const PAST_NO_SUBMISSION_DAYS = 14;
  const DONE_MAX_PAGES = 4;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const ASSESSMENT_TYPES = {
    le: "Learning experience",
    fa: "Formative assessment",
    sa: "Summative assessment",
    qt: "Quick task",
    se: "Supervised exam",
    pe: "Practice exam",
  };

  class AuthError extends Error {}

  // ---------- auth ----------

  function decodeJwt(token) {
    const part = typeof token === "string" ? token.split(".")[1] : null;
    if (!part) return null;
    try {
      const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="))
          .split("")
          .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
          .join("")
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function usablePayload(token) {
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(token || "")) return null;
    const payload = decodeJwt(token);
    if (!payload) return null;
    if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) return null;
    return payload;
  }

  function str(...values) {
    for (const v of values) {
      if ((typeof v === "string" && v) || typeof v === "number") return String(v);
    }
    return null;
  }

  async function authFromTabs() {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({ url: WEB_URLS });
    } catch {
      return null;
    }
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      try {
        // content/panel.js answers with the tab's localStorage session.
        const raw = await chrome.tabs.sendMessage(tab.id, { type: "tu:session" });
        if (!raw || !raw.userInfo) continue;
        const info = JSON.parse(raw.userInfo);
        const token = info.jwt || info.token || info.parentToken;
        const payload = usablePayload(token);
        if (!payload) continue;
        let programId = null;
        try {
          programId = str(JSON.parse(raw.program || "null")?.id);
        } catch {}
        return {
          token,
          source: "tab",
          region: str(payload.region, info.orgRegion),
          userId: str(info.id, info.identityId, payload.id, payload.sub),
          userType: str(info.user_type, info.userType, payload.user_type, payload.userType),
          orgId: str(info.org_id, info.organizationId, info.orgId),
          programId,
        };
      } catch {
        // No content script in this tab yet (e.g. opened before install).
      }
    }
    return null;
  }

  async function authFromCookies() {
    for (const domain of COOKIE_DOMAINS) {
      let cookies = [];
      try {
        cookies = await chrome.cookies.getAll({ domain });
      } catch {
        continue;
      }
      const lefts = cookies.filter((c) => c.name === "lhst").map((c) => c.value);
      const rights = cookies.filter((c) => c.name === "rhst").map((c) => c.value);
      for (const left of lefts) {
        for (const right of rights) {
          const signature = right.split(".").pop();
          if (!signature || !left.includes(".")) continue;
          const token = `${left}.${signature}`;
          const payload = usablePayload(token);
          if (!payload) continue;
          return {
            token,
            source: "cookies",
            region: str(payload.region),
            userId: str(payload.id, payload.user_id, payload.sub),
            userType: str(payload.user_type, payload.userType),
            orgId: str(payload.org_id, payload.organizationId, payload.orgId),
            programId: null,
          };
        }
      }
    }
    return null;
  }

  async function getAuth() {
    return (await authFromTabs()) || (await authFromCookies());
  }

  function endpointFor(region) {
    const raw = (region || "").trim() || DEFAULT_REGION;
    const mapped = REGION_REMAPS[raw] || raw;
    const host = CHINA_REGIONS.has(mapped) ? "apis.toddleapp.cn" : "apis.toddleapp.com";
    return `https://${mapped}-production-${host}/graphql`;
  }

  // ---------- transport ----------

  let lastRequestAt = 0;

  async function gql(auth, operationName, query, variables) {
    const wait = REQUEST_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();

    let res;
    try {
      res = await fetch(endpointFor(auth.region), {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${auth.token}`,
          "x-tod-source": "WEB",
          "x-tod-lang": (navigator.language || "en").split("-")[0],
        },
        body: JSON.stringify({ operationName, query, variables }),
      });
    } catch (e) {
      throw new Error(`Couldn't reach Toddle (${e.message || e}).`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new AuthError("Toddle rejected the session. Log in to Toddle again.");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Toddle API error ${res.status}${text ? ": " + text.slice(0, 200) : ""}`);
    }
    let body = await res.json();
    if (Array.isArray(body)) body = body[0] || {};
    const errors = body.errors || [];
    if (errors.some((e) => /unauth|not authori[sz]ed|jwt|token|login/i.test(e.message || ""))) {
      throw new AuthError("Toddle says you're signed out. Log in to Toddle again.");
    }
    return { data: body.data || null, errors };
  }

  function errorText(errors) {
    return errors.map((e) => e.message).filter(Boolean).join("; ") || "Unknown GraphQL error";
  }

  // ---------- data ----------

  async function fetchCourses(auth) {
    const filters = { archivalState: "ACTIVE" };
    if (auth.programId) filters.curriculumProgramIds = [auth.programId];
    const { data, errors } = await gql(auth, "getUserCourses", TU_QUERIES.USER_COURSES, {
      id: auth.userId,
      type: "STUDENT",
      filters,
    });
    const courses = data?.node?.courses;
    if (!Array.isArray(courses)) {
      if (errors.length) throw new Error(`Couldn't load classes: ${errorText(errors)}`);
      return [];
    }
    return courses.filter((c) => c && c.id && !c.isArchived);
  }

  function pickAcademicYear(courses) {
    const counts = new Map();
    const now = Date.now();
    for (const c of courses) {
      for (const y of c.academicYears || []) {
        const inRange =
          Date.parse(y.startDate) <= now && now <= Date.parse(y.endDate);
        const score = (y.isCurrentAcademicYear ? 2 : 0) + (inRange ? 1 : 0);
        if (!score) continue;
        counts.set(y.id, (counts.get(y.id) || 0) + score);
      }
    }
    let best = null;
    for (const [id, n] of counts) if (!best || n > best[1]) best = [id, n];
    return best ? best[0] : null;
  }

  async function fetchTasks(auth, filters, { maxPages = MAX_PAGES, orderByDirection = "ASC" } = {}) {
    const edges = [];
    let after = undefined;
    for (let page = 0; page < maxPages; page++) {
      const { data, errors } = await gql(auth, "getStudentTasks", TU_QUERIES.STUDENT_TASKS, {
        userId: auth.userId,
        type: "STUDENT",
        filters,
        first: PAGE_SIZE,
        after,
        orderByDirection,
      });
      const conn = data?.node?.tasks;
      if (!conn) throw new Error(errors.length ? errorText(errors) : "No task list returned for this account.");
      edges.push(...(conn.edges || []));
      if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
      after = conn.pageInfo.endCursor;
    }
    return edges;
  }

  // ---------- normalisation ----------

  function parseWhen(value, allDay) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number" || /^\d+$/.test(String(value))) {
      const n = Number(value);
      return n < 1e12 ? n * 1000 : n;
    }
    const s = String(value);
    const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const [, y, m, d] = dateOnly.map(Number);
      return new Date(y, m - 1, d, 23, 59).getTime();
    }
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    return t;
  }

  function cleanText(s) {
    return String(s || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function humanStatus(raw) {
    const s = String(raw || "").toUpperCase();
    if (!s) return null;
    if (s.includes("DRAFT") || s.includes("IN_PROGRESS") || s === "STARTED") return "In progress";
    if (s.includes("RETURN") || s.includes("REDO") || s.includes("RESUBMI")) return "Returned";
    return null;
  }

  function firstCourse(projectGroup) {
    return projectGroup?.courses?.edges?.find((e) => e?.node)?.node || null;
  }

  function projectLink(project) {
    const pg = project?.projectGroup;
    if (!project?.id || !pg?.id) return null;
    return {
      type: "project",
      projectId: project.id,
      projectGroupId: pg.id,
      groupType: pg.type || null,
      subType: pg.subType || null,
      courseIds: (pg.courses?.edges || []).map((e) => e?.node?.id).filter(Boolean),
    };
  }

  // Toddle routes live under /platform/<curriculumProgramId>/. These mirror the
  // web app's own navigation. Assignment notifications open
  // courses/<courseId>/links/classroom-details/<assignmentId>, or drop the
  // courses/<courseId>/ part for schools on Toddle's "learning courses" setup.
  // The To-do list opens projects under courses/<courseId>/ for IB
  // internal/external assessments and under project-group-types/<type>/ for
  // everything else.
  const COURSE_SCOPED_PROJECTS = new Set(["INTERNAL_ASSESSMENT", "EXTERNAL_ASSESSMENT"]);

  function taskPath(link, ctx) {
    if (!link) return null;
    const program = link.programId || ctx.programId;
    if (!program) return null;
    const enc = encodeURIComponent;
    const base = `/platform/${enc(program)}`;

    if (link.type === "assignment") {
      const scope = link.courseId && !link.usesLearningCourses ? `/courses/${enc(link.courseId)}` : "";
      return `${base}${scope}/links/classroom-details/${enc(link.assignmentId)}`;
    }

    const tail = `/projects/${enc(link.projectGroupId)}/progress/${enc(link.projectId)}`;
    if (COURSE_SCOPED_PROJECTS.has(link.subType)) {
      const courseId = link.courseIds.find((id) => ctx.courseIds.has(id));
      return courseId ? `${base}/courses/${enc(courseId)}${tail}` : null;
    }
    return link.groupType ? `${base}/project-group-types/${enc(link.groupType)}${tail}` : null;
  }

  function normalizeEdge(edge) {
    const item = edge?.item;
    if (!item) return null;

    if (item.assignment) {
      const a = item.assignment;
      const content = a.content || {};
      const course = a.course || {};
      const typeLabel =
        content.taskType?.label ||
        ASSESSMENT_TYPES[String(content.assessmentType?.value || "").toLowerCase()] ||
        null;
      const noSubmission = item.status === "SUBMISSION_NOT_REQUIRED" || a.isStudentSubmissionEnabled === false;
      return {
        requiresSubmission: noSubmission ? false : a.isStudentSubmissionEnabled === true ? true : null,
        submitted: item.isSubmitted === true,
        id: `assignment:${item.id}`,
        kind: "assignment",
        link: a.id
          ? {
              type: "assignment",
              assignmentId: a.id,
              programId: a.curriculumProgram?.id || null,
              courseId: course.id || null,
              usesLearningCourses: !!course.learningCourse?.id,
            }
          : null,
        title: cleanText(content.title?.value || content.label || a.label) || "Untitled",
        type: typeLabel,
        courseId: course.id || null,
        courseTitle: cleanText(course.title || course.learningCourse?.title),
        dueAt: parseWhen(a.deadline),
        allDay: false,
        closesAt: parseWhen(a.closeSubmissionDate),
        status: humanStatus(item.submission?.statusV2 || item.submission?.status) || humanStatus(item.status),
        isNew: item.isNewForStudent === true,
        locked: String(item.lockingState?.state || "").toUpperCase() === "LOCKED",
        unread: Number(item.conversation?.unreadMessageCount) || 0,
      };
    }

    if (item.deadline && item.project) {
      const d = item.deadline;
      const pg = item.project.projectGroup || {};
      const course = firstCourse(pg);
      return {
        id: `deadline:${item.id}`,
        kind: "deadline",
        link: projectLink(item.project),
        requiresSubmission: null,
        submitted: false,
        title: cleanText(d.title) || "Deadline",
        type: cleanText(pg.name) || "Project deadline",
        courseId: course?.id || null,
        courseTitle: cleanText(course?.title || pg.name),
        dueAt: parseWhen(d.deadlineDate),
        allDay: d.isDeadlineAllDay === true,
        closesAt: null,
        status: null,
        isNew: false,
        locked: false,
        unread: Number(item.project.conversation?.unreadMessageCount) || 0,
      };
    }

    if (item.task) {
      const t = item.task;
      const course = firstCourse(item.mappedProject?.projectGroup);
      return {
        id: `project-task:${item.id}`,
        kind: "project-task",
        link: projectLink(item.mappedProject),
        requiresSubmission:
          t.isStudentSubmissionEnabled === false ? false : t.isStudentSubmissionEnabled === true ? true : null,
        submitted: false,
        title: cleanText(t.title) || "Project task",
        type: "Project task",
        courseId: course?.id || null,
        courseTitle: "",
        dueAt: parseWhen(t.dueOn),
        allDay: false,
        closesAt: parseWhen(t.closesOn),
        status: humanStatus(item.latestSubmissionResponse?.status),
        isNew: false,
        locked: false,
        unread: 0,
      };
    }

    return null;
  }

  // ---------- sync ----------

  async function sync(known = {}) {
    const auth = await getAuth();
    if (!auth) throw new AuthError("Open Toddle and log in so the extension can read your tasks.");

    // A tab gives the freshest identity; cookies only carry what's in the JWT,
    // so fall back to what an earlier tab-based sync remembered.
    const sameOrg = !known.orgId || !auth.orgId || known.orgId === auth.orgId;
    if (auth.source === "cookies" && sameOrg) {
      auth.userId = known.userId || auth.userId;
      auth.programId = known.programId || auth.programId;
    }
    if (!auth.userId) throw new AuthError("Open (or reload) Toddle so the extension can finish setting up.");
    if (auth.userType && !/student/i.test(auth.userType)) {
      throw new Error(`This extension reads student to-do lists, but you're signed in as "${auth.userType}".`);
    }

    // Without a Toddle tab the student ID is a guess from the cookie JWT; if
    // that guess fails, ask for a Toddle visit rather than show an API error.
    const guessedUserId = auth.source === "cookies" && !known.userId;
    try {
      return await loadTasks(auth, known);
    } catch (e) {
      if (guessedUserId && !(e instanceof AuthError)) {
        throw new AuthError("Open (or reload) Toddle so the extension can finish setting up.");
      }
      throw e;
    }
  }

  async function loadTasks(auth, known) {
    const courses = await fetchCourses(auth);
    const academicYearId = pickAcademicYear(courses) || known.academicYearId || null;
    const programIds = [
      ...new Set(
        [auth.programId, ...courses.map((c) => c.curriculumProgram?.id)].filter(Boolean)
      ),
    ];

    const baseFilters = {
      completionStatus: "TODO",
      courseIds: courses.map((c) => c.id),
      entityTypes: ["STUDENT_ASSIGNMENT", "PROJECT_DEADLINE"],
      excludedAssessmentTypes: ["dp_pa", "dp_ep"],
      projectGroupIds: [],
      searchText: "",
    };
    if (academicYearId) baseFilters.academicYearId = academicYearId;
    if (programIds.length) baseFilters.curriculumProgramIds = programIds;

    const edges = [];
    const failures = [];
    try {
      edges.push(...(await fetchTasks(auth, baseFilters)));
    } catch (e) {
      if (e instanceof AuthError) throw e;
      failures.push(`all: ${e.message}`);
      for (const status of TODO_SUBSTATUSES) {
        try {
          edges.push(...(await fetchTasks(auth, { ...baseFilters, status })));
        } catch (err) {
          if (err instanceof AuthError) throw err;
          failures.push(`${status}: ${err.message}`);
        }
      }
      if (failures.length === TODO_SUBSTATUSES.length + 1) {
        throw new Error(`Couldn't load tasks. ${e.message}`);
      }
    }

    let doneEdges = [];
    try {
      doneEdges = await fetchTasks(
        auth,
        { ...baseFilters, completionStatus: "COMPLETED" },
        { maxPages: DONE_MAX_PAGES, orderByDirection: "DESC" }
      );
    } catch (e) {
      if (e instanceof AuthError) throw e;
      failures.push(`done: ${e.message}`);
    }

    const now = Date.now();
    const byId = new Map();
    const add = (task) => {
      if (!byId.has(task.id)) byId.set(task.id, task);
    };
    for (const edge of edges) {
      const task = normalizeEdge(edge);
      if (task && !(task.submitted && task.requiresSubmission !== false)) add(task);
    }
    const pastDueCutoff = now - PAST_NO_SUBMISSION_DAYS * DAY_MS;
    for (const edge of doneEdges) {
      const task = normalizeEdge(edge);
      if (task?.kind !== "assignment" || task.requiresSubmission !== false || task.dueAt == null) continue;
      if (task.dueAt < now && task.dueAt >= pastDueCutoff) add(task);
    }

    const courseMap = {};
    for (const c of courses) {
      courseMap[c.id] = {
        title: cleanText(c.title),
        color: c.profileImageData?.color || null,
      };
    }
    const webBase = CHINA_REGIONS.has(auth.region) ? "https://web.toddleapp.cn" : "https://web.toddleapp.com";
    const linkCtx = {
      programId: auth.programId || known.programId || programIds[0] || null,
      courseIds: new Set(courses.map((c) => c.id)),
    };
    const tasks = [...byId.values()].map(({ link, submitted, ...t }) => {
      const path = taskPath(link, linkCtx);
      return {
        ...t,
        url: path ? webBase + path : null,
        courseTitle: t.courseTitle || courseMap[t.courseId]?.title || "",
      };
    });

    return {
      tasks,
      courses: courseMap,
      identity: {
        userId: auth.userId,
        orgId: auth.orgId || known.orgId || null,
        programId: auth.programId || known.programId || null,
        academicYearId,
      },
      warnings: failures,
    };
  }

  self.Toddle = { sync, AuthError };
})();
