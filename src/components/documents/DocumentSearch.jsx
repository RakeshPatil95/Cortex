'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, FileText, Loader2 } from 'lucide-react';
import { caseService } from '@/services/cases';
import { useTranslations } from '@/lib/translations';

export default function DocumentSearch({ caseId, onResultClick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const { t, isRTL } = useTranslations();

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await caseService.searchDocuments(query, {
        caseId: caseId || undefined
      });

      setResults(response.results || []);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            AI Document Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Search documents by content..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button 
              onClick={handleSearch} 
              disabled={isSearching || !query.trim()}
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {hasSearched && (
        <Card>
          <CardHeader>
            <CardTitle>
              Search Results ({results.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No documents found matching your search.
              </p>
            ) : (
              <div className="space-y-3">
                {results.map((result, index) => (
                  <div
                    key={result.id}
                    className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => onResultClick?.(result)}
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-sm">
                            {result.metadata.documentTitle}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {result.metadata.documentType}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {Math.round(result.score * 100)}% match
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {result.text.length > 200 
                            ? `${result.text.substring(0, 200)}...` 
                            : result.text
                          }
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Chunk {result.metadata.chunkIndex + 1}</span>
                          <span>{result.metadata.textLength} characters</span>
                          <span>
                            {new Date(result.metadata.processedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
