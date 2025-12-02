
import React, { useState, useRef, useEffect } from 'react';
import { 
    Upload, FileVideo, Wand2, Play, CheckCircle, 
    Loader2, Download, ScanFace, ArrowRight, RefreshCw, AlertCircle, Globe, Sparkles, X, LayoutTemplate
} from 'lucide-react';
import { Template, APP_COSTS } from '../types';
import { generateVeoVideo, analyzeVideoFrames } from '../services/geminiService';
import { uploadToStorage } from '../services/storageService';
import { supabase } from '../supabaseClient';

interface TikTokClonerEditorProps {
    onBack: () => void;
    onGenerate: (data: any) => Promise<void> | void;
    userCredits: number;
    template: Template;
}

const MODELS = [
    { id: 'veo-3.1-fast-generate-preview', label: 'Wan 2.5 (Fast)', desc: 'Rapid generation, good motion.' },
    { id: 'veo-3.1-generate-preview', label: 'Gemini 3 Pro', desc: 'High fidelity, detailed textures.' },
    { id: 'veo-3.1-generate-preview', label: 'Sora Turbo (Beta)', desc: 'Experimental motion adherence.' },
];

const DEMO_VIDEO_URL = "https://cdn.coverr.co/videos/coverr-walking-in-a-city-at-night-4264/1080p.mp4";

