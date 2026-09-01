import { DocumentIRSchema } from "@lingua-bloom/contracts";
import { PDF_DOCUMENT_IR_PARSER_VERSION } from "@lingua-bloom/document-ingestion";
import { z } from "zod";

const DocumentIrCheckpointSchema = z.object({ id: z.string().min(1), payload: z.unknown() });

export function selectDocumentIrCheckpoint(
  kind: "pdf" | "text",
  input: unknown
): z.infer<typeof DocumentIrCheckpointSchema> | undefined {
  const checkpoints = z.array(DocumentIrCheckpointSchema).parse(input);
  if (kind === "text") return checkpoints[0];
  return checkpoints.find((checkpoint) => {
    const parsed = DocumentIRSchema.safeParse(checkpoint.payload);
    return parsed.success && parsed.data.parserVersion === PDF_DOCUMENT_IR_PARSER_VERSION;
  });
}
