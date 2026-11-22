// Functions like auth.login() and attendance.today() live here.
// Phase 1: they call Wix and Apps Script from the browser. Phase 2: they call /api/* or the @wix/astro integration.
// App UIs never change between phases.
export { WIX_CLIENT_ID, APPS_HOME_PATH, LOGIN_CALLBACK_PATH, BADGES, SUBTEAM_BADGE_PREFIX, type BadgeName } from "./config";
export * as auth from "./auth";
export type { Member, MemberStatus } from "./auth";
export * as attendance from "./attendance";
export type { AbsentRow, AttMeeting, AttMember, AttSettings, DayView, HereRow, KioskRow, KioskSession, MyRow, MyView, PastMeeting, SignInResult, SignInStatus, TeamStats } from "./attendance/types";
// Site Manager (apps/site). Browser side only; the server side is "@team6220/data/site-server".
export * as site from "./site";
// Inventory app data (apps/inventory). Also importable as "@team6220/data/inventory".
export { inventory } from "./inventory/index.ts";
// Shared by the operations apps (Icarus, Production, BOM): who is looking, projects, people, history, subteams.
export * as ops from "./ops";
export { OpsError, type OpsErrorCode, type OpsViewer, type Me, type Roles, type Person, type Project, type HistoryEntry, type RecordLink, type RecordKind } from "./ops/types";
// BOM app data (apps/bom).
export * as bom from "./bom";
export type { Bom, Order as BomOrder, Section as BomSection, Line as BomLine, LineInput as BomLineInput, LineState as BomLineState, OrderDetail as BomOrderDetail, Stamp } from "./bom/types";
// Icarus app data (apps/icarus): tasks, the Gantt chart, milestones, events, seasons, templates.
export * as icarus from "./icarus";
export type { Task, TaskStatus, TaskComment, MaterialNeed, Milestone, TeamEvent, Season, Template } from "./icarus/types";
export type { Gantt, GanttDay, GanttGroup, GanttLine, GanttRow } from "./icarus/gantt";
export type { IcarusData } from "./icarus";
export type { Draft } from "./ops/types";
// Production app data (apps/production): part requests, the tracker, the print queue.
export * as production from "./production";
export type { Part, PartRequest, PartStatus, Method as PartMethod, Priority as PartPriority, WorkEntry, PrintDetails } from "./production/types";
// A small window into Inventory for the other apps: what parts we have, add stock, create a part.
export * as stock from "./inventory/stock";
export type { StockItem } from "./inventory/stock";
export type { ReceiveInto } from "./bom";
// Cutting parts from Inventory's raw stock (Production's Cut planner).
export * as cutting from "./inventory/cutting";
export type { CutPlan, Material, PartToPlan, Reserved, StockPiece } from "./inventory/cutting";
// Your own account: profile, settings that follow you (the frame's layout, pins, keybinds), finishing your profile.
export * as account from "./account";
// The team calendar: meetings, shifts, competitions, breaks.
export * as calendar from "./calendar";
export type { CalEvent, CalEventType, CalendarData, PartDay, Shift, StepStatus, Supervisor, SupervisorInfo } from "./calendar/types";
export type { ShiftTimes } from "./calendar";
export type { EventLinks, IcsItem } from "./calendar";
// RSVP: forms for competitions and events, answers, who's coming, reminders.
export * as rsvp from "./rsvp";
export type { DayAnswer, EventInfo, ManageRow, OpenForm, PrivateRow, Question, QuestionType, ResultRow, Results, RsvpAnswer, RsvpForm, RsvpSettings } from "./rsvp/types";
// Your inbox, notification settings and Discord link.
export * as notifications from "./notifications";
export type { InboxItem, NotificationKind, NotificationPrefs } from "./notifications/catalog";
export type { Profile, AccountInfo, ProfileForm, Role as AccountRole } from "./account";
