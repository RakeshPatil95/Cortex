import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/config/auth';
import { ensureChatUser, listConversations } from '@/services/chat/persistence';

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await ensureChatUser(session);
    const { searchParams } = new URL(request.url);
    const result = await listConversations(
      user.id,
      searchParams.get('cursor'),
      searchParams.get('limit')
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Chat conversation list error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load conversations' },
      { status: 500 }
    );
  }
}
