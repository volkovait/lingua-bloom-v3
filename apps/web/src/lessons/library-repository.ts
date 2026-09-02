import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  LessonLibraryPageSchema,
  planLessonLibraryPage,
  type LessonLibraryCard,
  type LessonLibraryPage,
  type LessonLibraryStatus,
  toIlikeContainsPattern
} from "./library-filter";

const ACTIVE_STATUSES = [
  "accepted",
  "processing",
  "awaiting_review",
  "ready_to_publish",
  "failed"
] as const;

const LessonRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  public_lesson_id: z.string(),
  created_at: z.string()
});
const VersionRowSchema = z.object({
  lesson_id: z.string(),
  version: z.number(),
  created_at: z.string()
});
const RunRowSchema = z.object({
  id: z.string(),
  status: z.enum(ACTIVE_STATUSES),
  source_document_id: z.string(),
  updated_at: z.string()
});
const SourceRowSchema = z.object({ id: z.string(), title: z.string() });

export interface LessonLibraryQuery {
  readonly query: string;
  readonly status: LessonLibraryStatus;
  readonly cursor?: string | null;
}

export async function loadLessonLibraryPage(
  supabase: SupabaseClient,
  ownerId: string,
  input: LessonLibraryQuery
): Promise<LessonLibraryPage> {
  const offset = decodeCursor(input.cursor);
  const includePublished = input.status === "all" || input.status === "published";
  const includeDrafts = input.status !== "published";
  const publishedCount = includePublished
    ? await countPublished(supabase, ownerId, input.query)
    : 0;
  const draftContext = includeDrafts
    ? await prepareDraftContext(supabase, ownerId, input.query)
    : { sourceTitles: new Map<string, string>(), sourceIds: null };
  const draftCount = includeDrafts
    ? await countDrafts(supabase, ownerId, input.status, draftContext.sourceIds)
    : 0;
  const pagePlan = planLessonLibraryPage(offset, publishedCount, draftCount);

  const items: LessonLibraryCard[] = [];
  if (pagePlan.publishedLimit > 0) {
    items.push(
      ...(await fetchPublished(
        supabase,
        ownerId,
        input.query,
        pagePlan.publishedOffset,
        pagePlan.publishedLimit
      ))
    );
  }

  if (pagePlan.draftLimit > 0 && includeDrafts) {
    items.push(
      ...(await fetchDrafts(
        supabase,
        ownerId,
        input.status,
        draftContext,
        pagePlan.draftOffset,
        pagePlan.draftLimit
      ))
    );
  }

  return LessonLibraryPageSchema.parse({
    items,
    totalMatched: publishedCount + draftCount,
    nextCursor: pagePlan.nextOffset === null ? null : encodeCursor(pagePlan.nextOffset)
  });
}

async function countPublished(supabase: SupabaseClient, ownerId: string, query: string) {
  let request = supabase
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  if (query.trim()) request = request.ilike("title", toIlikeContainsPattern(query));
  const result = await request;
  if (result.error) throw new Error("Failed to count published lessons");
  return result.count ?? 0;
}

