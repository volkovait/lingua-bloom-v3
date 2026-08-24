import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const projectRoot = resolve(import.meta.dirname, "../../..");
const environment = parseEnvironment(await readFile(resolve(projectRoot, ".env.local"), "utf8"));
const supabaseUrl = requireEnvironment("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = requireEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const apiBaseUrl = process.env.API_BASE_URL;
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const report = { storage: await verifyStorageIsolation() };
if (apiBaseUrl) report.importEndpoint = await verifyImportEndpoint(apiBaseUrl);
console.log(JSON.stringify(report, null, 2));

if (Object.values(report).some((group) => Object.values(group).some((value) => value === false))) {
  process.exitCode = 1;
}

async function verifyStorageIsolation() {
  const password = `T023-${crypto.randomUUID()}-aA1!`;
  const stamp = Date.now();
  const users = [];
  let objectPath;

  try {
    const owner = await createUser(`t023-storage-owner-${stamp}@example.com`, password);
    users.push(owner.id);
    const other = await createUser(`t023-storage-other-${stamp}@example.com`, password);
    users.push(other.id);
    const ownerClient = await signIn(owner.email, password);
    const otherClient = await signIn(other.email, password);
    const sourceDocumentId = crypto.randomUUID();
    objectPath = `${owner.id}/${sourceDocumentId}/original.txt`;

    const ownerUpload = await ownerClient.storage
      .from("sources")
      .upload(objectPath, new TextEncoder().encode("t023"), {
        contentType: "text/plain",
        upsert: false
      });
    const ownerDownload = await ownerClient.storage.from("sources").download(objectPath);
    const otherDownload = await otherClient.storage.from("sources").download(objectPath);
    const otherList = await otherClient.storage
      .from("sources")
      .list(`${owner.id}/${sourceDocumentId}`);
    const otherUpload = await otherClient.storage
      .from("sources")
      .upload(`${owner.id}/${crypto.randomUUID()}/original.txt`, new TextEncoder().encode("x"), {
        contentType: "text/plain",
        upsert: false
      });

    return {
      ownerUploadAllowed: !ownerUpload.error,
      ownerDownloadAllowed: !ownerDownload.error && (await ownerDownload.data.text()) === "t023",
      crossTenantDownloadBlocked: Boolean(otherDownload.error),
      crossTenantListHidden: !otherList.error && otherList.data.length === 0,
      crossTenantUploadBlocked: Boolean(otherUpload.error)
    };
  } finally {
    if (objectPath) await admin.storage.from("sources").remove([objectPath]);
    for (const userId of users.reverse()) await admin.auth.admin.deleteUser(userId);
  }
}

async function verifyImportEndpoint(baseUrl) {
  const password = `T023-${crypto.randomUUID()}-aA1!`;
  const stamp = Date.now();
  const user = await createUser(`t023-import-${stamp}@example.com`, password);
  let retained = false;

  try {
    const cookieHeader = await createSessionCookie(user.email, password);
    const idempotencyKey = `t023-import-${crypto.randomUUID()}`;
    const beforeLimit = await countSources(user.id);
    const oversized = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers: { cookie: cookieHeader },
      body: importForm(`t023-limit-${crypto.randomUUID()}`, "😀".repeat(500_001))
    });
    const oversizedBody = await oversized.json();
    const afterLimit = await countSources(user.id);
    const unauthenticated = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      body: importForm(idempotencyKey)
    });
    const accepted = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers: { cookie: cookieHeader },
      body: importForm(idempotencyKey)
    });
    const acceptedBody = await accepted.json();
    const replay = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers: { cookie: cookieHeader },
      body: importForm(idempotencyKey)
    });
    const replayBody = await replay.json();
    const beforeConflict = await countSources(user.id);
    const conflict = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers: { cookie: cookieHeader },
      body: importForm(idempotencyKey, "A different immutable source")
    });
    const afterConflict = await countSources(user.id);
    const count = afterConflict;
    retained = (count ?? 0) > 0;

    return {
      oversizedRejectedBeforePersistence:
        oversized.status === 413 &&
        oversizedBody.code === "SOURCE_TOO_LARGE" &&
        oversizedBody.limitType === "textCharacters" &&
        oversizedBody.actual === 500_001 &&
        beforeLimit === afterLimit,
      unauthenticatedRejected: unauthenticated.status === 401,
      accepted: accepted.status === 202,
      exactReplayStable:
        replay.status === 202 &&
        typeof acceptedBody.runId === "string" &&
        acceptedBody.runId === replayBody.runId,
      idempotencyConflictBeforePersistence:
        conflict.status === 409 && beforeConflict === afterConflict,
      sourceRetained: retained
    };
  } finally {
    // A successful import is intentionally retained with its test owner for provenance.
    if (!retained) await admin.auth.admin.deleteUser(user.id);
  }
}

async function createUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error) throw error;
  return { id: data.user.id, email };
}

async function signIn(email, password) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function createSessionCookie(email, password) {
  const jar = new Map();
  const client = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value))
    }
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function countSources(ownerId) {
  const { count, error } = await admin
    .from("source_documents")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  if (error) throw error;
  return count ?? 0;
}

function importForm(idempotencyKey, sourceText = "Exercise 1: choose the correct answer.") {
  const form = new FormData();
  form.set("title", "T023 live import");
  form.set("idempotencyKey", idempotencyKey);
  form.set("sourceText", sourceText);
  return form;
}

function parseEnvironment(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        const name = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [name, value];
      })
  );
}

function requireEnvironment(name) {
  const value = environment[name];
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}
