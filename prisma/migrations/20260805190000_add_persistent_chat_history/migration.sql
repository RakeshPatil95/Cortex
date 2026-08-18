CREATE TYPE "ChatRole" AS ENUM ('user', 'assistant');
CREATE TYPE "ChatMessageStatus" AS ENUM ('completed', 'error');

CREATE TABLE "chat_conversations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_messages" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "turnId" TEXT NOT NULL,
  "role" "ChatRole" NOT NULL,
  "content" TEXT NOT NULL,
  "results" JSONB,
  "suggestedQuestions" JSONB,
  "status" "ChatMessageStatus" NOT NULL DEFAULT 'completed',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_conversations_userId_lastMessageAt_idx"
  ON "chat_conversations"("userId", "lastMessageAt");

CREATE UNIQUE INDEX "chat_messages_turnId_role_key"
  ON "chat_messages"("turnId", "role");

CREATE INDEX "chat_messages_conversationId_createdAt_idx"
  ON "chat_messages"("conversationId", "createdAt");

ALTER TABLE "chat_conversations"
  ADD CONSTRAINT "chat_conversations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
