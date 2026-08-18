import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/config/auth';
import { processChatMessage, getInitialSuggestedQuestions } from '@/services/chat';
import {
  chatPrisma,
  createConversationTitle,
  ensureChatUser,
  getOwnedConversation,
  loadConversationContext,
  serializeChatMessage,
  serializeConversation,
  toJsonSafe,
} from '@/services/chat/persistence';

const FALLBACK_MESSAGE = "I'm sorry, I encountered an error processing your request. Please try again.";

function responseFromStoredTurn(conversation, userMessage, assistantMessage) {
  return {
    success: assistantMessage.status !== 'error',
    message: assistantMessage.content,
    results: assistantMessage.results || { cases: [], documents: [] },
    suggestedQuestions: assistantMessage.suggestedQuestions || [],
    conversation: serializeConversation(conversation),
    userMessage: serializeChatMessage(userMessage),
    assistantMessage: serializeChatMessage(assistantMessage),
    timestamp: assistantMessage.createdAt,
  };
}

async function findStoredTurn(turnId, userId) {
  const userMessage = await chatPrisma.chatMessage.findUnique({
    where: {
      turnId_role: {
        turnId,
        role: 'user',
      },
    },
    include: { conversation: true },
  });

  if (!userMessage) {
    return null;
  }

  if (userMessage.conversation.userId !== userId) {
    return { conflict: true };
  }

  const assistantMessage = await chatPrisma.chatMessage.findUnique({
    where: {
      turnId_role: {
        turnId,
        role: 'assistant',
      },
    },
  });

  return {
    conversation: userMessage.conversation,
    userMessage,
    assistantMessage,
  };
}

async function persistUserMessage({ conversationId, turnId, message, userId }) {
  return chatPrisma.$transaction(async (tx) => {
    let conversation;

    if (conversationId) {
      conversation = await tx.chatConversation.findFirst({
        where: { id: conversationId, userId },
      });

      if (!conversation) {
        const notFound = new Error('Conversation not found');
        notFound.code = 'CHAT_NOT_FOUND';
        throw notFound;
      }
    } else {
      conversation = await tx.chatConversation.create({
        data: {
          userId,
          title: createConversationTitle(message),
        },
      });
    }

    const userMessage = await tx.chatMessage.create({
      data: {
        conversationId: conversation.id,
        turnId,
        role: 'user',
        content: message,
        status: 'completed',
      },
    });

    conversation = await tx.chatConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: userMessage.createdAt },
    });

    return { conversation, userMessage };
  });
}

/**
 * POST /api/chat - Process chat messages and return search results
 */
export async function POST(request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const { message, conversationId = null, turnId, filters = {} } = await request.json();

    // Validate input
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ 
        error: 'Message is required and must be a non-empty string' 
      }, { status: 400 });
    }

    if (!turnId || typeof turnId !== 'string' || turnId.trim().length === 0) {
      return NextResponse.json({
        error: 'Turn ID is required'
      }, { status: 400 });
    }

    if (conversationId && typeof conversationId !== 'string') {
      return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 });
    }

    const user = await ensureChatUser(session);
    const normalizedTurnId = turnId.trim();
    const normalizedMessage = message.trim();
    let storedTurn = await findStoredTurn(normalizedTurnId, user.id);

    if (storedTurn?.conflict) {
      return NextResponse.json({ error: 'Turn ID is already in use' }, { status: 409 });
    }

    if (storedTurn && conversationId && storedTurn.conversation.id !== conversationId) {
      return NextResponse.json({ error: 'Turn does not belong to this conversation' }, { status: 409 });
    }

    if (storedTurn?.assistantMessage) {
      return NextResponse.json(responseFromStoredTurn(
        storedTurn.conversation,
        storedTurn.userMessage,
        storedTurn.assistantMessage
      ));
    }

    if (!storedTurn) {
      if (conversationId) {
        const conversation = await getOwnedConversation(conversationId, user.id);
        if (!conversation) {
          return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }
      }

      try {
        storedTurn = await persistUserMessage({
          conversationId,
          turnId: normalizedTurnId,
          message: normalizedMessage,
          userId: user.id,
        });
      } catch (error) {
        if (error.code === 'CHAT_NOT_FOUND') {
          return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        if (error.code !== 'P2002') {
          throw error;
        }

        storedTurn = await findStoredTurn(normalizedTurnId, user.id);
        if (!storedTurn || storedTurn.conflict) {
          throw error;
        }
      }
    }

    const history = await loadConversationContext(
      storedTurn.conversation.id,
      storedTurn.userMessage.createdAt
    );

    let response;
    try {
      response = await processChatMessage(
        normalizedMessage,
        session.user.id,
        history,
        filters
      );
    } catch (error) {
      console.error('Chat processing failed:', error);
      response = {
        message: FALLBACK_MESSAGE,
        results: { cases: [], documents: [] },
        suggestedQuestions: getInitialSuggestedQuestions(),
        error: error.message,
      };
    }

    const safeResponse = toJsonSafe(response);
    const status = safeResponse.error ? 'error' : 'completed';
    const assistantMessage = await chatPrisma.chatMessage.upsert({
      where: {
        turnId_role: {
          turnId: normalizedTurnId,
          role: 'assistant',
        },
      },
      update: {
        content: safeResponse.message || FALLBACK_MESSAGE,
        results: safeResponse.results,
        suggestedQuestions: safeResponse.suggestedQuestions || [],
        status,
      },
      create: {
        conversationId: storedTurn.conversation.id,
        turnId: normalizedTurnId,
        role: 'assistant',
        content: safeResponse.message || FALLBACK_MESSAGE,
        results: safeResponse.results,
        suggestedQuestions: safeResponse.suggestedQuestions || [],
        status,
      },
    });

    const conversation = await chatPrisma.chatConversation.update({
      where: { id: storedTurn.conversation.id },
      data: { lastMessageAt: assistantMessage.createdAt },
    });

    return NextResponse.json({
      success: status !== 'error',
      ...safeResponse,
      conversation: serializeConversation(conversation),
      userMessage: serializeChatMessage(storedTurn.userMessage),
      assistantMessage: serializeChatMessage(assistantMessage),
      timestamp: assistantMessage.createdAt,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    
    // Return a user-friendly error response
    return NextResponse.json({
      success: false,
      error: 'Failed to process your message',
      message: "I'm sorry, I encountered an error processing your request. Please try again.",
      results: {
        cases: [],
        documents: []
      },
      suggestedQuestions: getInitialSuggestedQuestions(),
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

/**
 * GET /api/chat - Get chat suggestions or health check
 */
export async function GET(request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'suggestions') {
      // Return initial suggestions
      return NextResponse.json({
        success: true,
        suggestions: getInitialSuggestedQuestions()
      });
    }

    if (action === 'health') {
      // Health check
      return NextResponse.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString()
      });
    }

    // Default response
    return NextResponse.json({
      success: true,
      message: 'Chat API is running',
      endpoints: {
        'POST /api/chat': 'Send a chat message',
        'GET /api/chat?action=suggestions': 'Get suggested questions',
        'GET /api/chat?action=health': 'Health check'
      }
    });

  } catch (error) {
    console.error('Chat API GET error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
