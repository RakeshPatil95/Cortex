import { PrismaClient } from '@/generated/prisma';

const globalForChatPrisma = globalThis;

export const chatPrisma = globalForChatPrisma.__chatPrisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForChatPrisma.__chatPrisma = chatPrisma;
}

export const CHAT_LIST_LIMIT = 20;
export const CHAT_MESSAGE_LIMIT = 50;
export const CHAT_CONTEXT_LIMIT = 10;

export function createConversationTitle(message) {
  const normalized = String(message || '').replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 80) || 'New conversation';
}

export function toJsonSafe(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value, (key, nestedValue) =>
    typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue
  ));
}

export function serializeChatMessage(message) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    turnId: message.turnId,
    role: message.role,
    content: message.content,
    results: message.results || undefined,
    suggestedQuestions: message.suggestedQuestions || [],
    status: message.status,
    timestamp: message.createdAt,
  };
}

export function serializeConversation(conversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation._count?.messages,
    preview: conversation.messages?.[0]?.content,
  };
}

export async function ensureChatUser(session) {
  const sessionUser = session?.user;
  if (!sessionUser?.id || !sessionUser?.email) {
    throw new Error('Authenticated user identity is incomplete');
  }

  const existingById = await chatPrisma.user.findUnique({
    where: { id: sessionUser.id },
  });

  if (existingById) {
    return chatPrisma.user.update({
      where: { id: existingById.id },
      data: {
        name: sessionUser.name || existingById.name,
        image: sessionUser.image ?? existingById.image,
      },
    });
  }

  const existingByEmail = await chatPrisma.user.findUnique({
    where: { email: sessionUser.email },
  });

  if (existingByEmail) {
    return existingByEmail;
  }

  return chatPrisma.user.create({
    data: {
      id: sessionUser.id,
      email: sessionUser.email,
      name: sessionUser.name,
      image: sessionUser.image,
    },
  });
}

export async function getOwnedConversation(conversationId, userId) {
  return chatPrisma.chatConversation.findFirst({
    where: {
      id: conversationId,
      userId,
    },
  });
}

export async function loadConversationContext(conversationId, before) {
  const messages = await chatPrisma.chatMessage.findMany({
    where: {
      conversationId,
      status: 'completed',
      createdAt: { lt: before },
    },
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    take: CHAT_CONTEXT_LIMIT,
    select: {
      role: true,
      content: true,
    },
  });

  return messages.reverse();
}

export async function listConversations(userId, cursor, requestedLimit) {
  const limit = Math.min(Math.max(Number(requestedLimit) || CHAT_LIST_LIMIT, 1), 50);
  const conversations = await chatPrisma.chatConversation.findMany({
    where: { userId },
    orderBy: [
      { lastMessageAt: 'desc' },
      { id: 'desc' },
    ],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: 1,
        select: { content: true },
      },
    },
  });

  const hasMore = conversations.length > limit;
  const page = hasMore ? conversations.slice(0, limit) : conversations;

  return {
    conversations: page.map(serializeConversation),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function loadConversationMessages(conversationId, userId, cursor, requestedLimit) {
  const conversation = await getOwnedConversation(conversationId, userId);
  if (!conversation) {
    return null;
  }

  const limit = Math.min(Math.max(Number(requestedLimit) || CHAT_MESSAGE_LIMIT, 1), 100);
  const messages = await chatPrisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;

  return {
    conversation: serializeConversation(conversation),
    messages: page.reverse().map(serializeChatMessage),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}
