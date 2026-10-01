// Runs extension/lib/toddle.js against a mocked chrome API and Toddle GraphQL
// API.  Usage: node tests/sync.test.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const EXT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "extension");
const now = Date.now();
const H = 3600e3;

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const jwt = (payload) => `${b64url({ alg: "HS256" })}.${b64url(payload)}.sig_nature`;
const goodToken = jwt({ id: "u1", region: "us-east-1", exp: Math.floor(now / 1000) + 3600 });
const splitCookies = (token) => {
  const [h, p, s] = token.split(".");
  return [{ name: "lhst", value: `${h}.${p}` }, { name: "rhst", value: `${p}.${s}` }];
};

const EDGES = [
  {
    id: "e1", itemType: "STUDENT_ASSIGNMENT",
    item: {
      __typename: "StudentAssignment", id: "sa1", isSubmitted: false, isNewForStudent: true,
      conversation: { unreadMessageCount: 2 }, submission: { status: "DRAFT", statusV2: null },
      lockingState: { state: "UNLOCKED" },
      assignment: {
        id: "as1", deadline: new Date(now + 5 * H).toISOString(), closeSubmissionDate: null, isStudentSubmissionEnabled: true,
        course: { id: "c1", title: "Grade 10 Math" },
        curriculumProgram: { id: "prog-9" },
        content: { __typename: "Assessment", title: { value: "Quadratics <b>worksheet</b> &amp; quiz" }, assessmentType: { value: "fa" } },
      },
    },
  },
  {
    id: "e2", itemType: "STUDENT_ASSIGNMENT",
    item: {
      __typename: "StudentAssignment", id: "sa2", isSubmitted: true,
      assignment: { id: "as2", deadline: new Date(now + 30 * H).toISOString(), course: { id: "c1", title: "Grade 10 Math" }, content: { title: { value: "Already submitted" } } },
    },
  },
  {
    id: "e3", itemType: "PROJECT_DEADLINE",
    item: {
      __typename: "ProjectDeadline", id: "pd1",
      deadline: { id: "d1", deadlineDate: "2030-01-15", title: "PP draft", isDeadlineAllDay: true },
      project: {
        id: "p1", conversation: { unreadMessageCount: 0 },
        projectGroup: { id: "pg1", name: "Personal Project", type: "PERSONAL_PROJECT", subType: "PERSONAL_PROJECT", courses: { edges: [] } },
      },
    },
  },
  {
    id: "e4", itemType: "STUDENT_ASSIGNMENT",
    item: {
      __typename: "StudentAssignment", id: "sa3", isSubmitted: false,
      assignment: { id: "as3", deadline: String(now - 50 * H), course: { id: "c2", title: "Biology" }, content: { __typename: "AssignmentResource", label: "Lab report" } },
    },
  },
  {
    id: "e5", itemType: "PROJECT_DEADLINE",
    item: {
      __typename: "ProjectDeadline", id: "pd2",
      deadline: { id: "d2", deadlineDate: new Date(now + 72 * H).toISOString(), title: "IA first draft" },
      project: {
        id: "p2",
        projectGroup: {
          id: "pg2", name: "Biology IA", type: "DP_IA", subType: "INTERNAL_ASSESSMENT",
          courses: { edges: [{ node: { id: "c-other", title: "Not mine" } }, { node: { id: "c2", title: "Biology" } }] },
        },
      },
    },
  },
  {
    id: "e6", itemType: "STUDENT_ASSIGNMENT",
    item: {
      __typename: "StudentAssignment", id: "sa6", isSubmitted: false,
      assignment: {
        id: "as6", deadline: new Date(now + 48 * H).toISOString(),
        course: { id: "c1", title: "Grade 10 Math", learningCourse: { id: "lc1", title: "Math" } },
        content: { __typename: "Assessment", title: { value: "Essay outline" } },
      },
    },
  },
  {
    id: "e7", itemType: "STUDENT_ASSIGNMENT",
    item: {
      __typename: "StudentAssignment", id: "sa7", isSubmitted: false, status: "SUBMISSION_NOT_REQUIRED",
      assignment: {
        id: "as7", deadline: new Date(now + 20 * H).toISOString(), isStudentSubmissionEnabled: false,
        course: { id: "c2", title: "Biology" }, content: { title: { value: "Read chapter 9" } },
      },
    },
  },
];

