
import React, { useState, useEffect } from 'react';
import { User, Loader2, ShoppingBag, Clapperboard, Sparkles, Headphones, Image as ImageIcon, BookOpen, Camera, Search, ArrowRight, Wand2, Smartphone, Video, Layers, Music, Trophy, Flame, Target, DollarSign, CheckCircle2, X } from 'lucide-react';
import { Template, HeyGenAvatar, ClippingProject } from '../types';
import { getAvatars } from '../services/heygenService';

export interface TemplateGalleryProps {
  onSelectTemplate: (template: Template) => void;
  heyGenKey?: string;
  initialView?: 'DASHBOARD' | 'AVATAR_SELECT';
  userProfile?: any;
  recentProjects?: any[];
}

type GalleryView = 'DASHBOARD' | 'AVATAR_SELECT';

// Mock Clipping Campaigns
const CLIPPING_PROJECTS: ClippingProject[] = [
    {
        id: 'cp_1',
        title: 'Future Tech Review',
        brand: 'TechDaily',
        thumbnail: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2070&auto=format&fit=crop',
        reward_pool: '$10,000',
        payout_model: '$2.00 per 1k views',
        category: 'Technology',
        brief: 'Create a 30-second viral short discussing the potential of AI in daily life. Must be upbeat and futuristic.',
        requirements: ['Use "Cyberpunk" visual style', 'Voice: Puck (Energetic)', 'Mention "AI Revolution" in script'],
        recommended_voice: 'Puck',
        recommended_style: 'Cyberpunk'
    },
    {
        id: 'cp_2',
        title: 'Summer Fashion Haul',
        brand: 'VogueStyles',
        thumbnail: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=2070&auto=format&fit=crop',
        reward_pool: '$5,000',
        payout_model: '$1.50 per 1k views',
        category: 'Fashion',
        brief: 'Showcase trending summer outfits. Focus on bright colors and luxury aesthetics.',
        requirements: ['Use "Luxury" visual style', 'Voice: Kore (Calm)', 'Format: 9:16 Vertical'],
        recommended_voice: 'Kore',
        recommended_style: 'Luxury'
    },
    {
        id: 'cp_3',
        title: 'Crypto Market Update',
        brand: 'CoinBase Pro',
        thumbnail: 'https://images.unsplash.com/photo-1518546305927-5a440bbabb91?q=80&w=2070&auto=format&fit=crop',
        reward_pool: '$15,000',
        payout_model: '$3.00 per 1k views',
        category: 'Finance',
        brief: 'Explain a recent crypto trend in simple terms. Keep it informative and trustworthy.',
        requirements: ['Use "Corporate" visual style', 'Voice: Charon (Deep)', 'No financial advice disclaimer'],
        recommended_voice: 'Charon',
        recommended_style: 'Corporate'
    }
];

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({ onSelectTemplate, heyGenKey, initialView = 'DASHBOARD', userProfile, recentProjects = [] }) => {
  const [view, setView] = useState<GalleryView>(initialView);
  const [avatars, setAvatars] = useState<HeyGenAvatar[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'male' | 'female'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Clipping Project State
  const [selectedCampaign, setSelectedCampaign] = useState<ClippingProject | null>(null);

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

  const handleStartCampaign = (campaign: ClippingProject) => {
      // Create a template config based on the campaign to pre-fill the editor (conceptually)
      // In a real app, we'd pass these params to the editor to pre-select dropdowns
      const template: Template = {
          id: `campaign_${campaign.id}`,
          name: `Clip: ${campaign.title}`,
          category: 'Campaign',
          thumbnailUrl: campaign.thumbnail,
          variables: [
              { key: 'idea', label: 'Idea', type: 'textarea', defaultValue: campaign.brief },
              { key: 'style', label: 'Style', type: 'text', defaultValue: campaign.recommended_style }
          ],
          mode: 'SHORTS'
      };
      onSelectTemplate(template);
      setSelectedCampaign(null);
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
                <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
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
    <>
    <div className="h-full overflow-y-auto p-4 md:p-8 no-scrollbar bg-gray-50 dark:bg-black">
        <div className="max-w-7xl mx-auto pb-24 space-y-10">
        
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

        {/* Contest Banner */}
        <div className="bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-xl shadow-orange-500/20 group cursor-pointer hover:scale-[1.01] transition-transform">
            <div className="absolute -right-10 -bottom-10 opacity-20 rotate-12 group-hover:rotate-6 transition-transform duration-700">
                <Trophy size={240} />
            </div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            
            <div className="relative z-10">
                <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-white/30 mb-4 shadow-sm">
                    <Flame size={12} className="text-yellow-200 fill-yellow-200" /> 
                    Live Contest
                </div>
                <h2 className="text-3xl md:text-5xl font-black mb-4 tracking-tight drop-shadow-sm">
                    Enter our Clipping Contest
                </h2>
                <p className="text-lg md:text-xl font-medium text-white/95 leading-relaxed mb-8 max-w-2xl drop-shadow-sm">
                    For every <span className="font-extrabold bg-white/20 px-2 py-0.5 rounded-lg border border-white/20">1,000 views</span> you get with videos created on LoopGenie, we pay you <span className="font-extrabold text-yellow-100">$1</span>.
                </p>
                <button 
                    onClick={() => onSelectTemplate({ id: 'shorts', name: 'Shorts Maker', thumbnailUrl: '', variables: [], mode: 'SHORTS', category: 'AI' })}
                    className="bg-white text-orange-600 px-8 py-3.5 rounded-xl font-bold text-sm shadow-lg hover:bg-gray-50 hover:shadow-xl transition-all flex items-center gap-2 group-hover:gap-3"
                >
                    Start Creating Now <ArrowRight size={18} />
                </button>
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

        {/* Active Clipping Campaigns Section */}
        <div>
             <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Target className="text-green-500" size={18} /> Active Campaigns (Clipping)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {CLIPPING_PROJECTS.map(project => (
                    <div 
                        key={project.id}
                        onClick={() => setSelectedCampaign(project)}
                        className="bg-gray-900 rounded-3xl overflow-hidden relative group cursor-pointer border border-gray-800 hover:border-green-500/50 hover:shadow-2xl transition-all duration-300"
                    >
                        <div className="h-40 relative">
                             <img src={project.thumbnail} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
                             <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
                             <div className="absolute top-4 left-4 bg-green-500 text-black text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide">
                                {project.category}
                             </div>
                             <div className="absolute top-4 right-4 bg-black/60 text-white backdrop-blur-sm text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
                                <DollarSign size={12} className="text-green-400" />
                                {project.payout_model}
                             </div>
                        </div>
                        <div className="p-6 pt-2">
                             <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">{project.brand}</div>
                             <h3 className="text-xl font-bold text-white mb-3 group-hover:text-green-400 transition-colors">{project.title}</h3>
                             <div className="flex items-center gap-3 text-sm text-gray-400">
                                 <span className="flex items-center gap-1"><Trophy size={14} className="text-yellow-500" /> Pool: {project.reward_pool}</span>
                             </div>
                        </div>
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

    {/* Campaign Details Modal */}
    {selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-gray-900 rounded-3xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="relative h-48 flex-shrink-0">
                    <img src={selectedCampaign.thumbnail} className="w-full h-full object-cover opacity-50" />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
                    <button 
                        onClick={() => setSelectedCampaign(null)}
                        className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-white/20 rounded-full text-white transition-colors backdrop-blur-md"
                    >
                        <X size={20} />
                    </button>
                    <div className="absolute bottom-6 left-6">
                        <div className="text-green-400 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Target size={14} /> {selectedCampaign.brand}
                        </div>
                        <h2 className="text-3xl font-black text-white">{selectedCampaign.title}</h2>
                    </div>
                </div>
                
                <div className="p-6 md:p-8 overflow-y-auto">
                    <div className="flex flex-col md:flex-row gap-8 mb-8">
                        <div className="flex-1">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">The Brief</h3>
                            <p className="text-gray-300 leading-relaxed">{selectedCampaign.brief}</p>
                        </div>
                        <div className="w-full md:w-48 flex-shrink-0 bg-gray-800 rounded-xl p-4 border border-gray-700">
                             <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Payout Structure</h4>
                             <div className="text-2xl font-bold text-white mb-1">{selectedCampaign.payout_model}</div>
                             <div className="text-xs text-yellow-500 flex items-center gap-1">
                                 <Trophy size={12} /> Pool: {selectedCampaign.reward_pool}
                             </div>
                        </div>
                    </div>
                    
                    <div className="mb-8">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Requirements</h3>
                        <ul className="space-y-3">
                            {selectedCampaign.requirements.map((req, i) => (
                                <li key={i} className="flex items-start gap-3 text-gray-300">
                                    <CheckCircle2 size={18} className="text-green-500 mt-0.5 flex-shrink-0" />
                                    <span>{req}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    
                    <button 
                        onClick={() => handleStartCampaign(selectedCampaign)}
                        className="w-full py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-green-900/20 transition-all flex items-center justify-center gap-2 hover:scale-[1.01]"
                    >
                        <Clapperboard size={20} /> Start Creating Clip
                    </button>
                </div>
            </div>
        </div>
    )}
    </>
  );
};
