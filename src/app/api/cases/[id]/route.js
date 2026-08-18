import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/config/auth';
import { PrismaClient } from '@/generated/prisma';
import { createClient } from '@supabase/supabase-js';
import { processDocument, storeCaseVector, deleteCaseVector, deleteDocumentChunks } from '@/services/documentProcessor';

const prisma = new PrismaClient();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper function to process documents for AI search
async function processDocumentsForAI(documents, caseId, user) {
  for (const doc of documents) {
    try {
      // Only process supported file types
      const supportedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain'];
      if (!supportedTypes.includes(doc.mimeType)) {
        console.log(`Skipping AI processing for unsupported file type: ${doc.mimeType}`);
        continue;
      }

      // Download file from Supabase storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('legal-documents')
        .download(doc.filePath);

      if (downloadError) {
        console.error(`Error downloading file ${doc.filePath}:`, downloadError);
        continue;
      }

      // Convert to File object for processing
      const file = new File([fileData], doc.originalName, { type: doc.mimeType });

      // Process document for AI
      const metadata = {
        documentId: doc.uniqueDocumentId,
        caseId: caseId,
        documentTitle: doc.title,
        documentType: doc.documentType || 'unknown',
        userId: user.id,
        userName: user.name,
        userEmail: user.email
      };

      await processDocument(file, metadata);
      console.log(`Successfully processed document for AI: ${doc.originalName}`);

    } catch (error) {
      console.error(`Error processing document ${doc.originalName} for AI:`, error);
      // Continue processing other documents even if one fails
    }
  }
}

