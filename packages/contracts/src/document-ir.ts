import { z } from "zod";

export const IdSchema = z.string().min(1);

export const BBoxSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative()
  })
  .strict();

export const SourceDocumentSchema = z
  .object({
    id: IdSchema,
    ownerId: IdSchema,
    kind: z.enum(["pdf", "text"]),
    contentHash: z.string().min(16),
    storageRef: IdSchema,
    createdAt: z.iso.datetime(),
    retentionPolicy: z.literal("retainForProvenance")
  })
  .strict();

export const DocumentPageSchema = z
  .object({
    index: z.number().int().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive()
  })
  .strict();

export const SourceBlockSchema = z
  .object({
    id: IdSchema,
    pageIndex: z.number().int().nonnegative().nullable().optional(),
    kind: z.enum(["text", "table", "image", "line", "unknown"]),
    rawText: z.string(),
    normalizedText: z.string().nullable().optional(),
    order: z.number().int().nonnegative(),
    bbox: BBoxSchema.nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional()
  })
  .strict();

export const DocumentIRSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    parserVersion: z.string().min(1).optional(),
    id: IdSchema.optional(),
    sourceDocumentId: IdSchema,
    pages: z.array(DocumentPageSchema).min(1),
    blocks: z.array(SourceBlockSchema),
    warnings: z.array(z.string())
  })
  .strict();

export const SourceRefSchema = z
  .object({
    sourceDocumentId: IdSchema,
    documentIrId: IdSchema,
    blockId: IdSchema,
    charStart: z.number().int().nonnegative().nullable().optional(),
    charEnd: z.number().int().nonnegative().nullable().optional(),
    pageIndex: z.number().int().nonnegative().nullable().optional(),
    bbox: BBoxSchema.nullable().optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.charStart != null && value.charEnd != null && value.charEnd < value.charStart) {
      context.addIssue({ code: "custom", message: "charEnd must not precede charStart" });
    }
  });

export type SourceDocument = z.infer<typeof SourceDocumentSchema>;
export type DocumentIR = z.infer<typeof DocumentIRSchema>;
export type SourceBlock = z.infer<typeof SourceBlockSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
