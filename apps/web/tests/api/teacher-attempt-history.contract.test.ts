import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("teacher attempt history API", () => {
  test("requires teacher, owner scopes reads and disables caching", async () => {
    const [listRoute, detailRoute, repository] = await Promise.all([
      readFile(resolve(process.cwd(), "apps/web/app/api/attempts/route.ts"), "utf8"),
      readFile(resolve(process.cwd(), "apps/web/app/api/attempts/[attemptId]/route.ts"), "utf8"),
      readFile(
        resolve(process.cwd(), "apps/web/src/attempts/teacher-attempt-repository.ts"),
        "utf8"
      )
    ]);
    expect(listRoute).toContain("requireTeacher");
    expect(detailRoute).toContain("requireTeacher");
    expect(listRoute).toContain("private, no-store");
    expect(detailRoute).toContain("private, no-store");
    expect(repository).toContain("p_owner_id: ownerId");
    expect(repository).toContain('.eq("owner_id", ownerId)');
    expect(repository).not.toContain("request_fingerprint");
    expect(repository).not.toContain("result_payload");
  });

  test("renders URL filters, responsive detail and recovery navigation", async () => {
    const [listPage, detailPage, lessonCards, recovery, inngestRoute, globalStyles] =
      await Promise.all([
        readFile(resolve(process.cwd(), "apps/web/app/attempts/page.tsx"), "utf8"),
        readFile(resolve(process.cwd(), "apps/web/app/attempts/[attemptId]/page.tsx"), "utf8"),
        readFile(
          resolve(process.cwd(), "apps/web/components/lesson/lesson-library-results.tsx"),
          "utf8"
        ),
        readFile(resolve(process.cwd(), "apps/web/src/inngest/telegram-recovery.ts"), "utf8"),
        readFile(resolve(process.cwd(), "apps/web/app/api/inngest/route.ts"), "utf8"),
        readFile(resolve(process.cwd(), "apps/web/app/globals.css"), "utf8")
      ]);
    for (const field of ["query", "lessonId", "resultStatus", "deliveryStatus"])
      expect(listPage).toContain(`name="${field}"`);
    expect(listPage).toContain("nextCursor");
    expect(detailPage).toContain("groupByExercise");
    expect(detailPage).toContain("Принятые ответы:");
    expect(lessonCards).toContain("/attempts?lessonId=");
    expect(recovery).toContain("recover_stale_telegram_deliveries");
    expect(inngestRoute).toContain("telegramDeliveryRecovery");
    expect(globalStyles).toContain("@media (max-width: 1100px)");
    expect(globalStyles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(globalStyles).toContain(".attempt-filters > *");
    expect(globalStyles).toContain("min-width: 0");
    expect(globalStyles).toContain('content: "Результат: "');
    expect(globalStyles).toContain('content: "Telegram: "');
  });
});
