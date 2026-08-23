import { z } from "zod";

import { CONTEXT_SURFACES } from "./context/types.js";
import {
  MEMORY_SCOPES,
  MEMORY_SENSITIVITIES,
} from "./memory/types.js";

const projectKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
    "Project keys may contain letters, numbers, underscores, and hyphens.",
  )
  .transform((value) => value.toLowerCase());

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4_000),
});

export const chatRequestSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    messages: z.array(chatMessageSchema).min(1).max(20),
  })
  .superRefine((request, context) => {
    const lastMessage = request.messages.at(-1);

    if (lastMessage?.role !== "user") {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "The final message must be from the user.",
      });
    }
  });

export const memoryCreateRequestSchema = z
  .object({
    content: z.string().trim().min(1).max(2_000),
    scope: z.enum(MEMORY_SCOPES).optional(),
    subject: z.string().trim().min(1).max(200).nullable().optional(),
    sensitivity: z.enum(MEMORY_SENSITIVITIES).optional(),
    projectKey: projectKeySchema.optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  })
  .strict()
  .superRefine((memory, context) => {
    if (memory.scope === "project" && !memory.projectKey) {
      context.addIssue({
        code: "custom",
        path: ["projectKey"],
        message: "Project-scoped memories require a projectKey.",
      });
    }
  });

export const contextRequestSchema = z
  .object({
    project: projectKeySchema,
    task: z.string().trim().min(1).max(1_000).optional(),
    surface: z.enum(CONTEXT_SURFACES).default("other"),
  })
  .strict();

export const activityRequestSchema = z
  .object({
    project: projectKeySchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const memoryIdSchema = z.string().uuid();

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ContextRequest = z.infer<typeof contextRequestSchema>;
export type ActivityRequest = z.infer<typeof activityRequestSchema>;

export type ChatResponse = {
  conversationId: string;
  message: {
    role: "assistant";
    content: string;
  };
  model: string;
  requestId: string;
};

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Array<{
      path: string;
      message: string;
    }>;
  };
};
