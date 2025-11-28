
import React, { useState, useEffect } from 'react';
import { User, Loader2, ShoppingBag, Clapperboard, Layers, Sparkles, Headphones, Image as ImageIcon, BookOpen } from 'lucide-react';
import { Template, HeyGenAvatar } from '../types';
import { getAvatars } from '../services/heygenService';

export interface TemplateGalleryProps {
  onSelectTemplate: (template: Template) => void;
  heyGenKey?: string;
  initialView?: 'DASHBOARD' | 'AVATAR_SELECT';
}

type GalleryView = 'DASHBOARD' | 'AVATAR_SELECT';

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({ onSelectTemplate, heyGenKey, initialView = 'DASHBOARD' }) => {
  const [view, setView] = useState<GalleryView>(initialView);
  const [avatars, setAvatars] = useState<HeyGenAvatar[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'male' | 'female'>('ALL');

  useEffect(() => {
    // Pre-fetch avatars so they are ready when clicking the card
    const fetchRealAvatars = async () => {
        // If we already have avatars and no key change, don't refetch unless empty
        // The service layer handles API caching.
        if (!heyGenKey && avatars.length > 0) return;
        
        setIsLoading(true);
        try {
            const realAvatars = await getAvatars(heyGenKey || '');
            // Load ALL avatars, do not slice/limit them.
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
  }, [heyGenKey, view]); // Trigger fetch when entering AVATAR_SELECT view

  const handleSelectAvatar = (avatar: HeyGenAvatar) => {
      const template: Template = {
          id: `custom_avatar_${avatar.id}`,
          name: avatar.name,
          category: 'Avatar',
          thumbnailUrl: avatar.previewUrl,
          defaultAvatarId: avatar.id,
          variables: [
              { 
                  key: 'script', 
                  label: 'Script', 
                  type: 'textarea', 
                  placeholder: `Hi, I'm ${avatar.name}. I can read any text you type here!` 
              }
          ],
          mode: 'AVATAR'
      };
      onSelectTemplate(template);
  };

  const handleSelectProductUGC = () => {
      onSelectTemplate({
          id: 'mode_ugc',
          name: 'UGC Product Video',
          category: 'AI',
          thumbnailUrl: '',
          variables: [],
          mode: 'UGC_PRODUCT'
      });
  };

  const handleSelectTextToVideo = () => {
      onSelectTemplate({
          id: 'mode_text_video',
          name: 'AI Video Generator',
          category: 'AI',
          thumbnailUrl: '',
          variables: [],
          mode: 'TEXT_TO_VIDEO'
      });
  };

  const handleSelectImageToVideo = () => {
      onSelectTemplate({
          id: 'mode_image_video',
          name: 'Image to Video',
          category: 'AI',
          thumbnailUrl: '',
          variables: [],
          mode: 'IMAGE_TO_VIDEO'
      });
  };
  
  const handleSelectShortMaker = () => {
      onSelectTemplate({
          id: 'mode_shorts',
          name: 'ShortMaker',
          category: 'AI',
          thumbnailUrl: '',
          variables: [],
          mode: 'SHORTS'
      });
  };
  
  const handleSelectStorybook = () => {
      onSelectTemplate({
          id: 'mode_storybook',
          name: 'Storybook Video',
          category: 'AI',
          thumbnailUrl: '',
          variables: [],
          mode: 'STORYBOOK'
      });
  };

  const handleSelectAudiobook = () => {
      onSelectTemplate({
          id: 'mode_audiobook',
          name: 'Generate Audiobook',
          category: 'AI',
          thumbnailUrl: '',
          variables: [],
          mode: 'AUDIOBOOK'
      });
  };

  // Helper to filter avatars
  const filteredAvatars = avatars.filter(avatar => {
      if (genderFilter === 'ALL') return true;
      return avatar.gender === genderFilter;
  });

  // Tools Configuration
  const tools = [
    // LIVE TOOLS
    {
        id: 'avatar_video',
        title: 'Avatar Video',
        description: 'Lifelike avatars with premium lip-sync using HeyGen.',
        icon: <User size={24} />,
        colorClass: 'text-indigo-600',
        bgClass: 'bg-indigo-900/10',
        imgUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=800&q=80',
        status: 'LIVE',
        onClick: () => setView('AVATAR_SELECT'),
        cta: 'Select Avatar'
    },
    {
        id: 'short_maker',
        title: 'ShortMaker',
        description: 'Idea to YouTube Short in seconds.',
        icon: <Sparkles size={24} />,
        colorClass: 'text-pink-600',
        bgClass: 'bg-pink-900/20',
        imgUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=800&q=80',
        status: 'LIVE',
        onClick: handleSelectShortMaker,
        cta: 'Make Short'
    },
    {
        id: 'storybook',
        title: 'Storybook Video',
        description: 'Create illustrated stories with narration & visuals.',
        icon: <BookOpen size={24} />,
        colorClass: 'text-amber-600',
        bgClass: 'bg-amber-900/10',
        imgUrl: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=800&q=80',
        status: 'LIVE',
        onClick: handleSelectStorybook,
        cta: 'Create Story'
    },
    {
        id: 'audiobook',
        title: 'Generate Audiobook',
        description: 'Turn any text prompt into high-quality speech.',
        icon: <Headphones size={24} />,
        colorClass: 'text-orange-600',
        bgClass: 'bg-orange-900/10',
        imgUrl: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=800&q=80',
        status: 'LIVE',
        onClick: handleSelectAudiobook,
        cta: 'Create Audio'
    },

    // COMING SOON / BETA TOOLS
    {
        id: 'ai_video',
        title: 'AI Video',
        description: 'Text-to-video using Veo 3.1 model.',
        icon: <Clapperboard size={24} />,
        colorClass: 'text-purple-600',
        bgClass: 'bg-purple-900/10',
        imgUrl: 'https://images.unsplash.com/photo-1618172193763-c511deb635ca?auto=format&fit=crop&w=800&q=80',
        status: 'COMING SOON',
        onClick: handleSelectTextToVideo,
        cta: 'Generate'
    },
    {
        id: 'product_ugc',
        title: 'Product UGC',
        description: 'Generate viral UGC product videos using Google Veo.',
        icon: <ShoppingBag size={24} />,
        colorClass: 'text-teal-600',
        bgClass: 'bg-teal-900/10',
        imgUrl: 'https://images.unsplash.com/photo-1629198688000-71f23e745b6e?auto=format&fit=crop&w=800&q=80',
        status: 'COMING SOON',
        onClick: handleSelectProductUGC,
        cta: 'Create Video'
    },
    {
        id: 'image_video',
        title: 'Image to Video',
        description: 'Animate any image using Google Veo.',
        icon: <ImageIcon size={24} />,
        colorClass: 'text-sky-600',
        bgClass: 'bg-sky-900/10',
        imgUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=800&q=80',
        status: 'COMING SOON',
        onClick: handleSelectImageToVideo,
        cta: 'Animate'
    },
    {
        id: 'video_editor',
        title: 'Video Editor',
        description: 'Professional timeline editor for compositions.',
        icon: <Layers size={24} />,
        colorClass: 'text-gray-600',
        bgClass: 'bg-gray-900/10',
        imgUrl: 'https://images.unsplash.com/photo-1574717432707-c25c8587a3ea?auto=format&fit=crop&w=800&q=80',
        status: 'COMING SOON',
        onClick: () => {}, // No action implemented
        cta: 'Open Editor'
    }
  ];

  if (view === 'AVATAR_SELECT') {
      return (
        <div className="h-full flex flex-col">
            <div className="mb-8 flex items-center gap-4 flex-shrink-0">
                <button 
                    onClick={() => setView('DASHBOARD')}
                    className="text-gray-700 hover:text-indigo-700 transition-colors font-medium flex items-center gap-1"
                >
                    &larr; Back
                </button>
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Select Avatar</h2>
                    <p className="text-gray-600 font-medium">Choose one of the available avatars.</p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 gap-6">
                    <div className="p-4 bg-indigo-50 rounded-full">
                        <Loader2 className="animate-spin text-indigo-600" size={48} />
                    </div>
                    <p className="text-indigo-900 font-bold text-xl animate-pulse">..loading up your avatars</p>
                </div>
            ) : (
                <div className="flex flex-col h-full overflow-hidden">
                    {/* Gender Filter Tabs */}
                    {avatars.length > 0 && (
                        <div className="flex justify-center mb-6 flex-shrink-0">
                            <div className="bg-gray-100 p-1.5 rounded-xl inline-flex shadow-inner">
                                {(['ALL', 'male', 'female'] as const).map((filter) => (
                                    <button
                                        key={filter}
                                        onClick={() => setGenderFilter(filter)}
                                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all duration-200 capitalize ${
                                            genderFilter === filter 
                                            ? 'bg-white text-indigo-600 shadow-sm transform scale-105' 
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                                        }`}
                                    >
                                        {filter === 'ALL' ? 'All Avatars' : filter}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto min-h-0 px-1 pb-10">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto w-full">
                            {avatars.length === 0 ? (
                                <div className="col-span-full text-center text-gray-500 py-10">
                                    No avatars found. Please check your HeyGen API Key in Settings.
                                </div>
                            ) : filteredAvatars.length === 0 ? (
                                <div className="col-span-full text-center text-gray-400 py-20 flex flex-col items-center">
                                    <User size={48} className="mb-4 opacity-20" />
                                    <p>No {genderFilter} avatars found.</p>
                                </div>
                            ) : (
                                filteredAvatars.map(avatar => (
                                    <div 
                                        key={avatar.id}
                                        className="group relative bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-300 cursor-pointer transform hover:-translate-y-2"
                                        onClick={() => handleSelectAvatar(avatar)}
                                    >
                                        <div className="aspect-[4/3] bg-gray-100 overflow-hidden relative">
                                            <img 
                                                src={avatar.previewUrl} 
                                                alt={avatar.name} 
                                                loading="lazy"
                                                className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
                                                onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/600x400?text=Avatar'; }}
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300" />
                                            <div className="absolute bottom-4 left-4 text-white">
                                                <h3 className="font-bold text-lg mb-0.5">{avatar.name}</h3>
                                                <p className="text-xs font-medium opacity-90 uppercase tracking-wider">{avatar.gender}</p>
                                            </div>
                                            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                                                 <span className="bg-white text-indigo-900 px-3 py-1.5 rounded-full font-bold text-xs shadow-lg flex items-center gap-1">
                                                    Select &rarr;
                                                 </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
      );
  }

  return (
    <div className="h-full flex flex-col justify-center max-w-7xl mx-auto pb-10">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">What would you like to create?</h2>
        <p className="text-gray-600 font-medium">Select a workflow to get started.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
        {tools.map(tool => (
            <div 
                key={tool.id}
                onClick={tool.status === 'COMING SOON' && tool.id === 'video_editor' ? undefined : tool.onClick}
                className={`group bg-white rounded-3xl border border-gray-200 shadow-sm transition-all duration-300 flex flex-col relative overflow-hidden ${
                    tool.status === 'LIVE' 
                    ? 'hover:shadow-2xl hover:border-indigo-200 cursor-pointer' 
                    : 'opacity-90 hover:opacity-100 cursor-pointer'
                }`}
            >
                {/* Coming Soon Badge */}
                {tool.status === 'COMING SOON' && (
                    <div className="absolute top-4 right-4 z-30 bg-gray-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg border border-gray-700">
                        COMING SOON
                    </div>
                )}

                <div className={`h-40 overflow-hidden relative ${tool.bgClass.replace('/10', '/5')}`}>
                    <div className={`absolute inset-0 ${tool.bgClass} group-hover:bg-transparent transition-colors z-10`} />
                    <img 
                        src={tool.imgUrl} 
                        alt={tool.title} 
                        loading="lazy"
                        className={`w-full h-full object-cover transform transition-transform duration-700 ${
                            tool.status === 'LIVE' 
                            ? 'group-hover:scale-110' 
                            : 'grayscale group-hover:grayscale-0'
                        }`}
                    />
                    <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur-md p-2 rounded-xl shadow-sm">
                        {React.cloneElement(tool.icon as React.ReactElement, { className: tool.colorClass })}
                    </div>
                </div>

                <div className="p-6 flex flex-col flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{tool.title}</h3>
                    <p className="text-gray-500 font-medium text-sm leading-relaxed mb-4">
                        {tool.description}
                    </p>
                    <span className={`mt-auto font-bold text-sm flex items-center gap-2 transition-all ${
                        tool.status === 'LIVE' ? tool.colorClass + ' group-hover:gap-3' : 'text-gray-400'
                    }`}>
                        {tool.cta} <span className="text-lg">&rarr;</span>
                    </span>
                </div>
            </div>
        ))}
      </div>
    </div>
  );
};