// What Toddle returns for completionStatus: COMPLETED ("Done").
const DONE_EDGES = [
  {
    id: "d1", itemType: "STUDENT_ASSIGNMENT",
    item: {
      __typename: "StudentAssignment", id: "sd1", isSubmitted: false, status: "SUBMISSION_NOT_REQUIRED",
      assignment: {
        id: "ad1", deadline: new Date(now - 30 * H).toISOString(), isStudentSubmissionEnabled: false,
        course: { id: "c2", title: "Biology" }, content: { title: { value: "Chapter 8 reading" } },
      },
    },
  },
  {
    id: "d2", itemType: "STUDENT_ASSIGNMENT",
    item: {
      __typename: "StudentAssignment", id: "sd2", isSubmitted: false, status: "SUBMISSION_NOT_REQUIRED",
      assignment: {
        id: "ad2", deadline: new Date(now - 20 * 24 * H).toISOString(), isStudentSubmissionEnabled: false,
        course: { id: "c2", title: "Biology" }, content: { title: { value: "Old reading" } },
      },
    },
  },
  {
    id: "d3", itemType: "STUDENT_ASSIGNMENT",
    item: {
      __typename: "StudentAssignment", id: "sd3", isSubmitted: true, status: "TURNED_IN_ON_TIME",
      assignment: {
        id: "ad3", deadline: new Date(now - 10 * H).toISOString(), isStudentSubmissionEnabled: true,
        course: { id: "c1", title: "Grade 10 Math" }, content: { title: { value: "Handed-in essay" } },
      },
    },
  },
  {
    id: "d4", itemType: "PROJECT_DEADLINE",
    item: {
      __typename: "ProjectDeadline", id: "pd9",
      deadline: { id: "d9", deadlineDate: new Date(now - 5 * H).toISOString(), title: "Finished milestone" },
      project: { id: "p9", projectGroup: { id: "pg9", name: "Personal Project", type: "PERSONAL_PROJECT", courses: { edges: [] } } },
    },
  },
];