async function fetchPublished(
  supabase: SupabaseClient,
  ownerId: string,
  query: string,
  offset: number,
  limit: number
) {
  let request = supabase
    .from("lessons")
    .select("id,title,public_lesson_id,created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (query.trim()) request = request.ilike("title", toIlikeContainsPattern(query));
  const result = await request;
  if (result.error) throw new Error("Failed to load published lessons");
  const lessons = z.array(LessonRowSchema).parse(result.data);
  if (lessons.length === 0) return [];
  const versionsResult = await supabase
    .from("lesson_versions")
    .select("lesson_id,version,created_at")
    .in(
      "lesson_id",
      lessons.map((lesson) => lesson.id)
    )
    .order("version", { ascending: false });
  if (versionsResult.error) throw new Error("Failed to load published lesson versions");
  const versions = z.array(VersionRowSchema).parse(versionsResult.data);
  const byLesson = new Map<string, z.infer<typeof VersionRowSchema>[]>();
  for (const version of versions) {
    const current = byLesson.get(version.lesson_id) ?? [];
    current.push(version);
    byLesson.set(version.lesson_id, current);
  }
  return lessons.map((lesson): LessonLibraryCard => {
    const lessonVersions = byLesson.get(lesson.id) ?? [];
    const latest = lessonVersions[0];
    return {
      kind: "published",
      id: lesson.id,
      title: lesson.title,
      status: "published",
      publicLessonId: lesson.public_lesson_id,
      versionCount: Math.max(1, lessonVersions.length),
      latestVersion: latest?.version ?? 1,
      updatedAt: latest?.created_at ?? lesson.created_at
    };
  });
}

async function prepareDraftContext(supabase: SupabaseClient, ownerId: string, query: string) {
  if (!query.trim()) return { sourceTitles: new Map<string, string>(), sourceIds: null };
  const result = await supabase
    .from("source_documents")
    .select("id,title")
    .eq("owner_id", ownerId)
    .ilike("title", toIlikeContainsPattern(query));
  if (result.error) throw new Error("Failed to search draft titles");
  const sources = z.array(SourceRowSchema).parse(result.data);
  return {
    sourceTitles: new Map(sources.map((source) => [source.id, source.title])),
    sourceIds: sources.map((source) => source.id)
  };
}

async function countDrafts(
  supabase: SupabaseClient,
  ownerId: string,
  status: LessonLibraryStatus,
  sourceIds: readonly string[] | null
) {
  if (sourceIds?.length === 0) return 0;
  let request = supabase
    .from("pipeline_runs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .in("status", ACTIVE_STATUSES);
  if (status !== "all") request = request.eq("status", status);
  if (sourceIds) request = request.in("source_document_id", [...sourceIds]);
  const result = await request;
  if (result.error) throw new Error("Failed to count editable lessons");
  return result.count ?? 0;
}

async function fetchDrafts(
  supabase: SupabaseClient,
  ownerId: string,
  status: LessonLibraryStatus,
  context: { sourceTitles: Map<string, string>; sourceIds: readonly string[] | null },
  offset: number,
  limit: number
) {
  if (context.sourceIds?.length === 0) return [];
  let request = supabase
    .from("pipeline_runs")
    .select("id,status,source_document_id,updated_at")
    .eq("owner_id", ownerId)
    .in("status", ACTIVE_STATUSES)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (status !== "all") request = request.eq("status", status);
  if (context.sourceIds) request = request.in("source_document_id", [...context.sourceIds]);
  const result = await request;
  if (result.error) throw new Error("Failed to load editable lessons");
  const runs = z.array(RunRowSchema).parse(result.data);
  const missingSourceIds = runs
    .map((run) => run.source_document_id)
    .filter((id) => !context.sourceTitles.has(id));
  if (missingSourceIds.length > 0) {
    const sourcesResult = await supabase
      .from("source_documents")
      .select("id,title")
      .in("id", [...new Set(missingSourceIds)]);
    if (sourcesResult.error) throw new Error("Failed to load editable lesson titles");
    for (const source of z.array(SourceRowSchema).parse(sourcesResult.data))
      context.sourceTitles.set(source.id, source.title);
  }
  return runs.map((run): LessonLibraryCard => ({
    kind: "draft",
    id: run.id,
    title: context.sourceTitles.get(run.source_document_id) ?? "Новый урок",
    status: run.status,
    updatedAt: run.updated_at
  }));
}

function encodeCursor(offset: number) {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | null | undefined) {
  if (!cursor) return 0;
  try {
    const parsed = z
      .object({ offset: z.number().int().nonnegative() })
      .strict()
      .parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    return parsed.offset;
  } catch {
    throw new Error("INVALID_LIBRARY_CURSOR");
  }
}
