
import React from 'react';
import { LayoutTemplate, Video, FolderOpen, Settings, HelpCircle, Upload, LogOut, Coins, PlusCircle } from 'lucide-react';
import { AppView } from '../types';

interface SidebarProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
  isMobileOpen: boolean;
  toggleMobileMenu: () => void;
  onSignOut?: () => void;
  credits: number;
  onOpenUpgrade: () => void;
}

const NavItem: React.FC<{
  view: AppView;
  current: AppView;
  icon: React.ReactNode;
  label: string;
  onClick: (v: AppView) => void;
}> = ({ view, current, icon, label, onClick }) => {
  const isActive = view === current;
  return (
    <button
      onClick={() => onClick(view)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium ${
        isActive
          ? 'bg-indigo-50 text-indigo-700'
          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {React.cloneElement(icon as React.ReactElement, { size: 20 })}
      <span>{label}</span>
    </button>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, isMobileOpen, toggleMobileMenu, onSignOut, credits, onOpenUpgrade }) => {
  return (
    <>
       {/* Mobile Overlay */}
       {isMobileOpen && (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
            onClick={toggleMobileMenu}
        />
      )}

      <div className={`fixed inset-y-0 left-0 transform ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static z-30 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200 ease-in-out`}>
        <div className="p-6 border-b border-gray-100 flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
            L
          </div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">LoopGenie</h1>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-4 mt-2">
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

          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-4 mt-6">
            Manage
          </div>
          <NavItem
            view={AppView.PROJECTS}
            current={currentView}
            icon={<FolderOpen />}
            label="My Projects"
            onClick={onChangeView}
          />

          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-4 mt-6">
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

        <div className="p-4 border-t border-gray-100 space-y-4">
           {onSignOut && (
               <button 
                  onClick={onSignOut}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-700 transition-colors font-medium text-sm"
               >
                  <LogOut size={18} />
                  <span>Sign Out</span>
               </button>
           )}

           <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-4 border border-indigo-100 shadow-sm relative overflow-hidden group">
             <div className="flex items-center gap-2 mb-2 relative z-10">
                <div className="bg-indigo-100 p-1.5 rounded-md text-indigo-600">
                    <Coins size={16} />
                </div>
                <div className="text-xs text-indigo-900 font-bold uppercase tracking-wider">Credits Available</div>
             </div>
             
             <div className="flex items-end gap-1 mb-3 relative z-10">
                <span className="text-3xl font-black text-indigo-600 leading-none">{credits}</span>
             </div>

             <button 
                onClick={onOpenUpgrade}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 rounded-lg shadow-sm flex items-center justify-center gap-1 transition-colors relative z-10"
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
