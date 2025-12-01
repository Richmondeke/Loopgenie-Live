
import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { TemplateGallery } from './components/TemplateGallery';
import { Editor } from './components/Editor';
import { ProjectList } from './components/ProjectList';
import { Settings } from './components/Settings';
import { Auth } from './components/Auth';
import { LandingPage } from './components/LandingPage';
import { UpdatePassword } from './components/UpdatePassword';
import { UpgradeModal } from './components/UpgradeModal';
import { AdminDashboard } from './components/AdminDashboard';
import { Integrations } from './components/Integrations';
import { AppView, Template, Project, ProjectStatus } from './types';
import { generateVideo, checkVideoStatus, getAvatars, getVoices } from './services/heygenService';
import { fetchProjects, saveProject, updateProjectStatus, deductCredits, refundCredits, addCredits } from './services/projectService';
import { signOut, getSession, onAuthStateChange, getUserProfile } from './services/authService';
import { Menu, Loader2, AlertTriangle } from 'lucide-react';
import { DEFAULT_HEYGEN_API_KEY } from './constants';

const STORAGE_KEY_HEYGEN = 'genavatar_heygen_key';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userCredits, setUserCredits] = useState(0);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Navigation State
  const [authView, setAuthView] = useState<'LOGIN' | 'SIGNUP' | null>(null);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  const [currentView, setCurrentView] = useState<AppView>(AppView.TEMPLATES);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [galleryInitialView, setGalleryInitialView] = useState<'DASHBOARD' | 'AVATAR_SELECT'>('DASHBOARD');

  const [projects, setProjects] = useState<Project[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  
  const [heyGenKey, setHeyGenKey] = useState(localStorage.getItem(STORAGE_KEY_HEYGEN) || DEFAULT_HEYGEN_API_KEY);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('loopgenie_theme') === 'dark' || 
               (!localStorage.getItem('loopgenie_theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  // Apply Theme Effect
  useEffect(() => {
    if (isDarkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('loopgenie_theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('loopgenie_theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const loadProfile = async (userId: string) => {
      const profile = await getUserProfile(userId);
      if (profile) {
          setUserProfile(profile);
          setUserCredits(profile.credits_balance);
      }
  };

  const loadProjects = useCallback(async () => {
      setDbError(null);
      const { projects: loaded, error } = await fetchProjects();
      if (error) {
          // If 42P17 (Recursion), it means the Admin policy is broken
          if (error.code === '42P17') {
              setDbError("Database Policy Error: Infinite Recursion Detected. Please run the 'Emergency Fix' script from SCHEMA.md in your Supabase SQL Editor.");
          } else {
              // Just a warning for other errors
              console.warn("Could not fetch projects:", error);
          }
      } else {
          setProjects(loaded);
      }
  }, []);

  useEffect(() => {
    getSession().then(({ data }) => {
        setSession(data.session);
        if (data.session?.user) {
            loadProfile(data.session.user.id);
        }
        setAuthLoading(false);
    }).catch(() => setAuthLoading(false));

    const { data } = onAuthStateChange((event, session) => {
      console.log("Auth Event:", event);
      if (event === 'PASSWORD_RECOVERY') {
          setIsRecoveryMode(true);
      }
      setSession(session);
      if (session?.user) {
        loadProfile(session.user.id);
        setAuthView(null);
      }
      setAuthLoading(false);
    });

    return () => {
        if (data && data.subscription) {
            data.subscription.unsubscribe();
        }
    };
  }, []);

  useEffect(() => {
    if (session && heyGenKey) {
        getAvatars(heyGenKey).catch(e => console.warn("Background avatar fetch failed:", e));
        getVoices(heyGenKey).catch(e => console.warn("Background voice fetch failed:", e));
    }
  }, [session, heyGenKey]);

  useEffect(() => {
    if (session) {
      loadProjects();
    }
  }, [session, loadProjects]);

  useEffect(() => {
    if (heyGenKey) {
        localStorage.setItem(STORAGE_KEY_HEYGEN, heyGenKey);
    }
  }, [heyGenKey]);

  const pollStatuses = useCallback(async () => {
    if (!session) return;
    const activeProjects = projects.filter(p => p.status === ProjectStatus.PROCESSING || p.status === ProjectStatus.PENDING);
    if (activeProjects.length === 0) return;

    const updatedProjects = await Promise.all(activeProjects.map(async (project) => {
        if (project.type === 'UGC_PRODUCT') return project;

        const result = await checkVideoStatus(heyGenKey, project.id);
        
        if (result.status !== project.status || result.videoUrl) {
            await updateProjectStatus(project.id, {
                status: result.status,
                videoUrl: result.videoUrl,
                thumbnailUrl: result.thumbnailUrl,
                error: result.error
            });

            return { 
                ...project, 
                status: result.status,
                videoUrl: result.videoUrl || project.videoUrl,
                thumbnailUrl: result.thumbnailUrl || project.thumbnailUrl,
                error: result.error
            };
        }
        return project;
    }));

    setProjects(prev => prev.map(p => {
        const updated = updatedProjects.find(up => up.id === p.id);
        return updated ? updated : p;
    }));
  }, [projects, heyGenKey, session]);

  useEffect(() => {
    const interval = setInterval(() => {
        pollStatuses();
    }, 5000); 
    return () => clearInterval(interval);
  }, [pollStatuses]);

  const handleSignOut = async () => {
      await signOut();
      setSession(null);
      setUserProfile(null); 
      setProjects([]);
      setCurrentView(AppView.TEMPLATES);
      setAuthView(null);
  };

  const handleSelectTemplate = (template: Template) => {
    if (template.mode === 'AVATAR') {
        setGalleryInitialView('AVATAR_SELECT');
    } else {
        setGalleryInitialView('DASHBOARD');
    }
    setSelectedTemplate(template);
  };

  const handleGenerate = async (data: any) => {
    if (!selectedTemplate || !session) return;
    
    const cost = data.cost || 1;
    if (userCredits < cost) {
        setIsUpgradeModalOpen(true);
        throw new Error("Insufficient credits");
    }

    try {
        setIsGenerating(true);

        const confirmedBalance = await deductCredits(session.user.id, cost);
        if (confirmedBalance !== null) {
            setUserCredits(confirmedBalance);
        } else {
             setUserCredits(prev => Math.max(0, prev - cost));
        }

        let newProject: Project;
        // Construct prefix based on type for persistence
        let idPrefix = 'ugc_';
        if (data.type === 'STORYBOOK') idPrefix = 'stor_';
        else if (data.type === 'SHORTS') idPrefix = 'short_';
        else if (data.type === 'IMAGE_TO_VIDEO') idPrefix = 'imgv_';
        else if (data.type === 'TEXT_TO_VIDEO') idPrefix = 'txtv_';
        else if (data.type === 'AUDIOBOOK') idPrefix = 'aud_';
        else if (data.type === 'FASHION_SHOOT') idPrefix = 'fash_';

        if (data.isDirectSave) {
            newProject = {
                id: `${idPrefix}${Date.now()}`,
                templateId: selectedTemplate.id,
                templateName: data.templateName || selectedTemplate.name,
                thumbnailUrl: data.thumbnailUrl || 'https://via.placeholder.com/640x360?text=Project',
                videoUrl: data.videoUrl,
                status: ProjectStatus.COMPLETED,
                createdAt: Date.now(),
                type: data.type || 'UGC_PRODUCT',
                cost: cost
            };
        } else {
            const jobId = await generateVideo(
                heyGenKey,
                selectedTemplate.id,
                data.variables,
                data.avatarId,
                data.voiceId
            );

            newProject = {
                id: jobId,
                templateId: selectedTemplate.id,
                templateName: selectedTemplate.name,
                thumbnailUrl: selectedTemplate.thumbnailUrl,
                status: ProjectStatus.PENDING,
                createdAt: Date.now(),
                type: 'AVATAR',
                cost: cost
            };
        }

        await saveProject(newProject);
        setProjects(prev => [newProject, ...prev]);
        
        if (data.shouldRedirect !== false) {
             setSelectedTemplate(null);
             setCurrentView(AppView.PROJECTS);
        }

    } catch (error: any) {
        console.error("Generation failed:", error);
        
        try {
            const refundedBalance = await refundCredits(session.user.id, cost);
            if (refundedBalance !== null) {
                setUserCredits(refundedBalance);
            }
        } catch (refundError) {
            console.error("Failed to refund credits:", refundError);
        }

        let msg = error.message;
        if (!msg && typeof error === 'object') {
            try {
                msg = JSON.stringify(error);
            } catch (e) {
                msg = "Unknown error occurred";
            }
        }
        
        alert(`Generation Failed: ${msg}. \n\nCredits have been refunded.`);
        throw error;
    } finally {
        setIsGenerating(false);
    }
  };

  const handlePaymentSuccess = async (amount: number) => {
      if (!session) return;
      try {
          const newBalance = await addCredits(session.user.id, amount);
          if (newBalance !== null) {
              setUserCredits(newBalance);
              alert(`Successfully added ${amount} credits!`);
          }
      } catch (e) {
          console.error("Failed to add credits:", e);
          alert("Payment successful, but failed to update balance. Please contact support.");
      }
  };

  const handleRefreshProjects = () => {
      loadProjects();
  };

  const renderContent = () => {
    if (selectedTemplate && currentView === AppView.TEMPLATES) {
        return (
            <Editor 
                template={selectedTemplate} 
                onBack={() => setSelectedTemplate(null)}
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
                heyGenKey={heyGenKey}
                userCredits={userCredits}
            />
        );
    }

    switch (currentView) {
      case AppView.TEMPLATES:
        return (
            <TemplateGallery 
                onSelectTemplate={handleSelectTemplate} 
                heyGenKey={heyGenKey} 
                initialView={galleryInitialView}
                userProfile={userProfile}
                recentProjects={projects}
            />
        );
      case AppView.PROJECTS:
        return <ProjectList projects={projects} onPollStatus={handleRefreshProjects} />;
      case AppView.ADMIN:
        return <AdminDashboard initialTab="OVERVIEW" />;
      case AppView.ADMIN_USERS:
        return <AdminDashboard initialTab="USERS" />;
      case AppView.SETTINGS:
        return (
            <Settings 
                heyGenKey={heyGenKey} 
                setHeyGenKey={setHeyGenKey} 
            />
        );
      case AppView.INTEGRATIONS:
        return <Integrations />;
      case AppView.ASSETS:
        return <div className="flex items-center justify-center h-full text-gray-400">Assets Management (Coming Soon)</div>;
      case AppView.HELP:
        return <div className="flex items-center justify-center h-full text-gray-400">Documentation & Help (Coming Soon)</div>;
      default:
        return <TemplateGallery onSelectTemplate={handleSelectTemplate} heyGenKey={heyGenKey} />;
    }
  };

  if (authLoading) {
      return (
          <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <Loader2 className="animate-spin text-indigo-600" size={48} />
          </div>
      );
  }

  if (isRecoveryMode) return <UpdatePassword />;

  if (!session) {
      if (authView) return <Auth key={authView} initialView={authView} onBack={() => setAuthView(null)} />;
      return (
        <LandingPage 
            onLogin={() => setAuthView('LOGIN')} 
            onSignup={() => setAuthView('SIGNUP')} 
            isDarkMode={isDarkMode}
            toggleTheme={toggleTheme}
        />
      );
  }

  return (
    <div className="flex h-screen bg-background dark:bg-gray-900 relative transition-colors duration-200">
      <Sidebar 
        currentView={currentView} 
        onChangeView={(view) => {
            setCurrentView(view);
            if (view !== AppView.TEMPLATES) {
                setSelectedTemplate(null);
            }
            setIsMobileMenuOpen(false);
            setGalleryInitialView('DASHBOARD');
        }}
        isMobileOpen={isMobileMenuOpen}
        toggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        onSignOut={handleSignOut}
        credits={userCredits}
        onOpenUpgrade={() => setIsUpgradeModalOpen(true)}
        isAdmin={userProfile?.isAdmin} 
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
      />

      <main className="flex-1 overflow-hidden flex flex-col relative">
        <header className="md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between z-20 relative">
             <div className="font-bold text-gray-900 dark:text-white">LoopGenie</div>
             <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-gray-600 dark:text-gray-300">
                <Menu />
             </button>
        </header>
        
        {/* Error Banner for DB Issues */}
        {dbError && (
            <div className="bg-red-600 text-white p-3 text-sm font-bold flex items-center justify-between shadow-md z-50">
                <div className="flex items-center gap-2">
                    <AlertTriangle size={18} className="text-yellow-300" />
                    <span>{dbError}</span>
                </div>
                <button onClick={() => setDbError(null)} className="bg-white/20 hover:bg-white/30 rounded px-2 py-1 text-xs">Dismiss</button>
            </div>
        )}

        {/* Main Content Area - Updated to allow children to control scroll */}
        <div className="flex-1 relative h-full w-full">
            {renderContent()}
        </div>
      </main>

      {isUpgradeModalOpen && (
        <UpgradeModal 
            onClose={() => setIsUpgradeModalOpen(false)}
            onSuccess={handlePaymentSuccess}
            userEmail={session.user.email || ''}
            userName={userProfile?.full_name || ''}
        />
      )}
    </div>
  );
};

export default App;