function makeEnv({ tabSession, cookies = [], failNoStatus = false, failDone = false, failAll = false, calls }) {
  const chrome = {
    tabs: {
      query: async () => (tabSession === undefined ? [] : [{ id: 7 }]),
      sendMessage: async (_id, msg) => {
        assert.equal(msg.type, "tu:session");
        if (tabSession === "no-content-script") throw new Error("Could not establish connection.");
        return tabSession;
      },
    },
    cookies: { getAll: async ({ domain }) => (domain === "toddleapp.com" ? cookies : []) },
  };

  const resp = (obj, status = 200) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj) });

  async function fetch(url, init) {
    const body = JSON.parse(init.body);
    calls.push({ url, op: body.operationName, vars: body.variables, auth: init.headers.authorization });
    if (failAll) return resp({ errors: [{ message: "Node not found" }], data: { node: null } });
    if (body.operationName === "getUserCourses") {
      return resp({ data: { node: { id: "u1", courses: [
        { id: "c1", title: "Grade 10 Math", isArchived: false, profileImageData: { color: "#1e88e5" }, curriculumProgram: { id: "prog-1" }, academicYears: [{ id: "ay-25", startDate: "2025-08-01", endDate: "2026-07-31", isCurrentAcademicYear: false }, { id: "ay-26", startDate: "2026-08-01", endDate: "2027-07-31", isCurrentAcademicYear: true }] },
        { id: "c2", title: "Biology", isArchived: false, profileImageData: { color: "not-a-color" }, curriculumProgram: { id: "prog-1" }, academicYears: [{ id: "ay-26", startDate: "2026-08-01", endDate: "2027-07-31", isCurrentAcademicYear: true }] },
        { id: "c3", title: "Old class", isArchived: true, academicYears: [] },
      ] } } });
    }
    if (body.operationName === "getStudentTasks") {
      const { status, completionStatus } = body.variables.filters;
      const done = completionStatus === "COMPLETED";
      if (done && failDone) return resp({ errors: [{ message: "Done list unavailable" }], data: null });
      if (!done && failNoStatus && !status) return resp({ errors: [{ message: "Variable filters got invalid value" }], data: null });
      const after = body.variables.after ? Number(body.variables.after) : 0;
      let pool = done ? DONE_EDGES : EDGES;
      if (status === "UPCOMING") pool = EDGES.filter((e) => ["e1", "e2"].includes(e.id));
      if (status === "OVERDUE") pool = EDGES.filter((e) => e.id === "e4");
      if (status === "NODUE") pool = [];
      return resp({ data: { node: { id: "u1", __typename: "Student", tasks: {
        totalCount: pool.length,
        edges: pool.slice(after, after + 2),
        pageInfo: { hasNextPage: after + 2 < pool.length, endCursor: String(after + 2) },
      } } } });
    }
    throw new Error("unexpected op " + body.operationName);
  }

  const ctx = { chrome, fetch, navigator: { language: "en-US" }, atob: (s) => Buffer.from(s, "base64").toString("binary"), setTimeout, Date };
  ctx.self = ctx;
  vm.createContext(ctx);
  const toddleSrc = fs.readFileSync(`${EXT}/lib/toddle.js`, "utf8").replace("REQUEST_GAP_MS = 250", "REQUEST_GAP_MS = 0");
  vm.runInContext(fs.readFileSync(`${EXT}/lib/queries.js`, "utf8"), ctx);
  vm.runInContext(toddleSrc, ctx);
  return ctx;
}

const session = (info, program = { id: "prog-1" }) => ({ userInfo: JSON.stringify(info), program: JSON.stringify(program) });
const student = { id: "u1", org_id: "org1", jwt: goodToken, user_type: "student" };

