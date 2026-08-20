'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Plus,
  AlertCircle,
  Search,
  Filter,
  Calendar,
  User,
  MoreHorizontal,
  Briefcase,
  Trash2,
  Edit,
  X
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { useTranslations } from '@/lib/translations';
import { caseService } from '@/services/cases';

// GET /api/cases paginates and defaults to 10 per page. The dashboard filters
// and searches client-side, so it needs the complete set — otherwise the list
// silently stops at the first page (which is why only 10 of 50 cases showed).
const CASES_PAGE_SIZE = 100;

// Cases shown per page in the grid. Pagination is client-side over the filtered
// set so search and status/priority filters still apply across every case, not
// just the page currently on screen.
const CASES_PER_PAGE = 10;

async function fetchAllCases() {
  const first = await caseService.getCases({ page: 1, limit: CASES_PAGE_SIZE });
  const all = [...(first.cases || [])];
  const pages = first.pagination?.pages || 1;

  // Walk the remaining pages rather than hard-coding a big limit, so the list
  // stays complete as the case count grows.
  for (let page = 2; page <= pages; page += 1) {
    const next = await caseService.getCases({ page, limit: CASES_PAGE_SIZE });
    all.push(...(next.cases || []));
  }

  return all;
}

export default function DashboardContent() {
  const { data: session } = useSession();
  const { t, isRTL, locale } = useTranslations();
  const router = useRouter();

  // State for cases data
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState([]);
  const [page, setPage] = useState(1);

  // Fetch cases data
  useEffect(() => {
    console.log('DashboardContent - useEffect triggered, session:', session);

    const fetchCases = async () => {
      try {
        setLoading(true);
        setCases(await fetchAllCases());
      } catch (err) {
        console.error('Error fetching cases:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (session) {
      fetchCases();
    }
  }, [session]);

  // Handler functions for case actions
  const handleEdit = (caseItem) => {
    router.push(`/${locale}/cases/edit/${caseItem.id}`);
  };

  const handleDelete = async (caseItem) => {
    if (confirm(t('cases.confirmDelete'))) {
      try {
        await caseService.deleteCase(caseItem.id);
        // Refresh cases data
        setCases(await fetchAllCases());
      } catch (err) {
        console.error('Error deleting case:', err);
        alert(t('cases.deleteError'));
      }
    }
  };

  const getStatusColor = (status) => {
    const s = status?.toLowerCase();
    switch (s) {
      case 'active': return 'bg-green-100 text-green-800 hover:bg-green-100';
      case 'pending': return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
      case 'closed': return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
      case 'in court': return 'bg-red-100 text-red-800 hover:bg-red-100';
      case 'discovery': return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Toggle filter helpers
  const toggleStatus = (status) => {
    setStatusFilter(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const togglePriority = (priority) => {
    setPriorityFilter(prev =>
      prev.includes(priority) ? prev.filter(p => p !== priority) : [...prev, priority]
    );
  };

  const clearFilters = () => {
    setStatusFilter([]);
    setPriorityFilter([]);
    setSearchTerm('');
  };

  // Filter cases logic
  const filteredCases = cases.filter(c => {
    // Search Term Filter
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm ||
      c.caseNumber?.toLowerCase().includes(searchLower) ||
      c.serialNumber?.toLowerCase().includes(searchLower) ||
      c.caseCategory?.toLowerCase().includes(searchLower) ||
      c.caseSubType?.toLowerCase().includes(searchLower) ||
      c.status?.toLowerCase().includes(searchLower) ||
      c.assignedTo?.toLowerCase().includes(searchLower) ||
      c.parties?.some(p => p.name.toLowerCase().includes(searchLower));

    // Status Filter
    const matchesStatus = statusFilter.length === 0 || statusFilter.includes(c.status);

    // Priority Filter
    const matchesPriority = priorityFilter.length === 0 || priorityFilter.includes(c.priority);

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const activeFiltersCount = statusFilter.length + priorityFilter.length;

  const totalPages = Math.max(1, Math.ceil(filteredCases.length / CASES_PER_PAGE));
  // Filtering down to fewer pages can leave `page` past the end; clamp for this
  // render and correct the state in an effect so the grid is never blank.
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * CASES_PER_PAGE;
  const visibleCases = filteredCases.slice(pageStart, pageStart + CASES_PER_PAGE);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  // Any change to the search text or filters restarts at the first page.
  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, priorityFilter]);

  // Page numbers to render: always first and last, the current page and its
  // neighbours, with ellipses standing in for the gaps.
  const pageNumbers = [];
  for (let n = 1; n <= totalPages; n += 1) {
    if (n === 1 || n === totalPages || Math.abs(n - currentPage) <= 1) {
      pageNumbers.push(n);
    } else if (pageNumbers[pageNumbers.length - 1] !== 'ellipsis') {
      pageNumbers.push('ellipsis');
    }
  }

  const goToPage = (next) => {
    setPage(Math.min(Math.max(1, next), totalPages));
  };

  return (
    <div className="space-y-6 min-h-screen">
      {/* Header */}
      <div className={`flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${isRTL ? 'md:flex-row-reverse' : ''}`}>
        <div className={`${isRTL ? 'text-right' : 'text-left'} w-full md:w-auto`}>
          <h1 className="text-3xl font-bold text-foreground leading-tight">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('dashboard.subtitle', { name: session?.user?.name || 'User' })}
          </p>
        </div>
        <Link href={`/${locale}/cases/create`} className={`w-full md:w-auto`}>
          <Button className={`w-full md:w-auto ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Plus className={`h-4 w-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
            <span>{t('cases.createCase')}</span>
          </Button>
        </Link>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-lg border shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search cases, clients, or IDs..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 relative">
                <Filter className="mr-2 h-4 w-4" />
                Filter
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium leading-none">Filters</h4>
                  {(statusFilter.length > 0 || priorityFilter.length > 0) && (
                    <Button variant="ghost" size="sm" onClick={() => { setStatusFilter([]); setPriorityFilter([]); }} className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground">
                      Reset
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <h5 className="text-sm font-medium text-muted-foreground">Status</h5>
                  <div className="grid grid-cols-2 gap-2">
                    {['active', 'pending', 'closed', 'in court', 'discovery'].map((status) => (
                      <div key={status} className="flex items-center space-x-2">
                        <Checkbox
                          id={`status-${status}`}
                          checked={statusFilter.includes(status)}
                          onCheckedChange={() => toggleStatus(status)}
                        />
                        <Label htmlFor={`status-${status}`} className="text-sm capitalize cursor-pointer">
                          {status}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h5 className="text-sm font-medium text-muted-foreground">Priority</h5>
                  <div className="grid grid-cols-2 gap-2">
                    {['high', 'medium', 'low'].map((priority) => (
                      <div key={priority} className="flex items-center space-x-2">
                        <Checkbox
                          id={`priority-${priority}`}
                          checked={priorityFilter.includes(priority)}
                          onCheckedChange={() => togglePriority(priority)}
                        />
                        <Label htmlFor={`priority-${priority}`} className="text-sm capitalize cursor-pointer">
                          {priority}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {(searchTerm || activeFiltersCount > 0) && (
            <Button variant="ghost" size="icon" onClick={clearFilters} className="h-10 w-10" title="Clear all filters">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Cases Grid */}
      <div className="w-full">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">{t('common.loading')}</p>
            </div>
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-4" />
                <p className="text-destructive">{error}</p>
              </div>
            </CardContent>
          </Card>
        ) : filteredCases.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-gray-900">No cases found</h3>
              <p className="text-muted-foreground max-w-sm mt-2">
                {searchTerm || activeFiltersCount > 0
                  ? "No cases match your current filters. Try adjusting them."
                  : "Get started by creating your first legal case."}
              </p>
              {searchTerm || activeFiltersCount > 0 ? (
                <Button variant="outline" onClick={clearFilters} className="mt-4">
                  Clear Filters
                </Button>
              ) : (
                <Link href={`/${locale}/cases/create`} className="mt-4">
                  <Button variant="outline">Create New Case</Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {visibleCases.map((caseItem) => (
              <Card key={caseItem.id} className="hover:shadow-md transition-shadow duration-200 border-l-4 border-l-primary">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
                          {caseItem.caseNumber}
                        </Badge>
                        <Badge className={getStatusColor(caseItem.status)} variant="secondary">
                          {caseItem.status}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg font-semibold line-clamp-1" title={caseItem.caseCategory || 'Untitled Case'}>
                        {caseItem.caseCategory || 'Untitled Case'}
                      </CardTitle>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(caseItem)}>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(caseItem)} className="text-destructive focus:text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Case Progress</span>
                      {/* Mock progress based on status for now */}
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
                  <Button
                    variant="link"
                    size="sm"
                    className="px-0 text-primary"
                    onClick={() => handleEdit(caseItem)}
                  >
                    View Details
                  </Button>
                </CardFooter>
              </Card>
            ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <p className="text-sm text-muted-foreground" dir="ltr">
                {`Showing ${pageStart + 1}\u2013${pageStart + visibleCases.length} of ${filteredCases.length}`}
                {filteredCases.length !== cases.length ? ` (filtered from ${cases.length})` : ''}
              </p>

              {totalPages > 1 && (
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent dir="ltr">
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        aria-disabled={currentPage === 1}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : undefined}
                        onClick={(e) => { e.preventDefault(); goToPage(currentPage - 1); }}
                      />
                    </PaginationItem>

                    {pageNumbers.map((n, index) => (
                      <PaginationItem key={n === 'ellipsis' ? `gap-${index}` : n}>
                        {n === 'ellipsis' ? (
                          <PaginationEllipsis />
                        ) : (
                          <PaginationLink
                            href="#"
                            isActive={n === currentPage}
                            onClick={(e) => { e.preventDefault(); goToPage(n); }}
                          >
                            {n}
                          </PaginationLink>
                        )}
                      </PaginationItem>
                    ))}

                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        aria-disabled={currentPage === totalPages}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : undefined}
                        onClick={(e) => { e.preventDefault(); goToPage(currentPage + 1); }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
