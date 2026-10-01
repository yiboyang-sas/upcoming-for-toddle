# Chrome Web Store listing

Copy-paste answers for the Chrome Web Store Developer Dashboard.

## Store listing tab

**Name:** Upcoming for Toddle

**Summary** (the manifest description; 132 characters max):
> See your upcoming Toddle assignments and deadlines at a glance. Unofficial; not affiliated with Toddle.

**Category:** Productivity → Education
**Language:** English

**Description:**

> Never miss a Toddle deadline. Upcoming for Toddle shows every assignment and
> deadline from all your classes in one place, sorted by when it's due.
>
> WHAT YOU GET
> • A toolbar popup with your to-do list grouped into Today, Tomorrow, Next 7
>   days, Later, Overdue and No due date
> • A badge on the icon showing how many tasks are due in the next two days
> • An "Upcoming" tab on every Toddle page that slides your list into view
> • See which tasks need a submission and which don't, plus what's new, in
>   progress or has unread messages
> • Filter by class, and collapse any section you don't need
> • Click any assignment to open it straight in Toddle
>
> HOW IT WORKS
> Log in to Toddle as usual. The extension uses that login to fetch your to-do
> list from Toddle and refreshes it every 30 minutes. There's nothing to set up
> and no extra account to create.
>
> PRIVATE BY DESIGN
> The extension only talks to Toddle. It has no servers of its own, no
> analytics and no ads. Your task list stays on your computer.
>
> Works with Toddle student accounts.
>
> Upcoming for Toddle is an independent project. It is not affiliated with,
> endorsed by, or sponsored by Toddle.

**Graphic assets** (all in this folder, all RGB with no alpha as required):

| Field | File |
|---|---|
| Store icon (128×128) | `store-icon-128.png` (96×96 artwork with 16px padding, per the guidelines) |
| Screenshots (1280×800), in this order | `screenshot-1-popup.png`, `screenshot-2-in-page.png`, `screenshot-3-badge-dark.png`, `screenshot-4-filter.png` |
| Small promo tile (440×280) | `promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `promo-marquee-1400x560.png` |
| Global promo video | optional; leave blank |

Regenerate them with `scripts/render-store-assets.sh` (and the icons with
`python3 scripts/make-icons.py`).

## Privacy practices tab

**Single purpose:**
> Shows the signed-in student's upcoming Toddle assignments and deadlines in a
> toolbar popup, an icon badge and a panel on Toddle pages.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Caches the user's task list and one display setting locally so the popup opens instantly and works between refreshes. |
| `alarms` | Refreshes the task list every 30 minutes and keeps the "due soon" badge count current. |
| `cookies` | Reads Toddle's own login cookies (`lhst`/`rhst` on toddleapp.com) so the task list can refresh in the background when no Toddle tab is open. Cookies are only read, never modified, and only for Toddle's domains. |
| Host permission `https://*.toddleapp.com/*`, `https://*.toddleapp.cn/*` | Calls Toddle's API, which lives on regional subdomains (e.g. `eu-west-1-production-apis.toddleapp.com`), reads Toddle's login cookies, and adds the "Upcoming" panel to web.toddleapp.com. No other sites are accessed. |

**Remote code:** No, I am not using remote code. All JavaScript is packaged in
the extension.

**Data usage.** Check these boxes:

- ☑ **Personally identifiable information.** The user's Toddle student ID,
  used to request their to-do list.
- ☑ **Authentication information.** The user's existing Toddle session token,
  sent only to Toddle's API to fetch the to-do list. It is never stored.
- ☑ **Website content.** Assignment titles, class names and due dates from
  Toddle, displayed to the user and cached locally.

Leave everything else unchecked (health, financial, personal communications,
location, web history, user activity).

Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** the public URL where you host `PRIVACY.md` (a GitHub
file link or GitHub Pages works). Fill in the contact email in it first.

## Distribution tab

- Visibility: Public (or Unlisted to share a link with classmates first)
- Regions: All regions

## Test instructions (for the reviewer)

> This extension requires a Toddle student account, which is issued by a school.
> Without one, the popup shows a "Log in to Toddle" prompt, which is the expected
> signed-out state. With a student account: log in at https://web.toddleapp.com,
> then open the extension popup to see the to-do list. An "Upcoming" tab also
> appears on the right edge of Toddle pages. The screenshots show the signed-in
> experience.
