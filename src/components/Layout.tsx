import React, { useState } from 'react';
import {
  BarChart3,
  ClipboardCheck,
  Cloud,
  CloudOff,
  Database,
  FileSpreadsheet,
  Headphones,
  History,
  Link2,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { SyncStatus, User } from '../types';

export type NavTab =
  | 'admin-overview'
  | 'admin-final-summary'
  | 'admin-leads'
  | 'data-collection'
  | 'kawsar-posts'
  | 'admin-audit'
  | 'admin-sheets'
  | 'agent-workspace';

interface LayoutProps {
  user: User;
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onLogout: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  syncStatus: SyncStatus;
  quickStatLabel: string;
  quickStatValue: string;
  children: React.ReactNode;
}

interface NavItem {
  id: NavTab;
  label: string;
  icon: typeof BarChart3;
}

export function Layout({
  user,
  activeTab,
  onSelectTab,
  onLogout,
  theme,
  onToggleTheme,
  syncStatus,
  quickStatLabel,
  quickStatValue,
  children,
}: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: NavItem[] =
    user.role === 'admin'
      ? [
          { id: 'admin-overview', label: 'Analytics & KPIs', icon: BarChart3 },
          { id: 'admin-final-summary', label: 'Final Daily Summary', icon: ClipboardCheck },
          { id: 'admin-leads', label: 'Lead Distribution', icon: Users },
          { id: 'data-collection', label: 'Data Collection', icon: Database },
          { id: 'kawsar-posts', label: 'Kawsar Posts Log', icon: Link2 },
          { id: 'admin-audit', label: 'Audit Logs', icon: History },
          { id: 'admin-sheets', label: 'Google Sheets Sync', icon: FileSpreadsheet },
        ]
      : user.role === 'agent'
      ? [{ id: 'agent-workspace', label: 'My Call Queue', icon: Headphones }]
      : user.role === 'poster'
      ? [{ id: 'kawsar-posts', label: 'Post & Link Tracker', icon: Link2 }]
      : [{ id: 'data-collection', label: 'Lead Collection', icon: Database }];

  const roleLabel =
    user.role === 'admin'
      ? 'Admin / Supervisor'
      : user.role === 'agent'
      ? 'Call Center Agent'
      : user.role === 'poster'
      ? 'Content & Link Poster'
      : 'Data Collector';

  const handleNavClick = (tab: NavTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  const renderSyncIndicator = () => {
    if (syncStatus === 'syncing') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 whitespace-nowrap">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Syncing...</span>
        </span>
      );
    }
    if (syncStatus === 'synced') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
          <Cloud className="w-3.5 h-3.5" />
          <span>Synced</span>
        </span>
      );
    }
    if (syncStatus === 'error') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 whitespace-nowrap">
          <CloudOff className="w-3.5 h-3.5" />
          <span>Sync Error</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
        <CloudOff className="w-3.5 h-3.5" />
        <span>Offline Local Mode</span>
      </span>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
            R
          </div>
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            RunBD
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav aria-label="Main navigation" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-emerald-600/12 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom user card inside sidebar */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs flex items-center justify-center shrink-0">
            {user.avatarInitials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {user.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{roleLabel}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[80vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-50">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Header */}
        <header className="sticky top-0 z-20 h-16 bg-white/90 dark:bg-slate-900/85 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 text-sm font-semibold text-slate-900 dark:text-white min-w-0">
                <span className="truncate">{user.name}</span>
                <span className="text-slate-300 dark:text-slate-700 shrink-0" aria-hidden="true">
                  ·
                </span>
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
                  <span className="sm:hidden">
                    {user.role === 'admin'
                      ? 'Admin'
                      : user.role === 'agent'
                      ? 'Agent'
                      : user.role === 'poster'
                      ? 'Poster'
                      : 'Collector'}
                  </span>
                  <span className="hidden sm:inline">{roleLabel}</span>
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {quickStatLabel}:{' '}
                  <strong className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                    {quickStatValue}
                  </strong>
                </span>
                <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                  ·
                </span>
                {renderSyncIndicator()}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className="sm:hidden inline-flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
              title={
                syncStatus === 'synced'
                  ? 'Synced'
                  : syncStatus === 'syncing'
                  ? 'Syncing...'
                  : syncStatus === 'error'
                  ? 'Sync Error'
                  : 'Offline Local Mode'
              }
              aria-label={
                syncStatus === 'synced'
                  ? 'Synced'
                  : syncStatus === 'syncing'
                  ? 'Syncing'
                  : syncStatus === 'error'
                  ? 'Sync Error'
                  : 'Offline Local Mode'
              }
            >
              {syncStatus === 'synced' ? (
                <Cloud className="w-4 h-4 text-emerald-500" />
              ) : syncStatus === 'syncing' ? (
                <RefreshCw className="w-4 h-4 text-sky-500 animate-spin" />
              ) : syncStatus === 'error' ? (
                <CloudOff className="w-4 h-4 text-rose-500" />
              ) : (
                <CloudOff className="w-4 h-4 text-slate-400" />
              )}
            </span>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-500/30 transition-colors whitespace-nowrap cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