export const TikTokClonerEditor: React.FC<TikTokClonerEditorProps> = ({ onBack, onGenerate, userCredits, template }) => {
    // State
    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [videoUrlInput, setVideoUrlInput] = useState('');
    const [isLoadingVideo, setIsLoadingVideo] = useState(false);
    const [tempStoragePath, setTempStoragePath] = useState<string | null>(null);
    
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Analysis Data
    const [extractedFrames, setExtractedFrames] = useState<string[]>([]);
    const [analyzedPrompt, setAnalyzedPrompt] = useState('');
    const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
    
    // Result
    const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    
    // Refs
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- 1. AUTO-ANALYZE EFFECT ---
    useEffect(() => {
        if (sourceFile) {
            handleAnalyze();
        }
    }, [sourceFile]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            loadFile(file);
        }
    };

    const loadFile = (file: File) => {
        // Reset state for new file
        setSourceFile(file);
        setTempStoragePath(null); 
        setExtractedFrames([]);
        setAnalyzedPrompt('');
        setFinalVideoUrl(null);
        setErrorMsg('');
        setIsAnalyzing(false); // Will be set true by useEffect -> handleAnalyze
    };

    const handleClear = () => {
        setSourceFile(null);
        setVideoUrlInput('');
        setExtractedFrames([]);
        setAnalyzedPrompt('');
        setFinalVideoUrl(null);
        setErrorMsg('');
    };

    const handleLoadDemo = async () => {
        setIsLoadingVideo(true);
        setErrorMsg('');
        try {
            const response = await fetch(DEMO_VIDEO_URL);
            if (!response.ok) throw new Error("Failed to fetch demo video");
            const blob = await response.blob();
            const file = new File([blob], "demo_night_city.mp4", { type: "video/mp4" });
            loadFile(file);
        } catch (e: any) {
            setErrorMsg("Failed to load demo: " + e.message);
        } finally {
            setIsLoadingVideo(false);
        }
    };

    const handleUrlFetch = async () => {
        if (!videoUrlInput.trim()) return;
        setIsLoadingVideo(true);
        setErrorMsg('');
        setSourceFile(null);

        try {
            // PROXY FLOW
            const { data, error } = await supabase.functions.invoke('video-proxy', {
                body: { url: videoUrlInput }
            });

            if (error) {
                console.warn("Proxy function failed, falling back to direct fetch attempt", error);
                throw new Error("Proxy Unavailable: " + error.message);
            }

            if (!data?.filePath) throw new Error("Proxy did not return a valid file path.");

            const filePath = data.filePath;
            setTempStoragePath(filePath);

            const { data: blob, error: downError } = await supabase.storage
                .from('assets')
                .download(filePath);

            if (downError) throw downError;
            if (!blob) throw new Error("Empty file downloaded.");

            const file = new File([blob], "downloaded_video.mp4", { type: blob.type || 'video/mp4' });
            loadFile(file);

        } catch (e: any) {
            console.error(e);
            let msg = "Failed to download video.";
            if (e.message.includes('Proxy Unavailable')) msg = "Video Proxy Service is not active. Please use the Upload box or Demo button.";
            setErrorMsg(msg);
        } finally {
            setIsLoadingVideo(false);
        }
    };

    const extractFrames = async (file: File): Promise<string[]> => {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'auto';
            video.crossOrigin = 'anonymous'; 
            video.src = URL.createObjectURL(file);
            video.muted = true;
            video.playsInline = true;
            
            const frames: string[] = [];
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Force play to ensure buffer is loaded (Fix for black frames)
            const capture = async () => {
                try {
                    await video.play();
                    video.pause();
                    
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const duration = video.duration;
                    
                    // Seek points: 10%, 50%, 90%
                    const seekPoints = [duration * 0.1, duration * 0.5, duration * 0.9];
                    
                    for (const time of seekPoints) {
                        video.currentTime = time;
                        await new Promise(r => {
                            // Wait for seek or timeout
                            const onSeek = () => { video.removeEventListener('seeked', onSeek); r(true); };
                            video.addEventListener('seeked', onSeek);
                            setTimeout(onSeek, 1000); // Timeout fallback
                        });
                        
                        if (ctx) {
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            frames.push(canvas.toDataURL('image/jpeg', 0.6));
                        }
                    }
                    resolve(frames);
                } catch (e) {
                    reject(e);
                } finally {
                    URL.revokeObjectURL(video.src);
                }
            };

            video.oncanplaythrough = capture;
            video.onerror = (e) => reject(e);
            
            // Timeout if metadata loads but canplaythrough never fires
            setTimeout(() => {
                if (frames.length === 0) {
                     // Try one last desperate capture
                     if (ctx) {
                         ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                         const data = canvas.toDataURL('image/jpeg', 0.5);
                         if(data.length > 1000) resolve([data]);
                         else reject(new Error("Video timeout"));
                     }
                }
            }, 5000);
        });
    };

    const handleAnalyze = async () => {
        if (!sourceFile) return;
        setIsAnalyzing(true);
        setErrorMsg('');

        try {
            // 1. Extract Frames
            const frames = await extractFrames(sourceFile);
            if (frames.length === 0) throw new Error("Could not extract frames.");
            setExtractedFrames(frames);
            
            // CLEANUP Temp File
            if (tempStoragePath) {
                supabase.storage.from('assets').remove([tempStoragePath]).catch(console.warn);
                setTempStoragePath(null); 
            }

            // 2. Send to Gemini
            const prompt = await analyzeVideoFrames(frames);
            setAnalyzedPrompt(prompt);

        } catch (e: any) {
            console.error(e);
            setErrorMsg("Failed to analyze video. Please upload a simpler MP4 file.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleGenerate = async () => {
        if (!analyzedPrompt) return;
        if (userCredits < APP_COSTS.TIKTOK_CLONE) {
            alert("Insufficient credits.");
            return;
        }

        setIsGenerating(true);
        setErrorMsg('');
        setFinalVideoUrl(null);

        try {
            const videoUrl = await generateVeoVideo(
                analyzedPrompt,
                { aspectRatio: '9:16' }, 
                selectedModel
            );
            setFinalVideoUrl(videoUrl);

            // Save
            const permUrl = await uploadToStorage(videoUrl, `clone_${Date.now()}.mp4`, 'clones');
            await onGenerate({
                isDirectSave: true,
                videoUrl: permUrl,
                thumbnailUrl: extractedFrames[0], 
                cost: APP_COSTS.TIKTOK_CLONE,
                templateName: 'Viral Clone',
                type: 'TIKTOK_CLONER',
                shouldRedirect: false
            });

        } catch (e: any) {
            console.error(e);
            setErrorMsg(e.message || "Generation failed. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="h-full bg-black text-white p-4 lg:p-8 overflow-y-auto flex justify-center">
            <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 h-fit">
                
                {/* --- LEFT: SOURCE --- */}
                <div className="space-y-6">
                    <div className="bg-[#121214] border border-[#27272a] rounded-3xl p-6 shadow-xl relative overflow-hidden">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                                    <ScanFace className="text-white" size={20} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold">Source Video</h2>
                                    <p className="text-gray-400 text-xs">Video to analyze & clone.</p>
                                </div>
                            </div>
                            {sourceFile && (
                                <button onClick={handleClear} className="text-gray-500 hover:text-white p-2 bg-gray-800 rounded-full transition-colors">
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        {!sourceFile ? (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                {/* URL Input */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2 px-1">
                                        <Globe size={12} /> TikTok / Reels URL
                                    </label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={videoUrlInput}
                                            onChange={(e) => setVideoUrlInput(e.target.value)}
                                            placeholder="Paste link here..."
                                            className="flex-1 bg-black border border-gray-700 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-500 outline-none transition-all focus:ring-1 focus:ring-indigo-500/50"
                                            onKeyDown={(e) => e.key === 'Enter' && handleUrlFetch()}
                                        />
                                        <button 
                                            onClick={handleUrlFetch}
                                            disabled={isLoadingVideo || !videoUrlInput}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                                        >
                                            {isLoadingVideo ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                                        </button>
                                    </div>
                                </div>

                                <div className="relative flex items-center justify-center">
                                    <div className="h-px bg-gray-800 w-full absolute"></div>
                                    <span className="bg-[#121214] px-3 text-xs text-gray-500 uppercase font-bold relative z-10">OR</span>
                                </div>

                                {/* Upload Zone */}
                                <div 
                                    className={`border-2 border-dashed rounded-2xl h-40 flex flex-col items-center justify-center cursor-pointer transition-all group ${
                                        errorMsg ? 'border-red-500/50 bg-red-900/10' : 'border-gray-700 hover:border-indigo-500/50 hover:bg-gray-800/50'
                                    }`}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="video/*" className="hidden" />
                                    <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mb-3 group-hover:bg-gray-700 transition-colors">
                                        <Upload size={20} className="text-gray-400 group-hover:text-white" />
                                    </div>
                                    <div className="text-sm font-bold text-gray-300">Click to Upload Video</div>
                                    <div className="text-xs text-gray-500 mt-1">MP4, MOV (Max 50MB)</div>
                                </div>

                                {/* Demo Action */}
                                <button 
                                    onClick={handleLoadDemo}
                                    className="w-full py-3 rounded-xl bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
                                >
                                    <Sparkles size={14} /> Use Demo Video
                                </button>
                            </div>
                        ) : (
                            <div className="bg-black border border-gray-800 rounded-xl p-4 flex items-center gap-4 animate-in fade-in">
                                <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <FileVideo className="text-indigo-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-white truncate">{sourceFile.name}</div>
                                    <div className="text-xs text-gray-500">{(sourceFile.size / 1024 / 1024).toFixed(1)} MB • Ready</div>
                                </div>
                                <div className="text-green-500">
                                    <CheckCircle size={20} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Extracted Frames Preview */}
                    {extractedFrames.length > 0 && (
                        <div className="bg-[#121214] border border-[#27272a] rounded-2xl p-6">
                            <h3 className="text-xs font-bold text-gray-500 uppercase mb-4">Extracted Keyframes</h3>
                            <div className="grid grid-cols-3 gap-3">
                                {extractedFrames.map((frame, i) => (
                                    <div key={i} className="aspect-[9/16] bg-gray-800 rounded-lg overflow-hidden border border-gray-700 relative group shadow-sm">
                                        <img src={frame} alt={`Frame ${i}`} className="w-full h-full object-cover" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* --- RIGHT: SETTINGS & GENERATE --- */}
                <div className="space-y-6 flex flex-col h-full">
                    <div className="bg-[#121214] border border-[#27272a] rounded-3xl p-6 shadow-xl flex-1 flex flex-col">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                                <LayoutTemplate className="text-white" size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">Clone Settings</h2>
                                <p className="text-gray-400 text-xs">AI analyzes style automatically.</p>
                            </div>
                        </div>

                        {/* Model Selector */}
                        <div className="mb-6">
                            <div className="space-y-2">
                                {MODELS.map(m => (
                                    <div 
                                        key={m.id}
                                        onClick={() => setSelectedModel(m.id)}
                                        className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                                            selectedModel === m.id 
                                            ? 'bg-purple-900/20 border-purple-500 shadow-[0_0_15px_-5px_rgba(168,85,247,0.4)]' 
                                            : 'bg-black border-gray-800 hover:border-gray-600'
                                        }`}
                                    >
                                        <div>
                                            <div className="text-sm font-bold text-gray-200">{m.label}</div>
                                            <div className="text-[10px] text-gray-500">{m.desc}</div>
                                        </div>
                                        {selectedModel === m.id && <CheckCircle size={16} className="text-purple-500" />}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Prompt Editor / Status */}
                        <div className="mb-6 flex-1 flex flex-col min-h-[150px]">
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center justify-between">
                                <span>Analyzed Prompt</span>
                                {isAnalyzing && <span className="text-purple-400 animate-pulse">Scanning video aesthetics...</span>}
                            </label>
                            
                            {isAnalyzing ? (
                                <div className="flex-1 bg-black border border-gray-800 rounded-xl p-6 flex flex-col items-center justify-center text-center animate-pulse">
                                    <Loader2 className="animate-spin text-purple-500 mb-3" size={32} />
                                    <p className="text-gray-400 text-sm font-medium">Extracting style & motion...</p>
                                    <p className="text-gray-600 text-xs mt-1">This takes about 5-10 seconds.</p>
                                </div>
                            ) : (
                                <textarea 
                                    value={analyzedPrompt}
                                    onChange={(e) => setAnalyzedPrompt(e.target.value)}
                                    placeholder={sourceFile ? "Waiting for analysis..." : "Upload a video to see the magic happen."}
                                    disabled={!sourceFile}
                                    className="flex-1 w-full bg-black border border-gray-800 rounded-xl p-4 text-sm text-gray-300 focus:ring-1 focus:ring-purple-500 outline-none resize-none leading-relaxed custom-scrollbar transition-all focus:border-purple-500"
                                />
                            )}
                        </div>

                        {/* Error Message */}
                        {errorMsg && (
                            <div className="bg-red-900/20 border border-red-900/50 text-red-200 p-4 rounded-xl text-sm mb-4 flex items-start gap-3 animate-in slide-in-from-top-2">
                                <AlertCircle size={18} className="flex-shrink-0 mt-0.5" /> 
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        {/* Final Output */}
                        {finalVideoUrl ? (
                            <div className="space-y-4 animate-in slide-in-from-bottom duration-500">
                                <div className="bg-black rounded-xl overflow-hidden border border-gray-800 relative group aspect-[9/16] max-h-[300px] mx-auto shadow-2xl">
                                    <video src={finalVideoUrl} controls autoPlay loop className="w-full h-full object-contain" />
                                </div>
                                <div className="flex gap-2">
                                    <a 
                                        href={finalVideoUrl} 
                                        download 
                                        className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <Download size={18} /> Download
                                    </a>
                                    <button 
                                        onClick={() => setFinalVideoUrl(null)} 
                                        className="bg-gray-800 hover:bg-gray-700 text-white px-4 rounded-xl transition-colors"
                                    >
                                        <RefreshCw size={18} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={handleGenerate}
                                disabled={!analyzedPrompt || isGenerating || isAnalyzing}
                                className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all mt-auto shadow-lg ${
                                    !analyzedPrompt || isGenerating || isAnalyzing
                                    ? 'bg-[#27272a] text-gray-500 cursor-not-allowed' 
                                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/20 active:scale-95'
                                }`}
                            >
                                {isGenerating ? <Loader2 className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                                {isGenerating ? 'Generating Video...' : isAnalyzing ? 'Analyzing...' : `Clone Video (${APP_COSTS.TIKTOK_CLONE} Credits)`}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
