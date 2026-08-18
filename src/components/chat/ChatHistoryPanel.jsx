'use client';

import { History, Loader2, MessageSquare, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export default function ChatHistoryPanel({
  conversations,
  activeConversationId,
  loadingConversationId,
  isLoading,
  disabled,
  hasMore,
  locale,
  labels,
  onNewChat,
  onSelect,
  onDelete,
  onLoadMore,
  onClose,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-gray-200 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-900">
            <History className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{labels.history}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-gray-500"
            aria-label={labels.closeHistory}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Button className="w-full gap-2" disabled={disabled} onClick={onNewChat}>
          <Plus className="h-4 w-4" />
          {labels.newChat}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1.5 p-3">
          {isLoading && conversations.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {labels.loadingHistory}
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-gray-500">
              <MessageSquare className="mx-auto mb-3 h-8 w-8 text-gray-300" />
              {labels.noHistory}
            </div>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  'group flex w-full items-start rounded-xl transition-colors',
                  activeConversationId === conversation.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(conversation.id)}
                  className="flex min-w-0 flex-1 items-start gap-2 px-3 py-3 text-start disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingConversationId === conversation.id ? (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{conversation.title}</span>
                    <span className="mt-1 block text-xs text-gray-400">
                      {new Date(conversation.lastMessageAt).toLocaleDateString(locale)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={labels.deleteChat}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(conversation.id);
                  }}
                  className="mt-2.5 me-2 rounded-md p-1 text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}

          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={isLoading || disabled}
              onClick={onLoadMore}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {labels.loadMore}
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
