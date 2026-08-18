import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/config/auth';
import { searchDocuments } from '@/services/documentProcessor';

// POST /api/documents/search - Search documents using semantic search
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query, caseId, documentType, topK = 10 } = await request.json();

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    // Build filters
    const filters = {
      userId: session.user.id // Only search user's documents
    };

    if (caseId) {
      filters.caseId = caseId;
    }

    if (documentType) {
      filters.documentType = documentType;
    }

    // Perform search
    const result = await searchDocuments(query, filters, topK);

    return NextResponse.json({
      success: true,
      query,
      results: result.results,
      totalResults: result.totalResults,
      filters
    });

  } catch (error) {
    console.error('Document search error:', error);
    return NextResponse.json(
      { 
        error: 'Search failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
