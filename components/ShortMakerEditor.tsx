import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Video, Play, Music, Image as ImageIcon, Loader2, Save, Wand2, RefreshCw, BookOpen, Smartphone, CheckCircle, Clock, Film, ChevronRight, AlertCircle, Download, Layout, RectangleHorizontal, RectangleVertical, Square, Edit2, Key, Aperture } from 'lucide-react';
import { ShortMakerManifest, ProjectStatus, Template, APP_COSTS } from '../types';
import { generateStory, generateSceneImage, synthesizeAudio, assembleVideo } from '../services/shortMakerService';
import { getApiKey } from '../services/geminiService';
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

export const ShortMakerEditor: React.FC<ShortMakerEditorProps> = ({ onBack, onGenerate, userCredits, template }) => {
    const isStorybook = template.mode === 'STORYBOOK';
    const [step, setStep] = useState<ProductionStep>('INPUT');
    const [manifest, setManifest] = useState<ShortMakerManifest | null>(null);
    
    // Input State
    const [idea, setIdea] = useState('');
    const [style, setStyle] = useState(isStorybook ? 'Watercolor Illustration' : 'Cinematic');
    const [seed, setSeed] = useState('');
    
    // New Controls
    const [duration, setDuration] = useState<DurationTier>('30s');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>(isStorybook ? '16:9' : '9:16');
    const [visualModel, setVisualModel] = useState<VisualModel>('nano_banana');

    // Progress Tracking
    const [logs, setLogs] = useState<string[]>([]);
    const [completedImages, setCompletedImages] = useState<number>(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [isSaved, setIsSaved] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);

    // Dynamic Cost Calculation based on Duration
    const getCost = (d: DurationTier) => {
        if(d === '15s') return APP_COSTS.SHORTS_15S;
        if(d === '30s') return APP_COSTS.SHORTS_30S;
        return APP_COSTS.SHORTS_60S;
    };

    const COST = getCost(duration);

    const addLog = (msg: string) => {
        setLogs(prev => [...prev, msg]);
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    };

    const runProduction = async () => {
        if (!idea.trim()) return;
        
        setIsProcessing(true);
        setStep('SCRIPT');
        setLogs([]);
        setCompletedImages(0);
        setManifest(null);
        setVideoUrl(null);
        setErrorMsg('');
        setIsSaved(false);

        try {
            // STEP 1: SCRIPT / MANIFEST
            addLog(`🧠 Generating ${duration} story concept and script...`);
            const storyManifest = await generateStory({
                idea,
                seed: seed || undefined,
                style_tone: style,
                mode: template.mode,
                durationTier: duration,
                aspectRatio: aspectRatio
            });
            setManifest(storyManifest);
            addLog(`✅ Script generated successfully (${storyManifest.scenes.length} scenes).`);
            
            await new Promise(r => setTimeout(r, 1000));

            // STEP 2: VISUALS
            setStep('VISUALS');
            addLog(`🎨 Starting image generation (${aspectRatio}) using ${visualModel}...`);
            
            const workingScenes = [...storyManifest.scenes];
            const generationSeed = storyManifest.seed || Math.random().toString();

            for (let i = 0; i < workingScenes.length; i++) {
                addLog(`Painting Scene ${i + 1}: "${workingScenes[i].visual_description.substring(0, 30)}..."`);
                
                let url = '';
                let attempts = 0;
                const maxAttempts = 5; 
                
                while (!url && attempts < maxAttempts) {
                    try {
                        url = await generateSceneImage(
                            workingScenes[i],
                            generationSeed,
                            style,
                            aspectRatio,
                            visualModel 
                        );
                        workingScenes[i].generated_image_url = url;
                        setManifest({ ...storyManifest, scenes: [...workingScenes] });
                        setCompletedImages(prev => prev + 1);
                    } catch (err) {
                        attempts++;
                        console.warn(`Failed to gen image for scene ${i} (Attempt ${attempts}/${maxAttempts})`, err);
                        
                        if (attempts < maxAttempts) {
                            addLog(`⚠️ Retrying Scene ${i+1}...`);
                            const delay = 2000 * Math.pow(2, attempts - 1);
                            await new Promise(r => setTimeout(r, delay)); 
                        } else {
                            addLog(`❌ Failed to generate image for Scene ${i+1} after ${maxAttempts} attempts.`);
                        }
                    }
                }
            }
            addLog("✅ Visuals generated.");

            // STEP 3: AUDIO
            setStep('AUDIO');
            addLog("🎙️ Synthesizing voiceover narration...");
            
            const elevenKey = localStorage.getItem('genavatar_eleven_key');
            let generatedAudioUrl = '';
            
            try {
                const audioRes = await synthesizeAudio(storyManifest, elevenKey || undefined);
                generatedAudioUrl = audioRes.audioUrl;
                addLog(`✅ Audio created (${Math.round(audioRes.duration)}s).`);
            } catch (err) {
                console.warn("Audio failed", err);
                addLog("⚠️ Audio generation had issues, proceeding with silent/fallback.");
            }

            const manifestWithAudio = {
                ...storyManifest,
                scenes: workingScenes,
                generated_audio_url: generatedAudioUrl
            };
            setManifest(manifestWithAudio);

            // STEP 4: ASSEMBLY
            setStep('ASSEMBLY');
            addLog("🎬 Stitching video frames and syncing audio...");
            
            const finalVideoUrl = await assembleVideo(manifestWithAudio);
            setVideoUrl(finalVideoUrl);
            addLog("✅ Video assembly complete!");

            // FINISH & AUTO SAVE
            setStep('COMPLETE');
            addLog("☁️ Uploading to cloud storage...");
            
            try {
                const permanentVideoUrl = await uploadToStorage(
                    finalVideoUrl, 
                    `${isStorybook ? 'story' : 'short'}.webm`, 
                    'stories'
                );

                const thumbUrl = manifestWithAudio.scenes[0].generated_image_url;
                let permanentThumbUrl = thumbUrl;
                if (thumbUrl) {
                    permanentThumbUrl = await uploadToStorage(thumbUrl, 'thumbnail.png', 'thumbnails');
                }

                addLog("💾 Saving project to library...");
                
                await onGenerate({
                    isDirectSave: true,
                    videoUrl: permanentVideoUrl, 
                    thumbnailUrl: permanentThumbUrl,
                    cost: COST,
                    templateName: (isStorybook ? "Story: " : "Short: ") + manifestWithAudio.title,
                    type: isStorybook ? 'STORYBOOK' : 'SHORTS',
                    shouldRedirect: false
                });
                setIsSaved(true);
                addLog("✅ Project saved successfully.");
            } catch (saveError) {
                console.error("Save error:", saveError);
                addLog("❌ Error saving project. Please check your credits.");
            }

        } catch (e: any) {
            console.error(e);
            const msg = e.message || "Production failed.";
            setErrorMsg(msg);
            addLog(`❌ Critical Error: ${msg}`);
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
            <div className="h-full bg-black text-white p-6 overflow-y-auto flex items-center justify-center">
                <div className="max-w-2xl w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                    <div className={`absolute top-0 right-0 w-64 h-64 ${isStorybook ? 'bg-amber-600' : 'bg-pink-600'} opacity-10 blur-[80px] rounded-full pointer-events-none`} />

                    <div className="text-center mb-8 relative z-10">
                        <div className={`w-16 h-16 bg-gradient-to-br ${isStorybook ? 'from-amber-400 to-orange-600' : 'from-pink-500 to-orange-400'} rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg transform rotate-3`}>
                            {isStorybook ? <BookOpen size={32} className="text-white" /> : <Smartphone size={32} className="text-white" />}
                        </div>
                        <h2 className="text-3xl font-bold mb-2">{isStorybook ? 'Storybook Maker' : 'ShortMaker'}</h2>
                        <p className="text-gray-400">
                            {isStorybook 
                             ? 'Create an illustrated story from a simple prompt.' 
                             : 'Turn an idea into a viral YouTube Short instantly.'}
                        </p>
                    </div>

                    <div className="space-y-6 relative z-10">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Video Idea</label>
                            <textarea
                                value={idea}
                                onChange={(e) => setIdea(e.target.value)}
                                placeholder={isStorybook ? "A brave toaster goes on an adventure..." : "Top 5 facts about Mars..."}
                                className={`w-full bg-black/50 border border-gray-700 rounded-xl p-4 text-white placeholder-gray-500 focus:ring-2 ${isStorybook ? 'focus:ring-amber-500' : 'focus:ring-pink-500'} outline-none resize-none h-28 text-lg`}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Art Style</label>
                                    <select 
                                        value={style}
                                        onChange={(e) => setStyle(e.target.value)}
                                        className="w-full bg-black/50 border border-gray-700 rounded-lg p-3 text-white outline-none focus:border-white transition-colors"
                                    >
                                        <option>Cinematic</option>
                                        <option>Photorealistic</option>
                                        <option>Watercolor Illustration</option>
                                        <option>Anime</option>
                                        <option>3D Disney Style</option>
                                        <option>Cyberpunk</option>
                                        <option>Oil Painting</option>
                                        <option>Sketch</option>
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                                        <Aperture size={16} /> Visual Model
                                    </label>
                                    <select 
                                        value={visualModel}
                                        onChange={(e) => setVisualModel(e.target.value as VisualModel)}
                                        className="w-full bg-black/50 border border-gray-700 rounded-lg p-3 text-white outline-none focus:border-white transition-colors"
                                    >
                                        <option value="nano_banana">Nano Banana (Default, Fast)</option>
                                        <option value="flux">Flux (Artistic)</option>
                                        <option value="gemini_pro">Gemini 3 Pro (High Fidelity)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Duration (Approx)</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['15s', '30s', '60s'] as DurationTier[]).map(t => (
                                            <button
                                                key={t}
                                                onClick={() => setDuration(t)}
                                                className={`py-2 rounded-lg text-sm font-bold border transition-all flex flex-col items-center justify-center ${
                                                    duration === t 
                                                    ? (isStorybook ? 'bg-amber-600 border-amber-500 text-white' : 'bg-pink-600 border-pink-500 text-white')
                                                    : 'bg-black/30 border-gray-700 text-gray-400 hover:bg-white/10'
                                                }`}
                                            >
                                                <span>{t}</span>
                                                <span className="text-[10px] opacity-70 font-normal">{getCost(t)} Cr</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Aspect Ratio</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[
                                            { id: '9:16', icon: RectangleVertical, label: '9:16' },
                                            { id: '16:9', icon: RectangleHorizontal, label: '16:9' },
                                            { id: '1:1', icon: Square, label: '1:1' },
                                            { id: '4:3', icon: Layout, label: '4:3' }
                                        ].map((item) => (
                                            <button
                                                key={item.id}
                                                onClick={() => setAspectRatio(item.id as AspectRatio)}
                                                className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${
                                                    aspectRatio === item.id
                                                    ? (isStorybook ? 'bg-amber-600/20 border-amber-500 text-amber-200' : 'bg-pink-600/20 border-pink-500 text-pink-200')
                                                    : 'bg-black/30 border-gray-700 text-gray-500 hover:bg-white/10'
                                                }`}
                                                title={item.label}
                                            >
                                                <item.icon size={18} />
                                                <span className="text-[10px] mt-1 font-medium">{item.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-2">
                            <div className="flex justify-between text-xs text-gray-400 px-1 font-medium">
                                <span>Estimated Cost</span>
                                <span className={userCredits < COST ? "text-red-400 font-bold" : "text-green-400 font-bold"}>
                                    {COST} Credits
                                </span>
                            </div>
                            <button
                                onClick={runProduction}
                                disabled={!idea.trim()}
                                className={`w-full ${isStorybook ? 'bg-gradient-to-r from-amber-600 to-orange-600' : 'bg-gradient-to-r from-pink-600 to-purple-600'} hover:opacity-90 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:transform-none`}
                            >
                                <Wand2 size={20} />
                                <span>Generate Video ({COST} Credits)</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // PRODUCTION VIEW (unchanged)
    return (
        <div className="h-full bg-black text-white flex flex-col overflow-hidden">
            <div className="h-16 border-b border-gray-800 bg-gray-900/50 flex items-center justify-between px-6 flex-shrink-0 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                        <ChevronRight className="rotate-180" size={20} />
                    </button>
                    <h3 className="font-bold text-lg hidden md:block">
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
                <div className="flex-1 overflow-y-auto p-6 relative">
                    {isProcessing && (
                         <div className="mb-6 bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-xl flex items-center gap-3 animate-pulse">
                            <Loader2 className="animate-spin text-indigo-400" />
                            <span className="text-indigo-200 font-mono text-sm">
                                {step === 'SCRIPT' && "AI is dreaming up the story..."}
                                {step === 'VISUALS' && `Painting scenes... (${completedImages}/${manifest?.scenes?.length || '?'})`}
                                {step === 'AUDIO' && "Recording voiceover..."}
                                {step === 'ASSEMBLY' && "Stitching final video..."}
                                {step === 'COMPLETE' && "Saving to Cloud..."}
                            </span>
                         </div>
                    )}

                    {errorMsg && (
                        <div className="mb-6 bg-red-900/20 border border-red-500/50 p-4 rounded-xl flex items-center gap-3 justify-between flex-wrap">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="text-red-400 flex-shrink-0" />
                                <span className="text-red-200 text-sm break-all">{errorMsg}</span>
                            </div>
                            <div className="flex gap-2 mt-2 sm:mt-0">
                                <button onClick={() => setStep('INPUT')} className="bg-gray-800 border border-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-700 flex items-center gap-1"><Edit2 size={12} /> Edit</button>
                                <button onClick={runProduction} className="bg-red-800 px-3 py-1 rounded text-xs hover:bg-red-700 flex items-center gap-1"><RefreshCw size={12} /> Retry</button>
                            </div>
                        </div>
                    )}

                    {step === 'COMPLETE' && videoUrl && (
                        <div className="mb-8 animate-in slide-in-from-top duration-500">
                             <div className={`mx-auto bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-800 relative group`} style={{ aspectRatio: aspectRatio.replace(':', '/'), maxWidth: aspectRatio === '9:16' ? '400px' : '800px' }}>
                                <video src={videoUrl} controls autoPlay className="w-full h-full" />
                             </div>
                             <div className="flex justify-center mt-6 gap-4">
                                <a href={videoUrl} download={`story-${Date.now()}.webm`} className="bg-gray-800 hover:bg-gray-700 text-white px-8 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg transition-all"><Download size={20} /> Download</a>
                                {isSaved && <div className="bg-green-600/20 text-green-400 border border-green-600/50 px-8 py-3 rounded-full font-bold flex items-center gap-2"><CheckCircle size={20} /> Saved to Projects</div>}
                             </div>
                        </div>
                    )}

                    {manifest && (
                         <div className="space-y-6 max-w-7xl mx-auto">
                            <div className="flex items-center justify-between">
                                <h4 className="text-gray-400 text-sm font-bold uppercase tracking-wider">Storyboard</h4>
                                {manifest.generated_audio_url && step !== 'COMPLETE' && <div className="flex items-center gap-2 text-xs text-green-400 bg-green-900/20 px-2 py-1 rounded"><Music size={12} /> Audio Ready</div>}
                            </div>
                            <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`}>
                                {manifest.scenes.map((scene, idx) => (
                                    <div key={idx} className={`bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col transition-all duration-500 ${scene.generated_image_url ? 'opacity-100 scale-100' : 'opacity-50 scale-95'}`}>
                                        <div className="bg-black relative group" style={{ aspectRatio: aspectRatio.replace(':', '/') }}>
                                            {scene.generated_image_url ? (
                                                <img src={scene.generated_image_url} alt={`Scene ${idx+1}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center p-4">
                                                    {isProcessing && step === 'VISUALS' && completedImages === idx ? <Loader2 className="animate-spin text-blue-500 mb-2" /> : <ImageIcon className="text-gray-700 mb-2" />}
                                                    <span className="text-xs text-gray-600 text-center">{step === 'VISUALS' && completedImages === idx ? 'Painting...' : 'Waiting...'}</span>
                                                </div>
                                            )}
                                            <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-[10px] font-mono text-white">Scene {idx + 1}</div>
                                        </div>
                                        <div className="p-3 flex-1"><p className="text-xs text-gray-300 leading-relaxed line-clamp-3">{scene.narration_text}</p></div>
                                    </div>
                                ))}
                            </div>
                         </div>
                    )}
                </div>

                <div className="w-full md:w-80 bg-[#0F0F0F] border-t md:border-t-0 md:border-l border-gray-800 flex flex-col font-mono text-xs">
                    <div className="p-3 border-b border-gray-800 bg-[#151515] font-bold text-gray-400 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />Production Log</div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef}>
                        {logs.length === 0 && <div className="text-gray-600 italic">Waiting for input...</div>}
                        {logs.map((log, i) => (
                            <div key={i} className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                <span className="text-gray-600 select-none">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                                <span className={log.includes('❌') ? 'text-red-400' : log.includes('✅') ? 'text-green-400' : 'text-gray-300'}>{log}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};