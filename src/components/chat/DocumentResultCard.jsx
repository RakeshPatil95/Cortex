'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Eye, Calendar, User, Tag, ExternalLink } from 'lucide-react';
import { useTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

export default function DocumentResultCard({ document, onClick, className }) {
  const { t, isRTL } = useTranslations();

  const getDocumentTypeColor = (type) => {
    const typeMap = {
      'legal-document': 'default',
      'evidence': 'destructive',
      'contract': 'secondary',
      'correspondence': 'outline',
      'court-order': 'default',
      'expert-report': 'secondary',
      'financial-record': 'outline',
      'medical-record': 'secondary',
      'witness-statement': 'default',
      'other': 'outline'
    };
    return typeMap[type] || 'outline';
  };

  const getDocumentTypeDisplay = (type) => {
    const typeMap = {
      'legal-document': 'Legal Document',
      'evidence': 'Evidence',
      'contract': 'Contract',
      'correspondence': 'Correspondence',
      'court-order': 'Court Order',
      'expert-report': 'Expert Report',
      'financial-record': 'Financial Record',
      'medical-record': 'Medical Record',
      'witness-statement': 'Witness Statement',
      'other': 'Other'
    };
    return typeMap[type] || type || 'Unknown';
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

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick(document);
    }
  };

  const handlePreviewClick = (e) => {
    e.stopPropagation();
    if (onClick) {
      onClick(document);
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
          <div className="space-y-1 flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold line-clamp-2">
              {document.title || document.originalName}
            </CardTitle>
            <CardDescription className="text-sm line-clamp-1">
              {document.originalName}
            </CardDescription>
          </div>
          <div className="flex gap-2 ml-2">
            <Badge variant={getDocumentTypeColor(document.documentType)}>
              {getDocumentTypeDisplay(document.documentType)}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Document Info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {document.fileType?.toUpperCase() || 'Unknown Type'}
            </span>
            {document.fileSize && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground">
                  {formatFileSize(document.fileSize)}
                </span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Uploaded: {formatDate(document.uploadedAt)}
            </span>
          </div>

          {document.caseId && (
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Case: {document.caseId}
              </span>
            </div>
          )}
        </div>

        {/* Excerpt/Content Preview */}
        {document.excerpt && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Content Preview</div>
            <div className="text-sm text-muted-foreground line-clamp-3 bg-muted/30 p-3 rounded-md">
              {document.excerpt}
            </div>
          </div>
        )}

        {/* Tags (if available) */}
        {document.tags && document.tags.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Tags</div>
            <div className="flex flex-wrap gap-1">
              {document.tags.slice(0, 5).map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {document.tags.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{document.tags.length - 5} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Relevance Score (if available) */}
        {document.relevanceScore && (
          <div className="text-xs text-muted-foreground">
            Relevance: {Math.round(document.relevanceScore * 100)}%
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={handlePreviewClick}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              // Handle external link or download
              console.log('External action for document:', document.id);
            }}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
