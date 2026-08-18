'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Send, Loader2, Bot, Search, Briefcase, Sparkles, History, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';
import ChatMessage from './ChatMessage';
import ChatHistoryPanel from './ChatHistoryPanel';

export default function ChatContent() {
  const { data: session } = useSession();
  const { t, isRTL, locale } = useTranslations();

  // State
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [loadingDocumentId, setLoadingDocumentId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [conversationCursor, setConversationCursor] = useState(null);
  const [messageCursor, setMessageCursor] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [loadingConversationId, setLoadingConversationId] = useState(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDesktopHistoryOpen, setIsDesktopHistoryOpen] = useState(false);

  // Refs
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversation = useCallback(async (conversationId) => {
    setIsHistoryOpen(false);
    setIsDesktopHistoryOpen(false);
    setLoadingConversationId(conversationId);
    setIsLoadingMessages(true);
    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}?limit=50`);
      if (!response.ok) {
        throw new Error(`Failed to load conversation: ${response.status}`);
      }

      const data = await response.json();
      setActiveConversationId(conversationId);
      setMessages(data.messages || []);
      setMessageCursor(data.nextCursor || null);
      const latestAssistant = [...(data.messages || [])].reverse().find(message => message.role === 'assistant');
      setSuggestedQuestions(latestAssistant?.suggestedQuestions || []);
      setIsHistoryOpen(false);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setLoadingConversationId(null);
      setIsLoadingMessages(false);
    }
  }, []);

  const loadConversationList = useCallback(async ({ cursor = null, append = false } = {}) => {
    setIsLoadingHistory(true);
    try {
      const query = new URLSearchParams({ limit: '20' });
      if (cursor) query.set('cursor', cursor);

      const response = await fetch(`/api/chat/conversations?${query.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to load conversations: ${response.status}`);
      }

      const data = await response.json();
      const nextConversations = data.conversations || [];
      setConversations(previous => append
        ? [...previous, ...nextConversations.filter(item => !previous.some(existing => existing.id === item.id))]
        : nextConversations
      );
      setConversationCursor(data.nextCursor || null);
      return nextConversations;
    } catch (error) {
      console.error('Failed to load chat history:', error);
      return [];
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;

    loadConversationList();
  }, [session?.user?.id, loadConversationList]);

  // Load initial suggestions
  useEffect(() => {
    if (isInitialLoad) {
      loadInitialSuggestions();
      setIsInitialLoad(false);
    }
  }, [isInitialLoad]);

  const loadInitialSuggestions = async () => {
    try {
      // Use localized suggestions instead of API call
      const suggestions = [
        { text: t('chat.initialSuggestions.activeCases'), icon: Briefcase, color: 'text-blue-500', bg: 'bg-blue-50' },
        { text: t('chat.initialSuggestions.highPriorityCases'), icon: Sparkles, color: 'text-amber-500', bg: 'bg-amber-50' },
        { text: t('chat.initialSuggestions.recentCases'), icon: Search, color: 'text-emerald-500', bg: 'bg-emerald-50' }
      ];
      setSuggestedQuestions(suggestions);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e) => {
    setInputMessage(e.target.value);

    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  const sendMessage = async (messageText) => {
    if (!messageText.trim() || isLoading) return;

    const turnId = crypto.randomUUID();
    const userMessage = {
      id: `pending-${turnId}`,
      turnId,
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
      status: 'completed',
    };

    // Add user message immediately
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      // Send to API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          conversationId: activeConversationId,
          turnId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Add assistant response
      setMessages(previous => [
        ...previous.filter(message => message.id !== userMessage.id),
        data.userMessage,
        data.assistantMessage,
      ]);
      setActiveConversationId(data.conversation.id);
      setConversations(previous => [
        data.conversation,
        ...previous.filter(conversation => conversation.id !== data.conversation.id),
      ]);
      // Keep suggested questions as strings for follow-ups
      setSuggestedQuestions(data.suggestedQuestions || []);

    } catch (error) {
      console.error('Error sending message:', error);

      // Add error message
      const errorMessage = {
        id: `error-${turnId}`,
        turnId,
        role: 'assistant',
        content: t('chat.error'),
        timestamp: new Date().toISOString(),
        status: 'error',
        results: { cases: [], documents: [] },
        suggestedQuestions: [
          "Show me all my cases",
          "Find high priority cases",
          "Which cases are active?",
          "Show me recent cases",
          "Search for documents",
          "Find cases by category"
        ]
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(inputMessage);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputMessage);
    }
  };

  const handleSuggestedQuestionClick = (question) => {
    // Handle both object (initial) and string (follow-up) suggestions
    const text = typeof question === 'string' ? question : question.text;
    setInputMessage(text);
    inputRef.current?.focus();
  };

  const handleCaseClick = (case_) => {
    // Navigate to case details or open case modal
    console.log('Case clicked:', case_);
    // You can implement navigation here
    // router.push(`/cases/${case_.id}`);
  };

  const handleDocumentClick = async (document) => {
    if (!document) {
      return;
    }

    // Set loading state
    setLoadingDocumentId(document.id);

    try {
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
            const documentId = document.documentId;
            const originalName = document.originalName || document.fileName;
            const fileExt = originalName.split('.').pop();
            const fileName = `${documentId}.${fileExt}`;

            // Construct the file path in the format: cases/{serialNumber}/documents/{documentId}.{ext}
            filePath = `cases/${serialNumber}/documents/${fileName}`;
          } else {
            throw new Error(`Failed to get case details: ${caseResponse.status}`);
          }
        } catch (error) {
          // Try to extract case number from document text as fallback
          const caseNumberMatch = document.text?.match(/Case Number:\s*([A-Z0-9-]+)/i);
          if (caseNumberMatch) {
            const caseNumber = caseNumberMatch[1];
            const documentId = document.documentId;
            const originalName = document.originalName || document.fileName;
            const fileExt = originalName.split('.').pop();
            const fileName = `${documentId}.${fileExt}`;
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

      const response = await fetch('/api/documents/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath }),
      });

      if (response.ok) {
        const { url } = await response.json();
        window.open(url, '_blank', 'noopener');
      } else {
        const errorData = await response.json();
        alert('Failed to load document: ' + (errorData.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Failed to load document: ' + error.message);
    } finally {
      // Clear loading state
      setLoadingDocumentId(null);
    }
  };

  const startNewChat = () => {
    setLoadingConversationId(null);
    setIsLoadingMessages(false);
    setActiveConversationId(null);
    setMessages([]);
    setMessageCursor(null);
    setSuggestedQuestions([]);
    loadInitialSuggestions();
    setIsHistoryOpen(false);
  };

  const loadOlderMessages = async () => {
    if (!activeConversationId || !messageCursor || isLoadingMessages) return;

    setIsLoadingMessages(true);
    try {
      const response = await fetch(
        `/api/chat/conversations/${activeConversationId}?limit=50&cursor=${encodeURIComponent(messageCursor)}`
      );
      if (!response.ok) {
        throw new Error(`Failed to load older messages: ${response.status}`);
      }

      const data = await response.json();
      setMessages(previous => [...(data.messages || []), ...previous]);
      setMessageCursor(data.nextCursor || null);
    } catch (error) {
      console.error('Failed to load older messages:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const deleteConversation = async (conversationId) => {
    if (!window.confirm(t('chat.history.confirmDelete'))) return;

    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`Failed to delete conversation: ${response.status}`);
      }

      const remaining = conversations.filter(conversation => conversation.id !== conversationId);
      setConversations(remaining);

      if (activeConversationId === conversationId) {
        if (remaining.length > 0) {
          await loadConversation(remaining[0].id);
        } else {
          startNewChat();
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      window.alert(t('chat.history.deleteError'));
    }
  };

  const historyLabels = {
    history: t('chat.history.title'),
    newChat: t('chat.history.newChat'),
    loadingHistory: t('chat.history.loading'),
    noHistory: t('chat.history.empty'),
    deleteChat: t('chat.history.delete'),
    loadMore: t('chat.history.loadMore'),
    closeHistory: t('chat.history.close'),
  };

  const historyPanel = (
    <ChatHistoryPanel
      conversations={conversations}
      activeConversationId={activeConversationId}
      loadingConversationId={loadingConversationId}
      isLoading={isLoadingHistory}
      disabled={isLoading || isLoadingMessages}
      hasMore={Boolean(conversationCursor)}
      locale={locale}
      labels={historyLabels}
      onNewChat={startNewChat}
      onSelect={loadConversation}
      onDelete={deleteConversation}
      onLoadMore={() => loadConversationList({ cursor: conversationCursor, append: true })}
      onClose={() => {
        setIsHistoryOpen(false);
        setIsDesktopHistoryOpen(false);
      }}
    />
  );

  return (
    <div className={`h-screen w-full bg-slate-50/80 ${isRTL ? 'rtl' : 'ltr'}`}>
      <div className="flex h-full min-h-0">
        <aside className={cn(
          'hidden w-72 shrink-0 border-gray-200',
          isDesktopHistoryOpen ? 'xl:block' : 'xl:hidden',
          isRTL ? 'border-l' : 'border-r'
        )}>
          {historyPanel}
        </aside>

        <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <SheetContent
            side={isRTL ? 'right' : 'left'}
            className="gap-0 p-0 xl:hidden"
            showCloseButton={false}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t('chat.history.title')}</SheetTitle>
            </SheetHeader>
            {historyPanel}
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
      {/* Header - Sticky at top */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/50 px-6 py-4 flex-shrink-0 transition-all duration-200">
        <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 xl:hidden"
              onClick={() => setIsHistoryOpen(true)}
              aria-label={t('chat.history.title')}
            >
              <History className="h-5 w-5" />
            </Button>
            {!isDesktopHistoryOpen && (
              <Button
                variant="ghost"
                size="icon"
                className="hidden shrink-0 xl:inline-flex"
                onClick={() => setIsDesktopHistoryOpen(true)}
                aria-label={t('chat.history.title')}
              >
                <History className="h-5 w-5" />
              </Button>
            )}
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center ring-1 ring-black/5">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div className={`min-w-0 ${isRTL ? 'text-right' : 'text-left'}`}>
              <h1 className="truncate text-lg font-bold text-gray-900 tracking-tight">
                {activeConversationId
                  ? conversations.find(conversation => conversation.id === activeConversationId)?.title || t('chat.title')
                  : t('chat.title')}
              </h1>
              <p className="text-xs font-medium text-gray-500">{t('chat.subtitle')}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={startNewChat}
            disabled={isLoading || isLoadingMessages}
            className="gap-2 text-gray-500 transition-colors hover:text-primary"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('chat.history.newChat')}</span>
          </Button>
        </div>
      </div>

      {/* Messages Area - Scrollable */}
      <div className="relative flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
            {loadingConversationId ? (
              <div className="flex min-h-[500px] items-center justify-center px-4">
                <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-5 py-3 text-sm font-medium text-gray-600 shadow-lg">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  {t('chat.history.loadingConversation')}
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[500px] text-center px-4 animate-in fade-in zoom-in-95 duration-500">
                <div className="mb-10 relative">
                  <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full opacity-50"></div>
                  <div className="w-24 h-24 bg-white rounded-3xl shadow-xl ring-1 ring-black/5 flex items-center justify-center mx-auto relative z-10">
                    <Bot className="h-12 w-12 text-primary" />
                  </div>
                </div>

                <h3 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">
                  {t('chat.welcome.title')}
                </h3>
                <p className="text-gray-500 mb-10 max-w-md text-base leading-relaxed">
                  {t('chat.welcome.description')}
                </p>

                {/* Initial Suggestions Grid */}
                {suggestedQuestions.length > 0 && (
                  <div className="w-full max-w-2xl">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                      {t('chat.suggestions.title')}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {suggestedQuestions.map((item, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestedQuestionClick(item)}
                          className="group flex flex-col items-center p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 text-center h-full"
                        >
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors", item.bg)}>
                            <item.icon className={cn("h-5 w-5", item.color)} />
                          </div>
                          <span className="text-sm font-medium text-gray-700 group-hover:text-primary transition-colors">
                            {item.text}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6 pb-4">
                {messageCursor && (
                  <div className="flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isLoadingMessages}
                      onClick={loadOlderMessages}
                    >
                      {isLoadingMessages && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('chat.history.olderMessages')}
                    </Button>
                  </div>
                )}
                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message.content}
                    role={message.role}
                    timestamp={message.timestamp}
                    results={message.results}
                    suggestedQuestions={message.suggestedQuestions}
                    onSuggestedQuestionClick={handleSuggestedQuestionClick}
                    onCaseClick={handleCaseClick}
                    onDocumentClick={handleDocumentClick}
                    loadingDocumentId={loadingDocumentId}
                  />
                ))}
                {isLoading && (
                  <div className="flex gap-3 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="bg-muted/40 backdrop-blur-sm border border-border/50 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-1 h-6">
                        <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce"></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input Area - Floating Glass Pill */}
      <div className="sticky bottom-0 z-10 px-4 pb-6 pt-2 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="relative flex items-end gap-2 bg-white border border-gray-100 shadow-2xl shadow-gray-200/50 rounded-[2rem] p-2 ring-1 ring-black/5 transition-all duration-300 focus-within:ring-primary/20 focus-within:shadow-primary/5">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.input.placeholder')}
              disabled={isLoading || isLoadingMessages}
              rows={1}
              className="flex-1 max-h-[120px] min-h-[44px] py-3 px-4 bg-transparent border-0 focus:ring-0 outline-none resize-none placeholder:text-muted-foreground/70 text-base sm:text-sm leading-relaxed [&::-webkit-scrollbar]:hidden"
              style={{ height: '44px' }}
            />
            <Button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              size="icon"
              className={cn(
                "h-10 w-10 rounded-full transition-all duration-300 shrink-0 mb-0.5 mr-0.5",
                inputMessage.trim() && !isLoading
                  ? "bg-primary text-primary-foreground shadow-md hover:shadow-lg hover:scale-105"
                  : "bg-muted text-muted-foreground hover:bg-muted"
              )}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5 ml-0.5" />
              )}
            </Button>
          </form>
          <div className="text-center mt-2">
            <p className="text-[10px] text-muted-foreground/60">
              AI can make mistakes. Please verify important information.
            </p>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
