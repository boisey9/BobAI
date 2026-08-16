import type {
  MemoryScope,
  MemorySensitivity,
} from "./types.js";

const MAX_MEMORY_LENGTH = 2_000;

const SECRET_PATTERNS: RegExp[] = [
  /(?:password|passcode|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|private[_ -]?key|seed[_ -]?phrase|recovery[_ -]?phrase|mnemonic|cvv|security code)\s*(?:is|=|:)\s*\S+/i,
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/\S+/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
];

const PREFERENCE_PATTERN =
  /\b(?:prefer|preference|like|dislike|favorite|favourite|call me|refer to me|rather)\b/i;
const PROJECT_PATTERN =
  /\b(?:project|BobAI|BirdPath|RFQ|FOMOFlow|Power BI|dealer portal|GitHub|Vercel|Neon)\b/i;
const PERSONAL_PATTERN =
  /\b(?:my family|my wife|my husband|my spouse|my daughter|my son|my birthday|I live|I work|my name|call me)\b/i;
const SENSITIVE_PATTERN =
  /\b(?:address|medical|health|diagnosis|medication|financial|bank|salary|birthday|birth date|phone number|email address)\b/i;

export class MemoryPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryPolicyError";
  }
}

export function normalizeMemoryContent(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function assertMemoryContentAllowed(value: string): void {
  const content = normalizeMemoryContent(value);

  if (!content) {
    throw new MemoryPolicyError("Tell me what you want me to remember.");
  }

  if (content.length > MAX_MEMORY_LENGTH) {
    throw new MemoryPolicyError(
      `That memory is too long. Keep it under ${MAX_MEMORY_LENGTH.toLocaleString()} characters.`,
    );
  }

  if (SECRET_PATTERNS.some((pattern) => pattern.test(content))) {
    throw new MemoryPolicyError(
      "I won't store passwords, API keys, access tokens, private keys, recovery phrases, or database credentials in memory.",
    );
  }
}

export function inferMemoryScope(content: string): MemoryScope {
  if (PREFERENCE_PATTERN.test(content)) {
    return "preference";
  }

  if (PROJECT_PATTERN.test(content)) {
    return "project";
  }

  if (PERSONAL_PATTERN.test(content)) {
    return "personal";
  }

  return "fact";
}

export function inferMemorySensitivity(
  content: string,
): MemorySensitivity {
  return SENSITIVE_PATTERN.test(content) ? "sensitive" : "normal";
}
