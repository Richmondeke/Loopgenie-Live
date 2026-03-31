
import React, { useState, useEffect } from 'react';
import {
    Youtube,
    Sparkles,
    Image as ImageIcon,
    CheckCircle,
    Clock,
    Play,
    ChevronRight,
    Loader2,
    Plus,
    Trash2,
    Edit2,
    Wand2,
    AlertCircle,
    Layout,
    FileText
} from 'lucide-react';
import { YouTubeChannel, YouTubeEpisode, ShortMakerManifest } from '../types';
import { getYouTubeAuthUrl, uploadToYouTube } from '../services/youtubeService';
import { generateChannelConcept } from '../services/channelService';
import { runEpisodicProduction } from '../services/shortMakerService';
import { uploadToStorage } from '../services/storageService';
import { generateSceneImage, jobStore } from '../services/shortMakerService';

interface ChannelMakerProps {
    userCredits: number;
    onBack: () => void;
    onGenerate: (data: any) => Promise<void>;
    onSaveChannel?: (channel: YouTubeChannel) => Promise<void>;
    initialChannel?: YouTubeChannel | null;
}

export const ChannelMaker: React.FC<ChannelMakerProps> = ({ userCredits, onBack, onGenerate, onSaveChannel, initialChannel }) => {
    const [step, setStep] = useState<'SETUP' | 'BRANDING' | 'EPISODES' | 'PRODUCTION'>(
        initialChannel ? (initialChannel.episodes?.length > 0 ? 'EPISODES' : 'BRANDING') : 'SETUP'
    );
    const [channel, setChannel] = useState<Partial<YouTubeChannel>>(initialChannel || {
        name: '',
        description: '',
        episodes: []
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Per-episode production progress
    type EpisodeProgress = {
        step: string;
        stepIndex: number;
        totalSteps: number;
        percent: number;
        lastLog: string;
    };
    type SceneCard = { imageUrl: string; narration: string; index: number; total: number };
    const [episodeProgress, setEpisodeProgress] = useState<Record<string, EpisodeProgress>>({});
    // Per-episode live scene images that arrive as production runs
    const [episodeScenes, setEpisodeScenes] = useState<Record<string, SceneCard[]>>({});
    const [activeSceneEpisode, setActiveSceneEpisode] = useState<string | null>(null);

    const updateEpProgress = (epId: string, update: Partial<EpisodeProgress>) =>
        setEpisodeProgress(prev => ({
            ...prev,
            [epId]: { step: 'Queued', stepIndex: 0, totalSteps: 4, percent: 0, lastLog: '', ...prev[epId], ...update }
        }));

    // Auto-save channel whenever critical state changes
    useEffect(() => {
        if (onSaveChannel && channel.id && step !== 'SETUP') {
            onSaveChannel(channel as YouTubeChannel);
        }
    }, [channel, step]);

    const handleStartSetup = async () => {
        if (!channel.description) return;
        setIsGenerating(true);
        setError(null);
        try {
            const concept = await generateChannelConcept(channel.description);
            const newChannel: YouTubeChannel = {
                id: channel.id || `ch_${Date.now()}`,
                userId: (initialChannel as any)?.userId || '', // Will be filled by saveChannel in projectService if needed
                ...concept,
                description: channel.description,
                createdAt: channel.createdAt || Date.now(),
                episodes: concept.episodes || []
            } as YouTubeChannel;

            setChannel(newChannel);
            setStep('BRANDING');
            if (onSaveChannel) await onSaveChannel(newChannel);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateLogo = async () => {
        if (!channel.name || !channel.style) return;
        setIsGenerating(true);
        try {
            const prompt = `Modern mascot logo for a YouTube channel named "${channel.name}". Style: ${channel.style}. Minimalist, vector, professional, iconic. White background.`;
            const result = await generateSceneImage({
                image_prompt: prompt,
                scene_number: 1,
                duration_seconds: 0,
                narration_text: '',
                visual_description: '',
                character_tokens: [],
                environment_tokens: [],
                camera_directive: '',
                timecodes: { start_second: 0, end_second: 0 }
            }, Math.random().toString(), channel.style, '1:1', 'gemini_pro');

            setChannel(prev => ({ ...prev, logoUrl: result.url }));
            if (onSaveChannel) {
                await onSaveChannel({ ...channel, logoUrl: result.url } as YouTubeChannel);
            }
        } catch (e: any) {
            setError("Logo generation failed: " + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleApproveEpisode = (epId: string) => {
        setChannel(prev => ({
            ...prev,
            episodes: prev.episodes?.map(ep => ep.id === epId ? { ...ep, status: 'approved' } : ep)
        }));
    };

    // Parse an onProgress message into step info
    const parseProgress = (msg: string, epId: string, sceneCount = 6) => {
        const lower = msg.toLowerCase();
        const totalSteps = 3 + sceneCount; // script + N scenes + audio + assemble
        if (lower.includes('dreaming up script') || lower.includes('generating') && lower.includes('script')) {
            updateEpProgress(epId, { step: '✍️ Writing Script', stepIndex: 1, totalSteps, percent: Math.round(1 / totalSteps * 100), lastLog: msg });
        } else {
            const sceneMatch = msg.match(/Painting scene (\d+)\/(\d+)/i);
            if (sceneMatch) {
                const cur = parseInt(sceneMatch[1]);
                const tot = parseInt(sceneMatch[2]);
                const idx = 1 + cur;
                updateEpProgress(epId, { step: `🎨 Scene ${cur}/${tot}`, stepIndex: idx, totalSteps, percent: Math.round(idx / totalSteps * 100), lastLog: msg });
            } else if (lower.includes('voiceover') || lower.includes('synthesiz')) {
                const idx = totalSteps - 1;
                updateEpProgress(epId, { step: '🎙️ Recording Voiceover', stepIndex: idx, totalSteps, percent: Math.round(idx / totalSteps * 100), lastLog: msg });
            } else if (lower.includes('assembl') || lower.includes('stitching') || lower.includes('concatenat')) {
                updateEpProgress(epId, { step: '🎬 Assembling Video', stepIndex: totalSteps, totalSteps, percent: 95, lastLog: msg });
            } else if (lower.includes('complete') || lower.includes('production complete')) {
                updateEpProgress(epId, { step: '✅ Done', stepIndex: totalSteps, totalSteps, percent: 100, lastLog: msg });
            } else {
                updateEpProgress(epId, prev => ({ ...prev, lastLog: msg }) as any);
                setEpisodeProgress(prev => ({ ...prev, [epId]: { ...prev[epId], lastLog: msg } }));
            }
        }
    };

    const runProduction = async () => {
        const episodesToProduce = channel.episodes?.filter(e => e.status === 'approved') || [];
        if (episodesToProduce.length === 0) return;

        setStep('PRODUCTION');

        // Init progress for all episodes
        const initProgress: Record<string, EpisodeProgress> = {};
        episodesToProduce.forEach(ep => {
            initProgress[ep.id] = { step: 'Queued', stepIndex: 0, totalSteps: 9, percent: 0, lastLog: '' };
        });
        setEpisodeProgress(initProgress);

        for (const ep of episodesToProduce) {
            try {
                setChannel(prev => ({
                    ...prev,
                    episodes: prev.episodes?.map(e => e.id === ep.id ? { ...e, status: 'processing' } : e)
                }));
                updateEpProgress(ep.id, { step: '⚙️ Starting...', stepIndex: 0, percent: 2, lastLog: 'Initializing...' });

                // Show this episode's scenes on the right panel
                setActiveSceneEpisode(ep.id);

                const videoUrl = await runEpisodicProduction({
                    channel,
                    episode: ep,
                    onProgress: (msg) => {
                        console.log(`[${ep.title}] ${msg}`);
                        parseProgress(msg, ep.id);
                    },
                    onSceneReady: (sceneIndex, imageUrl, narration, total) => {
                        setEpisodeScenes(prev => ({
                            ...prev,
                            [ep.id]: [
                                ...(prev[ep.id] || []),
                                { imageUrl, narration, index: sceneIndex, total }
                            ].sort((a, b) => a.index - b.index)
                        }));
                    }
                });

                const permanentUrl = await uploadToStorage(videoUrl, `ep_${ep.id}.mp4`, 'episodes');
                updateEpProgress(ep.id, { step: '☁️ Uploading...', percent: 97, lastLog: 'Uploading to storage...' });

                await onGenerate({
                    isDirectSave: true,
                    videoUrl: permanentUrl,
                    thumbnailUrl: '',
                    cost: 9,
                    templateName: `${channel.name} - ${ep.title}`,
                    type: 'SHORTS',
                    channelId: channel.id,
                    episodeId: ep.id,
                    shouldRedirect: false
                });

                let youtubeId = '';
                if (channel.connected && channel.accessToken) {
                    try {
                        youtubeId = await uploadToYouTube(
                            channel.accessToken,
                            permanentUrl,
                            ep.title,
                            `${ep.description}\n\nGenerated by Loopgenie ${channel.name} series.`
                        );
                    } catch (ytError) {
                        console.warn('YouTube upload failed:', ytError);
                    }
                }

                updateEpProgress(ep.id, { step: '✅ Complete!', percent: 100, lastLog: 'Video ready in My Projects.' });
                setChannel(prev => ({
                    ...prev,
                    episodes: prev.episodes?.map(e => e.id === ep.id ? {
                        ...e,
                        status: 'completed' as const,
                        videoUrl: permanentUrl,
                        youtubeVideoId: youtubeId || e.youtubeVideoId
                    } : e)
                }));

            } catch (err: any) {
                console.error(`Failed to produce ${ep.title}:`, err);
                updateEpProgress(ep.id, { step: '❌ Failed', percent: 0, lastLog: err.message || 'Unknown error' });
                setChannel(prev => ({
                    ...prev,
                    episodes: prev.episodes?.map(e => e.id === ep.id ? { ...e, status: 'failed' as const } : e)
                }));
            }
        }
    };

    return (
        <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
                <div className="max-w-4xl mx-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-red-600 text-white rounded-2xl shadow-lg shadow-red-500/20">
                                <Youtube size={24} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">YouTube Channel Maker</h1>
                                <p className="text-gray-500 text-sm font-medium">Create an entire channel brand & content engine in minutes.</p>
                            </div>
                        </div>
                        <button
                            onClick={onBack}
                            className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl transition-all active:scale-95"
                        >
                            Back
                        </button>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-4 scrollbar-hide">
                        {['SETUP', 'BRANDING', 'EPISODES', 'PRODUCTION'].map((s, i) => (
                            <React.Fragment key={s}>
                                <div className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black tracking-widest whitespace-nowrap transition-all duration-300 ${step === s ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/20 scale-105' : 'text-gray-400'}`}>
                                    <span className={`w-6 h-6 flex items-center justify-center rounded-full border-2 transition-colors ${step === s ? 'border-white/40' : 'border-gray-200'}`}>{i + 1}</span>
                                    {s}
                                </div>
                                {i < 3 && <div className={`h-[2px] w-8 shrink-0 transition-colors duration-500 ${['BRANDING', 'EPISODES', 'PRODUCTION'].includes(step) && i === 0 || ['EPISODES', 'PRODUCTION'].includes(step) && i === 1 || step === 'PRODUCTION' && i === 2 ? 'bg-indigo-500' : 'bg-gray-100 dark:bg-gray-800'}`}></div>}
                            </React.Fragment>
                        ))}
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl flex items-center gap-3 text-red-600 dark:text-red-400 animate-in fade-in zoom-in duration-300">
                            <AlertCircle size={20} />
                            <p className="text-sm font-bold">{error}</p>
                        </div>
                    )}

                    {/* Step Content */}
                    {step === 'SETUP' && (
                        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-10 shadow-sm border border-gray-100 dark:border-gray-700 animate-in fade-in slide-in-from-bottom-8 duration-700">
                            <div className="mb-8">
                                <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Tell us about your channel</h2>
                                <p className="text-gray-500 font-medium">The more detail you provide, the better the AI can craft your brand.</p>
                            </div>
                            <div className="space-y-8">
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1">Channel Name (Optional)</label>
                                    <input
                                        type="text"
                                        value={channel.name}
                                        onChange={(e) => setChannel(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="e.g. Space Odyssey, History Buff, AI news..."
                                        className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-3xl p-5 text-gray-900 dark:text-white outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-bold text-lg placeholder:text-gray-300 dark:placeholder:text-gray-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1">What's the niche?</label>
                                    <textarea
                                        value={channel.description}
                                        onChange={(e) => setChannel(prev => ({ ...prev, description: e.target.value }))}
                                        rows={5}
                                        placeholder="e.g. I want to make a channel that explains scary true crime stories from the 1920s with a dark, cinematic aesthetic..."
                                        className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-3xl p-5 text-gray-900 dark:text-white outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium text-lg placeholder:text-gray-300 dark:placeholder:text-gray-600 resize-none leading-relaxed"
                                    />
                                </div>
                                <button
                                    onClick={handleStartSetup}
                                    disabled={isGenerating || !channel.description}
                                    className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-3xl font-black text-lg flex items-center justify-center gap-3 shadow-2xl shadow-indigo-500/30 transition-all active:scale-[0.98] group"
                                >
                                    {isGenerating ? <Loader2 className="animate-spin" size={24} /> : <Sparkles size={24} className="group-hover:rotate-12 transition-transform" />}
                                    {isGenerating ? 'Dreaming up your brand...' : 'Generate Channel Brand'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'BRANDING' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                            <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] p-10 shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-20 -mt-20"></div>

                                <div className="flex items-center justify-between mb-8 relative z-10">
                                    <h2 className="text-2xl font-black text-gray-900 dark:text-white">Channel Identity</h2>
                                    <button
                                        onClick={handleStartSetup}
                                        disabled={isGenerating}
                                        className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm hover:underline disabled:opacity-50"
                                    >
                                        {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                        Regenerate
                                    </button>
                                </div>

                                <div className="grid md:grid-cols-3 gap-10 relative z-10">
                                    <div className="flex flex-col items-center">
                                        <div className="w-40 h-40 bg-gray-50 dark:bg-gray-950 rounded-[2.5rem] flex items-center justify-center border-8 border-white dark:border-gray-700 overflow-hidden shadow-2xl mb-6 group cursor-pointer relative transition-transform hover:scale-105 active:scale-95">
                                            {channel.logoUrl ? (
                                                <img src={channel.logoUrl} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="text-center p-4">
                                                    <ImageIcon size={40} className="text-gray-300 mx-auto mb-2" />
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">No Logo</p>
                                                </div>
                                            )}
                                            <div
                                                onClick={(e) => { e.stopPropagation(); handleGenerateLogo(); }}
                                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-white"
                                            >
                                                <Wand2 size={24} className="mb-1" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">AI Logo</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center gap-3">
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Visual ID</span>
                                            {!channel.logoUrl && (
                                                <button
                                                    onClick={handleGenerateLogo}
                                                    disabled={isGenerating}
                                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all disabled:opacity-50"
                                                >
                                                    {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                                    Generate Logo
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="md:col-span-2 space-y-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block">Channel Name</label>
                                                <h3 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">{channel.name}</h3>
                                            </div>

                                            {/* YouTube Connection Card */}
                                            <div className={`p-4 rounded-2xl border-2 transition-all ${channel.connected ? 'bg-green-50/50 border-green-100 dark:bg-green-900/10 dark:border-green-900/30' : 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800'}`}>
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className={`p-2 rounded-lg ${channel.connected ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}>
                                                        <Youtube size={16} />
                                                    </div>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">YouTube API</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        if (channel.connected) {
                                                            setChannel(prev => ({ ...prev, connected: false }));
                                                        } else {
                                                            window.location.href = getYouTubeAuthUrl();
                                                        }
                                                    }}
                                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${channel.connected ? 'text-green-600 hover:bg-green-100' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20'}`}
                                                >
                                                    {channel.connected ? 'Connected' : 'Connect Channel'}
                                                </button>
                                                {channel.connected && (
                                                    <div className="mt-2 text-[10px] font-bold text-gray-400 truncate max-w-[120px]">
                                                        {channel.youtubeHandle}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block">Brand Story (Bio)</label>
                                            <p className="text-gray-600 dark:text-gray-400 font-medium leading-relaxed text-lg">{channel.bio}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-3">
                                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl text-xs font-black uppercase tracking-wider">
                                                <Sparkles size={14} />
                                                {channel.style}
                                            </div>
                                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl text-xs font-black uppercase tracking-wider">
                                                <Youtube size={14} />
                                                Verified Niche
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <button
                                    onClick={() => setStep('SETUP')}
                                    className="px-8 py-4 font-black text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors uppercase tracking-widest text-xs"
                                >
                                    ← Adjust Niche
                                </button>
                                <button
                                    onClick={() => setStep('EPISODES')}
                                    className="px-10 py-5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-[2rem] font-black shadow-2xl transition-all hover:scale-105 active:scale-[0.98] group flex items-center gap-3"
                                >
                                    <span>Next: Content Roadmap</span>
                                    <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'EPISODES' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                            <div className="flex items-end justify-between px-2">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2 tracking-tight">Content Roadmap</h2>
                                    <p className="text-gray-500 font-medium">AI has planned these 5 episodes based on your brand.</p>
                                </div>
                                <div className="text-xs font-black text-gray-400 uppercase tracking-widest bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-full hidden sm:block">
                                    {channel.episodes?.filter(e => e.status === 'approved').length} / 5 Approved
                                </div>
                            </div>

                            <div className="grid gap-5">
                                {channel.episodes?.map((episode, idx) => (
                                    <div
                                        key={episode.id}
                                        className={`group bg-white dark:bg-gray-800 border-2 rounded-[2rem] p-8 transition-all duration-300 ${episode.status === 'approved' ? 'border-green-500 shadow-xl shadow-green-500/10 scale-[1.02]' : 'border-transparent hover:border-indigo-500/30'}`}
                                    >
                                        <div className="flex items-start justify-between gap-6">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <span className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">EPISODE {idx + 1}</span>
                                                    {episode.status === 'approved' && (
                                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-100 dark:border-green-800">
                                                            <CheckCircle size={10} />
                                                            Approved
                                                        </div>
                                                    )}
                                                </div>
                                                <h3 className="text-xl font-black text-gray-900 dark:text-white mb-3 tracking-tight">{episode.title}</h3>
                                                <p className="text-gray-600 dark:text-gray-400 font-medium leading-relaxed line-clamp-2">{episode.description}</p>
                                            </div>
                                            <div className="flex flex-col gap-2 shrink-0">
                                                <button
                                                    onClick={() => handleApproveEpisode(episode.id)}
                                                    disabled={episode.status === 'approved'}
                                                    className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${episode.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-default' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-500/20 active:scale-95'}`}
                                                >
                                                    {episode.status === 'approved' ? 'Ready' : 'Approve'}
                                                </button>
                                                <button className="p-3 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-gray-50 dark:bg-gray-900 rounded-2xl transition-colors">
                                                    <Edit2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className={`relative rounded-[3rem] p-10 text-white shadow-2xl transition-all duration-700 ${channel.episodes?.some(e => e.status === 'approved') ? 'bg-indigo-600 shadow-indigo-500/40 scale-105' : 'bg-gray-800 opacity-80'}`}>
                                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-[3rem] -z-10 animate-pulse opacity-50"></div>

                                <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                                    <div className="text-center md:text-left">
                                        <h4 className="text-2xl font-black mb-2 tracking-tight">Ready to launch?</h4>
                                        <p className="text-white/80 font-medium max-w-sm">
                                            We'll start production for <strong>{channel.episodes?.filter(e => e.status === 'approved').length}</strong> videos. Each will be fully animated with voiceovers.
                                        </p>
                                    </div>
                                    <button
                                        onClick={runProduction}
                                        disabled={!channel.episodes?.some(e => e.status === 'approved')}
                                        className="px-10 py-5 bg-white text-indigo-600 rounded-[2rem] font-black text-lg shadow-xl hover:shadow-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-3"
                                    >
                                        <Play size={24} fill="currentColor" />
                                        Launch Production
                                    </button>
                                </div>
                            </div>

                            <div className="h-10"></div>
                        </div>
                    )}

                    {step === 'PRODUCTION' && (
                        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                            {/* Header */}
                            <div className="flex items-center gap-4 mb-8">
                                <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center relative shrink-0">
                                    <div className="absolute inset-0 bg-indigo-500/20 rounded-2xl animate-ping opacity-60"></div>
                                    <Play size={28} className="text-indigo-600 dark:text-indigo-400 relative z-10 ml-0.5" fill="currentColor" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Production Engine Live</h2>
                                    <p className="text-gray-500 text-sm font-medium">Scenes render live below as AI paints each frame.</p>
                                </div>
                                <button
                                    onClick={onBack}
                                    className="ml-auto px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-black text-sm shadow-xl hover:scale-105 active:scale-95 transition-all"
                                >
                                    → My Projects
                                </button>
                            </div>

                            <div className="grid lg:grid-cols-[340px,1fr] gap-6">
                                {/* Left: Episode Queue */}
                                <div className="space-y-3">
                                    {channel.episodes?.filter((e: any) => e.status === 'approved' || e.status === 'processing' || e.status === 'completed' || e.status === 'failed').map((ep: any) => {
                                        const prog = episodeProgress[ep.id];
                                        const pct = prog?.percent ?? (ep.status === 'completed' ? 100 : 0);
                                        const stepLabel = prog?.step ?? (ep.status === 'completed' ? '✅ Complete!' : ep.status === 'failed' ? '❌ Failed' : ep.status === 'processing' ? '⚙️ Starting...' : '🕐 Queued');
                                        const lastLog = prog?.lastLog ?? '';
                                        const isDone = ep.status === 'completed';
                                        const isFailed = ep.status === 'failed';
                                        const isActive = ep.status === 'processing';
                                        const isSelected = activeSceneEpisode === ep.id;
                                        const scenesDone = (episodeScenes[ep.id] || []).length;

                                        return (
                                            <button
                                                key={ep.id}
                                                onClick={() => setActiveSceneEpisode(ep.id)}
                                                className={`w-full text-left p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer ${isSelected
                                                    ? 'border-indigo-400 bg-indigo-50/80 dark:bg-indigo-900/20 shadow-lg shadow-indigo-500/10'
                                                    : isDone ? 'border-green-200 dark:border-green-900/40 bg-green-50/40 dark:bg-green-900/10'
                                                        : isFailed ? 'border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-900/10'
                                                            : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 hover:border-indigo-200'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className={`w-9 h-9 flex items-center justify-center rounded-xl shrink-0 ${isDone ? 'bg-green-500 text-white' : isFailed ? 'bg-red-500 text-white' : isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                                                        {isDone ? <CheckCircle size={17} /> : isFailed ? <AlertCircle size={17} /> : isActive ? <Loader2 size={17} className="animate-spin" /> : <Clock size={17} />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-black text-gray-900 dark:text-white truncate">{ep.title}</div>
                                                        <div className={`text-[11px] font-bold ${isDone ? 'text-green-600' : isFailed ? 'text-red-500' : isActive ? 'text-indigo-500' : 'text-gray-400'}`}>{stepLabel}</div>
                                                    </div>
                                                    {scenesDone > 0 && (
                                                        <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 px-2 py-1 rounded-full shrink-0">
                                                            {scenesDone} frames
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Progress bar */}
                                                <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-700 ${isDone ? 'bg-green-500' : isFailed ? 'bg-red-500' : 'bg-indigo-500'}`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                {lastLog && !isDone && !isFailed && (
                                                    <p className="text-[10px] text-gray-400 truncate mt-1">{lastLog}</p>
                                                )}
                                            </button>
                                        );
                                    })}

                                    <div className="text-center pt-2">
                                        <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                            {channel.episodes?.filter((e: any) => e.status === 'completed').length || 0} / {channel.episodes?.filter((e: any) => ['approved', 'processing', 'completed'].includes(e.status)).length || 0} complete
                                        </span>
                                    </div>
                                </div>

                                {/* Right: Live Scene Grid */}
                                <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-6 min-h-[500px]">
                                    {(() => {
                                        const displayEpId = activeSceneEpisode || channel.episodes?.find((e: any) => e.status === 'processing' || e.status === 'completed')?.id;
                                        const displayScenes = displayEpId ? (episodeScenes[displayEpId] || []) : [];
                                        const displayEp = channel.episodes?.find((e: any) => e.id === displayEpId);
                                        const prog = displayEpId ? episodeProgress[displayEpId] : null;
                                        const placeholderCount = displayEp ? (prog?.totalSteps ? Math.max(prog.totalSteps - 3, 1) : 6) : 6;

                                        return (
                                            <>
                                                <div className="flex items-center justify-between mb-5">
                                                    <div>
                                                        <h3 className="text-base font-black text-gray-900 dark:text-white">
                                                            {displayEp ? displayEp.title : 'Scene Preview'}
                                                        </h3>
                                                        <p className="text-xs text-gray-400 font-medium mt-0.5">
                                                            {displayScenes.length > 0 ? `${displayScenes.length} of ~${displayScenes[0]?.total || '?'} scenes rendered` : 'Waiting for first scene...'}
                                                        </p>
                                                    </div>
                                                    {displayScenes.length > 0 && (
                                                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-full">
                                                            🎨 Live
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-3 gap-3">
                                                    {/* Rendered scenes */}
                                                    {displayScenes.map((sc) => (
                                                        <div key={sc.index} className="relative rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-900 aspect-[9/16] group animate-in zoom-in duration-500">
                                                            <img
                                                                src={sc.imageUrl}
                                                                alt={`Scene ${sc.index + 1}`}
                                                                className="w-full h-full object-cover"
                                                            />
                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <div className="absolute bottom-0 left-0 right-0 p-3">
                                                                    <span className="text-[9px] font-black text-white/80 uppercase tracking-widest block mb-1">Scene {sc.index + 1}</span>
                                                                    <p className="text-white text-[10px] font-medium leading-tight line-clamp-3">{sc.narration}</p>
                                                                </div>
                                                            </div>
                                                            <div className="absolute top-2 left-2 w-6 h-6 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center">
                                                                <span className="text-white text-[9px] font-black">{sc.index + 1}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {/* Placeholder slots for upcoming scenes */}
                                                    {displayScenes.length < placeholderCount && Array.from({ length: Math.min(placeholderCount - displayScenes.length, 9) }).map((_, i) => (
                                                        <div key={`ph-${i}`} className="bg-gray-100 dark:bg-gray-900/60 rounded-2xl aspect-[9/16] flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700">
                                                            {i === 0 && displayEp?.status === 'processing' ? (
                                                                <div className="text-center">
                                                                    <Loader2 size={20} className="animate-spin text-indigo-400 mx-auto mb-2" />
                                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Painting</span>
                                                                </div>
                                                            ) : (
                                                                <ImageIcon size={20} className="text-gray-300 dark:text-gray-700" />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                {displayScenes.length === 0 && !displayEp && (
                                                    <div className="flex flex-col items-center justify-center h-80 text-center">
                                                        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
                                                            <ImageIcon size={28} className="text-indigo-400" />
                                                        </div>
                                                        <p className="text-gray-400 font-bold text-sm">Select an episode to preview its scenes</p>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
