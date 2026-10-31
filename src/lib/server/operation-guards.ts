import { randomUUID } from "node:crypto";
import { integrationDatabase } from "../integration-store";
import { UserAuthError } from "../user-auth";

/** Bounds waiting even when a DB driver does not support AbortSignal. */
export function withinDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new Error("Operation timed out"));
    if (signal.aborted) {
      work.catch(() => undefined);
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
export async function reserveEmbeddingCharacters(owner: string, characters: number) {
  const configured = Number(process.env.OBSERI_EMBEDDING_MONTHLY_CHAR_LIMIT || 5_000_000);
  const limit = Number.isSafeInteger(configured) && configured > 0 ? configured : 5_000_000;
  if (!Number.isSafeInteger(characters) || characters < 1 || characters > 100_000)
    throw new Error("Embedding input limit exceeded");
  const month = new Date().toISOString().slice(0, 7);
  const rows =
    await integrationDatabase()`insert into obseri_embedding_budgets (owner_user_id, month, characters)
    select ${owner}, ${month}, ${characters}::bigint where ${characters}::bigint <= ${limit}::bigint
    on conflict (owner_user_id, month) do update set characters = obseri_embedding_budgets.characters + excluded.characters
    where obseri_embedding_budgets.characters + excluded.characters <= ${limit}
    returning characters`;
  if (!rows.length) throw new Error("Monthly semantic indexing budget reached");
}
export async function recordOperation(
  owner: string,
  operation: "crawl" | "pdf" | "semantic",
  status: "ok" | "failed" | "fallback",
  code: string,
) {
  // No URLs, messages, provider responses or credentials are recorded.
  try {
    await withinDeadline(
      integrationDatabase()`insert into obseri_operation_events (owner_user_id, operation, status, code)
      select ${owner}, ${operation}, ${status}, ${code}
      where not exists (select 1 from obseri_operation_events where owner_user_id = ${owner} and operation = ${operation}
        and status = ${status} and code = ${code} and created_at > now() - interval '5 minutes')`,
      AbortSignal.timeout(1000),
    );
  } catch {
    console.warn("operation_health_record_unavailable");
  }
}
/** Database leases bound simultaneous imports across serverless instances. */
export async function acquireImportLease(owner: string) {
  const sql = integrationDatabase();
  const id = randomUUID();
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(734091)`;
    await tx`delete from obseri_import_leases where expires_at < now()`;
    const [count] =
      await tx`select count(*) as total, count(*) filter (where owner_user_id = ${owner}) as owned from obseri_import_leases`;
    if (Number(count.owned) >= 2 || Number(count.total) >= 12)
      throw new UserAuthError(
        "Imports are busy. Wait for an active import to finish and try again.",
        429,
      );
    await tx`insert into obseri_import_leases (id, owner_user_id, expires_at) values (${id}, ${owner}, now() + interval '5 minutes')`;
  });
  return async () => {
    try {
      await sql`delete from obseri_import_leases where id = ${id}`;
    } catch {
      /* Expiry recovers interrupted workers. */
    }
  };
}

/** Cap chunked JSON bodies too, before parsing or starting expensive imports. */
export async function readBoundedJson(request: Request, maxBytes = 250_000): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new UserAuthError("Request body is required.", 400);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
  const decoder = new TextDecoder();
  let text = "",
    size = 0;
  try {
    while (true) {
      const { done, value } = await withinDeadline(reader.read(), signal);
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new UserAuthError("Request is too large.", 413);
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    void reader.cancel();
    if (signal.aborted) throw new UserAuthError("Request upload timed out. Try again.", 408);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
