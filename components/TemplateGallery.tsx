
import React, { useState, useEffect } from 'react';
import { User, Loader2, ShoppingBag, Clapperboard, Sparkles, Headphones, Image as ImageIcon, BookOpen, Camera, Search, ArrowRight } from 'lucide-react';
import { Template, HeyGenAvatar } from '../types';
import { getAvatars } from '../services/heygenService';

export interface TemplateGalleryProps {
  onSelectTemplate: (template: Template) => void;
  heyGenKey?: string;
  initialView?: 'DASHBOARD' | 'AVATAR_SELECT';
  userProfile?: any;
  recentProjects?: any[];
}

type GalleryView = 'DASHBOARD' | 'AVATAR_SELECT';

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({ onSelectTemplate, heyGenKey, initialView = 'DASHBOARD', userProfile, recentProjects = [] }) => {
  const [view, setView] = useState<GalleryView>(initialView);
  const [avatars, setAvatars] = useState<HeyGenAvatar[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'male' | 'female'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchRealAvatars = async () => {
        if (!heyGenKey && avatars.length > 0) return;
        setIsLoading(true);
        try {
            const realAvatars = await getAvatars(heyGenKey || '');
            setAvatars(realAvatars);
        } catch (e) {
            console.error("Failed to load avatars", e);
            setAvatars([]);
        } finally {
            setIsLoading(false);
        }
    };

    if (view === 'AVATAR_SELECT') {
        fetchRealAvatars();
    }
  }, [heyGenKey, view]);

  const handleSelectAvatar = (avatar: HeyGenAvatar) => {
      const template: Template = {
          id: `custom_avatar_${avatar.id}`,
          name: avatar.name,
          category: 'Avatar',
          thumbnailUrl: avatar.previewUrl,
          defaultAvatarId: avatar.id,
          variables: [{ key: 'script', label: 'Script', type: 'textarea', placeholder: `Hi, I'm ${avatar.name}...` }],
          mode: 'AVATAR'
      };
      onSelectTemplate(template);
  };

  // Tools Configuration with Categories
  const QUICK_TOOLS = [
    {
        id: 'short_maker',
        title: 'ShortMaker',
        desc: 'Viral shorts in seconds',
        icon: <Sparkles size={20} />,
        color: 'bg-pink-500',
        text: 'text-pink-500',
        bg: 'bg-pink-50 dark:bg-pink-900/10',
        onClick: () => onSelectTemplate({ id: 'shorts', name: 'ShortMaker', thumbnailUrl: '', variables: [], mode: 'SHORTS', category: 'AI' })
    },
    {
        id: 'product_ugc',
        title: 'Product UGC',
        desc: 'Video ads from photos',
        icon: <ShoppingBag size={20} />,
        color: 'bg-teal-500',
        text: 'text-teal-500',
        bg: 'bg-teal-50 dark:bg-teal-900/10',
        onClick: () => onSelectTemplate({ id: 'ugc', name: 'Product UGC', thumbnailUrl: '', variables: [], mode: 'UGC_PRODUCT', category: 'AI' })
    },
    {
        id: 'ai_video',
        title: 'AI Video',
        desc: 'Text to Cinematic Video',
        icon: <Clapperboard size={20} />,
        color: 'bg-purple-500',
        text: 'text-purple-500',
        bg: 'bg-purple-50 dark:bg-purple-900/10',
        onClick: () => onSelectTemplate({ id: 'txt_vid', name: 'AI Video', thumbnailUrl: '', variables: [], mode: 'TEXT_TO_VIDEO', category: 'AI' })
    },
    {
        id: 'image_video',
        title: 'Animate Image',
        desc: 'Bring photos to life',
        icon: <ImageIcon size={20} />,
        color: 'bg-sky-500',
        text: 'text-sky-500',
        bg: 'bg-sky-50 dark:bg-sky-900/10',
        onClick: () => onSelectTemplate({ id: 'img_vid', name: 'Image to Video', thumbnailUrl: '', variables: [], mode: 'IMAGE_TO_VIDEO', category: 'AI' })
    }
  ];

  const STUDIO_TOOLS = [
    {
        id: 'avatar_video',
        title: 'Avatar Video Studio',
        description: 'Create professional spokesperson videos with premium HeyGen avatars.',
        icon: <User size={24} />,
        colorClass: 'text-indigo-600 dark:text-indigo-400',
        bgClass: 'bg-indigo-50 dark:bg-indigo-900/20',
        imgUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=800&q=80',
        onClick: () => setView('AVATAR_SELECT'),
        cta: 'Select Avatar'
    },
    {
        id: 'fashion_shoot',
        title: 'Fashion Photoshoot',
        description: 'Generate high-end model photography from flat-lay merchandise images.',
        icon: <Camera size={24} />,
        colorClass: 'text-rose-600 dark:text-rose-400',
        bgClass: 'bg-rose-50 dark:bg-rose-900/20',
        imgUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
        onClick: () => onSelectTemplate({ id: 'fashion', name: 'Fashion Shoot', thumbnailUrl: '', variables: [], mode: 'FASHION_SHOOT', category: 'AI' }),
        cta: 'Start Shoot'
    },
    {
        id: 'storybook',
        title: 'Storybook Video',
        description: 'Create fully illustrated and narrated stories for kids or marketing.',
        icon: <BookOpen size={24} />,
        colorClass: 'text-amber-600 dark:text-amber-400',
        bgClass: 'bg-amber-50 dark:bg-amber-900/20',
        imgUrl: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=800&q=80',
        onClick: () => onSelectTemplate({ id: 'story', name: 'Storybook', thumbnailUrl: '', variables: [], mode: 'STORYBOOK', category: 'AI' }),
        cta: 'Write Story'
    },
    {
        id: 'audiobook',
        title: 'Audiobook Gen',
        description: 'Convert text documents into emotive, human-like speech.',
        icon: <Headphones size={24} />,
        colorClass: 'text-orange-600 dark:text-orange-400',
        bgClass: 'bg-orange-50 dark:bg-orange-900/20',
        imgUrl: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=800&q=80',
        onClick: () => onSelectTemplate({ id: 'audio', name: 'Audiobook', thumbnailUrl: '', variables: [], mode: 'AUDIOBOOK', category: 'AI' }),
        cta: 'Create Audio'
    }
  ];

  const filteredStudioTools = STUDIO_TOOLS.filter(t => 
    (t.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (t.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // AVATAR SELECTION VIEW
  if (view === 'AVATAR_SELECT') {
      const filteredAvatars = avatars.filter(a => 
        (genderFilter === 'ALL' || a.gender === genderFilter) && 
        (a.name || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
      
      return (
        <div className="h-full flex flex-col p-4 md:p-8 overflow-hidden">
            <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between flex-shrink-0 gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => setView('DASHBOARD')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-600 dark:text-gray-300">
                        <ArrowRight className="rotate-180" size={24} />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Select Avatar</h2>
                        <p className="text-gray-500 dark:text-gray-400">Choose a presenter for your video.</p>
                    </div>
                </div>
                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl self-start md:self-auto">
                    {(['ALL', 'male', 'female'] as const).map(filter => (
                        <button key={filter} onClick={() => setGenderFilter(filter)} className={`px-4 py-1.5 rounded-lg text-sm font-bold capitalize transition-all ${genderFilter === filter ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>{filter === 'ALL' ? 'All' : filter}</button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                    <Loader2 className="animate-spin text-indigo-600 dark:text-indigo-400 mb-4" size={40} />
                    <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading avatars...</p>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {filteredAvatars.map(avatar => (
                            <div key={avatar.id} onClick={() => handleSelectAvatar(avatar)} className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:-translate-y-1 hover:shadow-xl dark:hover:shadow-[0_0_15px_rgba(99,102,241,0.3)] dark:hover:border-indigo-500 transition-all duration-300">
                                <div className="aspect-[3/4] relative overflow-hidden bg-gray-100 dark:bg-gray-900">
                                    <img src={avatar.previewUrl} alt={avatar.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                                        <span className="text-white font-bold flex items-center gap-2">Select <ArrowRight size={16}/></span>
                                    </div>
                                </div>
                                <div className="p-4">
                                    <h3 className="font-bold text-gray-900 dark:text-white">{avatar.name}</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{avatar.gender}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
      );
  }

  // MAIN DASHBOARD VIEW
  return (
    <div className="h-full overflow-y-auto p-4 md:p-8 no-scrollbar">
        <div className="max-w-7xl mx-auto pb-10 space-y-10">
        
        {/* Hero Banner */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-700 dark:from-indigo-900 dark:to-purple-900 p-8 md:p-12 flex flex-col md:flex-row items-center justify-between shadow-2xl shadow-indigo-200 dark:shadow-none">
            <div className="relative z-10 max-w-xl text-center md:text-left">
                <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4 leading-tight">
                    Welcome back{userProfile?.full_name ? `, ${userProfile.full_name.split(' ')[0]}` : ''}! <span className="inline-block animate-pulse">👋</span>
                </h1>
                <p className="text-indigo-100 text-lg mb-8">
                    Ready to create something amazing today? Select a tool below to get started.
                </p>
                <div className="relative max-w-md mx-auto md:mx-0">
                    <Search className="absolute left-4 top-3.5 text-indigo-300" size={20} />
                    <input 
                        type="text" 
                        placeholder="Search for tools..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white/10 backdrop-blur-md border border-indigo-400/30 rounded-xl pl-12 pr-4 py-3 text-white placeholder-indigo-200 focus:outline-none focus:bg-white/20 focus:border-indigo-300 transition-all"
                    />
                </div>
            </div>
            <div className="hidden md:block relative z-10">
                <div className="w-64 h-64 bg-white/10 rounded-full backdrop-blur-3xl absolute -top-10 -right-10 animate-blob" />
                <div className="w-48 h-48 bg-purple-500/20 rounded-full backdrop-blur-3xl absolute bottom-0 left-0 animate-blob animation-delay-2000" />
                <img 
                    src="https://cdn3d.iconscout.com/3d/premium/thumb/video-editing-5481232-4569723.png" 
                    alt="3D Illustration" 
                    className="w-64 h-64 object-contain relative z-20 drop-shadow-2xl transform hover:scale-105 transition-transform duration-500" 
                />
            </div>
            {/* Abstract Background Shapes */}
            <div className="absolute top-0 right-0 w-full h-full opacity-30 pointer-events-none">
                <svg viewBox="0 0 100 100" className="w-full h-full fill-white/10">
                    <circle cx="90" cy="10" r="40" />
                    <circle cx="10" cy="90" r="30" />
                </svg>
            </div>
        </div>

        {/* Quick Access Tools */}
        <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <Sparkles className="text-indigo-500" size={20} /> Quick Create
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {QUICK_TOOLS.map(tool => (
                    <button 
                        key={tool.id} 
                        onClick={tool.onClick}
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-2xl flex flex-col items-start gap-3 hover:border-indigo-400 dark:hover:border-indigo-500 hover:scale-[1.02] hover:shadow-lg dark:hover:shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all duration-300 group text-left"
                    >
                        <div className={`p-3 rounded-xl ${tool.bg} ${tool.text} group-hover:scale-110 transition-transform`}>
                            {tool.icon}
                        </div>
                        <div>
                            <div className="font-bold text-gray-900 dark:text-white">{tool.title}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{tool.desc}</div>
                        </div>
                    </button>
                ))}
            </div>
        </div>

        {/* Main Studio Tools */}
        <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <Clapperboard className="text-indigo-500" size={20} /> Creative Studio
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredStudioTools.map(tool => (
                    <div 
                        key={tool.id}
                        onClick={tool.onClick}
                        className="group bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:-translate-y-1 hover:shadow-xl dark:hover:shadow-[0_0_20px_rgba(79,70,229,0.15)] dark:hover:border-indigo-500/50 transition-all duration-300"
                    >
                        <div className="h-48 overflow-hidden relative">
                            <img src={tool.imgUrl} alt={tool.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-90 group-hover:opacity-100" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            <div className="absolute bottom-4 left-4 text-white">
                                <div className={`w-10 h-10 ${tool.bgClass.replace('/10', '/90')} backdrop-blur-md rounded-xl flex items-center justify-center mb-3 shadow-lg`}>
                                    {React.cloneElement(tool.icon as React.ReactElement, { className: 'text-white' })}
                                </div>
                            </div>
                        </div>
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{tool.title}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-6 h-10 line-clamp-2">{tool.description}</p>
                            <span className="inline-flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white group-hover:gap-3 transition-all">
                                {tool.cta} <ArrowRight size={16} className="text-indigo-500" />
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Recent Activity Mini-Section */}
        {recentProjects.length > 0 && (
            <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Jump Back In</h2>
                <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                    {recentProjects.slice(0, 4).map((p, i) => (
                        <div key={i} className="min-w-[200px] h-32 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden relative group cursor-pointer hover:border-indigo-400 transition-colors">
                            <img src={p.thumbnailUrl || 'https://via.placeholder.com/200x120'} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" alt="" />
                            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                                <p className="text-white text-xs font-bold truncate">{p.templateName}</p>
                                <p className="text-gray-300 text-[10px]">{new Date(p.createdAt).toLocaleDateString()}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
        </div>
    </div>
  );
};
