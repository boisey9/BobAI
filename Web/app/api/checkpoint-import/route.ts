import { createImportHandler } from "@/lib/checkpoint-import";
import { getCheckpointImportContext, writeCheckpointImport, signCheckpointImportReview } from "@/lib/bob-core";
import { hasOwnerSession, validateOwnerCsrfToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createImportHandler({ hasOwnerSession, csrf: validateOwnerCsrfToken,
  read: getCheckpointImportContext, write: writeCheckpointImport, sign: signCheckpointImportReview });
