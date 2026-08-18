'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { caseService } from '@/services/cases';
import { useTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { Upload, FileText, Loader2, AlertCircle, Sparkles } from 'lucide-react';

const ACCEPTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt'];
const ACCEPT_ATTR = '.pdf,.doc,.docx,.txt';

/**
 * Upload-first step for creating a case. The user drops a single document; we
 * extract case fields + parties via the LLM and hand them back to the parent to
 * pre-fill the form. `onExtracted({ fields, parties, file, warnings })` fires on
 * success (the file is passed through so it can be attached to the case);
 * `onSkip()` lets the user go straight to a blank form.
 */
export default function CaseAutofillUpload({ onExtracted, onSkip }) {
  const { locale } = useTranslations();
  const fileInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState('');

  const isSupported = (file) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(ext);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError('');

    if (!isSupported(file)) {
      setError('Unsupported file type. Please upload a PDF, DOC, DOCX, or TXT file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum size is 10MB.');
      return;
    }

    setIsExtracting(true);
    try {
      const result = await caseService.extractCaseFromDocument(file, locale);
      onExtracted?.({
        fields: result?.fields || {},
        parties: result?.parties || [],
        document: result?.document || null,
        warnings: result?.warnings || [],
        file,
      });
    } catch (err) {
      console.error('Auto-fill extraction failed:', err);
      setError(err.message || 'Could not read the document. You can try again or enter details manually.');
      setIsExtracting(false);
    }
  };

  const handleInputChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    handleFile(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    if (isExtracting) return;
    const file = event.dataTransfer.files?.[0];
    handleFile(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Auto-fill from a document
        </CardTitle>
        <CardDescription>
          Upload a case document and we&apos;ll pre-fill the form for you to review. You can also skip this and enter details manually.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div
          role="button"
          tabIndex={0}
          onClick={() => !isExtracting && fileInputRef.current?.click()}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isExtracting) fileInputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); if (!isExtracting) setIsDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors',
            isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
            isExtracting ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:border-primary/50',
          )}
        >
          {isExtracting ? (
            <>
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Reading the document…</p>
              <p className="mt-1 text-xs text-muted-foreground">Extracting case details. This can take a few seconds.</p>
            </>
          ) : (
            <>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Drop a document here, or click to browse</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> PDF, DOC, DOCX or TXT · up to 10MB
              </p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={handleInputChange}
            disabled={isExtracting}
          />
        </div>

        <div className="flex justify-center">
          <Button type="button" variant="ghost" onClick={onSkip} disabled={isExtracting}>
            Enter details manually
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
