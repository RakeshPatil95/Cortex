'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from '@/lib/translations';
import { caseService } from '@/services/cases';
import {
    ArrowLeft,
    Calendar,
    User,
    FileText,
    Briefcase,
    Edit,
    Loader2,
    AlertCircle,
    Users,
    Files,
    Gavel
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function CaseDetailContent({ caseId }) {
    const { t, isRTL, locale } = useTranslations();
    const router = useRouter();

    const [caseData, setCaseData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchCase = async () => {
            try {
                setLoading(true);
                const data = await caseService.getCase(caseId);
                setCaseData(data);
            } catch (err) {
                console.error('Error fetching case:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (caseId) {
            fetchCase();
        }
    }, [caseId]);

    const getStatusColor = (status) => {
        const s = status?.toLowerCase();
        switch (s) {
            case 'active': return 'bg-green-100 text-green-800';
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            case 'closed': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getPriorityColor = (priority) => {
        const p = priority?.toLowerCase();
        switch (p) {
            case 'high': return 'bg-red-100 text-red-800';
            case 'medium': return 'bg-blue-100 text-blue-800';
            case 'low': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50/80 p-6 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading case details...</p>
                </div>
            </div>
        );
    }

    if (error || !caseData) {
        return (
            <div className="min-h-screen bg-slate-50/80 p-6">
                <Card className="max-w-2xl mx-auto">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Case</h3>
                        <p className="text-sm text-muted-foreground mb-4">{error || 'Case not found'}</p>
                        <Button onClick={() => router.back()}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Go Back
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className={cn("min-h-screen bg-slate-50/80 p-6", isRTL ? "rtl" : "ltr")}>
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.back()}
                            className="h-10 w-10"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                                    {caseData.caseNumber}
                                </h1>
                                <Badge className={getStatusColor(caseData.status)} variant="secondary">
                                    {caseData.status}
                                </Badge>
                                <Badge className={getPriorityColor(caseData.priority)} variant="secondary">
                                    {caseData.priority} priority
                                </Badge>
                            </div>
                            <p className="text-sm text-gray-500">
                                Serial Number: {caseData.serialNumber}
                            </p>
                        </div>
                    </div>
                    <Link href={`/${locale}/cases/edit/${caseData.id}`}>
                        <Button>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Case
                        </Button>
                    </Link>
                </div>

                {/* Overview Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardDescription className="flex items-center gap-2">
                                <Briefcase className="h-4 w-4" />
                                Case Type
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold">{caseData.caseCategory || 'N/A'}</p>
                            {caseData.caseSubType && (
                                <p className="text-sm text-muted-foreground">{caseData.caseSubType}</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardDescription className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                Assigned To
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold">{caseData.assignedTo || 'Unassigned'}</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardDescription className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Filed Date
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold">
                                {new Date(caseData.filedDate).toLocaleDateString()}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardDescription className="flex items-center gap-2">
                                <Gavel className="h-4 w-4" />
                                Next Hearing
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold">
                                {caseData.nextHearing
                                    ? new Date(caseData.nextHearing).toLocaleDateString()
                                    : 'Not scheduled'}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs Section */}
                <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 lg:w-auto">
                        <TabsTrigger value="overview" className="gap-2">
                            <FileText className="h-4 w-4" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="parties" className="gap-2">
                            <Users className="h-4 w-4" />
                            Parties ({caseData.parties?.length || 0})
                        </TabsTrigger>
                        <TabsTrigger value="documents" className="gap-2">
                            <Files className="h-4 w-4" />
                            Documents ({caseData.documents?.length || 0})
                        </TabsTrigger>
                        <TabsTrigger value="hearings" className="gap-2">
                            <Gavel className="h-4 w-4" />
                            Hearings ({caseData.hearings?.length || 0})
                        </TabsTrigger>
                    </TabsList>

                    {/* Overview Tab */}
                    <TabsContent value="overview" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Case Information</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-muted-foreground">Case Category</p>
                                        <p className="font-medium">{caseData.caseCategory || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Case Sub Type</p>
                                        <p className="font-medium">{caseData.caseSubType || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Current Stage</p>
                                        <p className="font-medium">{caseData.currentStage || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Assigned To</p>
                                        <p className="font-medium">{caseData.assignedTo || 'Unassigned'}</p>
                                    </div>
                                </div>

                                {caseData.publicProsecutorMemo && (
                                    <div>
                                        <p className="text-sm text-muted-foreground mb-2">Public Prosecutor Memo</p>
                                        <div className="bg-muted/50 p-4 rounded-lg">
                                            <p className="text-sm whitespace-pre-wrap">{caseData.publicProsecutorMemo}</p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Parties Tab */}
                    <TabsContent value="parties" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Case Parties</CardTitle>
                                <CardDescription>All parties involved in this case</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {caseData.parties && caseData.parties.length > 0 ? (
                                    <div className="space-y-3">
                                        {caseData.parties.map((party) => (
                                            <div key={party.id} className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="font-semibold">{party.name}</p>
                                                        <Badge variant="outline" className="capitalize">{party.role}</Badge>
                                                    </div>
                                                    {party.civilId && (
                                                        <p className="text-sm text-muted-foreground">Civil ID: {party.civilId}</p>
                                                    )}
                                                    {party.phone && (
                                                        <p className="text-sm text-muted-foreground">Phone: {party.phone}</p>
                                                    )}
                                                    {party.email && (
                                                        <p className="text-sm text-muted-foreground">Email: {party.email}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-muted-foreground py-8">No parties added yet</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Documents Tab */}
                    <TabsContent value="documents" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Case Documents</CardTitle>
                                <CardDescription>All documents related to this case</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {caseData.documents && caseData.documents.length > 0 ? (
                                    <div className="space-y-3">
                                        {caseData.documents.map((doc) => (
                                            <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium truncate">{doc.title}</p>
                                                        {doc.documentType && (
                                                            <p className="text-sm text-muted-foreground">{doc.documentType}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <Button variant="outline" size="sm">View</Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-muted-foreground py-8">No documents uploaded yet</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Hearings Tab */}
                    <TabsContent value="hearings" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Case Hearings</CardTitle>
                                <CardDescription>All scheduled and past hearings</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {caseData.hearings && caseData.hearings.length > 0 ? (
                                    <div className="space-y-3">
                                        {caseData.hearings.map((hearing) => (
                                            <div key={hearing.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="font-semibold">
                                                        {new Date(hearing.hearingDate).toLocaleDateString()}
                                                    </p>
                                                    {hearing.outcome && (
                                                        <Badge variant="outline">{hearing.outcome.name}</Badge>
                                                    )}
                                                </div>
                                                {hearing.notes && (
                                                    <p className="text-sm text-muted-foreground">{hearing.notes}</p>
                                                )}
                                                {hearing.nextHearing && (
                                                    <p className="text-sm text-muted-foreground mt-2">
                                                        Next: {new Date(hearing.nextHearing).toLocaleDateString()}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-muted-foreground py-8">No hearings scheduled yet</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
