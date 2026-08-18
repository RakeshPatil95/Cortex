'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from '@/lib/translations';
import { Search, Eye, Edit, Trash2, FileText, Calendar, User } from 'lucide-react';

export default function CaseTable({ cases = [], onEdit, onDelete, onView }) {
  const { t, isRTL } = useTranslations();
  const [searchTerm, setSearchTerm] = useState('');

  // Filter cases based on search
  const filteredCases = cases.filter(caseItem => {
    const matchesSearch = 
      caseItem.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      caseItem.caseNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      caseItem.caseType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      caseItem.defendants?.some(d => d.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      caseItem.plaintiffs?.some(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      caseItem.defendants?.some(d => d.civilId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      caseItem.plaintiffs?.some(p => p.civilId.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesSearch;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'closed':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const formatParties = (parties) => {
    if (!parties || parties.length === 0) return 'N/A';
    if (parties.length === 1) return parties[0].name;
    return `${parties[0].name} +${parties.length - 1}`;
  };

  const formatCivilIds = (parties) => {
    if (!parties || parties.length === 0) return 'N/A';
    const validIds = parties.filter(p => p.civilId).map(p => p.civilId);
    if (validIds.length === 0) return 'N/A';
    if (validIds.length === 1) return validIds[0];
    return `${validIds[0]} +${validIds.length - 1}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div>
            <CardTitle>{t('cases.legalCases')}</CardTitle>
            <CardDescription>
              {t('cases.manageCases')} ({filteredCases.length} {t('cases.cases')})
            </CardDescription>
          </div>
        </div>

        {/* Search */}
        <div className="space-y-4">
          <div className={`flex ${isRTL ? 'justify-end' : 'justify-start'}`}>
            <div className="flex-1 max-w-lg relative">
              <Search className={`absolute top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 ${isRTL ? 'right-3' : 'left-3'}`} />
              <Input
                placeholder={t('cases.searchCases')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${isRTL ? 'pr-10 text-right' : 'pl-10 text-left'}`}
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead className={isRTL ? 'text-right' : 'text-left'}>{t('cases.serialNumber')}</TableHead>
                <TableHead className={isRTL ? 'text-right' : 'text-left'}>{t('cases.caseNumber')}</TableHead>
                <TableHead className={isRTL ? 'text-right' : 'text-left'}>{t('cases.caseType')}</TableHead>
                <TableHead className={isRTL ? 'text-right' : 'text-left'}>{t('cases.defendants')}</TableHead>
                <TableHead className={isRTL ? 'text-right' : 'text-left'}>{t('cases.status')}</TableHead>
                <TableHead className={isRTL ? 'text-right' : 'text-left'}>{t('cases.priority')}</TableHead>
                <TableHead className={isRTL ? 'text-right' : 'text-left'}>{t('cases.filedDate')}</TableHead>
                <TableHead className={isRTL ? 'text-right' : 'text-left'}>{t('actions.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                      {t('cases.noCasesFound')}
                    </h3>
                        <p className="text-muted-foreground">
                          {searchTerm 
                            ? t('cases.adjustFilters') 
                            : t('cases.noCasesDescription')
                          }
                        </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCases.map((caseItem) => (
                  <TableRow key={caseItem.id}>
                    <TableCell className="font-medium">
                      {caseItem.serialNumber}
                    </TableCell>
                    <TableCell>{caseItem.caseNumber}</TableCell>
                    <TableCell>{caseItem.caseType}</TableCell>
                    <TableCell>
                      <div className="max-w-32">
                        <p className="truncate" title={caseItem.defendants?.map(d => d.name).join(', ') || 'N/A'}>
                          {formatParties(caseItem.defendants)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={getStatusColor(caseItem.status)}>
                        {t(`status.${caseItem.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={getPriorityColor(caseItem.priority)}>
                        {t(`priority.${caseItem.priority}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDate(caseItem.filedDate)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={`flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onEdit?.(caseItem)}
                              title={t('actions.editCase')}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onDelete?.(caseItem)}
                              title={t('actions.deleteCase')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
