export type MemoryCommand =
  | { type: "remember"; content: string }
  | { type: "forget"; query: string }
  | { type: "recall"; query: string | null };

function stripBobPrefix(value: string): string {
  return value
    .trim()
    .replace(/^(?:hey\s+)?bob\s*[,;:\-]?\s*/i, "")
    .trim();
}

function cleanCapturedValue(value: string): string {
  return value.trim().replace(/^['“”]|['“”]$/g, "").trim();
}

export function parseMemoryCommand(input: string): MemoryCommand | null {
  const text = stripBobPrefix(input);

  const remember = text.match(
    /^(?:please\s+)?remember(?:\s+(?:that|this))?\s*[,;:\-]?\s+(.+)$/i,
  );

  if (remember?.[1]) {
    return {
      type: "remember",
      content: cleanCapturedValue(remember[1]),
    };
  }

  const forget = text.match(
    /^(?:please\s+)?forget(?:\s+(?:that|this|about))?\s*[,;:\-]?\s+(.+)$/i,
  );

  if (forget?.[1]) {
    return {
      type: "forget",
      query: cleanCapturedValue(forget[1]).replace(/[?.!]+$/, ""),
    };
  }

  if (
    /^(?:what\s+do\s+you\s+remember|show\s+(?:me\s+)?(?:your\s+)?memories|list\s+(?:your\s+)?memories)\s*[?.!]*$/i.test(
      text,
    )
  ) {
    return { type: "recall", query: null };
  }

  const recall = text.match(
    /^(?:what\s+do\s+you\s+remember\s+about|what\s+do\s+you\s+know\s+about|show\s+me\s+what\s+you\s+remember\s+about)\s+(.+?)[?.!]*$/i,
  );

  if (recall?.[1]) {
    return {
      type: "recall",
      query: cleanCapturedValue(recall[1]),
    };
  }

  return null;
}