// GET /api/cases/[id] - Get a specific case
export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const caseData = await prisma.legalCase.findFirst({
      where: {
        id,
        createdById: session.user.id
      },
      select: {
        id: true,
        serialNumber: true,
        caseNumber: true,
        caseType: true,
        caseCategory: true,
        caseSubType: true,
        currentStage: true,
        assignedTo: true,
        publicProsecutorMemo: true,
        status: true,
        priority: true,
        filedDate: true,
        nextHearing: true,
        createdAt: true,
        updatedAt: true,
        parties: true,
        documents: true,
        hearings: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    return NextResponse.json(caseData);
  } catch (error) {
    console.error('Error fetching case:', error);
    return NextResponse.json(
      { error: 'Failed to fetch case' },
      { status: 500 }
    );
  }
}

// PUT /api/cases/[id] - Update a case
export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure user exists in database (upsert by email to handle existing users)
    const user = await prisma.user.upsert({
      where: { email: session.user.email },
      update: {
        id: session.user.id,
        name: session.user.name,
        image: session.user.image
      },
      create: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image
      }
    });

    const { id } = await params;
    
    // Parse FormData
    const formData = await request.formData();
    
    // Extract text fields
    const serialNumber = formData.get('serialNumber');
    const caseNumber = formData.get('caseNumber');
    const caseType = formData.get('caseType');
    const caseCategory = formData.get('caseCategory');
    const caseSubType = formData.get('caseSubType');
    const currentStage = formData.get('currentStage');
    const parties = JSON.parse(formData.get('parties') || '[]');
    const publicProsecutorMemo = formData.get('publicProsecutorMemo');
    const status = formData.get('status');
    const priority = formData.get('priority');
    const assignedTo = formData.get('assignedTo');
    const filedDate = formData.get('filedDate');
    const nextHearing = formData.get('nextHearing');
    
    // Extract documents metadata
    const documentsMetadata = JSON.parse(formData.get('documentsMetadata') || '[]');
    const documentsToDelete = JSON.parse(formData.get('documentsToDelete') || '[]');
    
    // Extract actual file objects
    const documents = documentsMetadata.map((meta, index) => ({
      ...meta,
      file: formData.get(`document_${index}`)
    }));

    // Check if case exists and belongs to user
    const existingCase = await prisma.legalCase.findFirst({
      where: {
        id,
        createdById: session.user.id
      }
    });

    if (!existingCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // Check if serial number is being changed and if it already exists
    if (serialNumber !== existingCase.serialNumber) {
      const duplicateCase = await prisma.legalCase.findUnique({
        where: { serialNumber }
      });

      if (duplicateCase) {
        return NextResponse.json(
          { error: 'Serial number already exists' },
          { status: 400 }
        );
      }
    }

    // Handle document uploads for new documents and metadata updates for existing ones
    const uploadedDocuments = [];
    if (documents && documents.length > 0) {
      for (const doc of documents) {
        if (doc.file) {
          const fileExt = doc.originalName.split('.').pop();
          const fileName = `${doc.uniqueDocumentId}.${fileExt}`;
          const filePath = `cases/${serialNumber}/documents/${fileName}`;

          // Convert file to buffer from FormData File object
          const arrayBuffer = await doc.file.arrayBuffer();
          const fileData = Buffer.from(arrayBuffer);

          // Upload to Supabase storage
          const { error: uploadError } = await supabase.storage
            .from('legal-documents')
            .upload(filePath, fileData, {
              contentType: doc.mimeType,
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error('Error uploading file:', uploadError);
            continue; // Skip this document if upload fails
          }

          uploadedDocuments.push({
            uniqueDocumentId: doc.uniqueDocumentId,
            title: doc.title,
            fileName,
            originalName: doc.originalName,
            description: doc.description,
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
            filePath,
            documentType: doc.documentType,
            uploadedById: session.user.id,
            tags: doc.tags || [] // Use text array instead of relation
          });
        } else if (doc.id) {
          await prisma.caseDocument.update({
            where: { id: doc.id },
            data: {
              title: doc.title,
              description: doc.description,
              documentType: doc.documentType,
              tags: doc.tags || []
            }
          });
        }
      }
    }

    // Delete documents removed by user
    if (Array.isArray(documentsToDelete) && documentsToDelete.length > 0) {
      const docsToRemove = await prisma.caseDocument.findMany({
        where: {
          caseId: id,
          filePath: {
            in: documentsToDelete
          }
        }
      });

      for (const doc of docsToRemove) {
        let storageDeleted = false;
        
        if (doc.filePath) {
          console.log(`Attempting to delete file from storage: ${doc.filePath}`);
          
          const { error: deleteError } = await supabase.storage
            .from('legal-documents')
            .remove([doc.filePath]);

          if (deleteError) {
            console.error('Error deleting file from storage:', deleteError);
            console.error('File path that failed:', doc.filePath);
            // Continue with database deletion even if storage deletion fails
          } else {
            console.log(`Successfully deleted file from storage: ${doc.filePath}`);
            storageDeleted = true;
          }
        } else {
          // If no file path, consider it deleted (might be a database-only record)
          storageDeleted = true;
        }

        // Only delete from pgvector if storage deletion was successful
        if (storageDeleted && doc.uniqueDocumentId) {
          try {
            await deleteDocumentChunks(doc.uniqueDocumentId);
            console.log(`Successfully deleted document ${doc.uniqueDocumentId} from pgvector`);
          } catch (vectorError) {
            console.error(`Failed to delete document ${doc.uniqueDocumentId} from pgvector:`, vectorError);
            // Continue with database deletion even if vector deletion fails
          }
        }

        // Delete from database
        await prisma.caseDocument.delete({
          where: {
            id: doc.id
          }
        });
        console.log(`Deleted document record from database: ${doc.id}`);
      }
    }

    // Update the case with all related data
    const updatedCase = await prisma.legalCase.update({
      where: { id },
      data: {
        serialNumber,
        caseNumber,
        caseType,
        // Store the actual values from frontend
        caseCategory: caseCategory || null,
        caseSubType: caseSubType || null,
        currentStage: currentStage || null,
        assignedTo: assignedTo || null,
        publicProsecutorMemo,
        status: status || 'active',
        priority: priority || 'medium',
        filedDate: filedDate ? new Date(filedDate) : existingCase.filedDate,
        nextHearing: nextHearing ? new Date(nextHearing) : null,
        // Update parties - delete existing and create new ones
        parties: {
          deleteMany: {},
          create: (parties || []).map(party => ({
            name: party.name,
            civilId: party.civilId,
            role: party.role,
            address: party.address,
            phone: party.phone,
            email: party.email,
            notes: party.notes,
            isActive: party.isActive !== false
          }))
        },
        // Add new documents
        documents: {
          create: uploadedDocuments
        }
      },
      select: {
        id: true,
        serialNumber: true,
        caseNumber: true,
        caseType: true,
        caseCategory: true,
        caseSubType: true,
        currentStage: true,
        assignedTo: true,
        publicProsecutorMemo: true,
        status: true,
        priority: true,
        createdById: true,
        filedDate: true,
        nextHearing: true,
        createdAt: true,
        updatedAt: true,
        parties: true,
        documents: true,
        hearings: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Process new documents for AI search (async, don't wait)
    if (uploadedDocuments.length > 0) {
      processDocumentsForAI(uploadedDocuments, id, session.user).catch(error => {
        console.error('Error processing new documents for AI:', error);
        // Don't fail the case update if AI processing fails
      });
    }

    // Update case metadata in pgvector for search (async, don't wait)
    storeCaseVector(updatedCase).catch(error => {
      console.error('Error updating case metadata in pgvector:', error);
      // Don't fail the case update if vector storage fails
    });

    return NextResponse.json(updatedCase);
  } catch (error) {
    console.error('Error updating case:', error);
    return NextResponse.json(
      { error: 'Failed to update case' },
      { status: 500 }
    );
  }
}

// DELETE /api/cases/[id] - Delete a case
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if case exists and belongs to user
    const existingCase = await prisma.legalCase.findFirst({
      where: {
        id,
        createdById: session.user.id
      },
      include: {
        documents: true
      }
    });

    if (!existingCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // Delete files from Supabase storage and pgvector
    for (const doc of existingCase.documents) {
      let storageDeleted = false;
      
      if (doc.filePath) {
        console.log(`Deleting file from storage: ${doc.filePath}`);
        
        const { error } = await supabase.storage
          .from('legal-documents')
          .remove([doc.filePath]);

        if (error) {
          console.error('Error deleting file from storage:', error);
          console.error('File path that failed:', doc.filePath);
        } else {
          console.log(`Successfully deleted file from storage: ${doc.filePath}`);
          storageDeleted = true;
        }
      } else {
        // If no file path, consider it deleted (might be a database-only record)
        storageDeleted = true;
      }

      // Only delete from pgvector if storage deletion was successful
      if (storageDeleted && doc.uniqueDocumentId) {
        try {
          await deleteDocumentChunks(doc.uniqueDocumentId);
          console.log(`Successfully deleted document ${doc.uniqueDocumentId} from pgvector`);
        } catch (vectorError) {
          console.error(`Failed to delete document ${doc.uniqueDocumentId} from pgvector:`, vectorError);
          // Continue with case deletion even if vector deletion fails
        }
      }
    }

    // Delete case metadata from pgvector (async, don't wait)
    deleteCaseVector(id).catch(error => {
      console.error('Error deleting case metadata from pgvector:', error);
      // Don't fail the case deletion if vector deletion fails
    });

    // Delete the case (cascade will handle related records)
    await prisma.legalCase.delete({
      where: { id }
    });

    return NextResponse.json({ message: 'Case deleted successfully' });
  } catch (error) {
    console.error('Error deleting case:', error);
    return NextResponse.json(
      { error: 'Failed to delete case' },
      { status: 500 }
    );
  }
}
