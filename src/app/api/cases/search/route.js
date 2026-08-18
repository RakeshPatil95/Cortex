import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/config/auth';
import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

/**
 * GET /api/cases/search - Search cases with multiple criteria
 */
export async function GET(request) {
    try {
        // Check authentication
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);

        // Extract search criteria
        const caseNumber = searchParams.get('caseNumber');
        const serialNumber = searchParams.get('serialNumber');
        const partyName = searchParams.get('partyName');
        const status = searchParams.get('status');
        const priority = searchParams.get('priority');
        const caseType = searchParams.get('caseType');
        const assignedTo = searchParams.get('assignedTo');
        const filedDateFrom = searchParams.get('filedDateFrom');
        const filedDateTo = searchParams.get('filedDateTo');
        const nextHearingFrom = searchParams.get('nextHearingFrom');
        const nextHearingTo = searchParams.get('nextHearingTo');

        // Build Prisma where clause
        const where = {
            createdById: session.user.id,
            AND: []
        };

        // Add case number filter (partial match)
        if (caseNumber) {
            where.AND.push({
                caseNumber: {
                    contains: caseNumber,
                    mode: 'insensitive'
                }
            });
        }

        // Add serial number filter (partial match)
        if (serialNumber) {
            where.AND.push({
                serialNumber: {
                    contains: serialNumber,
                    mode: 'insensitive'
                }
            });
        }

        // Add party name filter (search in related parties)
        if (partyName) {
            where.AND.push({
                parties: {
                    some: {
                        name: {
                            contains: partyName,
                            mode: 'insensitive'
                        }
                    }
                }
            });
        }

        // Add status filter
        if (status) {
            where.AND.push({
                status: status
            });
        }

        // Add priority filter
        if (priority) {
            where.AND.push({
                priority: priority
            });
        }

        // Add case type filter (partial match)
        if (caseType) {
            where.AND.push({
                OR: [
                    {
                        caseType: {
                            contains: caseType,
                            mode: 'insensitive'
                        }
                    },
                    {
                        caseCategory: {
                            contains: caseType,
                            mode: 'insensitive'
                        }
                    },
                    {
                        caseSubType: {
                            contains: caseType,
                            mode: 'insensitive'
                        }
                    }
                ]
            });
        }

        // Add assigned to filter (partial match)
        if (assignedTo) {
            where.AND.push({
                assignedTo: {
                    contains: assignedTo,
                    mode: 'insensitive'
                }
            });
        }

        // Add filed date range filter
        if (filedDateFrom || filedDateTo) {
            const dateFilter = {};
            if (filedDateFrom) {
                dateFilter.gte = new Date(filedDateFrom);
            }
            if (filedDateTo) {
                // Set to end of day
                const toDate = new Date(filedDateTo);
                toDate.setHours(23, 59, 59, 999);
                dateFilter.lte = toDate;
            }
            where.AND.push({
                filedDate: dateFilter
            });
        }

        // Add next hearing date range filter
        if (nextHearingFrom || nextHearingTo) {
            const dateFilter = {};
            if (nextHearingFrom) {
                dateFilter.gte = new Date(nextHearingFrom);
            }
            if (nextHearingTo) {
                // Set to end of day
                const toDate = new Date(nextHearingTo);
                toDate.setHours(23, 59, 59, 999);
                dateFilter.lte = toDate;
            }
            where.AND.push({
                nextHearing: dateFilter
            });
        }

        // Remove empty AND array if no filters
        if (where.AND.length === 0) {
            delete where.AND;
        }

        // Execute search query
        const cases = await prisma.legalCase.findMany({
            where,
            include: {
                parties: {
                    where: { isActive: true },
                    select: {
                        id: true,
                        name: true,
                        role: true
                    },
                    take: 3
                },
                documents: {
                    select: {
                        id: true,
                        title: true,
                        documentType: true
                    },
                    take: 3
                },
                hearings: {
                    orderBy: { hearingDate: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        hearingDate: true,
                        outcome: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            },
            orderBy: [
                { createdAt: 'desc' }
            ],
            take: 100 // Limit results
        });

        // Format response
        return NextResponse.json({
            success: true,
            cases: cases.map(case_ => ({
                id: case_.id,
                serialNumber: case_.serialNumber,
                caseNumber: case_.caseNumber,
                caseType: case_.caseType,
                caseCategory: case_.caseCategory,
                caseSubType: case_.caseSubType,
                currentStage: case_.currentStage,
                status: case_.status,
                priority: case_.priority,
                assignedTo: case_.assignedTo,
                filedDate: case_.filedDate,
                nextHearing: case_.nextHearing,
                createdAt: case_.createdAt,
                parties: case_.parties,
                documentCount: case_.documents.length,
                latestHearing: case_.hearings[0] || null
            })),
            total: cases.length,
            searchCriteria: {
                caseNumber,
                serialNumber,
                partyName,
                status,
                priority,
                caseType,
                assignedTo,
                filedDateFrom,
                filedDateTo,
                nextHearingFrom,
                nextHearingTo
            }
        });

    } catch (error) {
        console.error('Case search error:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to search cases',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }, { status: 500 });
    }
}
