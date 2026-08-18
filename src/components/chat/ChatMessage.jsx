'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Bot, User, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { useTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { parseBoldMarkdown } from '@/lib/markdown';
import { documentService } from '@/services/cases';

export default function ChatMessage({
  message,
  role,
  timestamp,
  results = null,
  suggestedQuestions = [],
  onSuggestedQuestionClick,
  onCaseClick,
  onDocumentClick,
  loadingDocumentId,
  className
}) {
  const { t, isRTL } = useTranslations();
  const [previewLoadingId, setPreviewLoadingId] = useState(null);

  const handleSuggestedQuestionClick = (question) => {
    if (onSuggestedQuestionClick) {
      onSuggestedQuestionClick(question);
    }
  };

  const handleCaseClick = (case_) => {
    if (onCaseClick) {
      onCaseClick(case_);
    }
  };

  const handleViewDocument = async (document) => {
    if (!document) {
      return;
    }

    if (onDocumentClick) {
      onDocumentClick(document);
      return;
    }

    // Use the same logic as CaseForm.jsx
    if (document.file) {
      // Handle new file uploads (not applicable in chat context)
      const blobUrl = URL.createObjectURL(document.file);
      window.open(blobUrl, '_blank', 'noopener');
      return;
    }

    // Check for file path - try different possible properties
    let filePath = document.filePath;

    // If no filePath, try to construct it from available data
    if (!filePath || filePath === 'unknown') {
      try {
        // Get case details to construct the proper file path
        const caseResponse = await fetch(`/api/cases/${document.caseId}`);

        if (caseResponse.ok) {
          const caseData = await caseResponse.json();
          const serialNumber = caseData.serialNumber;
          const fileName = document.fileName || document.originalName;

          // Construct the file path in the format: cases/{serialNumber}/documents/{fileName}
          filePath = `cases/${serialNumber}/documents/${fileName}`;
        } else {
          throw new Error(`Failed to get case details: ${caseResponse.status}`);
        }
      } catch (error) {
        // Try to extract case number from document text as fallback
        const caseNumberMatch = document.text?.match(/Case Number:\s*([A-Z0-9-]+)/i);
        if (caseNumberMatch) {
          const caseNumber = caseNumberMatch[1];
          const fileName = document.fileName || document.originalName;
          filePath = `cases/${caseNumber}/documents/${fileName}`;
        } else {
          // Final fallback to just using the fileName
          filePath = document.fileName || document.originalName;
        }
      }

      if (!filePath || filePath === 'unknown') {
        alert('Document file path not available. This document may need to be reprocessed.');
        return;
      }
    }

    try {
      setPreviewLoadingId(document.id);
      const url = await documentService.getDocumentUrl(filePath);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      alert('Failed to load document: ' + error.message);
    } finally {
      setPreviewLoadingId(null);
    }
  };


  const isUser = role === 'user';
  const isAssistant = role === 'assistant';

  return (
    <div className={cn(
      "flex gap-2 mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300 group",
      isUser ? "flex-row-reverse" : "flex-row",
      isRTL ? "rtl" : "ltr",
      className
    )}>
      {/* Avatar */}
      <Avatar className={cn(
        "h-8 w-8 flex-shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-105",
        isUser ? "mt-1" : "mt-1"
      )}>
        {isUser ? (
          <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
            <User className="h-4 w-4" />
          </AvatarFallback>
        ) : (
          <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        )}
      </Avatar>

      {/* Message Content */}
      <div className={cn(
        "flex flex-col space-y-2 max-w-[85%] sm:max-w-[80%]",
        isUser ? "items-end" : "items-start"
      )}>
        {/* Message Bubble */}
        <div className={cn(
          "px-4 py-3 shadow-sm transition-all duration-200 w-fit",
          isUser
            ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
            : "bg-white/80 backdrop-blur-sm border border-border/40 text-foreground rounded-2xl rounded-bl-sm"
        )}>
          <div className={cn(
            "whitespace-pre-wrap text-sm leading-relaxed break-words",
            isRTL ? "text-right" : "text-left"
          )}>
            {isAssistant
              ? parseBoldMarkdown(message).map((segment, index) => (
                segment.bold
                  ? <strong key={index} className="font-semibold">{segment.text}</strong>
                  : segment.text
              ))
              : message}
          </div>
        </div>

        {/* Suggested Questions (Assistant only) */}
        {isAssistant && suggestedQuestions && suggestedQuestions.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/30 space-y-3 animate-in fade-in duration-500 delay-150">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground/80 px-1">
              <Sparkles className="w-3 h-3 text-primary/70" />
              <span>Suggested follow-ups</span>
            </div>
            <div className="flex flex-col gap-2">
              {suggestedQuestions.slice(0, 3).map((question, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestedQuestionClick(question)}
                  className="group flex items-center justify-between w-full text-left text-sm p-3 rounded-xl bg-white/50 border border-border/50 hover:bg-white hover:border-primary/20 hover:shadow-sm transition-all duration-200"
                >
                  <span className="text-gray-700 group-hover:text-primary transition-colors line-clamp-1">
                    {question}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results Section (Assistant only) */}
        {isAssistant && results && results.documents && results.documents.length > 0 && (
          <div className="mt-3 space-y-3 animate-in fade-in duration-500 delay-300">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
              <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
              <span>{t('chat.documents.relatedDocuments')} ({results.documents.length})</span>
            </div>

            {/* Horizontal Scrollable List */}
            <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide snap-x">
              {results.documents.map((document, index) => (
                <div
                  key={document.id}
                  className="flex-none w-[280px] snap-center bg-white border border-border/60 rounded-xl p-3 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer group/card"
                  onClick={() => handleViewDocument(document)}
                >
                  <div className="flex flex-col h-full gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 text-primary group-hover/card:scale-110 transition-transform duration-200">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-medium text-sm text-foreground truncate" title={document.title}>{document.title}</h4>
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            {document.documentType}
                          </span>
                        </div>
                      </div>
                      {loadingDocumentId === document.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <div className="opacity-0 group-hover/card:opacity-100 transition-opacity text-primary">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {document.excerpt && (
                      <div className="mt-auto pt-2 border-t border-border/30">
                        <p className="text-xs text-muted-foreground line-clamp-2 italic">
                          "{document.excerpt}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div className={cn(
          "text-[10px] text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 px-1",
          isUser ? "text-right" : "text-left"
        )}>
          {timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
        </div>
      </div>
    </div>
  );
}
