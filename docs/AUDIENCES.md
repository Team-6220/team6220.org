# Who the website is for

This page records who team6220.org is meant to appeal to and what each group needs from it, so design and copy
decisions can be checked against a clear list.

**How to read it.** Statements with a named source come from the team's own documents. Anything marked
**Proposed** is an inference by the assistant that wrote this page (issue #79) and has not been confirmed by the
team. Please correct or delete it.

Sources:

- the original redesign notes ([redesign/ORIGINAL-REDESIGN.md](redesign/ORIGINAL-REDESIGN.md)), called "the original doc" below
- the [Migration Plan](MIGRATION-PLAN.md)
- Hoss' site review in issue #69 (the live issue is the source of truth)
- the pages that exist today in `sites/main/` and `src/pages/`

## What the team has said

- The original doc asks the site to "address multiple audiences", with "different paths (i.e. buttons on the home
  page) for three target audiences: students looking to join the team, possible sponsors, and other teams/students
  in FIRST". An earlier line in the same doc names the buttons as "Los Al students, FIRST students, sponsors".
- Issue #69 says the main target audience is "sponsors, community members, and prospective members who will know us
  locally", so the site should mainly call the team "Los Al Robotics" (the team name is "The Golden Griffins"; the
  nonprofit is "Los Al Robotics").
- Issue #69 renames the home page "Sponsor us" button to "Support us", because some community members have reached
  out to help through the website in past years.
- The Migration Plan separates the **public website** (anyone can see it) from the **team apps** (mostly team
  members; GoldSim and the Pit display are public). See [APPS-PHILOSOPHY.md](APPS-PHILOSOPHY.md).

## Audiences

### 1. Prospective students and their families

Los Al students, incoming freshmen, parents and guardians.

**Evidence.** Original doc: "Los Al students--address all questions that MUN does" (the Los Al MUN FAQ). Issue #69:
the Join page should be less about "how to join" and more about "why"; it should address dues, the joining checklist
(safety quiz and so on), applications and priority for summer camp students; it should offer one form that adds
people to the newsletter; the About page's skills should look good "to school people". Today's site: `/about/join`
has an interest form and FAQ (with a "Parent / guardian" option), and `/summer-camp` exists.

**Needs.**

- Why join, what the team is like, what students learn.
- Straight answers: dues, applications, timeline, who can join and when, what the commitment is (issue #69 asks Hoss
  for the FAQs).
- A low-effort way to show interest (one form, then the newsletter).
- Summer camp as a way in.
- **Proposed:** parents need reassurance about safety, cost and time commitment, and a clear contact. Many families
  will read the site on a phone.

### 2. Sponsors, donors and supporters

Companies, foundations, and community members who want to help.

**Evidence.** Original doc: "Clear sponsorship tiers" (modeled on Citrus Circuits and the Los Al Show Choir, noting
that companies matter more in FRC), and "List a bunch of stats for sponsors (monthly impressions, target audiences,
etc.)". Issue #69: use more relevant stats ("take better ones from the packet"), host the sponsorship packet as a PDF
instead of Google Slides, feature the Amazon wishlist, make Sponsors one click instead of a dropdown, show sponsor
logos in color, and have an easy way to upload logos each season. Today's site: `/sponsors` has three tiers (Lion,
Eagle, Griffin), a season budget breakdown, a sponsor logo wall and a contact email.

**Needs.**

- Tiers and what each one gets, one obvious way to give (money, goods or services, wishlist), and where the money
  goes.
- Proof the team is a credible partner: results, reach and audience numbers (the "stats").
- Their logo shown correctly and kept current.
- A contact who answers. Issue #69 asks for operations@team6220.org and the team phone number instead of the
  defunct business address.
- Community members who just want to help are the reason for the "Support us" wording.
- **Proposed:** a sponsor wants to see quickly that gifts go to a registered nonprofit (the site already shows the
  501(c)(3) status) and how to get a receipt.

### 3. The FIRST community

Other teams and students, and possibly judges and volunteers.

**Evidence.** Original doc: a path for "other teams/students in FIRST"; "Resources and bot documentation like Citrus
Circuits and Cheesy Poofs"; the site "has everything--sponsor info, documentation, internal team resources, external
team resources, CAD, team history"; add current GitHub, Chief Delphi and merch links; inspiration from other teams'
sites. Issue #69: a Robots tab with more robots and a 3D viewer for robots with CAD, technical binders with an
archive, a helpful-links section (FIRST dashboard, Chief Delphi), videos of the robot in action. Today's site:
`/robots`, `/resources`, `/resources/media`, public GoldSim.

**Needs.**

- Robot information, CAD, technical binders and team documentation they can learn from.
- Open-source tools (GoldSim) and the team's design resources.
- Where to follow and contact the team (GitHub, Chief Delphi, social media).
- **Proposed:** judges and award reviewers benefit from a clear story of the team's philosophy, outreach and impact.
  None of the sources name judges as a separate audience; this is an inference from the About and Outreach pages.

### 4. Current team members

**Evidence.** Original doc: "internal team resources". Issue #69: Resources should link to the team handbook, team
structure, subteam resource docs, branding guidelines and the "master link"; a Log In button in the top right.
Migration Plan: one login and one dashboard for all team apps (Team Member badge, approved by a Web Admin); webmasters
should be able to update content without editing code ([SITE-MANAGER.md](SITE-MANAGER.md)).

**Needs.**

- One place to sign in and open every team app.
- Fast access to the handbook, binders and subteam docs.
- **Proposed:** members use the apps on phones and kiosks during meetings and competitions, so those pages need to
  load fast and work on small screens.
- **Proposed:** webmasters and leads are users too, because they keep the site current each season.

### 5. The local community

Los Alamitos residents, school staff, local businesses.

**Evidence.** Issue #69: the main audience includes "community members ... who will know us locally". Today's site:
the Outreach page (summer camp, STEM Expo, open workshop days), Instagram link and merch page. The original doc
suggests a live combined social media feed or blog posts.

**Needs.**

- Who the team is and what it does for the school and community.
- Ways to support and follow along: "Support us", merch, social media.
- **Proposed:** event dates and a simple way to ask for a demo or appearance.

### 6. Alumni

Not mentioned in the original doc, the Migration Plan or issue #69, so everything here is **Proposed**.

- **Proposed:** alumni might want the team history, a way to stay in touch or give, and current results. The History
  page and "Support us" already partly serve this. The team should decide whether alumni are an audience to design
  for; if so, a link on the home page or footer would be enough.

## Where each audience enters today

| Audience | Main entry points today |
| --- | --- |
| Prospective students and families | Home "Join the team" door, `/about/join`, `/summer-camp`, `/about` |
| Sponsors, donors and supporters | Home "Sponsors" door ("Support us" in the plan), `/sponsors`, `/merch` |
| FIRST community | `/robots`, `/resources`, `/resources/media`, `/apps/goldsim` |
| Current members | Log In, `/apps`, `/resources` |
| Local community | `/about/outreach`, `/summer-camp`, social links, `/merch` |
| Alumni (Proposed) | `/about/history`, "Support us" |

## Open questions for the team

- The original doc wants three home page buttons (students, sponsors, FIRST/other teams). The home page has four
  doors today (About, Join, Sponsors, Outreach). Which should it be? Issue #69 should decide.
- Is the join audience only Los Alamitos USD students? The Join form says "For Los Al USD students and families".
- Are judges and alumni audiences we design for, or just served by the existing pages?
