'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, User, Scale, FileText, Eye, Users, AlertCircle, Clock } from 'lucide-react';
import { useTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

export default function CaseResultCard({ case_, onClick, className }) {
  const { t, isRTL } = useTranslations();

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'default';
      case 'pending': return 'secondary';
      case 'closed': return 'outline';
      default: return 'outline';
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Not specified';
    try {
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick(case_);
    }
  };

  return (
    <Card 
      className={cn(
        "cursor-pointer hover:shadow-md transition-shadow duration-200",
        className
      )}
      onClick={handleCardClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold">
              {case_.serialNumber}
            </CardTitle>
            <CardDescription className="text-sm">
              {case_.caseNumber}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant={getPriorityColor(case_.priority)}>
              {case_.priority}
            </Badge>
            <Badge variant={getStatusColor(case_.status)}>
              {case_.status}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Case Type and Category */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {case_.caseCategory || 'Unknown Category'}
            </span>
            {case_.caseSubType && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground">
                  {case_.caseSubType}
                </span>
              </>
            )}
          </div>
          {case_.currentStage && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Stage: {case_.currentStage}
              </span>
            </div>
          )}
        </div>

        {/* Parties */}
        {case_.parties && case_.parties.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Parties</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {case_.parties.slice(0, 3).map((party, index) => (
                <span key={party.id}>
                  {party.name} ({party.role})
                  {index < Math.min(case_.parties.length, 3) - 1 && ', '}
                </span>
              ))}
              {case_.parties.length > 3 && (
                <span> and {case_.parties.length - 3} more</span>
              )}
            </div>
          </div>
        )}

        {/* Assignment */}
        {case_.assignedTo && (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Assigned to: {case_.assignedTo}
            </span>
          </div>
        )}

        {/* Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Filed</div>
              <div className="text-sm">{formatDate(case_.filedDate)}</div>
            </div>
          </div>
          {case_.nextHearing && (
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Next Hearing</div>
                <div className="text-sm">{formatDate(case_.nextHearing)}</div>
              </div>
            </div>
          )}
        </div>

        {/* Documents */}
        {case_.documentCount > 0 && (
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {case_.documentCount} document{case_.documentCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Memo Preview */}
        {case_.publicProsecutorMemo && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Memo</div>
            <div className="text-sm text-muted-foreground line-clamp-2">
              {case_.publicProsecutorMemo.length > 100 
                ? `${case_.publicProsecutorMemo.substring(0, 100)}...`
                : case_.publicProsecutorMemo
              }
            </div>
          </div>
        )}

        {/* Relevance Score (if available) */}
        {case_.relevanceScore && (
          <div className="text-xs text-muted-foreground">
            Relevance: {Math.round(case_.relevanceScore * 100)}%
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              handleCardClick();
            }}
          >
            <Eye className="h-4 w-4 mr-2" />
            View Case Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
