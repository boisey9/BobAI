import { z } from "zod";

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

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;

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
