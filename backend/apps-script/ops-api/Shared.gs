// Things all three apps share: numbers, the history log, projects, people and subteam badges.

/** Each kind of number and the letter shown in front of it (t42, p10). Parts and orders are added by their apps. */
const NUMBER_KINDS = ["task", "project", "part", "order"];

// ---------------------------------------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------------------------------------

/**
 * { kind, count? } -> { number }. Hands out the next number of that kind. Numbers are never reused.
 * With count (up to 200) it sets aside that many in a row and returns the first, for starting a season.
 */
function nextNumber_(body) {
  if (NUMBER_KINDS.indexOf(body.kind) === -1) throw apiError_("bad-request", "Unknown kind of number.");
  const count = body.count === undefined ? 1 : Math.floor(Number(body.count));
  if (!(count >= 1 && count <= 200)) throw apiError_("bad-request", "Ask for between 1 and 200 numbers.");
  return { number: takeNumber_(body.kind, count) };
}

function takeNumber_(kind, count) {
  return withLock_(function () {
    const row = wixQuery_(COLLECTION_COUNTERS, { key: kind }, 1)[0] || { key: kind, next: 1 };
    const number = Number(row.next) || 1;
    wixSave_(COLLECTION_COUNTERS, Object.assign({}, row, { next: number + (count || 1) }));
    return number;
  });
}

// ---------------------------------------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------------------------------------

/** { record: { kind, id }, change, summary } -> {}. ("change" is a word like "status" or "created".) Used by the apps after a change they wrote straight to Wix. */
function logHistory_(body, actor) {
  const record = body.record || {};
  writeHistory_(actor, {
    kind: text_(record.kind, "record kind", 40),
    id: text_(record.id, "record id", 100),
  }, text_(body.change, "change", 60), text_(body.summary, "summary", 500, true));
  return {};
}

