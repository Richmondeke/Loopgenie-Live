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
import { AdminDashboard } from './components/AdminDashboard'; // NEW IMPORT
import { AppView, Template, Project, ProjectStatus } from './types';
import { generateVideo, checkVideoStatus, getAvatars, getVoices } from './services/heygenService';
import { fetchProjects, saveProject, updateProjectStatus, deductCredits, refundCredits, addCredits } from './services/projectService';
import { signOut, getSession, onAuthStateChange, getUserProfile } from './services/authService';
import { Menu, Loader2 } from 'lucide-react';
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

  const loadProfile = async (userId: string) => {
      const profile = await getUserProfile(userId);
      if (profile) {
          setUserProfile(profile);
          setUserCredits(profile.credits_balance);
      }
  };

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
      fetchProjects().then(setProjects);
    }
  }, [session]);

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
      setUserProfile(null); // Clear profile
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
        if (data.isDirectSave) {
            let idPrefix = 'ugc_';
            if (data.type === 'STORYBOOK') idPrefix = 'stor_';
            else if (data.type === 'SHORTS') idPrefix = 'short_';
            else if (data.type === 'IMAGE_TO_VIDEO') idPrefix = 'imgv_';
            else if (data.type === 'TEXT_TO_VIDEO') idPrefix = 'txtv_';
            else if (data.type === 'AUDIOBOOK') idPrefix = 'aud_';
            else if (data.type === 'FASHION_SHOOT') idPrefix = 'fash_';

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
            />
        );
      case AppView.PROJECTS:
        return <ProjectList projects={projects} onPollStatus={pollStatuses} />;
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
          <div className="h-screen flex items-center justify-center bg-gray-50">
              <Loader2 className="animate-spin text-indigo-600" size={48} />
          </div>
      );
  }

  if (isRecoveryMode) return <UpdatePassword />;

  if (!session) {
      if (authView) return <Auth key={authView} initialView={authView} onBack={() => setAuthView(null)} />;
      return <LandingPage onLogin={() => setAuthView('LOGIN')} onSignup={() => setAuthView('SIGNUP')} />;
  }

  return (
    <div className="flex h-screen bg-background relative">
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
        isAdmin={userProfile?.isAdmin} // Pass admin status to sidebar
      />

      <main className="flex-1 overflow-hidden flex flex-col relative">
        <header className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between">
             <div className="font-bold text-gray-900">LoopGenie</div>
             <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-gray-600">
                <Menu />
             </button>
        </header>
        <div className="flex-1 overflow-hidden p-6">
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