const tests = {
  async "reads the session from an open Toddle tab and loads every TODO item"() {
    const calls = [];
    const ctx = makeEnv({ calls, tabSession: session(student) });
    const r = await ctx.Toddle.sync({});
    assert.equal(calls[0].url, "https://us-east-1-production-apis.toddleapp.com/graphql");
    assert.equal(calls[0].auth, `Bearer ${goodToken}`);
    const taskCalls = calls.filter((c) => c.op === "getStudentTasks" && c.vars.filters.completionStatus === "TODO");
    assert.equal(taskCalls.length, 4, "paginates 7 edges in pages of 2");
    const f = taskCalls[0].vars.filters;
    assert.equal(f.completionStatus, "TODO");
    assert.equal(f.status, undefined);
    assert.equal(f.academicYearId, "ay-26");
    assert.deepEqual([...f.courseIds], ["c1", "c2"]);
    assert.deepEqual([...f.curriculumProgramIds], ["prog-1"]);
    assert.deepEqual([...r.tasks].map((t) => t.title).sort(), [
      "Chapter 8 reading", "Essay outline", "IA first draft", "Lab report", "PP draft", "Quadratics worksheet & quiz", "Read chapter 9",
    ]);
    assert.deepEqual({ ...r.identity }, { userId: "u1", orgId: "org1", programId: "prog-1", academicYearId: "ay-26" });
  },

  async "normalises titles, types, statuses and dates"() {
    const ctx = makeEnv({ calls: [], tabSession: session(student) });
    const { tasks } = await ctx.Toddle.sync({});
    const quad = tasks.find((t) => t.id === "assignment:sa1");
    assert.equal(quad.type, "Formative assessment");
    assert.equal(quad.status, "In progress");
    assert.equal(quad.unread, 2);
    assert.equal(quad.isNew, true);
    assert.ok(Math.abs(quad.dueAt - (now + 5 * H)) < 1000);
    const pp = tasks.find((t) => t.id === "deadline:pd1");
    assert.equal(pp.allDay, true);
    assert.equal(new Date(pp.dueAt).getHours(), 23, "date-only deadline -> local end of day");
    assert.equal(pp.courseTitle, "Personal Project");
    const lab = tasks.find((t) => t.id === "assignment:sa3");
    assert.ok(Math.abs(lab.dueAt - (now - 50 * H)) < 1000, "epoch-ms string deadline");
    assert.ok(!("link" in quad), "internal link spec is not stored");
  },

  async "builds deep links the way Toddle's web app does"() {
    const ctx = makeEnv({ calls: [], tabSession: session(student) });
    const { tasks } = await ctx.Toddle.sync({});
    const url = (id) => tasks.find((t) => t.id === id).url;
    // Assignment: scoped to its class, under its own curriculum program when
    // known, else the current one.
    assert.equal(url("assignment:sa1"), "https://web.toddleapp.com/platform/prog-9/courses/c1/links/classroom-details/as1");
    assert.equal(url("assignment:sa3"), "https://web.toddleapp.com/platform/prog-1/courses/c2/links/classroom-details/as3");
    // Schools on Toddle's learning-courses setup use the program-level link.
    assert.equal(url("assignment:sa6"), "https://web.toddleapp.com/platform/prog-1/links/classroom-details/as6");
    // Regular project (Personal Project etc.): project-group-types route.
    assert.equal(url("deadline:pd1"), "https://web.toddleapp.com/platform/prog-1/project-group-types/PERSONAL_PROJECT/projects/pg1/progress/p1");
    // IB internal assessment: course route, using a course the student is in.
    assert.equal(url("deadline:pd2"), "https://web.toddleapp.com/platform/prog-1/courses/c2/projects/pg2/progress/p2");
  },

  async "labels which assignments need a submission"() {
    const { tasks } = await makeEnv({ calls: [], tabSession: session(student) }).Toddle.sync({});
    const needs = (id) => tasks.find((t) => t.id === id).requiresSubmission;
    assert.equal(needs("assignment:sa1"), true, "isStudentSubmissionEnabled: true");
    assert.equal(needs("assignment:sa7"), false, "status SUBMISSION_NOT_REQUIRED");
    assert.equal(needs("assignment:sa3"), null, "unknown when Toddle doesn't say");
    assert.equal(needs("deadline:pd1"), null, "project deadlines aren't labelled");
    assert.ok(tasks.every((t) => !("submitted" in t)), "internal flag is not stored");
  },

  async "keeps recently past-due assignments that need no submission"() {
    const calls = [];
    const { tasks } = await makeEnv({ calls, tabSession: session(student) }).Toddle.sync({});
    const done = calls.filter((c) => c.op === "getStudentTasks" && c.vars.filters.completionStatus === "COMPLETED");
    assert.ok(done.length >= 1 && done.length <= 4, "reads at most 4 pages of Done");
    assert.equal(done[0].vars.orderByDirection, "DESC", "most recent Done items first");
    const ids = tasks.map((t) => t.id);
    assert.ok(ids.includes("assignment:sd1"), "no submission, past due yesterday: shown");
    assert.ok(!ids.includes("assignment:sd2"), "no submission, 20 days ago: too old");
    assert.ok(!ids.includes("assignment:sd3"), "submitted work stays hidden");
    assert.ok(!ids.includes("deadline:pd9"), "only assignments come back from Done");
    const reading = tasks.find((t) => t.id === "assignment:sd1");
    assert.ok(reading.dueAt < now && reading.requiresSubmission === false);
  },

  async "still syncs if the Done list can't be read"() {
    const r = await makeEnv({ calls: [], failDone: true, tabSession: session(student) }).Toddle.sync({});
    assert.equal(r.tasks.length, 6);
    assert.ok(r.warnings.some((w) => w.startsWith("done:")));
  },

  async "uses the .cn web app for China regions"() {
    const cnToken = jwt({ id: "u1", region: "cn-north-1", exp: Math.floor(now / 1000) + 3600 });
    const calls = [];
    const ctx = makeEnv({ calls, tabSession: session({ ...student, jwt: cnToken }) });
    const { tasks } = await ctx.Toddle.sync({});
    assert.equal(calls[0].url, "https://cn-north-1-production-apis.toddleapp.cn/graphql");
    assert.ok(tasks.every((t) => !t.url || t.url.startsWith("https://web.toddleapp.cn/platform/")));
  },

  async "maps regions to API gateways"() {
    for (const [region, expected] of [
      [undefined, "https://eu-west-1-production-apis.toddleapp.com/graphql"],
      ["me-central-1", "https://eu-central-1-production-apis.toddleapp.com/graphql"],
      ["ap-south-1", "https://ap-south-1-production-apis.toddleapp.com/graphql"],
    ]) {
      const token = jwt({ id: "u1", region, exp: Math.floor(now / 1000) + 3600 });
      const calls = [];
      await makeEnv({ calls, tabSession: session({ ...student, jwt: token }) }).Toddle.sync({});
      assert.equal(calls[0].url, expected, `region ${region}`);
    }
  },

  async "falls back to UPCOMING/OVERDUE/NODUE if the All query is rejected"() {
    const calls = [];
    const r = await makeEnv({ calls, failNoStatus: true, tabSession: session(student) }).Toddle.sync({});
    const statuses = calls
      .filter((c) => c.op === "getStudentTasks" && c.vars.filters.completionStatus === "TODO")
      .map((c) => c.vars.filters.status ?? "none");
    assert.deepEqual(statuses, ["none", "UPCOMING", "OVERDUE", "NODUE"]);
    assert.equal(r.tasks.length, 3);
    assert.equal(r.warnings.length, 1);
  },

  async "works without a Toddle tab by rebuilding the token from cookies"() {
    const calls = [];
    const ctx = makeEnv({ calls, cookies: splitCookies(goodToken) });
    const r = await ctx.Toddle.sync({ userId: "u1", programId: "prog-1", academicYearId: "ay-26" });
    assert.equal(calls[0].auth, `Bearer ${goodToken}`);
    assert.equal(r.tasks.length, 7);
    assert.equal(r.tasks.find((t) => t.id === "assignment:sa3").url, "https://web.toddleapp.com/platform/prog-1/courses/c2/links/classroom-details/as3");
  },

  async "falls back to cookies when a Toddle tab predates the install"() {
    const calls = [];
    const ctx = makeEnv({ calls, tabSession: "no-content-script", cookies: splitCookies(goodToken) });
    const r = await ctx.Toddle.sync({ userId: "u1", programId: "prog-1" });
    assert.equal(r.tasks.length, 7);
  },

  async "asks the user to log in when the session has expired"() {
    const calls = [];
    const expired = jwt({ id: "u1", exp: Math.floor(now / 1000) - 10 });
    const ctx = makeEnv({ calls, tabSession: session({ ...student, jwt: expired }) });
    await assert.rejects(ctx.Toddle.sync({}), (e) => e instanceof ctx.Toddle.AuthError);
    assert.equal(calls.length, 0);
  },

  async "explains that parent/staff accounts aren't supported"() {
    const ctx = makeEnv({ calls: [], tabSession: session({ ...student, user_type: "parent" }) });
    await assert.rejects(ctx.Toddle.sync({}), /signed in as "parent"/);
  },

  async "asks for a Toddle visit when a first-run cookie guess fails"() {
    const ctx = makeEnv({ calls: [], failAll: true, cookies: splitCookies(goodToken) });
    await assert.rejects(ctx.Toddle.sync({}), (e) => e instanceof ctx.Toddle.AuthError && /reload\) Toddle/.test(e.message));
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n  ${e.stack.split("\n").slice(0, 3).join("\n  ")}`);
  }
}
console.log(`\n${Object.keys(tests).length - failed}/${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
