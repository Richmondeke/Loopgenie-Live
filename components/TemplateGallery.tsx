
import React, { useState, useEffect } from 'react';
import { User, Loader2, ShoppingBag, Clapperboard, Sparkles, Headphones, Image as ImageIcon, BookOpen, Camera, Search, ArrowRight, Wand2, Smartphone, Video, Layers, Music } from 'lucide-react';
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

  // --- BASIC TOOLS CONFIGURATION ---
  const BASIC_TOOLS = [
    {
        id: 'audio_gen',
        title: 'Generate Audio',
        desc: 'Text to Speech (Audiobook)',
        icon: <Headphones size={24} />,
        color: 'bg-orange-500',
        bg: 'bg-orange-50 dark:bg-orange-900/10',
        text: 'text-orange-500',
        onClick: () => onSelectTemplate({ id: 'audio', name: 'Generate Audio', thumbnailUrl: '', variables: [], mode: 'AUDIOBOOK', category: 'AI' })
    },
    {
        id: 'text_to_image',
        title: 'Text to Image',
        desc: 'Generate AI Images',
        icon: <Wand2 size={24} />,
        color: 'bg-pink-500',
        bg: 'bg-pink-50 dark:bg-pink-900/10',
        text: 'text-pink-500',
        onClick: () => onSelectTemplate({ id: 'txt_img', name: 'Text to Image', thumbnailUrl: '', variables: [], mode: 'TEXT_TO_IMAGE', category: 'AI' })
    },
    {
        id: 'image_to_image',
        title: 'Image to Image',
        desc: 'Remix & Style Transfer',
        icon: <Layers size={24} />,
        color: 'bg-blue-500',
        bg: 'bg-blue-50 dark:bg-blue-900/10',
        text: 'text-blue-500',
        onClick: () => onSelectTemplate({ id: 'img_img', name: 'Image to Image', thumbnailUrl: '', variables: [], mode: 'IMAGE_TO_IMAGE', category: 'AI' })
    },
    {
        id: 'image_to_video',
        title: 'Image to Video',
        desc: 'Animate Static Photos',
        icon: <Video size={24} />,
        color: 'bg-indigo-500',
        bg: 'bg-indigo-50 dark:bg-indigo-900/10',
        text: 'text-indigo-500',
        onClick: () => onSelectTemplate({ id: 'img_vid', name: 'Image to Video', thumbnailUrl: '', variables: [], mode: 'IMAGE_TO_VIDEO', category: 'AI' })
    },
    {
        id: 'avatar_gen',
        title: 'Generate Avatar',
        desc: 'Talking Head Video',
        icon: <User size={24} />,
        color: 'bg-purple-500',
        bg: 'bg-purple-50 dark:bg-purple-900/10',
        text: 'text-purple-500',
        onClick: () => setView('AVATAR_SELECT')
    }
  ];

  // --- MARKETING TOOLS CONFIGURATION ---
  const MARKETING_TOOLS = [
    {
        id: 'shorts_maker',
        title: 'Shorts Maker',
        desc: 'Viral Vertical Videos',
        icon: <Smartphone size={24} />,
        color: 'bg-rose-500',
        bg: 'bg-rose-50 dark:bg-rose-900/10',
        text: 'text-rose-500',
        isHot: true,
        onClick: () => onSelectTemplate({ id: 'shorts', name: 'Shorts Maker', thumbnailUrl: '', variables: [], mode: 'SHORTS', category: 'AI' })
    },
    {
        id: 'product_photoshoot',
        title: 'Product Photoshoot',
        desc: 'AI Fashion Photography',
        icon: <Camera size={24} />,
        color: 'bg-teal-500',
        bg: 'bg-teal-50 dark:bg-teal-900/10',
        text: 'text-teal-500',
        onClick: () => onSelectTemplate({ id: 'fashion', name: 'Product Photoshoot', thumbnailUrl: '', variables: [], mode: 'FASHION_SHOOT', category: 'AI' })
    },
    {
        id: 'product_ugc',
        title: 'Product UGC',
        desc: 'Video Ads from Photos',
        icon: <ShoppingBag size={24} />,
        color: 'bg-yellow-500',
        bg: 'bg-yellow-50 dark:bg-yellow-900/10',
        text: 'text-yellow-500',
        onClick: () => onSelectTemplate({ id: 'ugc', name: 'Product UGC', thumbnailUrl: '', variables: [], mode: 'UGC_PRODUCT', category: 'AI' })
    }
  ];

  const filteredBasic = BASIC_TOOLS.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredMarketing = MARKETING_TOOLS.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));

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
    <div className="h-full overflow-y-auto p-4 md:p-8 no-scrollbar bg-gray-50 dark:bg-black">
        <div className="max-w-7xl mx-auto pb-10 space-y-10">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
                <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">Studio Dashboard</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1">Select a tool to start creating.</p>
            </div>
            <div className="relative w-full md:w-80">
                <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Search tools..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl pl-12 pr-4 py-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
            </div>
        </div>

        {/* Basic Tools */}
        <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Sparkles className="text-indigo-500" size={18} /> Basic Tools
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {filteredBasic.map(tool => (
                    <button 
                        key={tool.id} 
                        onClick={tool.onClick}
                        className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-2xl flex flex-col items-center text-center gap-4 hover:border-indigo-400 dark:hover:border-indigo-500 hover:scale-[1.02] hover:shadow-lg dark:hover:shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all duration-300 group"
                    >
                        <div className={`p-4 rounded-full ${tool.bg} ${tool.text} group-hover:scale-110 transition-transform shadow-sm`}>
                            {tool.icon}
                        </div>
                        <div>
                            <div className="font-bold text-gray-900 dark:text-white text-sm">{tool.title}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tool.desc}</div>
                        </div>
                    </button>
                ))}
            </div>
        </div>

        {/* Marketing Tools */}
        <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Clapperboard className="text-rose-500" size={18} /> Marketing Tools
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {filteredMarketing.map(tool => (
                    <div 
                        key={tool.id}
                        onClick={tool.onClick}
                        className="group bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 cursor-pointer hover:-translate-y-1 hover:shadow-xl dark:hover:shadow-[0_0_20px_rgba(244,63,94,0.15)] dark:hover:border-rose-500/30 transition-all duration-300 relative overflow-hidden"
                    >
                        {tool.isHot && (
                            <div className="absolute top-4 right-4 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg animate-pulse">
                                HOT
                            </div>
                        )}
                        
                        <div className="flex items-start justify-between mb-6">
                            <div className={`w-14 h-14 ${tool.bg} rounded-2xl flex items-center justify-center ${tool.text}`}>
                                {tool.icon}
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-full p-2 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/20 transition-colors">
                                <ArrowRight size={16} className="text-gray-400 group-hover:text-indigo-500 transition-colors" />
                            </div>
                        </div>
                        
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{tool.title}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{tool.desc}</p>
                    </div>
                ))}
            </div>
        </div>

        {/* Recent Activity */}
        {recentProjects.length > 0 && (
            <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Recent Projects</h2>
                <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                    {recentProjects.slice(0, 5).map((p, i) => (
                        <div key={i} className="min-w-[220px] h-36 rounded-2xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden relative group cursor-pointer hover:border-indigo-400 transition-colors">
                            <img src={p.thumbnailUrl || 'https://via.placeholder.com/200x120'} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="" />
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
