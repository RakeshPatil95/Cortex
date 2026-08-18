import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/config/auth';
import {
  chatPrisma,
  ensureChatUser,
  getOwnedConversation,
  loadConversationMessages,
} from '@/services/chat/persistence';

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await ensureChatUser(session);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const result = await loadConversationMessages(
      id,
      user.id,
      searchParams.get('cursor'),
      searchParams.get('limit')
    );

    if (!result) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Chat conversation load error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load conversation' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await ensureChatUser(session);
    const { id } = await params;
    const conversation = await getOwnedConversation(id, user.id);

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    await chatPrisma.chatConversation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Chat conversation delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete conversation' },
      { status: 500 }
    );
  }
}
