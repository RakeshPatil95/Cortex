import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/config/auth';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    // Create signed URL with 1 hour expiry
    const { data, error } = await supabase.storage
      .from('legal-documents')
      .createSignedUrl(filePath, 3600);

    if (error) {
      console.error('Error creating signed URL:', error);
      return NextResponse.json(
        { error: `Failed to create document URL: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.signedUrl });

  } catch (error) {
    console.error('Error generating document preview URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate document preview URL' },
      { status: 500 }
    );
  }
}

