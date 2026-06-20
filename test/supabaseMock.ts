import { vi } from "vitest";

// ──────────────────────────────────────────────────────────────────────────
// Mock réutilisable du client Supabase.
//
// Le vrai client expose un *query builder* chaînable (`from().select().eq()…`)
// qui se résout (await) à `{ data, error, count }`. Ce mock reproduit ça :
//   - chaque méthode de chaîne renvoie le même builder (donc chaînable)
//   - le builder est « thenable » : on peut l'await à n'importe quel maillon
//     (certaines actions terminent sur `.eq()`, d'autres sur `.single()`)
//   - chaque appel à `.from(table)` consomme le prochain résultat de la file
//     `results` (dans l'ordre des appels), ce qui rend les tests déterministes.
// ──────────────────────────────────────────────────────────────────────────

export type QueryResult = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

const CHAIN_METHODS = [
  "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "like", "ilike",
  "match", "not", "or", "contains", "filter",
  "order", "limit", "range", "single", "maybeSingle",
] as const;

export type MockBuilder = Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>;
};

function makeBuilder(result: QueryResult): MockBuilder {
  const res: QueryResult = { data: null, error: null, ...result };
  const builder = {
    then: (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(res).then(resolve, reject),
  } as MockBuilder;
  for (const m of CHAIN_METHODS) {
    builder[m] = vi.fn(() => builder);
  }
  return builder;
}

// ── Canaux Realtime ─────────────────────────────────────────────────────────
// Reproduit `supabase.channel(name).on(...).subscribe(cb)`. Les handlers
// `postgres_changes` / `presence` / `broadcast` sont enregistrés et peuvent être
// déclenchés depuis un test via `channel.emit(predicate, payload)`.

export type RegisteredHandler = {
  type: string;
  config: Record<string, unknown>;
  handler: (payload: unknown) => unknown;
};

export type MockChannel = {
  name: string;
  handlers: RegisteredHandler[];
  presence: Record<string, unknown>;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  track: ReturnType<typeof vi.fn>;
  untrack: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  presenceState: ReturnType<typeof vi.fn>;
  /** Déclenche tous les handlers correspondant au prédicat. */
  emit: (predicate: (h: RegisteredHandler) => boolean, payload: unknown) => void;
};

function makeChannel(name: string): MockChannel {
  const ch = { name, handlers: [], presence: {} } as unknown as MockChannel;
  ch.on = vi.fn((type: string, config: Record<string, unknown>, handler: (p: unknown) => unknown) => {
    ch.handlers.push({ type, config, handler });
    return ch;
  });
  ch.subscribe = vi.fn((cb?: (status: string) => unknown) => {
    if (cb) cb("SUBSCRIBED");
    return ch;
  });
  ch.track = vi.fn(() => Promise.resolve("ok"));
  ch.untrack = vi.fn(() => Promise.resolve("ok"));
  ch.send = vi.fn(() => Promise.resolve("ok"));
  ch.presenceState = vi.fn(() => ch.presence);
  ch.emit = (predicate, payload) => {
    for (const h of ch.handlers) if (predicate(h)) h.handler(payload);
  };
  return ch;
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;

export function createSupabaseMock(opts: {
  user?: { id: string } | null;
  claims?: unknown;
  /** Résultats consommés dans l'ordre des appels à `.from()`. */
  results?: QueryResult[];
  storageRemoveResult?: QueryResult;
} = {}) {
  const results = [...(opts.results ?? [])];
  const builders: Array<{ table: string; builder: MockBuilder }> = [];

  const from = vi.fn((table: string) => {
    const result = results.length ? results.shift()! : { data: null, error: null };
    const builder = makeBuilder(result);
    builders.push({ table, builder });
    return builder;
  });

  const storageRemove = vi
    .fn()
    .mockResolvedValue(opts.storageRemoveResult ?? { data: [], error: null });
  const storageUpload = vi.fn().mockResolvedValue({ data: {}, error: null });
  const getPublicUrl = vi.fn((path: string) => ({
    data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${path}` },
  }));

  const channels: MockChannel[] = [];
  const channel = vi.fn((name: string) => {
    const ch = makeChannel(name);
    channels.push(ch);
    return ch;
  });
  const removeChannel = vi.fn();
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

  const onAuthStateChange = vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  }));

  const client = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: opts.user ?? null }, error: null }),
      getClaims: vi.fn().mockResolvedValue({ data: opts.claims ?? null }),
      onAuthStateChange,
    },
    from,
    rpc,
    channel,
    removeChannel,
    storage: {
      from: vi.fn(() => ({ remove: storageRemove, upload: storageUpload, getPublicUrl })),
    },
  };

  return {
    /** À passer à `createClient.mockResolvedValue(mock.client)`. */
    client,
    from,
    rpc,
    channel,
    removeChannel,
    onAuthStateChange,
    storageRemove,
    /** Canaux Realtime créés, dans l'ordre. */
    channels,
    channelNamed: (name: string) => channels.find((c) => c.name === name),
    lastChannel: () => channels[channels.length - 1],
    /** Tous les builders créés, dans l'ordre. */
    builders,
    /** Builders créés pour une table donnée. */
    buildersFor: (table: string) =>
      builders.filter((b) => b.table === table).map((b) => b.builder),
    lastBuilder: () => builders[builders.length - 1]?.builder,
  };
}