/** Adds one line to the change log. The actor is always the verified member or Apollo, never taken from the request. */
function writeHistory_(actor, record, action, summary) {
  wixInsert_(COLLECTION_HISTORY, {
    recordKind: record.kind,
    recordId: record.id,
    actorId: actor.id,
    actorName: actor.name,
    actorIsAgent: actor.agent === true,
    action: action,
    summary: summary || "",
    at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------------------------------------
// Projects (p10). One list, shared by Icarus, Production and BOM.
// ---------------------------------------------------------------------------------------------------------

const PROJECT_STATUSES = ["active", "done", "cancelled"];

/** { project: { _id?, name, description, subteams, status, githubRepo, startDate, endDate } } -> { project } */
function saveProject_(body, actor) {
  const input = body.project || {};
  const existing = input._id ? wixQuery_(COLLECTION_PROJECTS, { _id: String(input._id) }, 1)[0] : null;
  if (input._id && !existing) throw apiError_("bad-request", "That project doesn't exist any more.");
  const allowedSubteams = subteamBadges_().map(function (s) { return s.name; });
  const project = {
    number: existing ? existing.number : takeNumber_("project"),
    name: text_(input.name, "project name", 100),
    description: text_(input.description, "description", 2000, true),
    subteams: (Array.isArray(input.subteams) ? input.subteams : []).filter(function (s) {
      return allowedSubteams.indexOf(s) !== -1;
    }),
    status: PROJECT_STATUSES.indexOf(input.status) !== -1 ? input.status : "active",
    githubRepo: text_(input.githubRepo, "GitHub repository", 140, true),
    startDate: text_(input.startDate, "start date", 10, true),
    endDate: text_(input.endDate, "end date", 10, true),
  };
  if (existing) project._id = existing._id;
  const saved = wixSave_(COLLECTION_PROJECTS, project);
  writeHistory_(actor, { kind: "project", id: saved._id }, existing ? "updated" : "created", "p" + project.number + " " + project.name);
  return { project: saved };
}

// ---------------------------------------------------------------------------------------------------------
// People and subteam badges
// ---------------------------------------------------------------------------------------------------------

/** [{ name: "Design", badgeId }] for every site badge called "Subteam: <name>". The badges are the list. */
function subteamBadges_() {
  const badges = siteBadges_(false);
  return Object.keys(badges)
    .filter(function (id) { return badges[id].indexOf(SUBTEAM_PREFIX) === 0; })
    .map(function (id) { return { name: badges[id].slice(SUBTEAM_PREFIX.length), badgeId: id }; });
}

/** {} -> { me: { id, name, badges, subteams, roles }, subteams: [names] }. Also keeps the member's ops_people row fresh. */
function whoAmI_(body, actor) {
  const subteams = subteamsOf_(actor.badges);
  rememberPerson_(actor.id, actor.name, subteams);
  return {
    me: { id: actor.id, name: actor.name, badges: actor.badges, subteams: subteams, roles: roles_(actor.badges) },
    subteams: subteamBadges_().map(function (s) { return s.name; }),
  };
}

function subteamsOf_(badgeTitles) {
  return badgeTitles
    .filter(function (t) { return t.indexOf(SUBTEAM_PREFIX) === 0; })
    .map(function (t) { return t.slice(SUBTEAM_PREFIX.length); });
}

/** { subteams: [names] } -> { subteams }. A member picks their own subteams. */
function setMySubteams_(body, actor) {
  const subteams = changeSubteams_(actor.id, wantedSubteams_(body.subteams));
  forgetMember_(body.token);
  rememberPerson_(actor.id, actor.name, subteams);
  writeHistory_(actor, { kind: "person", id: actor.id }, "subteams", subteams.join(", ") || "none");
  return { subteams: subteams };
}

/** { memberIds: [...], subteams: [names] } -> { changed }. A Lead, Mentor or Web Admin sets other people's subteams. */
function setSubteams_(body, actor) {
  const ids = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
  if (!ids.length || ids.length > 50) throw apiError_("bad-request", "Choose between 1 and 50 people.");
  const wanted = wantedSubteams_(body.subteams);
  ids.forEach(function (memberId) {
    const person = wixQuery_(COLLECTION_PEOPLE, { memberId: memberId }, 1)[0];
    if (!person) throw apiError_("bad-request", "One of those people hasn't opened the apps yet.");
    const subteams = changeSubteams_(memberId, wanted);
    wixSave_(COLLECTION_PEOPLE, Object.assign({}, person, { subteams: subteams }));
    writeHistory_(actor, { kind: "person", id: memberId }, "subteams", subteams.join(", ") || "none");
  });
  return { changed: ids.length };
}

/** Checks a list of subteam names against the real subteam badges. */
function wantedSubteams_(names) {
  const known = subteamBadges_().map(function (s) { return s.name; });
  const wanted = Array.isArray(names) ? names.map(String) : [];
  wanted.forEach(function (name) {
    if (known.indexOf(name) === -1) throw apiError_("bad-request", "There is no subteam called '" + name + "'.");
  });
  return known.filter(function (name) { return wanted.indexOf(name) !== -1; });
}

/**
 * Makes a member's subteam badges match `wanted`. This is the ONLY place the server changes badges, and it only
 * ever touches badges whose title starts with "Subteam: ": it cannot give Team Member, Lead, Mentor or any other.
 */
function changeSubteams_(memberId, wanted) {
  const current = memberBadgeAssignments_(memberId).filter(function (a) {
    return a.title.indexOf(SUBTEAM_PREFIX) === 0;
  });
  const currentNames = current.map(function (a) { return a.title.slice(SUBTEAM_PREFIX.length); });
  subteamBadges_().forEach(function (subteam) {
    if (wanted.indexOf(subteam.name) !== -1 && currentNames.indexOf(subteam.name) === -1) {
      wixAssignBadge_(subteam.badgeId, memberId);
    }
  });
  current.forEach(function (a) {
    if (wanted.indexOf(a.title.slice(SUBTEAM_PREFIX.length)) === -1) wixRemoveBadgeAssignment_(a.assignmentId);
  });
  return wanted;
}

/** Keeps one ops_people row per member, so pickers can list people without asking Wix Members. */
function rememberPerson_(memberId, name, subteams) {
  const existing = wixQuery_(COLLECTION_PEOPLE, { memberId: memberId }, 1)[0];
  const same = existing && existing.name === name && JSON.stringify(existing.subteams || []) === JSON.stringify(subteams);
  if (same) return;
  wixSave_(COLLECTION_PEOPLE, Object.assign({}, existing, { memberId: memberId, name: name, subteams: subteams, active: true }));
}
