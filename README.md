# Upcoming for Toddle

A Chrome extension that shows a student's upcoming Toddle assignments and
deadlines:

- **Toolbar popup**: the whole to-do list, grouped into Today, Tomorrow, Next 7
  days, Later, Overdue and No due date, with a class filter. Each assignment
  is labelled "Needs submission" or "No submission". Assignments with nothing
  to hand in stay visible for 14 days after they're due (Toddle moves them to
  Done). Any section can be collapsed by clicking its header, and that choice
  is remembered. Clicking a task opens it in Toddle.
- **Badge**: the number of tasks due in the next 2 days.
- **"Upcoming" tab on Toddle pages**: the same list slides in from the right
  edge of Toddle. It can be turned off in the popup.

It refreshes every 30 minutes, and whenever you open Toddle or the popup.
It is unofficial and not affiliated with Toddle.

## Project layout

```
extension/            the extension itself (this is what gets zipped and shipped)
  manifest.json
  background.js       sync scheduling, badge
  lib/toddle.js       auth, Toddle API calls, data normalisation, deep links
  lib/queries.js      GraphQL documents
  lib/view.js/.css    list UI shared by the popup and the in-page panel
  popup/              toolbar popup
  content/panel.js    "Upcoming" tab on Toddle pages + session hand-off
tests/sync.test.mjs   tests against a mocked Toddle API (no dependencies)
store/                Web Store listing text, screenshots, promo tile
scripts/package.sh    checks + builds dist/upcoming-for-toddle-<version>.zip
scripts/render-store-assets.sh   re-renders store/ images from the real UI code
PRIVACY.md            privacy policy (host it and link it in the store listing)
```

## Develop

1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** →
   select the `extension/` folder.
2. After editing, click the reload icon on the extension's card, then reload
   any open Toddle tab.
3. `node tests/sync.test.mjs` runs the tests (Node 18+, no install needed).

## Release

1. Bump `version` in `extension/manifest.json`.
2. `scripts/package.sh` runs the syntax check, tests and manifest check, then
   writes `dist/upcoming-for-toddle-<version>.zip`.
3. Upload that zip in the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
   The listing text, permission justifications and privacy answers are in
   [`store/listing.md`](store/listing.md).

## How it works

**Data.** It uses the same GraphQL query (`getStudentTasks` with
`completionStatus: TODO`) that Toddle's own web app uses for its to-do list.
The query goes to `https://<region>-production-apis.toddleapp.com/graphql`.

**Auth.** The extension never asks for a password. It uses the student's
existing Toddle session, which comes from one of two places:
- `localStorage.userInfo` on an open Toddle tab, handed over by the content
  script, or
- the same token rebuilt from Toddle's `lhst`/`rhst` cookies, so background
  refreshes work without a Toddle tab.

The token is used in memory only and never stored.

**Deep links.** These mirror Toddle's own navigation. All routes live under
`/platform/<curriculumProgramId>/`:

| Item | Path |
|---|---|
| Assignment | `courses/<classId>/links/classroom-details/<assignmentId>`; without `courses/<classId>/` for schools on Toddle's learning-courses setup (the links Toddle's notifications use) |
| Project deadline (IB IA/EA) | `courses/<courseId>/projects/<groupId>/progress/<projectId>` |
| Other project deadline | `project-group-types/<type>/projects/<groupId>/progress/<projectId>` |

## Maintenance notes

Toddle's API is undocumented and can change without notice. If the popup shows
an error after a Toddle update, the fix is usually in `lib/queries.js` or
`normalizeEdge()` in `lib/toddle.js`. The error text in the popup is the first
clue.
