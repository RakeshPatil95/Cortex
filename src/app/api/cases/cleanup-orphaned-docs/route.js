import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/config/auth';
import { PrismaClient } from '@/generated/prisma';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// POST /api/cases/cleanup-orphaned-docs - Clean up orphaned document records
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { caseId } = await request.json();

    if (!caseId) {
      return NextResponse.json({ error: 'Case ID is required' }, { status: 400 });
    }

    // Get all documents for the case
    const documents = await prisma.caseDocument.findMany({
      where: {
        caseId,
        case: {
          createdById: session.user.id
        }
      }
    });

    const orphanedDocs = [];
    const validDocs = [];

    // Check each document against storage
    for (const doc of documents) {
      if (!doc.filePath) {
        orphanedDocs.push(doc);
        continue;
      }

      try {
        // Check if file exists in storage
        const { data: fileData, error: listError } = await supabase.storage
          .from('legal-documents')
          .list(doc.filePath.split('/').slice(0, -1).join('/'));

        if (listError) {
          console.error('Error listing directory for doc:', doc.id, listError);
          orphanedDocs.push(doc);
          continue;
        }

        const fileName = doc.filePath.split('/').pop();
        const fileExists = fileData?.some(file => file.name === fileName);

        if (!fileExists) {
          orphanedDocs.push(doc);
        } else {
          validDocs.push(doc);
        }
      } catch (error) {
        console.error('Error checking file existence for doc:', doc.id, error);
        orphanedDocs.push(doc);
      }
    }

    // Delete orphaned documents from database
    if (orphanedDocs.length > 0) {
      await prisma.caseDocument.deleteMany({
        where: {
          id: {
            in: orphanedDocs.map(doc => doc.id)
          }
        }
      });
    }

    return NextResponse.json({
      message: 'Cleanup completed',
      orphanedCount: orphanedDocs.length,
      validCount: validDocs.length,
      orphanedDocs: orphanedDocs.map(doc => ({
        id: doc.id,
        title: doc.title,
        filePath: doc.filePath
      }))
    });

  } catch (error) {
    console.error('Error cleaning up orphaned documents:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup orphaned documents' },
      { status: 500 }
    );
  }
}
