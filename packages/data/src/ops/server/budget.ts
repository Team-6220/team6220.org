// Wix lets one request make 20 calls to outside services (docs/PHASE-2.md). This wraps an OpsEnv, counts every call
// the actions make, and refuses the 17th, so a request that is too big fails with a clear message instead of halfway
// through. The other calls of a request (who is asking: three) are why the limit here is 17, not 20. SERVER ONLY.
import { apiError, type Doc, type OpsEnv } from "./env";

/** What an action may use, leaving room for the session check (3 calls). */
export const CALLS_PER_REQUEST = 17;

export function withCallBudget(env: OpsEnv, max = CALLS_PER_REQUEST): OpsEnv {
  let used = 0;
  const spend = () => {
    if (++used > max) throw apiError("busy", "That was too much to do in one request. Try again with less at a time.");
  };
  /** One counted call. */
  const one = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => async (...args: A): Promise<R> => {
    spend();
    return fn(...args);
  };
  /** A bulk call that does nothing (and costs nothing) when there is nothing to do. */
  const many = <T extends unknown[], R>(fn: (collection: string, docs: T) => Promise<R[]>) => async (collection: string, docs: T): Promise<R[]> => {
    if (!docs.length) return [];
    spend();
    return fn(collection, docs);
  };
  const { data, badges, members } = env;
  return {
    data: {
      query: one(data.query.bind(data)),
      queryIds: async (collection, ids) => (ids.length ? one(data.queryIds.bind(data))(collection, ids) : []),
      insert: one(data.insert.bind(data)),
      insertMany: many<Doc[], Doc>(data.insertMany.bind(data)),
      save: one(data.save.bind(data)),
      saveMany: many<Doc[], Doc>(data.saveMany.bind(data)),
      remove: one(data.remove.bind(data)),
      increment: one(data.increment.bind(data)),
    },
    badges: {
      list: one(badges.list.bind(badges)),
      assignmentsOf: one(badges.assignmentsOf.bind(badges)),
      assign: one(badges.assign.bind(badges)),
      removeAssignments: one(badges.removeAssignments.bind(badges)),
    },
    members: { list: one(members.list.bind(members)) },
    secret: one(env.secret.bind(env)),
    fetch: (async (...args: Parameters<typeof fetch>) => {
      spend();
      return env.fetch(...args);
    }) as typeof fetch,
    cache: env.cache,
    now: () => env.now(),
    callsLeft: () => max - used,
  };
}
