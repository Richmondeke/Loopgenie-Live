
import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Video, Play, Music, Image as ImageIcon, Loader2, Save, Wand2, RefreshCw, BookOpen, Smartphone, CheckCircle, Clock, Film, ChevronRight, AlertCircle, Download, Layout, RectangleHorizontal, RectangleVertical, Square, Edit2, Key, Aperture, Pause, Volume2, Upload, Trash2, Mic } from 'lucide-react';
import { ShortMakerManifest, ProjectStatus, Template, APP_COSTS } from '../types';
import { generateStory, generateSceneImage, synthesizeAudio, assembleVideo } from '../services/shortMakerService';
import { getApiKey, generateSpeech } from '../services/geminiService';
import { uploadToStorage } from '../services/storageService';

interface ShortMakerEditorProps {
    onBack: () => void;
    onGenerate: (data: any) => Promise<void> | void;
    userCredits: number;
    template: Template;
}

type ProductionStep = 'INPUT' | 'SCRIPT' | 'VISUALS' | 'AUDIO' | 'ASSEMBLY' | 'COMPLETE';
type DurationTier = '15s' | '30s' | '60s';
type AspectRatio = '9:16' | '16:9' | '1:1' | '4:3';
type VisualModel = 'nano_banana' | 'flux' | 'gemini_pro';

// Expanded Voice Config with Metadata
const VOICES = [
    { id: 'Fenrir', label: 'Fenrir', gender: 'Male', tone: 'Deep, Epic', desc: 'Movie trailer voice' },
    { id: 'Kore', label: 'Kore', gender: 'Female', tone: 'Calm, Soothing', desc: 'Relaxing storybooks' },
    { id: 'Puck', label: 'Puck', gender: 'Male', tone: 'Energetic', desc: 'High energy TikToks' },
    { id: 'Charon', label: 'Charon', gender: 'Male', tone: 'Deep, Steady', desc: 'News & Documentary' },
    { id: 'Zephyr', label: 'Zephyr', gender: 'Female', tone: 'Gentle', desc: 'Educational content' },
];

const SCRIPT_STYLES = [
    { id: 'Viral Hook', label: 'Viral / Hook-Heavy', desc: 'Fast paced, starts with a question.' },
    { id: 'Corporate', label: 'Professional / Corporate', desc: 'Clean, informative, trustworthy.' },
    { id: 'Thriller', label: 'Scary / Thriller', desc: 'Suspenseful, dark, slow pacing.' },
    { id: 'Funny', label: 'Funny / Witty', desc: 'Lighthearted, jokes, punchy.' },
    { id: 'Emotional', label: 'Emotional / Sad', desc: 'Touching, slow, meaningful.' },
    { id: 'Educational', label: 'Educational / Fact-Based', desc: 'Clear, concise, explanatory.' },
];

