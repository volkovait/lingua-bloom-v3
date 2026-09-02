import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(resolve(import.meta.dirname, "../../../.env.local"));

const url = requireEnvironment("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = requireEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(url, serviceRoleKey, clientOptions());
const suffix = randomUUID().replaceAll("-", "");
const password = `Lb-${suffix}-Aa1!`;
const ownerEmail = `lb-cost-owner-${suffix}@example.invalid`;
const outsiderEmail = `lb-cost-outsider-${suffix}@example.invalid`;
const ids = {
  source: randomUUID(),
  ir: randomUUID(),
  layoutRun: randomUUID(),
  answerRun: randomUUID(),
  review: randomUUID(),
  draft: randomUUID()
};
let ownerId;
let outsiderId;

try {
  ownerId = await createTestUser(ownerEmail, password);
  outsiderId = await createTestUser(outsiderEmail, password);
  const owner = await signIn(ownerEmail, password);
  const outsider = await signIn(outsiderEmail, password);
  await seed(ownerId);

  const reviewBefore = await requiredSingle(
    admin.from("unknown_layout_reviews").select("revision").eq("id", ids.review)
  );
  assert(reviewBefore.revision === 1, "review starts at revision 1");

  const layoutPlanHash = "a".repeat(64);
  const [layoutFirst, layoutSecond] = await Promise.all([
    claimLayout(owner, layoutPlanHash),
    claimLayout(owner, layoutPlanHash)
  ]);
  const layoutStatuses = [layoutFirst.claim_status, layoutSecond.claim_status].sort();
  assert(
    JSON.stringify(layoutStatuses) === JSON.stringify(["claimed", "in_progress"]),
    `layout concurrent claim is atomic (${layoutStatuses.join(", ")})`
  );
  const firstLayoutToken = [layoutFirst, layoutSecond].find(
    (claim) => claim.claim_status === "claimed"
  )?.claim_token;
  assert(Boolean(firstLayoutToken), "layout claim returns a generation token");

  await required(
    admin
      .from("layout_classification_checkpoints")
      .update({ lease_expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("run_id", ids.layoutRun)
  );
  const reclaimedLayout = await claimLayout(owner, layoutPlanHash);
  assert(reclaimedLayout.claim_status === "claimed", "expired layout lease is reclaimable");
  assert(
    reclaimedLayout.claim_token !== firstLayoutToken,
    "reclaimed layout lease receives a new generation token"
  );
  await requiredRpc(
    owner.rpc("complete_layout_classification", {
      p_run_id: ids.layoutRun,
      p_review_revision: 1,
      p_plan_hash: layoutPlanHash,
      p_claim_token: reclaimedLayout.claim_token,
      p_suggestions: [
        {
          candidateId: "candidate-1",
          classification: "shortText",
          confidence: 0.9,
          rationale: "Live checkpoint validation"
        }
      ],
      p_telemetry: {
        model: "live-validation",
        promptVersion: "layout-review-classification/1.0.0",
        pricingVersion: "layout-review-rub-pricing/1.0.0",
        latencyMs: 1,
        inputTokens: 1,
        outputTokens: 1,
        actualCost: 0,
        actualCurrency: "RUB"
      }
    })
  );
  const reusedLayout = await claimLayout(owner, layoutPlanHash);
  assert(reusedLayout.claim_status === "completed", "completed layout result is reused");

  const answerPlanHash = "b".repeat(64);
  const answerBatchHash = "c".repeat(64);
  const [answerFirst, answerSecond] = await Promise.all([
    claimAnswer(owner, answerPlanHash, answerBatchHash),
    claimAnswer(owner, answerPlanHash, answerBatchHash)
  ]);
  const answerStatuses = [answerFirst.claim_status, answerSecond.claim_status].sort();
  assert(
    JSON.stringify(answerStatuses) === JSON.stringify(["claimed", "in_progress"]),
    `answer concurrent claim is atomic (${answerStatuses.join(", ")})`
  );
  const answerToken = [answerFirst, answerSecond].find(
    (claim) => claim.claim_status === "claimed"
  )?.claim_token;
  assert(Boolean(answerToken), "answer claim returns a generation token");
  await requiredRpc(
    owner.rpc("complete_answer_suggestion_batch", {
      p_run_id: ids.answerRun,
      p_draft_revision: 1,
      p_plan_hash: answerPlanHash,
      p_batch_index: 0,
      p_batch_hash: answerBatchHash,
      p_claim_token: answerToken,
      p_suggestions: [{ fieldId: "field-1", acceptedValues: ["answer"] }],
      p_telemetry: { requestCount: 1, actualCostUsd: 0 }
    })
  );
  const reusedAnswer = await claimAnswer(owner, answerPlanHash, answerBatchHash);
  assert(reusedAnswer.claim_status === "completed", "completed answer batch is reused");

  const outsiderRows = await required(
    outsider
      .from("layout_classification_checkpoints")
      .select("id", { count: "exact" })
      .eq("run_id", ids.layoutRun)
  );
  assert(outsiderRows.count === 0, "RLS hides layout checkpoints from another teacher");
  const outsiderClaim = await outsider.rpc("claim_layout_classification", {
    p_run_id: ids.layoutRun,
    p_review_id: ids.review,
    p_review_revision: 1,
    p_plan_hash: layoutPlanHash
  });
  assert(Boolean(outsiderClaim.error), "owner-derived RPC rejects another teacher");

  const reviewAfter = await requiredSingle(
    admin.from("unknown_layout_reviews").select("revision").eq("id", ids.review)
  );
  assert(reviewAfter.revision === reviewBefore.revision, "AI checkpoints do not change review revision");
  console.log("LIVE_COST_SAFETY_OK");
} finally {
  await cleanup();
}

async function seed(owner) {
  await required(
    admin.from("source_documents").insert({
      id: ids.source,
      owner_id: owner,
      kind: "text",
      title: "Temporary cost-safety validation",
      content_hash: suffix.padEnd(64, "0").slice(0, 64),
      storage_ref: `live-validation/${suffix}.txt`,
      byte_size: 1
    })
  );
  await required(
    admin.from("document_irs").insert({
      id: ids.ir,
      source_document_id: ids.source,
      owner_id: owner,
      schema_version: "1.0.0",
      payload: { validationOnly: true }
    })
  );
  await required(
    admin.from("pipeline_runs").insert([
      {
        id: ids.layoutRun,
        source_document_id: ids.source,
        owner_id: owner,
        status: "awaiting_review",
        current_step: "await-layout-review",
        idempotency_key: `live-layout-${suffix}`,
        request_fingerprint: `live-layout-${suffix}`
      },
      {
        id: ids.answerRun,
        source_document_id: ids.source,
        owner_id: owner,
        status: "awaiting_review",
        current_step: "wait-for-review",
        idempotency_key: `live-answer-${suffix}`,
        request_fingerprint: `live-answer-${suffix}`
      }
    ])
  );
  await required(
    admin.from("unknown_layout_reviews").insert({
      id: ids.review,
      run_id: ids.layoutRun,
      source_document_id: ids.source,
      document_ir_id: ids.ir,
      owner_id: owner,
      revision: 1,
      status: "active",
      payload: { schemaVersion: "1.1.0", validationOnly: true }
    })
  );
  await required(
    admin.from("lesson_drafts").insert({
      id: ids.draft,
      run_id: ids.answerRun,
      source_document_id: ids.source,
      document_ir_id: ids.ir,
      owner_id: owner,
      revision: 1,
      payload: { schemaVersion: "1.1.0", validationOnly: true }
    })
  );
}

async function claimLayout(client, planHash) {
  return requiredRpc(
    client.rpc("claim_layout_classification", {
      p_run_id: ids.layoutRun,
      p_review_id: ids.review,
      p_review_revision: 1,
      p_plan_hash: planHash
    })
  ).then(firstRow);
}

async function claimAnswer(client, planHash, batchHash) {
  return requiredRpc(
    client.rpc("claim_answer_suggestion_batch", {
      p_run_id: ids.answerRun,
      p_draft_id: ids.draft,
      p_draft_revision: 1,
      p_plan_hash: planHash,
      p_batch_index: 0,
      p_batch_hash: batchHash
    })
  ).then(firstRow);
}

async function createTestUser(email, userPassword) {
  const result = await admin.auth.admin.createUser({
    email,
    password: userPassword,
    email_confirm: true
  });
  if (result.error || !result.data.user) throw result.error ?? new Error("USER_CREATE_FAILED");
  return result.data.user.id;
}

async function signIn(email, userPassword) {
  const client = createClient(url, anonKey, clientOptions());
  const result = await client.auth.signInWithPassword({ email, password: userPassword });
  if (result.error) throw result.error;
  return client;
}

async function cleanup() {
  for (const [table, column, values] of [
    ["layout_classification_checkpoints", "run_id", [ids.layoutRun]],
    ["answer_suggestion_batches", "run_id", [ids.answerRun]],
    ["unknown_layout_reviews", "id", [ids.review]],
    ["lesson_drafts", "id", [ids.draft]],
    ["pipeline_runs", "id", [ids.layoutRun, ids.answerRun]]
  ]) {
    await required(admin.from(table).delete().in(column, values));
  }
  if (ownerId) {
    const result = await admin.auth.admin.updateUserById(ownerId, {
      ban_duration: "876000h",
      user_metadata: { liveValidationOnly: true }
    });
    if (result.error) throw result.error;
  }
  if (outsiderId) {
    const result = await admin.auth.admin.deleteUser(outsiderId);
    if (result.error) throw result.error;
  }
  console.log("LIVE_VALIDATION_CLEANUP_OK");
}

function firstRow(value) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) throw new Error("RPC_RETURNED_NO_ROW");
  return row;
}

async function required(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result;
}

async function requiredSingle(query) {
  const result = await required(query.single());
  return result.data;
}

async function requiredRpc(query) {
  const result = await required(query);
  return result.data;
}

function assert(condition, message) {
  if (!condition) throw new Error(`LIVE_ASSERTION_FAILED: ${message}`);
  console.log(`ok - ${message}`);
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function clientOptions() {
  return { auth: { autoRefreshToken: false, persistSession: false } };
}
