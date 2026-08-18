import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/config/auth';
import { PrismaClient } from '@/generated/prisma';
import {
  CASE_CATEGORIES,
  CASE_SUBTYPES,
  CASE_STAGES,
} from '@/services/cases/referenceOptions';

const prisma = new PrismaClient();

// GET /api/cases/reference-data - Get all reference data for the form
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Reference data comes from the shared referenceOptions module (single source
    // of truth shared with the create form and the field extractor).
    const categories = CASE_CATEGORIES;
    const subTypes = CASE_SUBTYPES;
    const statusStages = CASE_STAGES;

    const documentTags = [
      { id: '1', name: 'Evidence', nameAr: 'دليل', color: '#ef4444' },
      { id: '2', name: 'Contract', nameAr: 'عقد', color: '#3b82f6' },
      { id: '3', name: 'Correspondence', nameAr: 'مراسلة', color: '#10b981' },
      { id: '4', name: 'Court Order', nameAr: 'أمر قضائي', color: '#f59e0b' },
      { id: '5', name: 'Expert Report', nameAr: 'تقرير خبير', color: '#8b5cf6' },
    ];

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json({
      categories,
      subTypes,
      statusStages,
      documentTags,
      users
    });
  } catch (error) {
    console.error('Error fetching reference data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reference data' },
      { status: 500 }
    );
  }
}