export const ShortMakerEditor: React.FC<ShortMakerEditorProps> = ({ onBack, onGenerate, userCredits, template }) => {
    const isStorybook = template.mode === 'STORYBOOK';
    const [step, setStep] = useState<ProductionStep>('INPUT');
    const [manifest, setManifest] = useState<ShortMakerManifest | null>(null);
    
    // Input State
    const [idea, setIdea] = useState('');
    const [scriptStyle, setScriptStyle] = useState('Viral Hook');
    const [style, setStyle] = useState(isStorybook ? 'Watercolor Illustration' : 'Cinematic');
    const [seed, setSeed] = useState('');
    
    // Controls
    const [duration, setDuration] = useState<DurationTier>('30s');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>(isStorybook ? '16:9' : '9:16');
    const [visualModel, setVisualModel] = useState<VisualModel>('nano_banana');
    
    // Audio Settings
    const [selectedVoice, setSelectedVoice] = useState('Fenrir');
    const [bgMusic, setBgMusic] = useState<string | null>(null);
    const [bgMusicName, setBgMusicName] = useState<string>('');
    
    // Preview State
    const [playingVoicePreview, setPlayingVoicePreview] = useState<string | null>(null);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);

    // Progress
    const [logs, setLogs] = useState<string[]>([]);
    const [completedImages, setCompletedImages] = useState<number>(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [isSaved, setIsSaved] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);

    // Cost Calc
    const getCost = (d: DurationTier) => {
        if(d === '15s') return APP_COSTS.SHORTS_15S;
        if(d === '30s') return APP_COSTS.SHORTS_30S;
        return APP_COSTS.SHORTS_60S;
    };
    const COST = getCost(duration);

    useEffect(() => {
        return () => {
            if (previewAudioRef.current) previewAudioRef.current.pause();
        };
    }, []);

    const addLog = (msg: string) => {
        setLogs(prev => [...prev, msg]);
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    };

    const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) {
                alert("File too large. Please upload an MP3 under 10MB.");
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setBgMusic(reader.result as string);
                setBgMusicName(file.name);
            };
            reader.readAsDataURL(file);
        }
    };

    const playVoicePreview = async (e: React.MouseEvent, voiceId: string) => {
        e.stopPropagation();
        
        if (playingVoicePreview === voiceId) {
            previewAudioRef.current?.pause();
            setPlayingVoicePreview(null);
            return;
        }

        if (previewAudioRef.current) previewAudioRef.current.pause();
        setPlayingVoicePreview(voiceId);

        try {
            const previewText = "Hello creator, this is a preview of my voice.";
            const url = await generateSpeech(previewText, voiceId);
            
            const audio = new Audio(url);
            previewAudioRef.current = audio;
            audio.onended = () => setPlayingVoicePreview(null);
            audio.onerror = () => setPlayingVoicePreview(null);
            audio.play();
        } catch (e: any) {
            console.error("Preview failed", e);
            setPlayingVoicePreview(null);
            alert(e.message || "Failed to preview voice.");
        }
    };

    const runProduction = async (resume: boolean = false) => {
        if (!idea.trim()) return;
        setIsProcessing(true);
        setErrorMsg('');
        setIsSaved(false);

        if (!resume) {
            setStep('SCRIPT');
            setLogs([]);
            setCompletedImages(0);
            setManifest(null);
            setVideoUrl(null);
        } else {
            addLog("🔄 Resuming production...");
        }

        try {
            // STEP 1: SCRIPT
            let currentManifest: ShortMakerManifest | null = resume ? manifest : null;

            if (!currentManifest) {
                setStep('SCRIPT');
                addLog(`🧠 Dreaming up ${scriptStyle} story...`);
                currentManifest = await generateStory({
                    idea,
                    seed: seed || undefined,
                    style_tone: style,
                    mode: template.mode,
                    durationTier: duration,
                    aspectRatio: aspectRatio,
                    voice_preference: { voice: selectedVoice },
                    scriptStyle: scriptStyle 
                });
                setManifest(currentManifest);
                addLog(`✅ Script ready: "${currentManifest.title}"`);
            }

            if (!currentManifest) throw new Error("Failed to initialize story.");

            // STEP 2: VISUALS
            setStep('VISUALS');
            const workingScenes = [...currentManifest.scenes];
            const generationSeed = currentManifest.seed || Math.random().toString();
            const alreadyDoneCount = workingScenes.filter(s => !!s.generated_image_url).length;
            setCompletedImages(alreadyDoneCount);

            if (alreadyDoneCount < workingScenes.length) {
                addLog(`🎨 Generating visuals (${alreadyDoneCount}/${workingScenes.length} done)...`);
            }

            for (let i = 0; i < workingScenes.length; i++) {
                if (workingScenes[i].generated_image_url) continue;

                addLog(`Painting Scene ${i + 1}...`);
                let url = '';
                let attempts = 0;
                while (!url && attempts < 3) {
                    try {
                        url = await generateSceneImage(
                            workingScenes[i],
                            generationSeed,
                            style,
                            aspectRatio,
                            visualModel 
                        );
                        workingScenes[i].generated_image_url = url;
                        setManifest({ ...currentManifest, scenes: [...workingScenes] });
                        setCompletedImages(prev => prev + 1);
                    } catch (err) {
                        attempts++;
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }
                if (!url) throw new Error(`Failed to generate image for Scene ${i+1}`);
            }
            
            currentManifest = { ...currentManifest, scenes: workingScenes };
            setManifest(currentManifest);

            // STEP 3: AUDIO
            setStep('AUDIO');
            let generatedAudioUrl = currentManifest.generated_audio_url || '';

            if (!generatedAudioUrl) {
                addLog(`🎙️ Recording voiceover (${selectedVoice})...`);
                const elevenKey = localStorage.getItem('genavatar_eleven_key');
                try {
                    const audioRes = await synthesizeAudio(
                        currentManifest, 
                        elevenKey || undefined, 
                        selectedVoice 
                    );
                    generatedAudioUrl = audioRes.audioUrl;
                    addLog(`✅ Audio recording complete.`);
                } catch (err) {
                    console.warn(err);
                    addLog("⚠️ Audio issues, attempting fallback...");
                }
                currentManifest = { ...currentManifest, generated_audio_url: generatedAudioUrl };
                setManifest(currentManifest);
            }

            // STEP 4: ASSEMBLY
            setStep('ASSEMBLY');
            if (resume && videoUrl) {
                 addLog("⏩ Video already built.");
            } else {
                addLog("🎬 Stitching video & mixing background music...");
                const finalVideoUrl = await assembleVideo(currentManifest, bgMusic || undefined);
                setVideoUrl(finalVideoUrl);
                addLog("✅ Production Complete!");
                
                // STEP 5: SAVE
                setStep('COMPLETE');
                addLog("☁️ Saving to cloud...");
                try {
                    const permanentVideoUrl = await uploadToStorage(
                        finalVideoUrl, 
                        `${isStorybook ? 'story' : 'short'}_${Date.now()}.mp4`, 
                        'stories'
                    );
                    
                    // Try saving thumb
                    let thumbUrl = currentManifest.scenes[0].generated_image_url;
                    try {
                        if (thumbUrl) thumbUrl = await uploadToStorage(thumbUrl, `thumb_${Date.now()}.png`, 'thumbnails');
                    } catch(e) {}

                    await onGenerate({
                        isDirectSave: true,
                        videoUrl: permanentVideoUrl, 
                        thumbnailUrl: thumbUrl,
                        cost: COST,
                        templateName: currentManifest.title,
                        type: isStorybook ? 'STORYBOOK' : 'SHORTS',
                        shouldRedirect: false
                    });
                    setIsSaved(true);
                    addLog("💾 Saved to My Projects.");
                } catch (saveError: any) {
                    console.error("Save error:", saveError);
                    addLog(`❌ Save failed: ${saveError.message}. Please download manually.`);
                }
            }

        } catch (e: any) {
            console.error(e);
            setErrorMsg(e.message || "Production failed.");
            addLog(`❌ Error: ${e.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const StepIndicator = ({ current, target, label, icon: Icon }: any) => {
        const steps = ['INPUT', 'SCRIPT', 'VISUALS', 'AUDIO', 'ASSEMBLY', 'COMPLETE'];
        const currentIndex = steps.indexOf(current);
        const targetIndex = steps.indexOf(target);
        
        let statusColor = 'text-gray-600 bg-gray-800 border-gray-700'; 
        if (current === target) statusColor = 'text-blue-400 bg-blue-900/30 border-blue-500 animate-pulse'; 
        if (currentIndex > targetIndex) statusColor = 'text-green-400 bg-green-900/30 border-green-500'; 

        return (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${statusColor}`}>
                {currentIndex > targetIndex ? <CheckCircle size={14} /> : <Icon size={14} />}
                <span className="hidden sm:inline">{label}</span>
            </div>
        );
    };

    if (step === 'INPUT') {
        return (
            <div className="h-full bg-black text-white p-4 lg:p-8 overflow-y-auto flex items-center justify-center">
                <div className="max-w-5xl w-full bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                    {/* Header */}
                    <div className="text-center mb-8 relative z-10">
                        <div className={`w-14 h-14 bg-gradient-to-br ${isStorybook ? 'from-amber-400 to-orange-600' : 'from-pink-500 to-orange-400'} rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg transform rotate-3`}>
                            {isStorybook ? <BookOpen size={28} className="text-white" /> : <Smartphone size={28} className="text-white" />}
                        </div>
                        <h2 className="text-3xl font-bold mb-1">{isStorybook ? 'Storybook Maker' : 'ShortMaker'}</h2>
                        <p className="text-gray-400 text-sm">Create {isStorybook ? 'illustrated stories' : 'viral shorts'} in seconds.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
                        
                        {/* LEFT COLUMN: Concept & Visuals */}
                        <div className="lg:col-span-7 space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Video Idea</label>
                                <textarea
                                    value={idea}
                                    onChange={(e) => setIdea(e.target.value)}
                                    placeholder={isStorybook ? "A brave toaster goes on an adventure..." : "Top 5 facts about Mars..."}
                                    className="w-full bg-black/40 border border-gray-700 rounded-xl p-4 text-white placeholder-gray-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none h-28 text-base leading-relaxed"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Script Style</label>
                                    <select 
                                        value={scriptStyle}
                                        onChange={(e) => setScriptStyle(e.target.value)}
                                        className="w-full bg-black/40 border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-blue-500 text-sm"
                                    >
                                        {SCRIPT_STYLES.map(s => (
                                            <option key={s.id} value={s.id}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Art Style</label>
                                    <select 
                                        value={style}
                                        onChange={(e) => setStyle(e.target.value)}
                                        className="w-full bg-black/40 border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-blue-500 text-sm"
                                    >
                                        <option>Cinematic</option>
                                        <option>Photorealistic</option>
                                        <option>Watercolor Illustration</option>
                                        <option>Anime</option>
                                        <option>3D Disney Style</option>
                                        <option>Cyberpunk</option>
                                        <option>Oil Painting</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Visual Model</label>
                                    <select 
                                        value={visualModel}
                                        onChange={(e) => setVisualModel(e.target.value as VisualModel)}
                                        className="w-full bg-black/40 border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-blue-500 text-sm"
                                    >
                                        <option value="nano_banana">Nano Banana (Default, Fast)</option>
                                        <option value="flux">Flux (Artistic)</option>
                                        <option value="gemini_pro">Gemini 3 Pro (High Quality)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Duration</label>
                                    <div className="flex bg-black/40 rounded-lg p-1 border border-gray-700">
                                        {(['15s', '30s', '60s'] as DurationTier[]).map(t => (
                                            <button
                                                key={t}
                                                onClick={() => setDuration(t)}
                                                className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${
                                                    duration === t 
                                                    ? 'bg-gray-700 text-white shadow-sm' 
                                                    : 'text-gray-500 hover:text-gray-300'
                                                }`}
                                            >
                                                {t} <span className="opacity-50 font-normal ml-0.5">{getCost(t)}c</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Aspect Ratio</label>
                                <div className="flex gap-3">
                                    {[
                                        { id: '9:16', icon: RectangleVertical, label: 'Portrait' },
                                        { id: '16:9', icon: RectangleHorizontal, label: 'Landscape' },
                                        { id: '1:1', icon: Square, label: 'Square' }
                                    ].map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => setAspectRatio(item.id as AspectRatio)}
                                            className={`flex-1 py-2 px-3 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                                                aspectRatio === item.id
                                                ? 'bg-blue-900/20 border-blue-500 text-blue-200'
                                                : 'bg-black/40 border-gray-700 text-gray-500 hover:bg-gray-800'
                                            }`}
                                        >
                                            <item.icon size={16} />
                                            <span className="text-[10px] font-medium">{item.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Audio & Generate */}
                        <div className="lg:col-span-5 flex flex-col gap-6">
                            
                            {/* Voice Selection Grid */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Voice Actor</label>
                                <div className="grid grid-cols-2 gap-3 h-48 overflow-y-auto pr-1 custom-scrollbar">
                                    {VOICES.map(voice => (
                                        <div 
                                            key={voice.id}
                                            onClick={() => setSelectedVoice(voice.id)}
                                            className={`p-3 rounded-xl border cursor-pointer transition-all relative group flex flex-col justify-between ${
                                                selectedVoice === voice.id 
                                                ? 'bg-indigo-900/30 border-indigo-500 ring-1 ring-indigo-500/50' 
                                                : 'bg-black/40 border-gray-700 hover:bg-gray-800 hover:border-gray-600'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${selectedVoice === voice.id ? 'bg-indigo-400' : 'bg-gray-600'}`} />
                                                    <span className={`text-sm font-bold ${selectedVoice === voice.id ? 'text-white' : 'text-gray-300'}`}>{voice.label}</span>
                                                </div>
                                                <button
                                                    onClick={(e) => playVoicePreview(e, voice.id)}
                                                    className={`p-1.5 rounded-full transition-all ${
                                                        playingVoicePreview === voice.id 
                                                        ? 'bg-indigo-500 text-white' 
                                                        : 'bg-gray-700 text-gray-400 hover:bg-indigo-500 hover:text-white'
                                                    }`}
                                                >
                                                    {playingVoicePreview === voice.id ? <Pause size={10} /> : <Play size={10} />}
                                                </button>
                                            </div>
                                            <div className="text-[10px] text-gray-500 leading-tight">
                                                <span className="block font-semibold text-gray-400 mb-0.5">{voice.tone}</span>
                                                {voice.desc}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Background Music Upload */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Background Music (Optional)</label>
                                <div className={`relative p-4 rounded-xl border border-dashed transition-all ${
                                    bgMusic ? 'border-green-500/50 bg-green-900/10' : 'border-gray-700 bg-black/40 hover:bg-black/60'
                                }`}>
                                    {bgMusic ? (
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="w-8 h-8 bg-green-900/50 rounded-full flex items-center justify-center text-green-400 flex-shrink-0">
                                                    <Music size={14} />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-xs font-bold text-green-200 truncate max-w-[120px]">{bgMusicName}</span>
                                                    <span className="text-[10px] text-green-400/70">Ready to mix</span>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => { setBgMusic(null); setBgMusicName(''); }}
                                                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="flex flex-col items-center justify-center cursor-pointer py-3 group">
                                            <Upload size={20} className="text-gray-500 group-hover:text-gray-300 mb-2 transition-colors" />
                                            <span className="text-xs text-gray-400 font-medium group-hover:text-gray-200 transition-colors">Click to upload MP3 / WAV</span>
                                            <span className="text-[10px] text-gray-600 mt-1">We'll duck volume automatically</span>
                                            <input type="file" accept="audio/*" onChange={handleMusicUpload} className="hidden" />
                                        </label>
                                    )}
                                </div>
                            </div>

                            <div className="mt-auto pt-4 border-t border-gray-800">
                                <div className="flex justify-between items-center mb-3 px-1">
                                    <span className="text-xs font-medium text-gray-500">Estimated Cost</span>
                                    <span className={`text-sm font-bold ${userCredits < COST ? 'text-red-400' : 'text-indigo-300'}`}>
                                        {COST} Credits
                                    </span>
                                </div>
                                <button
                                    onClick={() => runProduction(false)}
                                    disabled={!idea.trim() || userCredits < COST}
                                    className={`w-full py-4 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-[0.98] ${
                                        !idea.trim() || userCredits < COST
                                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:shadow-indigo-500/25'
                                    }`}
                                >
                                    <Wand2 size={18} />
                                    <span>Generate Video</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // PRODUCTION VIEW (Same as before but cleaned up)
    return (
        <div className="h-full bg-black text-white flex flex-col overflow-hidden">
            <div className="h-16 border-b border-gray-800 bg-gray-900/50 flex items-center justify-between px-6 flex-shrink-0 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                        <ChevronRight className="rotate-180" size={20} />
                    </button>
                    <h3 className="font-bold text-lg hidden md:block text-gray-200">
                        {manifest?.title || 'Generating...'}
                    </h3>
                </div>
                <div className="flex items-center gap-2">
                    <StepIndicator current={step} target="SCRIPT" label="Script" icon={BookOpen} />
                    <div className="w-4 h-px bg-gray-700" />
                    <StepIndicator current={step} target="VISUALS" label="Visuals" icon={ImageIcon} />
                    <div className="w-4 h-px bg-gray-700" />
                    <StepIndicator current={step} target="AUDIO" label="Audio" icon={Music} />
                    <div className="w-4 h-px bg-gray-700" />
                    <StepIndicator current={step} target="ASSEMBLY" label="Output" icon={Film} />
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                <div className="flex-1 overflow-y-auto p-6 relative flex flex-col">
                    {errorMsg && (
                        <div className="mb-6 bg-red-900/20 border border-red-500/50 p-4 rounded-xl flex items-center gap-3 justify-between flex-wrap shrink-0">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="text-red-400 flex-shrink-0" />
                                <span className="text-red-200 text-sm break-all">{errorMsg}</span>
                            </div>
                            <div className="flex gap-2 mt-2 sm:mt-0">
                                <button onClick={() => setStep('INPUT')} className="bg-gray-800 border border-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-700 flex items-center gap-1"><Edit2 size={12} /> Edit</button>
                                <button onClick={() => runProduction(true)} className="bg-red-800 px-3 py-1 rounded text-xs hover:bg-red-700 flex items-center gap-1"><RefreshCw size={12} /> Retry</button>
                            </div>
                        </div>
                    )}

                    {step === 'COMPLETE' && videoUrl ? (
                        <div className="flex-1 flex flex-col items-center justify-center animate-in slide-in-from-top duration-500">
                             <div className={`w-full max-w-4xl bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-800 relative group`} style={{ aspectRatio: aspectRatio.replace(':', '/') === '9/16' ? '9/16' : '16/9', maxHeight: '60vh' }}>
                                <video src={videoUrl} controls autoPlay className="w-full h-full object-contain bg-black" />
                             </div>
                             <div className="flex justify-center mt-8 gap-4">
                                <a href={videoUrl} download={`${isStorybook ? 'story' : 'short'}-${Date.now()}.mp4`} className="bg-gray-800 hover:bg-gray-700 text-white px-8 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg transition-all"><Download size={20} /> Download</a>
                                {isSaved && <div className="bg-green-600/20 text-green-400 border border-green-600/50 px-8 py-3 rounded-full font-bold flex items-center gap-2"><CheckCircle size={20} /> Saved</div>}
                             </div>
                        </div>
                    ) : (
                         <div className="space-y-6 max-w-7xl mx-auto w-full">
                            <div className="flex items-center justify-between">
                                <h4 className="text-gray-400 text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                                    <Layout size={14} /> Live Storyboard
                                </h4>
                                {manifest?.generated_audio_url && step !== 'COMPLETE' && <div className="flex items-center gap-2 text-xs text-green-400 bg-green-900/20 px-2 py-1 rounded"><Volume2 size={12} /> Voiceover Ready</div>}
                            </div>
                            <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`}>
                                {manifest ? manifest.scenes.map((scene, idx) => (
                                    <div key={idx} className={`bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col transition-all duration-500 ${scene.generated_image_url ? 'opacity-100 ring-1 ring-gray-700' : 'opacity-50 scale-95'}`}>
                                        <div className="bg-black relative group" style={{ aspectRatio: aspectRatio.replace(':', '/') }}>
                                            {scene.generated_image_url ? (
                                                <img src={scene.generated_image_url} alt={`Scene ${idx+1}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center p-4">
                                                    {isProcessing && step === 'VISUALS' && completedImages === idx ? <Loader2 className="animate-spin text-blue-500 mb-2" /> : <ImageIcon className="text-gray-700 mb-2" />}
                                                    <span className="text-xs text-gray-600 text-center">{step === 'VISUALS' && completedImages === idx ? 'Painting...' : 'Pending'}</span>
                                                </div>
                                            )}
                                            <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-[10px] font-mono text-white">Scene {idx + 1}</div>
                                        </div>
                                        <div className="p-3 flex-1 bg-gray-900">
                                            <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-3">{scene.narration_text}</p>
                                        </div>
                                    </div>
                                )) : (
                                    // Skeletons
                                    Array.from({ length: 4 }).map((_, i) => (
                                        <div key={i} className="aspect-[9/16] bg-gray-800/50 rounded-xl animate-pulse" />
                                    ))
                                )}
                            </div>
                         </div>
                    )}
                </div>

                {/* Logs Sidebar */}
                <div className="w-full md:w-80 bg-[#0F0F0F] border-t md:border-t-0 md:border-l border-gray-800 flex flex-col font-mono text-xs shrink-0 h-48 md:h-auto">
                    <div className="p-3 border-b border-gray-800 bg-[#151515] font-bold text-gray-400 flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                        Production Log
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef}>
                        {logs.length === 0 && <div className="text-gray-600 italic text-center mt-10">Ready to start...</div>}
                        {logs.map((log, i) => (
                            <div key={i} className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                <span className="text-gray-600 select-none">[{i+1}]</span>
                                <span className={log.includes('❌') ? 'text-red-400' : log.includes('✅') ? 'text-green-400' : 'text-gray-300'}>{log}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
