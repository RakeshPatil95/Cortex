import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/config/auth';
import { processDocument, deleteDocumentChunks } from '@/services/documentProcessor';

// POST /api/documents/process - Process a document and store in pgvector
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const caseId = formData.get('caseId');
    const documentId = formData.get('documentId');
    const documentTitle = formData.get('documentTitle');
    const documentType = formData.get('documentType');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!caseId || !documentId || !documentTitle) {
      return NextResponse.json({ 
        error: 'Missing required fields: caseId, documentId, documentTitle' 
      }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Unsupported file type. Only PDF, DOC, DOCX, and TXT files are allowed.' 
      }, { status: 400 });
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'File too large. Maximum size is 10MB.' 
      }, { status: 400 });
    }

    // Process the document
    const result = await processDocument(file, {
      documentId,
      caseId,
      documentTitle,
      documentType: documentType || 'unknown',
      userId: session.user.id,
      userName: session.user.name,
      userEmail: session.user.email
    });

    return NextResponse.json({
      success: true,
      message: 'Document processed successfully',
      data: result
    });

  } catch (error) {
    console.error('Document processing error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process document',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// DELETE /api/documents/process - Delete document from pgvector
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    const result = await deleteDocumentChunks(documentId);

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully',
      data: result
    });

  } catch (error) {
    console.error('Document deletion error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete document',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
