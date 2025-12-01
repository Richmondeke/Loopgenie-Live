import React from 'react';
import { LayoutTemplate, Video, FolderOpen, Settings, HelpCircle, Upload, LogOut, Coins, PlusCircle, ShieldCheck, Users, Sun, Moon } from 'lucide-react';
import { AppView } from '../types';

interface SidebarProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
  isMobileOpen: boolean;
  toggleMobileMenu: () => void;
  onSignOut?: () => void;
  credits: number;
  onOpenUpgrade: () => void;
  isAdmin?: boolean; 
  isDarkMode?: boolean;
  toggleTheme?: () => void;
}

const NavItem: React.FC<{
  view: AppView;
  current: AppView;
  icon: React.ReactNode;
  label: string;
  onClick: (v: AppView) => void;
  extraClass?: string;
}> = ({ view, current, icon, label, onClick, extraClass }) => {
  const isActive = view === current;
  return (
    <button
      onClick={() => onClick(view)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium ${
        isActive
          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
      } ${extraClass || ''}`}
    >
      {React.cloneElement(icon as React.ReactElement, { size: 20 })}
      <span>{label}</span>
    </button>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, isMobileOpen, toggleMobileMenu, onSignOut, credits, onOpenUpgrade, isAdmin, isDarkMode, toggleTheme }) => {
  return (
    <>
       {/* Mobile Overlay */}
       {isMobileOpen && (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
            onClick={toggleMobileMenu}
        />
      )}

      <div className={`fixed inset-y-0 left-0 transform ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static z-30 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-transform duration-200 ease-in-out`}>
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center">
            <svg viewBox="0 0 100 50" className="w-full h-full drop-shadow-md">
                <defs>
                    <linearGradient id="sidebar_grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#4f46e5" />
                        <stop offset="100%" stopColor="#9333ea" />
                    </linearGradient>
                </defs>
                <path 
                    fill="none" 
                    stroke="url(#sidebar_grad)" 
                    strokeWidth="10" 
                    strokeLinecap="round"
                    className="animate-draw"
                    strokeDasharray="250"
                    d="M20,25 C20,5 45,5 50,25 C55,45 80,45 80,25 C80,5 55,5 50,25 C45,45 20,45 20,25 z"
                />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">LoopGenie</h1>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-4 mt-2">
            Create
          </div>
          <NavItem
            view={AppView.TEMPLATES}
            current={currentView}
            icon={<LayoutTemplate />}
            label="Templates"
            onClick={onChangeView}
          />
          <NavItem
            view={AppView.ASSETS}
            current={currentView}
            icon={<Upload />}
            label="Assets"
            onClick={onChangeView}
          />

          <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-4 mt-6">
            Manage
          </div>
          <NavItem
            view={AppView.PROJECTS}
            current={currentView}
            icon={<FolderOpen />}
            label="My Projects"
            onClick={onChangeView}
          />

          {isAdmin && (
            <>
              <div className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2 px-4 mt-6">
                Admin
              </div>
              <NavItem
                view={AppView.ADMIN}
                current={currentView}
                icon={<ShieldCheck className="text-purple-600 dark:text-purple-400" />}
                label="Dashboard"
                onClick={onChangeView}
                extraClass="bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-100 dark:border-purple-900/50"
              />
              <NavItem
                view={AppView.ADMIN_USERS}
                current={currentView}
                icon={<Users className="text-purple-600 dark:text-purple-400" />}
                label="Users & Credits"
                onClick={onChangeView}
                extraClass="bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-100 dark:border-purple-900/50 mt-1"
              />
            </>
          )}

          <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-4 mt-6">
            System
          </div>
          <NavItem
            view={AppView.SETTINGS}
            current={currentView}
            icon={<Settings />}
            label="Settings"
            onClick={onChangeView}
          />
          <NavItem
            view={AppView.HELP}
            current={currentView}
            icon={<HelpCircle />}
            label="Help & Docs"
            onClick={onChangeView}
          />
        </nav>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
           
           {toggleTheme && (
               <button 
                  onClick={toggleTheme}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium text-sm"
               >
                  {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                  <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
               </button>
           )}

           {onSignOut && (
               <button 
                  onClick={onSignOut}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-400 transition-colors font-medium text-sm"
               >
                  <LogOut size={18} />
                  <span>Sign Out</span>
               </button>
           )}

           <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/30 dark:to-blue-900/30 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800 shadow-sm relative overflow-hidden group">
             <div className="flex items-center gap-2 mb-2 relative z-10">
                <div className="bg-indigo-100 dark:bg-indigo-800 p-1.5 rounded-md text-indigo-600 dark:text-indigo-300">
                    <Coins size={16} />
                </div>
                <div className="text-xs text-indigo-900 dark:text-indigo-200 font-bold uppercase tracking-wider">Credits Available</div>
             </div>
             
             <div className="flex items-end gap-1 mb-3 relative z-10">
                <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 leading-none">{credits}</span>
             </div>

             <button 
                onClick={onOpenUpgrade}
                className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-bold py-2 rounded-lg shadow-sm flex items-center justify-center gap-1 transition-colors relative z-10"
             >
                <PlusCircle size={14} /> Get Credits
             </button>
             
             {/* Decorative shimmer */}
             <div className="absolute top-0 right-0 w-16 h-16 bg-white opacity-20 rounded-full blur-xl transform translate-x-4 -translate-y-4 pointer-events-none" />
           </div>
        </div>
      </div>
    </>
  );
};