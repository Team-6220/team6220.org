// Connects the operations server (packages/data/src/ops/server) to Wix: collections, badges, members and secrets, all
// with elevated permissions, because the server writes collections that members can only read (Wix docs: "Elevate API
// call permissions"). The logic is in packages/data and is unit-tested against a fake; this file is only the plumbing.
import { auth } from "@wix/essentials";
import { items } from "@wix/data";
import { files } from "@wix/media";
import { badgeAssignments, badgesV2, members } from "@wix/members";
import { withId, type Doc, type OpsEnv } from "@team6220/data/ops-server";
import { readSecret } from "./wix-secrets";

const query = auth.elevate(items.query);
const insert = auth.elevate(items.insert);
const bulkInsert = auth.elevate(items.bulkInsert);
const save = auth.elevate(items.save);
const bulkSave = auth.elevate(items.bulkSave);
const remove = auth.elevate(items.remove);
const patch = auth.elevate(items.patch) as unknown as (collection: string, id: string, changes: { action: string; fieldPath: string; value: unknown }[]) => Promise<Doc>;
const queryAssignments = auth.elevate(badgeAssignments.queryBadgeAssignments);
const createAssignments = auth.elevate(badgeAssignments.bulkCreateBadgeAssignments);
const deleteAssignments = auth.elevate(badgeAssignments.bulkDeleteBadgeAssignments);
const queryBadges = auth.elevate(badgesV2.queryBadges);
const queryMembers = auth.elevate(members.queryMembers);
const approveMember = auth.elevate(members.approveMember);
const updateMember = auth.elevate(members.updateMember);
const deleteMember = auth.elevate(members.deleteMember);
const uploadUrlFor = auth.elevate(files.generateFileUploadUrl);

/** Wix takes up to 1000 items per bulk data call and 100 per badge call. */
const DATA_CHUNK = 1000;
const BADGE_CHUNK = 100;
const chunks = <T>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

function throwBulkErrors(result: { errors?: { message?: string; code?: string }[] } | undefined, what: string) {
  const first = result?.errors?.[0];
  if (first) throw new Error(`Wix reported ${result!.errors!.length} error(s) ${what}: ${first.message ?? first.code ?? "unknown"}`);
}

// Secrets and answers are remembered for a short while, so most requests don't spend calls on them.
const secretCache = new Map<string, { value: string | undefined; until: number }>();
const SECRET_SECONDS = 60;
const answerCache = new Map<string, { value: string; until: number }>();

export const opsEnv: OpsEnv = {
  data: {
    async query(collection, filter = {}, limit = 1000, sort, skip = 0) {
      let q = query(collection);
      for (const [field, value] of Object.entries(filter)) q = q.eq(field, value);
      if (sort) q = sort.descending ? q.descending(sort.field) : q.ascending(sort.field);
      if (skip) q = q.skip(skip);
      return (await q.limit(limit).find()).items as Doc[];
    },
    async queryIds(collection, ids) {
      const found = await Promise.all(chunks(ids, 100).map(async (part) => (await query(collection).hasSome("_id", part).limit(100).find()).items as Doc[]));
      return found.flat();
    },
    async insert(collection, doc) {
      return (await insert(collection, withId(doc))) as Doc;
    },
    async insertMany(collection, docs) {
      const withIds = docs.map(withId);
      for (const part of chunks(withIds, DATA_CHUNK)) throwBulkErrors(await bulkInsert(collection, part), `saving to ${collection}`);
      return withIds;
    },
    async save(collection, doc) {
      return (await save(collection, doc)) as Doc;
    },
    async saveMany(collection, docs) {
      const withIds = docs.map(withId);
      for (const part of chunks(withIds, DATA_CHUNK)) throwBulkErrors(await bulkSave(collection, part), `saving to ${collection}`);
      return withIds;
    },
    async remove(collection, id) {
      await remove(collection, id);
    },
    async increment(collection, id, field, delta) {
      try {
        return await patch(collection, id, [{ action: "INCREMENT_FIELD", fieldPath: field, value: delta }]);
      } catch {
        return null; // no such item yet
      }
    },
  },
  badges: {
    async list() {
      return (await queryBadges().limit(100).find()).items.map((b) => ({ id: b._id ?? "", title: b.title ?? "" }));
    },
    async assignmentsOf(memberIds, badgeIds) {
      let page = await queryAssignments().in("memberId", memberIds).in("badgeId", badgeIds).limit(100).find();
      const found = [...page.items];
      for (let more = 0; page.hasNext() && more < 4; more++) {
        page = await page.next();
        found.push(...page.items);
      }
      return found.map((a) => ({ id: a._id ?? "", badgeId: a.badgeId ?? "", memberId: a.memberId ?? "" }));
    },
    async assign(pairs) {
      for (const part of chunks(pairs, BADGE_CHUNK)) await createAssignments(part);
    },
    async removeAssignments(ids) {
      for (const part of chunks(ids, BADGE_CHUNK)) await deleteAssignments(part);
    },
  },
  members: {
    async list(offset) {
      const page = await queryMembers({ fieldsets: ["FULL"] }).skip(offset).limit(100).find();
      return page.items.map((m) => ({
        id: m._id ?? "",
        status: m.status ?? undefined,
        contact: { firstName: m.contact?.firstName ?? undefined, lastName: m.contact?.lastName ?? undefined },
        profile: { nickname: m.profile?.nickname ?? undefined, slug: m.profile?.slug ?? undefined },
      }));
    },
    async approve(memberId) {
      await approveMember(memberId);
    },
    async setPhoto(memberId, url) {
      await updateMember(memberId, { profile: { photo: { url } } });
    },
    async remove(memberId) {
      await deleteMember(memberId);
    },
  },
  media: {
    // Wix Media's two-step upload: ask for an upload address, then PUT the bytes there.
    async uploadImage({ folder, fileName, mimeType, bytes }) {
      const { uploadUrl } = await uploadUrlFor(mimeType, { fileName, filePath: `${folder}/${fileName}` });
      if (!uploadUrl) throw new Error("Wix Media didn't give an upload address.");
      const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: bytes.slice().buffer as ArrayBuffer });
      if (!res.ok) throw new Error(`Wix Media refused the upload (${res.status}).`);
      const answer = (await res.json()) as { file?: { url?: string } };
      if (!answer.file?.url) throw new Error("Wix Media didn't return the file's address.");
      return answer.file.url;
    },
  },
  async secret(name) {
    const hit = secretCache.get(name);
    if (hit && hit.until > Date.now()) return hit.value;
    const value = await readSecret(name);
    secretCache.set(name, { value, until: Date.now() + SECRET_SECONDS * 1000 });
    return value;
  },
  fetch: (...args) => fetch(...args),
  cache: {
    get: (key) => {
      const hit = answerCache.get(key);
      return hit && hit.until > Date.now() ? hit.value : undefined;
    },
    put: (key, value, seconds) => void answerCache.set(key, { value, until: Date.now() + seconds * 1000 }),
    remove: (key) => void answerCache.delete(key),
  },
  now: () => new Date(),
  callsLeft: () => Infinity,
};
