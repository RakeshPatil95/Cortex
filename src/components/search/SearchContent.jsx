'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslations } from '@/lib/translations';
import { Search, Loader2, Filter, X, Calendar, User, FileText, ChevronDown, ChevronUp, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function SearchContent() {
  const { t, isRTL } = useTranslations();
  const resultsRef = useRef(null);

  // Form state
  const [searchCriteria, setSearchCriteria] = useState({
    caseNumber: '',
    serialNumber: '',
    partyName: '',
    status: '',
    priority: '',
    caseType: '',
    assignedTo: '',
    filedDateFrom: '',
    filedDateTo: '',
    nextHearingFrom: '',
    nextHearingTo: ''
  });

  // UI state
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [error, setError] = useState(null);

  const handleInputChange = (field, value) => {
    setSearchCriteria(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setIsSearching(true);
    setError(null);

    try {
      // Build query params from search criteria
      const params = new URLSearchParams();
      Object.entries(searchCriteria).forEach(([key, value]) => {
        if (value && value.trim() !== '') {
          params.append(key, value);
        }
      });

      const response = await fetch(`/api/cases/search?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      setResults(data);

      // Scroll to results after a short delay to ensure DOM is updated
      setTimeout(() => {
        if (resultsRef.current) {
          resultsRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }, 100);
    } catch (err) {
      console.error('Search error:', err);
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleReset = () => {
    setSearchCriteria({
      caseNumber: '',
      serialNumber: '',
      partyName: '',
      status: '',
      priority: '',
      caseType: '',
      assignedTo: '',
      filedDateFrom: '',
      filedDateTo: '',
      nextHearingFrom: '',
      nextHearingTo: ''
    });
    setResults(null);
    setError(null);
  };

  const hasActiveFilters = Object.values(searchCriteria).some(v => v && v.trim() !== '');

  return (
    <div className="space-y-6 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className={`flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${isRTL ? 'md:flex-row-reverse' : ''}`}>
          <div className={`${isRTL ? 'text-right' : 'text-left'} w-full md:w-auto`}>
            <h1 className="text-3xl font-bold text-foreground leading-tight">{t('search.searchCases')}</h1>
            <p className="text-muted-foreground mt-1">
              Search for cases using multiple criteria
            </p>
          </div>

          {hasActiveFilters && (
            <Button
              variant="outline"
              onClick={handleReset}
              className={`gap-2 w-full md:w-auto ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <X className={`h-4 w-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
              <span>Clear All Filters</span>
            </Button>
          )}
        </div>

        {/* Search Form */}
        <Card className="shadow-lg border-gray-200/50">
          <CardHeader className="border-b border-gray-100 bg-white/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Search className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">Search Filters</CardTitle>
                  <CardDescription>Enter search criteria to find cases</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="space-y-6">
              {/* Basic Search Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Case Number */}
                <div className="space-y-2">
                  <Label htmlFor="caseNumber" className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    Case Number
                  </Label>
                  <Input
                    id="caseNumber"
                    placeholder="Enter case number..."
                    value={searchCriteria.caseNumber}
                    onChange={(e) => handleInputChange('caseNumber', e.target.value)}
                    className="bg-white"
                  />
                </div>

                {/* Serial Number */}
                <div className="space-y-2">
                  <Label htmlFor="serialNumber" className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    Serial Number
                  </Label>
                  <Input
                    id="serialNumber"
                    placeholder="Enter serial number..."
                    value={searchCriteria.serialNumber}
                    onChange={(e) => handleInputChange('serialNumber', e.target.value)}
                    className="bg-white"
                  />
                </div>

                {/* Party Name */}
                <div className="space-y-2">
                  <Label htmlFor="partyName" className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    Party Name
                  </Label>
                  <Input
                    id="partyName"
                    placeholder="Enter party name..."
                    value={searchCriteria.partyName}
                    onChange={(e) => handleInputChange('partyName', e.target.value)}
                    className="bg-white"
                  />
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={searchCriteria.status}
                    onValueChange={(value) => handleInputChange('status', value)}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select status..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Priority */}
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={searchCriteria.priority}
                    onValueChange={(value) => handleInputChange('priority', value)}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select priority..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Case Type */}
                <div className="space-y-2">
                  <Label htmlFor="caseType">Case Type</Label>
                  <Input
                    id="caseType"
                    placeholder="Enter case type..."
                    value={searchCriteria.caseType}
                    onChange={(e) => handleInputChange('caseType', e.target.value)}
                    className="bg-white"
                  />
                </div>
              </div>

              {/* Advanced Date Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                {/* Assigned To */}
                <div className="space-y-2">
                  <Label htmlFor="assignedTo">Assigned To</Label>
                  <Input
                    id="assignedTo"
                    placeholder="Enter assigned user..."
                    value={searchCriteria.assignedTo}
                    onChange={(e) => handleInputChange('assignedTo', e.target.value)}
                    className="bg-white"
                  />
                </div>

                {/* Filed Date From */}
                <div className="space-y-2">
                  <Label htmlFor="filedDateFrom" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    Filed Date From
                  </Label>
                  <Input
                    id="filedDateFrom"
                    type="date"
                    value={searchCriteria.filedDateFrom}
                    onChange={(e) => handleInputChange('filedDateFrom', e.target.value)}
                    className="bg-white"
                  />
                </div>

                {/* Filed Date To */}
                <div className="space-y-2">
                  <Label htmlFor="filedDateTo" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    Filed Date To
                  </Label>
                  <Input
                    id="filedDateTo"
                    type="date"
                    value={searchCriteria.filedDateTo}
                    onChange={(e) => handleInputChange('filedDateTo', e.target.value)}
                    className="bg-white"
                  />
                </div>

                {/* Next Hearing From */}
                <div className="space-y-2">
                  <Label htmlFor="nextHearingFrom" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    Next Hearing From
                  </Label>
                  <Input
                    id="nextHearingFrom"
                    type="date"
                    value={searchCriteria.nextHearingFrom}
                    onChange={(e) => handleInputChange('nextHearingFrom', e.target.value)}
                    className="bg-white"
                  />
                </div>

                {/* Next Hearing To */}
                <div className="space-y-2">
                  <Label htmlFor="nextHearingTo" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    Next Hearing To
                  </Label>
                  <Input
                    id="nextHearingTo"
                    type="date"
                    value={searchCriteria.nextHearingTo}
                    onChange={(e) => handleInputChange('nextHearingTo', e.target.value)}
                    className="bg-white"
                  />
                </div>
              </div>

              {/* Search Button */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button
                  type="submit"
                  disabled={isSearching || !hasActiveFilters}
                  className="min-w-[150px]"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Search Cases
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Results Section */}
        {results && (
          <div ref={resultsRef}>
            <Card className="shadow-lg border-gray-200/50">
              <CardHeader className="border-b border-gray-100 bg-white/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">
                    Search Results ({results.cases?.length || 0})
                  </CardTitle>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                {results.cases && results.cases.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {results.cases.map((caseItem) => (
                      <Card key={caseItem.id} className="hover:shadow-md transition-shadow duration-200 border-l-4 border-l-primary">
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
                                  {caseItem.caseNumber}
                                </Badge>
                                <Badge className={cn(
                                  caseItem.status === 'active' && "bg-green-100 text-green-800 hover:bg-green-100",
                                  caseItem.status === 'pending' && "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
                                  caseItem.status === 'closed' && "bg-gray-100 text-gray-800 hover:bg-gray-100"
                                )} variant="secondary">
                                  {caseItem.status}
                                </Badge>
                              </div>
                              <CardTitle className="text-lg font-semibold line-clamp-1" title={caseItem.caseCategory || 'Untitled Case'}>
                                {caseItem.caseCategory || 'Untitled Case'}
                              </CardTitle>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="pb-3 space-y-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex flex-col gap-1">
                              <span className="text-muted-foreground flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5" /> Assigned To
                              </span>
                              <span className="font-medium truncate">{caseItem.assignedTo || 'Unassigned'}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-muted-foreground flex items-center gap-1.5">
                                <Briefcase className="h-3.5 w-3.5" /> Type
                              </span>
                              <span className="font-medium truncate">{caseItem.caseSubType || caseItem.caseType || 'N/A'}</span>
                            </div>
                          </div>

                          {/* Parties Info */}
                          {caseItem.parties && caseItem.parties.length > 0 && (
                            <div className="flex items-center gap-2 text-sm">
                              <User className="h-4 w-4 text-gray-400" />
                              <span className="text-gray-600 truncate">
                                {caseItem.parties[0].name}
                                {caseItem.parties.length > 1 && ` +${caseItem.parties.length - 1}`}
                              </span>
                            </div>
                          )}

                          <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Case Progress</span>
                              <span className="font-medium">{caseItem.status === 'closed' ? '100%' : 'Active'}</span>
                            </div>
                            <Progress value={caseItem.status === 'closed' ? 100 : 45} className="h-2" />
                          </div>
                        </CardContent>

                        <CardFooter className="pt-3 border-t bg-gray-50/50 flex justify-between items-center text-sm">
                          <div className="flex items-center text-muted-foreground">
                            <Calendar className="mr-2 h-4 w-4" />
                            {caseItem.nextHearing ? new Date(caseItem.nextHearing).toLocaleDateString() : 'No Hearings'}
                          </div>
                          <Link href={`/cases/${caseItem.id}`}>
                            <Button
                              variant="link"
                              size="sm"
                              className="px-0 text-primary"
                            >
                              View Details
                            </Button>
                          </Link>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No cases found
                    </h3>
                    <p className="text-sm text-gray-500 max-w-md mx-auto">
                      {t('search.adjustSearch')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
