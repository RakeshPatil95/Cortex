import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/config/auth';
import { PrismaClient } from '@/generated/prisma';
import { createClient } from '@supabase/supabase-js';
import { processDocument, storeCaseVector } from '@/services/documentProcessor';

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
        filePath: doc.filePath, // Add filePath for document viewing
        fileName: doc.fileName, // Add fileName for document viewing
        originalName: doc.originalName, // Add originalName for document viewing
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

// GET /api/cases - Get all cases for the user
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {
      createdById: session.user.id,
      ...(status && { status }),
      ...(priority && { priority }),
    };

    const [cases, total] = await Promise.all([
      prisma.legalCase.findMany({
        where,
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
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.legalCase.count({ where })
    ]);

    return NextResponse.json({
      cases,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching cases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cases' },
      { status: 500 }
    );
  }
}

// POST /api/cases - Create a new case
export async function POST(request) {
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
    
    // Extract actual file objects
    const documents = documentsMetadata.map((meta, index) => ({
      ...meta,
      file: formData.get(`document_${index}`)
    }));

    // Validate required fields
    if (!serialNumber || !caseNumber || !caseType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if serial number already exists
    const existingCase = await prisma.legalCase.findUnique({
      where: { serialNumber }
    });

    if (existingCase) {
      return NextResponse.json(
        { error: 'Serial number already exists' },
        { status: 400 }
      );
    }

    // Upload documents to Supabase storage
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
        }
      }
    }

    // Create the case with all related data
    const newCase = await prisma.legalCase.create({
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
        filedDate: filedDate ? new Date(filedDate) : new Date(),
        nextHearing: nextHearing ? new Date(nextHearing) : null,
        createdById: session.user.id,
        parties: {
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

    // Process documents for AI search (async, don't wait)
    if (uploadedDocuments.length > 0) {
      processDocumentsForAI(uploadedDocuments, newCase.id, session.user).catch(error => {
        console.error('Error processing documents for AI:', error);
        // Don't fail the case creation if AI processing fails
      });
    }

    // Store case metadata in pgvector for search (async, don't wait)
    storeCaseVector(newCase).catch(error => {
      console.error('Error storing case metadata in pgvector:', error);
      // Don't fail the case creation if vector storage fails
    });

    return NextResponse.json(newCase, { status: 201 });
  } catch (error) {
    console.error('Error creating case:', error);
    return NextResponse.json(
      { error: 'Failed to create case' },
      { status: 500 }
    );
  }
}
