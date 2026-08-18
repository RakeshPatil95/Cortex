'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/translations';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  MessageSquare,
  Search,
  LogOut,
  Menu,
  X,
  User,
  ChevronsUpDown,
} from 'lucide-react';

export default function Sidebar({ user, onSignOut }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { t, isRTL, locale } = useTranslations();

  // Debug: Log sidebar props
  console.log('Sidebar - User:', user, 'Pathname:', pathname, 'Locale:', locale);

  const navigation = [
    {
      name: t('navigation.dashboard'),
      href: `/${locale}/dashboard`,
      icon: LayoutDashboard,
    },
    {
      name: t('navigation.chat'),
      href: `/${locale}/chat`,
      icon: MessageSquare,
    },
    {
      name: t('navigation.search'),
      href: `/${locale}/search`,
      icon: Search,
    },
  ];

  return (
    <>
      {/* Mobile menu button */}
      <div className={`lg:hidden fixed top-4 z-50 ${isRTL ? 'left-4' : 'right-4'}`}>
        <Button
          variant="outline"
          size="sm"
          className="bg-background border-border shadow-sm"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 z-50 w-64 bg-sidebar border-border transform transition-transform duration-200 ease-in-out shadow-sm lg:shadow-none',
          isRTL
            ? 'right-0 border-l'
            : 'left-0 border-r',
          isOpen
            ? 'translate-x-0'
            : isRTL
              ? 'translate-x-full lg:translate-x-0'
              : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className={`flex items-center justify-between h-16 px-4 border-b border-sidebar-border/50 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 bg-sidebar-primary/10 rounded-lg flex items-center justify-center">
                <div className="h-4 w-4 bg-sidebar-primary rounded-sm" />
              </div>
              <h1 className="text-base font-semibold text-sidebar-foreground tracking-tight">{t('brand.name')}</h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 px-3 py-6">
            <nav className="space-y-1.5">
              {navigation.map((item) => {
                const isActive = pathname === item.href || pathname.endsWith(item.href.split('/').pop());
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                        : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/5 hover:text-sidebar-foreground',
                      isRTL ? 'flex-row-reverse' : ''
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <item.icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        isRTL ? 'ml-2.5' : 'mr-2.5',
                        isActive ? 'text-sidebar-accent-foreground' : 'text-sidebar-muted-foreground group-hover:text-sidebar-foreground'
                      )}
                    />
                    {item.name}
                    {isActive && (
                      <div
                        className={cn(
                          'absolute w-1 h-5 bg-sidebar-primary rounded-full',
                          isRTL ? 'right-0' : 'left-0',
                          'opacity-0 lg:opacity-100' // Only show on desktop to avoid overlap with padding
                        )}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>

          {/* Footer / User Profile */}
          <div className="p-4 border-t border-sidebar-border/50 bg-sidebar/50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full h-auto p-2 hover:bg-sidebar-accent/5 justify-start",
                    isRTL ? 'flex-row-reverse' : ''
                  )}
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="h-9 w-9 rounded-lg bg-sidebar-muted flex items-center justify-center border border-sidebar-border shadow-sm">
                      <User className="h-4 w-4 text-sidebar-muted-foreground" />
                    </div>
                    <div className={cn("flex flex-col items-start flex-1 min-w-0", isRTL ? "items-end text-right" : "items-start text-left")}>
                      <span className="text-sm font-medium text-sidebar-foreground truncate w-full">
                        {user?.name || 'User'}
                      </span>
                      <span className="text-xs text-sidebar-muted-foreground truncate w-full">
                        {user?.email}
                      </span>
                    </div>
                    <ChevronsUpDown className="h-4 w-4 text-sidebar-muted-foreground shrink-0" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                align="end"
                side="top"
                sideOffset={8}
              >
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onSignOut}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                >
                  <LogOut className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                  <span>{t('navigation.signOut')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </>
  );
}
