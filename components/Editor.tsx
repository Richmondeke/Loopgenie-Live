
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, Sparkles, Video, Loader2, Wand2, Upload, Plus, Film, Image as ImageIcon, Music, Trash2, Youtube, Play, Pause, AlertCircle, ShoppingBag, Volume2, Maximize, MoreVertical, PenTool, Zap, Download, Save, Coins, Clapperboard, Layers, Settings as SettingsIcon, Type, MousePointer2, Search, X, Headphones, FileAudio, BookOpen, RectangleHorizontal, RectangleVertical } from 'lucide-react';
import { Template, HeyGenAvatar, HeyGenVoice, CompositionState, CompositionElement, ElementType, ProjectStatus } from '../types';
import { generateScriptContent, generateVeoVideo, generateVeoProductVideo, generateVeoImageToVideo, generateSpeech } from '../services/geminiService';
import { getAvatars, getVoices, generateVideo, checkVideoStatus } from '../services/heygenService';
import { searchPexels, readFileAsDataURL, StockAsset } from '../services/mockAssetService';
import { ShortMakerEditor } from './ShortMakerEditor';
import { stitchVideoFrames, cropVideo } from '../services/ffmpegService';

interface EditorProps {
  template: Template;
  onBack: () => void;
  onGenerate: (data: any) => Promise<void> | void; // Allow promise return
  isGenerating: boolean;
  heyGenKey?: string;
  userCredits: number;
}

// ==========================================
// 1. Avatar Editor (Updated with Crop/FFmpeg support)
// ==========================================
const AvatarEditor: React.FC<EditorProps> = ({ template, onGenerate, isGenerating, heyGenKey, userCredits }) => {
    const [script, setScript] = useState('');
    const [avatars, setAvatars] = useState<HeyGenAvatar[]>([]);
    const [allVoices, setAllVoices] = useState<HeyGenVoice[]>([]); 
    const [selectedAvatar, setSelectedAvatar] = useState<string>(template.defaultAvatarId || '');
    const [selectedVoice, setSelectedVoice] = useState<string>(template.defaultVoiceId || '');
    
    // Config Options
    const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16'); // Default to Portrait as requested
    const [generationMode, setGenerationMode] = useState<'HEYGEN' | 'STATIC'>('HEYGEN');

    // Resource Loading State
    const [isLoadingResources, setIsLoadingResources] = useState(true);
    const [isLocalGenerating, setIsLocalGenerating] = useState(false);
    const [generationStatus, setGenerationStatus] = useState<string>('');
    
    // AI State
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiTone, setAiTone] = useState('Professional');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    // Audio Preview State
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Credit Calculation
    const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
    // Static mode is cheaper (e.g. 1 credit vs normal rate)
    const estimatedCost = generationMode === 'STATIC' ? 1 : Math.max(1, Math.ceil(wordCount / 75));
    const hasSufficientCredits = userCredits >= estimatedCost;
  
    useEffect(() => {
      const loadResources = async () => {
          setIsLoadingResources(true);
          try {
              let loadedAvatars: HeyGenAvatar[] = [];
              let loadedVoices: HeyGenVoice[] = [];

              if (heyGenKey) {
                  try {
                      // Caching is handled inside these service calls
                      const [realAvatars, realVoices] = await Promise.all([
                          getAvatars(heyGenKey),
                          getVoices(heyGenKey)
                      ]);
                      if (realAvatars.length > 0) loadedAvatars = realAvatars;
                      if (realVoices.length > 0) loadedVoices = realVoices;
                  } catch (e) {
                      console.error("Failed to fetch from API", e);
                  }
              }

              const playableVoices = loadedVoices.filter(v => !!v.previewAudio);
              
              setAvatars(loadedAvatars);
              setAllVoices(playableVoices);

              if (!selectedAvatar && loadedAvatars.length > 0) {
                  setSelectedAvatar(loadedAvatars[0].id);
              }

          } catch (e) {
              console.error("Failed to load resources", e);
          } finally {
              setIsLoadingResources(false);
          }
      };
      loadResources();
    }, [heyGenKey]);

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);
  
    const currentAvatar = avatars.find(a => a.id === selectedAvatar);

    const filteredVoices = useMemo(() => {
        if (!currentAvatar) return allVoices;
        return allVoices.filter(v => 
            v.gender?.toLowerCase() === currentAvatar.gender?.toLowerCase()
        );
    }, [allVoices, currentAvatar]);

    useEffect(() => {
        if (filteredVoices.length > 0) {
            const isCurrentSelectionValid = filteredVoices.some(v => v.id === selectedVoice);
            if (!isCurrentSelectionValid) {
                setSelectedVoice(filteredVoices[0].id);
            }
        }
    }, [filteredVoices, selectedVoice]);

    const handleAiGenerate = async () => {
      if (!aiPrompt.trim()) return;
      setIsAiLoading(true);
      setAiError(null);
      try {
        const generatedContent = await generateScriptContent({
          topic: aiPrompt,
          tone: aiTone,
          templateVariables: []
        });
        if (generatedContent.script) {
            setScript(generatedContent.script);
        }
      } catch (e) {
        console.error(e);
        setAiError("Failed to generate script. Please try again.");
      } finally {
        setIsAiLoading(false);
      }
    };

    const handlePlayPreview = (e: React.MouseEvent, voice: HeyGenVoice) => {
        e.stopPropagation();
        
        if (playingVoiceId === voice.id) {
            audioRef.current?.pause();
            setPlayingVoiceId(null);
        } else {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            
            if (voice.previewAudio) {
                const audio = new Audio(voice.previewAudio);
                audio.onended = () => setPlayingVoiceId(null);
                audio.onerror = () => setPlayingVoiceId(null);
                audio.play().catch(() => setPlayingVoiceId(null));
                setPlayingVoiceId(voice.id);
                audioRef.current = audio;
            }
        }
    };

    const triggerGenerate = async () => {
        if (!hasSufficientCredits || !currentAvatar) return;
        
        setIsLocalGenerating(true);
        setGenerationStatus("Starting generation...");

        const targetW = aspectRatio === '9:16' ? 1080 : 1920;
        const targetH = aspectRatio === '9:16' ? 1920 : 1080;

        try {
            // STATIC MODE: Generate client-side using FFmpeg/Canvas (Simulated)
            if (generationMode === 'STATIC') {
                setGenerationStatus("Synthesizing Audio...");
                const voiceName = currentAvatar.gender === 'female' ? 'Kore' : 'Fenrir';
                const audioUrl = await generateSpeech(script, voiceName);

                setGenerationStatus("Stitching & Cropping Video...");
                // Pass target dimensions for cropping
                const videoUrl = await stitchVideoFrames([currentAvatar.previewUrl], audioUrl, 5000, targetW, targetH);

                setGenerationStatus("Saving Project...");
                // Save - We await this to ensure we catch errors here and don't close loading prematurely
                await onGenerate({
                    isDirectSave: true,
                    videoUrl: videoUrl,
                    thumbnailUrl: currentAvatar.previewUrl,
                    cost: estimatedCost,
                    type: 'AVATAR',
                    templateName: `${currentAvatar.name} (Static)`,
                    shouldRedirect: true
                });
            } 
            // HEYGEN MODE: API Call -> Poll -> Crop -> Save
            else {
                if (!heyGenKey) throw new Error("HeyGen API Key is missing.");
                
                setGenerationStatus("Sending request to HeyGen...");
                
                // 1. Start Job
                // We ask HeyGen for high-res but we will crop it ourselves anyway to be sure
                const jobId = await generateVideo(
                    heyGenKey,
                    template.id, 
                    { script }, 
                    selectedAvatar, 
                    selectedVoice, 
                    { width: targetW, height: targetH }
                );

                // 2. Poll for completion
                setGenerationStatus("Waiting for HeyGen to render (this may take a minute)...");
                let videoUrl = null;
                let attempts = 0;
                
                while (!videoUrl && attempts < 60) { // Timeout after ~5 mins
                    await new Promise(r => setTimeout(r, 5000));
                    const status = await checkVideoStatus(heyGenKey, jobId);
                    
                    if (status.status === ProjectStatus.COMPLETED && status.videoUrl) {
                        videoUrl = status.videoUrl;
                    } else if (status.status === ProjectStatus.FAILED) {
                        throw new Error(status.error || "HeyGen generation failed.");
                    }
                    attempts++;
                    setGenerationStatus(`Rendering... (${attempts * 5}s elapsed)`);
                }

                if (!videoUrl) throw new Error("Timed out waiting for HeyGen.");

                // 3. Post-Process Crop
                setGenerationStatus("Finalizing Crop (Client-Side)...");
                // We pass the remote URL to our local cropper
                // Note: This relies on the remote URL supporting CORS (crossOrigin anonymous)
                const croppedUrl = await cropVideo(videoUrl, targetW, targetH);

                // 4. Save
                setGenerationStatus("Saving Project...");
                await onGenerate({ 
                    isDirectSave: true,
                    videoUrl: croppedUrl,
                    thumbnailUrl: currentAvatar.previewUrl,
                    cost: estimatedCost,
                    type: 'AVATAR',
                    templateName: `${currentAvatar.name} (Lip-Sync)`,
                    shouldRedirect: true
                });
            }

        } catch (error: any) {
             console.error(error);
             alert(`Generation Failed: ${error.message}`);
             // Note: In a real app, we'd trigger a refund here if credits were deducted
        } finally {
             // Only clear loading state if we are still mounted/didn't redirect successfully in a way that unmounts
             // But actually, we want to clear it so the UI resets if error occurred.
             // If successful redirect happened, this component is unmounted, so state update is no-op/warn
             setIsLocalGenerating(false);
             setGenerationStatus("");
        }
    };
  
    if (isLoadingResources) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
                <Loader2 className="animate-spin text-indigo-600" size={48} />
                <p className="text-gray-500 font-medium animate-pulse">Loading voices and avatars...</p>
            </div>
        );
    }

    return (
      <div className="h-full flex flex-col lg:flex-row gap-8 overflow-hidden relative">
        {/* Blocking Overlay for Generation */}
        {isLocalGenerating && (
            <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center">
                <div className="bg-white p-8 rounded-2xl shadow-2xl border border-gray-100 flex flex-col items-center text-center max-w-sm">
                    <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Generating Video</h3>
                    <p className="text-gray-600 font-medium animate-pulse">{generationStatus}</p>
                    <p className="text-xs text-gray-400 mt-4">Please do not close this tab.</p>
                </div>
            </div>
        )}

        <div className="flex-1 flex flex-col h-full overflow-y-auto pr-2 pb-20 space-y-8 no-scrollbar">
            {/* AI Script Section */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <label className="text-xl font-bold text-gray-900">Script</label>
                    <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                        <select 
                            className="text-sm p-2 bg-transparent outline-none text-gray-700 font-medium cursor-pointer"
                            value={aiTone}
                            onChange={(e) => setAiTone(e.target.value)}
                        >
                            <option>Professional</option>
                            <option>Friendly</option>
                            <option>Excited</option>
                        </select>
                        <div className="h-4 w-px bg-gray-300 mx-1"></div>
                        <div className="relative flex items-center">
                            <input 
                                type="text"
                                placeholder="Topic (e.g. Sales pitch)..."
                                className="text-sm p-2 w-40 md:w-64 outline-none text-gray-900 placeholder-gray-400 bg-transparent"
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAiGenerate()}
                            />
                            <button 
                                onClick={handleAiGenerate}
                                disabled={isAiLoading || !aiPrompt}
                                className="p-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors ml-1"
                                title="Generate Script with AI"
                            >
                                {isAiLoading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                            </button>
                        </div>
                    </div>
                </div>
                
                {aiError && <div className="text-sm text-red-500 font-medium bg-red-50 p-2 rounded-lg">{aiError}</div>}
                
                <textarea
                    className="w-full p-6 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none h-64 text-gray-800 text-lg leading-relaxed font-medium placeholder-gray-400 shadow-sm bg-white"
                    placeholder="Type what you want your avatar to say..."
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                />
                
                <div className="flex justify-end text-sm text-gray-500 font-medium">
                    <span>{wordCount} words</span>
                    <span className="mx-2">•</span>
                    <span className={!hasSufficientCredits ? 'text-red-500 font-bold' : ''}>
                        Est. Cost: {estimatedCost} Credit{estimatedCost > 1 ? 's' : ''}
                    </span>
                </div>
            </div>
  
            {/* Voice Section */}
            <div className="space-y-4">
                <label className="block text-xl font-bold text-gray-900">Voice</label>
                {filteredVoices.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-500">
                         {allVoices.length === 0 
                            ? "No voices with preview capabilities found." 
                            : "No voices found matching this avatar's gender."}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredVoices.map(voice => (
                            <div
                                key={voice.id}
                                onClick={() => setSelectedVoice(voice.id)}
                                className={`group relative flex items-center p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                                    selectedVoice === voice.id
                                    ? 'border-indigo-600 bg-indigo-50 shadow-sm ring-1 ring-indigo-600'
                                    : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md'
                                }`}
                            >
                                <div className="flex-1 min-w-0 pr-10">
                                    <div className={`font-bold text-base mb-1 ${selectedVoice === voice.id ? 'text-indigo-900' : 'text-gray-900'}`}>
                                        {voice.name}
                                    </div>
                                    <div className={`text-xs font-medium uppercase tracking-wide ${selectedVoice === voice.id ? 'text-indigo-600' : 'text-gray-500'}`}>
                                        {voice.language} • {voice.gender}
                                    </div>
                                </div>
                                <div className="absolute right-4">
                                    <button 
                                        onClick={(e) => handlePlayPreview(e, voice)}
                                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                            playingVoiceId === voice.id 
                                            ? 'bg-indigo-600 text-white shadow-md scale-110' 
                                            : selectedVoice === voice.id
                                                ? 'bg-indigo-200 text-indigo-700 hover:bg-indigo-300'
                                                : 'bg-gray-100 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600'
                                        }`}
                                    >
                                        {playingVoiceId === voice.id ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-1" />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
  
        {/* Right Sidebar: Preview & Settings */}
        <div className="w-full lg:w-[400px] flex-shrink-0 flex flex-col gap-4">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-lg overflow-hidden flex-1 relative min-h-[400px] lg:min-h-0 flex flex-col">
             
             {/* Preview Image */}
             <div className="flex-1 relative overflow-hidden bg-gray-100">
                 {currentAvatar ? (
                     <img 
                        src={currentAvatar.previewUrl} 
                        alt="Preview" 
                        className={`w-full h-full object-cover transition-all duration-500 ${aspectRatio === '9:16' ? 'object-cover' : 'object-contain bg-black'}`}
                     />
                 ) : (
                     <div className="flex items-center justify-center h-full text-gray-400 font-medium">
                        No Avatar Selected
                     </div>
                 )}
                 <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
             </div>

             {/* Output Settings */}
             <div className="p-4 bg-gray-50 border-t border-gray-200 space-y-4">
                 
                 {/* Aspect Ratio Selector */}
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Format / Crop</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setAspectRatio('9:16')}
                            className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-sm font-medium transition-all ${
                                aspectRatio === '9:16' 
                                ? 'bg-indigo-100 border-indigo-500 text-indigo-700' 
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            <RectangleVertical size={16} /> 9:16 (Portrait)
                        </button>
                        <button
                            onClick={() => setAspectRatio('16:9')}
                            className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-sm font-medium transition-all ${
                                aspectRatio === '16:9' 
                                ? 'bg-indigo-100 border-indigo-500 text-indigo-700' 
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            <RectangleHorizontal size={16} /> 16:9 (Landscape)
                        </button>
                    </div>
                 </div>

                 {/* Generation Mode */}
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Generation Mode</label>
                    <div className="flex bg-gray-200 p-1 rounded-xl">
                        <button
                            onClick={() => setGenerationMode('HEYGEN')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                                generationMode === 'HEYGEN' ? 'bg-white shadow-sm text-indigo-900' : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Lip-Sync
                        </button>
                        <button
                            onClick={() => setGenerationMode('STATIC')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                                generationMode === 'STATIC' ? 'bg-white shadow-sm text-indigo-900' : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Static (FFmpeg)
                        </button>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2 text-center">
                        {generationMode === 'HEYGEN' 
                            ? "Premium quality via HeyGen. Cropped client-side for perfect fit." 
                            : "Static image with voiceover. Fast & cropped via FFmpeg."}
                    </p>
                 </div>
             </div>
          </div>
          
          <button
              onClick={triggerGenerate}
              disabled={isGenerating || isLocalGenerating || !script.trim() || !hasSufficientCredits}
              className={`w-full font-bold text-xl py-5 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all transform ${
                !hasSufficientCredits 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700'
              }`}
          >
              {isGenerating || isLocalGenerating ? (
                  <Loader2 className="animate-spin" size={28} />
              ) : !hasSufficientCredits ? (
                  <div className="flex flex-col items-center leading-tight">
                    <span>Insufficient Credits</span>
                    <span className="text-xs font-normal">Need {estimatedCost} credits</span>
                  </div>
              ) : (
                  <>
                    <Video size={28} />
                    <span>Generate ({estimatedCost} Credit{estimatedCost > 1 ? 's' : ''})</span>
                  </>
              )}
          </button>
        </div>
      </div>
    );
};

// ==========================================
// 8. Audiobook Editor (Rest of file unchanged)
// ==========================================
const AudiobookEditor: React.FC<EditorProps> = ({ onGenerate, userCredits }) => {
    // ... [Previous Audiobook code retained unchanged] ...
    const [topic, setTopic] = useState('');
    const [script, setScript] = useState('');
    const [isScriptLoading, setIsScriptLoading] = useState(false);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [voice, setVoice] = useState('Kore'); // Default Gemini voice
    const [isSaved, setIsSaved] = useState(false);
    
    // Preview State
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);

    // Cost calculation (1 credit per 200 words approx)
    const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
    const estimatedCost = Math.max(1, Math.ceil(wordCount / 200));
    const hasSufficientCredits = userCredits >= estimatedCost;

    useEffect(() => {
        return () => {
            if (previewAudioRef.current) {
                previewAudioRef.current.pause();
            }
        };
    }, []);

    const handleGenerateScript = async () => {
        if (!topic.trim()) return;
        setIsScriptLoading(true);
        setErrorMsg('');
        try {
            const result = await generateScriptContent({
                topic,
                tone: 'Engaging Storyteller',
                templateVariables: []
            });
            if (result.script) {
                setScript(result.script);
            }
        } catch (e: any) {
            setErrorMsg(e.message || "Failed to generate script");
        } finally {
            setIsScriptLoading(false);
        }
    };

    const handleGenerateAudio = async () => {
        if (!script.trim()) return;
        if (!hasSufficientCredits) {
            setErrorMsg("Insufficient credits");
            return;
        }

        setIsAudioLoading(true);
        setErrorMsg('');
        setAudioUrl(null);
        setIsSaved(false);

        try {
            const url = await generateSpeech(script, voice);
            setAudioUrl(url);
            
            // Auto Save
            await onGenerate({
                isDirectSave: true,
                videoUrl: url,
                thumbnailUrl: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80',
                cost: estimatedCost,
                type: 'AUDIOBOOK',
                shouldRedirect: false
            });
            setIsSaved(true);
        } catch (e: any) {
            setErrorMsg(e.message || "Failed to generate audio");
        } finally {
            setIsAudioLoading(false);
        }
    };

    const handlePreviewVoice = async () => {
        if (isPreviewPlaying && previewAudioRef.current) {
            previewAudioRef.current.pause();
            setIsPreviewPlaying(false);
            return;
        }

        setIsPreviewLoading(true);
        try {
            const previewText = `Hello, I am ${voice}. This is a preview of my voice.`;
            // Re-use generateSpeech but for short text
            const url = await generateSpeech(previewText, voice);
            
            const audio = new Audio(url);
            previewAudioRef.current = audio;
            
            audio.onended = () => {
                setIsPreviewPlaying(false);
            };
            
            audio.onerror = (e) => {
                console.error("Audio playback error", e);
                setIsPreviewPlaying(false);
            };

            await audio.play();
            setIsPreviewPlaying(true);
        } catch (e) {
            console.error("Preview generation failed", e);
            // We usually don't block main UI for preview failures, just log it
        } finally {
            setIsPreviewLoading(false);
        }
    };

    return (
        <div className="h-full bg-gray-50 text-gray-900 p-4 lg:p-8 overflow-y-auto rounded-xl">
            <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto h-full">
                {/* Input Column */}
                <div className="flex-1 flex flex-col gap-6">
                     <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                        <h2 className="text-xl font-bold flex items-center gap-2 mb-1">
                            <Headphones className="text-orange-500" />
                            Audiobook Generator
                        </h2>
                        <p className="text-sm text-gray-500 mb-6">Turn concepts into narrated stories.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Topic / Prompt</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                        placeholder="E.g. The history of coffee, A bedtime story about a dragon..."
                                        className="flex-1 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                                    />
                                    <button 
                                        onClick={handleGenerateScript}
                                        disabled={isScriptLoading || !topic}
                                        className="bg-orange-100 text-orange-700 px-4 rounded-xl font-bold hover:bg-orange-200 disabled:opacity-50 transition-colors"
                                    >
                                        {isScriptLoading ? <Loader2 className="animate-spin" /> : <Wand2 />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Script (Editable)</label>
                                <textarea 
                                    value={script}
                                    onChange={(e) => setScript(e.target.value)}
                                    placeholder="Your script will appear here..."
                                    className="w-full h-64 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none resize-none text-lg leading-relaxed"
                                />
                                <div className="text-right text-xs text-gray-500 mt-2">
                                    {wordCount} words • Est. Cost: {estimatedCost} Credits
                                </div>
                            </div>
                        </div>
                     </div>
                </div>

                {/* Controls & Output Column */}
                <div className="w-full lg:w-[400px] flex-shrink-0 flex flex-col gap-6">
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex-1 flex flex-col">
                        <div className="mb-6">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Voice Selection</label>
                            <div className="flex gap-2">
                                <select 
                                    value={voice}
                                    onChange={(e) => setVoice(e.target.value)}
                                    className="flex-1 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-white"
                                >
                                    <option value="Kore">Kore (Female, Calm)</option>
                                    <option value="Puck">Puck (Male, Energetic)</option>
                                    <option value="Fenrir">Fenrir (Male, Deep)</option>
                                    <option value="Charon">Charon (Male, Authoritative)</option>
                                    <option value="Zephyr">Zephyr (Female, Gentle)</option>
                                </select>
                                <button
                                    onClick={handlePreviewVoice}
                                    disabled={isPreviewLoading}
                                    className="w-12 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl transition-colors flex items-center justify-center flex-shrink-0"
                                    title="Preview Voice"
                                >
                                     {isPreviewLoading ? <Loader2 size={20} className="animate-spin" /> : isPreviewPlaying ? <Pause size={20} /> : <Play size={20} />}
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 bg-gray-50 rounded-xl border border-gray-200 flex flex-col items-center justify-center p-6 mb-6 relative overflow-hidden">
                            {audioUrl ? (
                                <div className="w-full text-center">
                                    <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                                        <Volume2 size={32} className="text-orange-600" />
                                    </div>
                                    <audio controls src={audioUrl} className="w-full" />
                                </div>
                            ) : isAudioLoading ? (
                                <div className="text-center">
                                    <Loader2 className="animate-spin text-orange-500 w-10 h-10 mx-auto mb-4" />
                                    <p className="text-gray-500 font-medium">Synthesizing Speech...</p>
                                </div>
                            ) : (
                                <div className="text-center text-gray-400">
                                    <FileAudio size={48} className="mx-auto mb-2 opacity-20" />
                                    <p>Audio Preview</p>
                                </div>
                            )}
                        </div>

                        {errorMsg && (
                            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4 text-center font-medium">
                                {errorMsg}
                            </div>
                        )}

                        <button
                            onClick={handleGenerateAudio}
                            disabled={isAudioLoading || !script.trim() || !hasSufficientCredits}
                            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
                        >
                            {isAudioLoading ? <Loader2 className="animate-spin" /> : <Sparkles />}
                            Generate Audio ({estimatedCost} Credits)
                        </button>

                        {isSaved && (
                            <div className="w-full py-3 rounded-xl bg-green-50 text-green-700 font-bold text-center border border-green-200 text-sm">
                                Saved to Projects
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ... Rest of the existing editors (ProductUGCEditor, TextToVideoEditor, ImageToVideoEditor, CompositionEditor, Editor) ...

// ==========================================
// 4. Product UGC Editor
// ==========================================
const ProductUGCEditor: React.FC<EditorProps> = ({ onGenerate, userCredits }) => {
    // ... [Previous UGC Code retained essentially as is, abbreviated for brevity in this response unless changes needed] ...
    // Note: Re-implementing the previous code here to ensure the XML replacement works correctly.
    const [images, setImages] = useState<(string | null)[]>([null, null, null]);
    const [prompt, setPrompt] = useState('');
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);
    const [status, setStatus] = useState<'idle' | 'generating' | 'completed' | 'error'>('idle');
    const [videoUri, setVideoUri] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [isSaved, setIsSaved] = useState(false);
    const COST = 1;
    const hasSufficientCredits = userCredits >= COST;

    const handleImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const newImages = [...images];
                newImages[index] = reader.result as string;
                setImages(newImages);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGenerate = async () => {
        const validImages = images.filter(img => img !== null) as string[];
        if (validImages.length === 0) {
            setErrorMsg("Please upload at least one product image.");
            return;
        }
        if (!prompt.trim()) {
            setErrorMsg("Please describe the scene.");
            return;
        }
        if (!hasSufficientCredits) {
            setErrorMsg("Insufficient credits.");
            return;
        }

        setStatus('generating');
        setErrorMsg('');
        setVideoUri(null);
        setIsSaved(false);

        try {
            if (window.aistudio && window.aistudio.hasSelectedApiKey) {
                const has = await window.aistudio.hasSelectedApiKey();
                if (!has) await window.aistudio.openSelectKey();
            }

            const uri = await generateVeoProductVideo(prompt, validImages);
            setVideoUri(uri);
            setStatus('completed');
            
            // Auto Save
            await onGenerate({
                 isDirectSave: true,
                 videoUrl: uri,
                 thumbnailUrl: images.find(i => i !== null) || null,
                 cost: COST,
                 type: 'UGC_PRODUCT',
                 shouldRedirect: false
            });
            setIsSaved(true);

        } catch (error: any) {
            console.error(error);
            setStatus('error');
            setErrorMsg(error.message || "Failed to generate video.");
        }
    };

    return (
        <div className="h-full bg-black text-white p-4 lg:p-8 overflow-y-auto rounded-xl">
             <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto h-full">
                <div className="w-full lg:w-[400px] flex-shrink-0 bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
                    <div>
                        <h2 className="text-xl font-semibold mb-1">UGC Product Video</h2>
                        <p className="text-gray-400 text-xs">Generate Videos from Product Images using Google's Veo 3.1 model</p>
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-3 block text-gray-300">Upload Images (up to 3)</label>
                        <div className="grid grid-cols-3 gap-3">
                            {images.map((img, idx) => (
                                <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-800 border border-gray-700 hover:border-gray-500 transition-colors group">
                                    {img ? (
                                        <>
                                            <img src={img} alt={`Product ${idx+1}`} className="w-full h-full object-cover" />
                                            <button 
                                                onClick={() => {
                                                    const newImages = [...images];
                                                    newImages[idx] = null;
                                                    setImages(newImages);
                                                }}
                                                className="absolute top-1 right-1 bg-black/50 p-1 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </>
                                    ) : (
                                        <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-gray-500 hover:text-gray-300">
                                            <Plus size={24} />
                                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(idx, e)} />
                                        </label>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-2 block text-gray-300">Prompt</label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Describe the scene, character actions, camera angles..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white placeholder-gray-500 focus:ring-1 focus:ring-blue-500 outline-none h-32 resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-400 mb-1 block">Resolution</label>
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-gray-300 flex justify-between items-center">
                                <span>720p</span>
                                <div className="rotate-90 text-xs">&rsaquo;</div>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-400 mb-1 block">Duration</label>
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-gray-300 flex justify-between items-center">
                                <span>8s</span>
                                <div className="rotate-90 text-xs">&rsaquo;</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-800/50 p-3 rounded-xl flex items-center justify-between border border-gray-700">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                            Generate Audio <Zap size={14} className="text-blue-400 fill-blue-400" />
                        </div>
                        <button 
                            onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                            className={`w-10 h-5 rounded-full relative transition-colors ${isAudioEnabled ? 'bg-white' : 'bg-gray-600'}`}
                        >
                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-black transition-all ${isAudioEnabled ? 'left-6' : 'left-1'}`} />
                        </button>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={status === 'generating' || images.filter(i => i).length === 0 || !hasSufficientCredits}
                        className={`w-full font-bold text-xl py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg mt-auto ${
                            status === 'generating' || images.filter(i => i).length === 0 || !hasSufficientCredits
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-teal-600 hover:bg-teal-500 text-white hover:shadow-teal-500/20'
                        }`}
                    >
                        {status === 'generating' ? <Loader2 className="animate-spin" /> : <Video size={20} />}
                        <span>{status === 'generating' ? 'Generating...' : `Generate Video (${COST} Credit)`}</span>
                    </button>
                    {errorMsg && <div className="text-red-400 text-xs text-center">{errorMsg}</div>}
                </div>

                <div className="flex-1 bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-gray-200 font-medium">Output Preview</h2>
                        {isSaved && (
                            <div className="px-3 py-1 bg-green-900/50 text-green-400 text-xs rounded-full border border-green-800">
                                Saved to Projects
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 bg-black rounded-xl overflow-hidden relative flex items-center justify-center border border-gray-800">
                        {status === 'completed' && videoUri ? (
                            <video src={videoUri} controls autoPlay loop className="w-full h-full object-contain" />
                        ) : status === 'generating' ? (
                            <div className="text-center">
                                <Loader2 className="animate-spin text-blue-500 w-12 h-12 mb-4 mx-auto" />
                                <p className="text-gray-500 font-medium">Generating your masterpiece...</p>
                            </div>
                        ) : (
                            <div className="text-gray-600 flex flex-col items-center">
                                <Video size={48} className="mb-2 opacity-20" />
                                <p>Preview area</p>
                            </div>
                        )}
                    </div>
                </div>
             </div>
        </div>
    );
};

// ==========================================
// 5. Text to Video Editor
// ==========================================
const TextToVideoEditor: React.FC<EditorProps> = ({ onGenerate, userCredits }) => {
    // ... [Previous AI Video Code retained as is] ...
    const [prompt, setPrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
    const [status, setStatus] = useState<'idle' | 'generating' | 'completed' | 'error'>('idle');
    const [videoUri, setVideoUri] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [isSaved, setIsSaved] = useState(false);
    const COST = 1;
    const hasSufficientCredits = userCredits >= COST;

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            setErrorMsg("Please enter a text prompt.");
            return;
        }
        if (!hasSufficientCredits) {
            setErrorMsg("Insufficient credits.");
            return;
        }

        setStatus('generating');
        setErrorMsg('');
        setVideoUri(null);
        setIsSaved(false);

        try {
            if (window.aistudio && window.aistudio.hasSelectedApiKey) {
                const has = await window.aistudio.hasSelectedApiKey();
                if (!has) await window.aistudio.openSelectKey();
            }

            const uri = await generateVeoVideo(prompt, aspectRatio);
            setVideoUri(uri);
            setStatus('completed');
            
            // Auto Save
            await onGenerate({
                 isDirectSave: true,
                 videoUrl: uri,
                 thumbnailUrl: null, 
                 cost: COST,
                 type: 'TEXT_TO_VIDEO',
                 shouldRedirect: false
            });
            setIsSaved(true);

        } catch (error: any) {
            console.error(error);
            setStatus('error');
            setErrorMsg(error.message || "Failed to generate video.");
        }
    };

    return (
        <div className="h-full bg-black text-white p-4 lg:p-8 overflow-y-auto rounded-xl">
             <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto h-full">
                <div className="w-full lg:w-[400px] flex-shrink-0 bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
                    <div>
                        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
                            <Clapperboard size={20} className="text-purple-400" />
                            AI Video Generator
                        </h2>
                        <p className="text-gray-400 text-xs">Turn text into cinematic video using Veo 3.1</p>
                    </div>

                    <div className="flex-1">
                        <label className="text-sm font-medium mb-2 block text-gray-300">Prompt</label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="A futuristic city with flying cars in cyberpunk style, cinematic lighting..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-white placeholder-gray-500 focus:ring-1 focus:ring-purple-500 outline-none h-48 resize-none leading-relaxed"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-400 mb-1 block">Aspect Ratio</label>
                            <select 
                                value={aspectRatio}
                                onChange={(e) => setAspectRatio(e.target.value as any)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-gray-300 outline-none focus:border-purple-500"
                            >
                                <option value="16:9">16:9 (Landscape)</option>
                                <option value="9:16">9:16 (Portrait)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-400 mb-1 block">Duration</label>
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-gray-500 flex justify-between items-center cursor-not-allowed">
                                <span>~5s (Preview)</span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={status === 'generating' || !prompt || !hasSufficientCredits}
                        className={`w-full font-bold text-xl py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg mt-6 ${
                            status === 'generating' || !prompt || !hasSufficientCredits
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-purple-600 hover:bg-purple-500 text-white hover:shadow-purple-500/20'
                        }`}
                    >
                        {status === 'generating' ? <Loader2 className="animate-spin" /> : <Clapperboard size={20} />}
                        <span>{status === 'generating' ? 'Generating...' : `Generate Video (${COST} Credit)`}</span>
                    </button>
                    {errorMsg && <div className="text-red-400 text-xs text-center">{errorMsg}</div>}
                </div>

                <div className="flex-1 bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-gray-200 font-medium">Output Preview</h2>
                        {isSaved && (
                            <div className="px-3 py-1 bg-green-900/50 text-green-400 text-xs rounded-full border border-green-800">
                                Saved to Projects
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 bg-black rounded-xl overflow-hidden relative flex items-center justify-center border border-gray-800">
                        {status === 'completed' && videoUri ? (
                            <video src={videoUri} controls autoPlay loop className="w-full h-full object-contain" />
                        ) : status === 'generating' ? (
                            <div className="text-center">
                                <Loader2 className="animate-spin text-purple-500 w-12 h-12 mb-4 mx-auto" />
                                <p className="text-gray-500 font-medium">Creating magic...</p>
                            </div>
                        ) : (
                            <div className="text-gray-600 flex flex-col items-center">
                                <Clapperboard size={48} className="mb-2 opacity-20" />
                                <p>Preview area</p>
                            </div>
                        )}
                    </div>
                </div>
             </div>
        </div>
    );
};

// ... ImageToVideoEditor, CompositionEditor ...
// ==========================================
// 9. Image To Video Editor
// ==========================================

const ImageToVideoEditor: React.FC<EditorProps> = ({ onGenerate, userCredits }) => {
    const [image, setImage] = useState<string | null>(null);
    const [prompt, setPrompt] = useState('');
    const [status, setStatus] = useState<'idle' | 'generating' | 'completed' | 'error'>('idle');
    const [videoUri, setVideoUri] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [isSaved, setIsSaved] = useState(false);
    const COST = 1;
    const hasSufficientCredits = userCredits >= COST;

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGenerate = async () => {
        if (!image) {
            setErrorMsg("Please upload an image.");
            return;
        }
        if (!hasSufficientCredits) {
            setErrorMsg("Insufficient credits.");
            return;
        }

        setStatus('generating');
        setErrorMsg('');
        setVideoUri(null);
        setIsSaved(false);

        try {
            if (window.aistudio && window.aistudio.hasSelectedApiKey) {
                const has = await window.aistudio.hasSelectedApiKey();
                if (!has) await window.aistudio.openSelectKey();
            }

            const uri = await generateVeoImageToVideo(prompt, image);
            setVideoUri(uri);
            setStatus('completed');
            
            // Auto Save
            await onGenerate({
                 isDirectSave: true,
                 videoUrl: uri,
                 thumbnailUrl: image, 
                 cost: COST,
                 type: 'IMAGE_TO_VIDEO',
                 shouldRedirect: false
            });
            setIsSaved(true);

        } catch (error: any) {
            console.error(error);
            setStatus('error');
            setErrorMsg(error.message || "Failed to generate video.");
        }
    };

    return (
        <div className="h-full bg-black text-white p-4 lg:p-8 overflow-y-auto rounded-xl">
             <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto h-full">
                <div className="w-full lg:w-[400px] flex-shrink-0 bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-6">
                    <div>
                        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
                            <ImageIcon size={20} className="text-sky-400" />
                            Image to Video
                        </h2>
                        <p className="text-gray-400 text-xs">Animate a still image using Veo 3.1</p>
                    </div>

                    <div className="flex-1 flex flex-col gap-4">
                        <label className="text-sm font-medium block text-gray-300">Source Image</label>
                        <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-800 border border-gray-700 hover:border-sky-500 transition-colors group">
                            {image ? (
                                <>
                                    <img src={image} alt="Source" className="w-full h-full object-cover" />
                                    <button 
                                        onClick={() => setImage(null)}
                                        className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </>
                            ) : (
                                <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-gray-500 hover:text-gray-300">
                                    <Upload size={32} className="mb-2" />
                                    <span className="text-xs font-medium">Click to upload image</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                </label>
                            )}
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block text-gray-300">Motion Prompt (Optional)</label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Describe the motion e.g., 'The water flows gently', 'Camera pans right'..."
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-white placeholder-gray-500 focus:ring-1 focus:ring-sky-500 outline-none h-32 resize-none leading-relaxed"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={status === 'generating' || !image || !hasSufficientCredits}
                        className={`w-full font-bold text-xl py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg ${
                            status === 'generating' || !image || !hasSufficientCredits
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-sky-600 hover:bg-sky-500 text-white hover:shadow-sky-500/20'
                        }`}
                    >
                        {status === 'generating' ? (
                            <Loader2 className="animate-spin" />
                        ) : (
                            <Video size={20} />
                        )}
                        <span>{status === 'generating' ? 'Generating...' : `Generate Video (${COST} Credit)`}</span>
                    </button>
                    {errorMsg && <div className="text-red-400 text-xs text-center">{errorMsg}</div>}
                </div>

                <div className="flex-1 bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-gray-200 font-medium">Output Preview</h2>
                        {isSaved && (
                            <div className="px-3 py-1 bg-green-900/50 text-green-400 text-xs rounded-full border border-green-800">
                                Saved to Projects
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 bg-black rounded-xl overflow-hidden relative flex items-center justify-center border border-gray-800">
                        {status === 'completed' && videoUri ? (
                            <video src={videoUri} controls autoPlay loop className="w-full h-full object-contain" />
                        ) : status === 'generating' ? (
                            <div className="text-center">
                                <Loader2 className="animate-spin text-sky-500 w-12 h-12 mb-4 mx-auto" />
                                <p className="text-gray-500 font-medium">Animating your image...</p>
                            </div>
                        ) : (
                            <div className="text-gray-600 flex flex-col items-center">
                                <Film size={48} className="mb-2 opacity-20" />
                                <p>Preview area</p>
                            </div>
                        )}
                    </div>
                </div>
             </div>
        </div>
    );
};


// ==========================================
// 6. Composition Editor (Full CapCut Style)
// ==========================================

const DEFAULT_COMPOSITION: CompositionState = {
    name: "New Video Project",
    width: 720,
    height: 1280,
    duration: 10,
    elements: [
        {
          id: "txt_1",
          type: "text",
          name: "Headline",
          track: 2,
          startTime: 0,
          duration: 5,
          x: 10, y: 10, width: 80, height: 10,
          text: "Welcome to LoopGenie",
          fillColor: "#FFFFFF",
          fontSize: 48,
          textAlign: "center"
        }
    ]
};

const CompositionEditor: React.FC<EditorProps> = ({ onGenerate, userCredits }) => {
    // ... [Same Composition Editor code] ...
    const [state, setState] = useState<CompositionState>(DEFAULT_COMPOSITION);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [assetTab, setAssetTab] = useState<'upload' | 'pexels'>('upload');
    const [searchQuery, setSearchQuery] = useState('');
    const [stockImages, setStockImages] = useState<StockAsset[]>([]);
    const [draggedElement, setDraggedElement] = useState<{id: string, startX: number, startY: number, startLeft: number, startTop: number} | null>(null);

    // Asset Loading
    useEffect(() => {
        if (assetTab === 'pexels') {
            searchPexels(searchQuery).then(setStockImages);
        }
    }, [assetTab, searchQuery]);

    // Playback Loop
    useEffect(() => {
        let animationFrame: number;
        if (isPlaying) {
            let lastTime = performance.now();
            const loop = (now: number) => {
                const dt = (now - lastTime) / 1000;
                lastTime = now;
                setCurrentTime(prev => {
                    const next = prev + dt;
                    if (next >= state.duration) {
                        setIsPlaying(false);
                        return 0;
                    }
                    return next;
                });
                animationFrame = requestAnimationFrame(loop);
            };
            animationFrame = requestAnimationFrame(loop);
        }
        return () => cancelAnimationFrame(animationFrame);
    }, [isPlaying, state.duration]);

    // Handlers
    const addElement = (type: ElementType, src?: string, text?: string) => {
        const newEl: CompositionElement = {
            id: `el_${Date.now()}`,
            type,
            name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${state.elements.length + 1}`,
            track: 1, // Add to bottom track
            startTime: currentTime, // Add at playhead
            duration: 5,
            x: 10, y: 10, width: type === 'text' ? 80 : 50, height: type === 'text' ? 10 : 30,
            text: text || (type === 'text' ? 'New Text' : undefined),
            src,
            fillColor: type === 'text' ? '#FFFFFF' : undefined,
            fontSize: 24,
            textAlign: 'center'
        };
        setState(prev => ({ ...prev, elements: [...prev.elements, newEl] }));
        setSelectedId(newEl.id);
    };

    const updateElement = (id: string, updates: Partial<CompositionElement>) => {
        setState(prev => ({
            ...prev,
            elements: prev.elements.map(el => el.id === id ? { ...el, ...updates } : el)
        }));
    };

    const deleteElement = (id: string) => {
        setState(prev => ({
            ...prev,
            elements: prev.elements.filter(el => el.id !== id)
        }));
        setSelectedId(null);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = await readFileAsDataURL(file);
        const type = file.type.startsWith('video') ? 'video' : 'image';
        addElement(type, url);
    };

    const selectedElement = state.elements.find(el => el.id === selectedId);

    // Canvas Dragging
    const handleCanvasMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setSelectedId(id);
        const el = state.elements.find(e => e.id === id);
        if (el) {
            setDraggedElement({
                id,
                startX: e.clientX,
                startY: e.clientY,
                startLeft: el.x,
                startTop: el.y
            });
        }
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (draggedElement) {
            const dx = e.clientX - draggedElement.startX;
            const dy = e.clientY - draggedElement.startY;
            // Convert pixels to percentage roughly (assuming canvas container size)
            // This is a simplification. Real implementation needs ref to container.
            // Let's assume container is approx 360px wide for calculation
            const pxToPercentW = 100 / 360; 
            const pxToPercentH = 100 / 640; 

            updateElement(draggedElement.id, {
                x: draggedElement.startLeft + (dx * pxToPercentW),
                y: draggedElement.startTop + (dy * pxToPercentH)
            });
        }
    };

    const handleCanvasMouseUp = () => {
        setDraggedElement(null);
    };

    return (
        <div 
            className="h-full bg-[#1e1e1e] text-white flex flex-col overflow-hidden"
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
        >
             {/* Toolbar */}
             <div className="h-12 border-b border-gray-700 flex items-center px-4 justify-between bg-[#252525]">
                 <div className="flex items-center gap-4">
                     <span className="font-semibold text-gray-300">{state.name}</span>
                     <span className="text-xs text-gray-500">{state.width}x{state.height}</span>
                 </div>
                 <div className="flex items-center gap-2">
                     <button className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-md font-medium transition-colors">
                        Export Video
                     </button>
                 </div>
             </div>

             <div className="flex-1 flex overflow-hidden">
                 {/* Left Panel: Assets */}
                 <div className="w-80 border-r border-gray-700 bg-[#252525] flex flex-col">
                     <div className="flex border-b border-gray-700">
                         <button 
                            onClick={() => setAssetTab('upload')}
                            className={`flex-1 py-3 text-xs font-bold ${assetTab === 'upload' ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}
                         >
                            UPLOADS
                         </button>
                         <button 
                            onClick={() => setAssetTab('pexels')}
                            className={`flex-1 py-3 text-xs font-bold ${assetTab === 'pexels' ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}
                         >
                            PEXELS
                         </button>
                     </div>

                     <div className="flex-1 overflow-y-auto p-4">
                        {assetTab === 'upload' ? (
                            <div className="space-y-4">
                                <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-800 transition-colors">
                                    <Upload size={20} className="mb-2 text-gray-400" />
                                    <span className="text-xs text-gray-500">Click to Upload Media</span>
                                    <input type="file" className="hidden" onChange={handleUpload} accept="image/*,video/*" />
                                </label>
                                <button 
                                    onClick={() => addElement('text')}
                                    className="w-full py-2 bg-gray-700 rounded text-sm hover:bg-gray-600 flex items-center justify-center gap-2"
                                >
                                    <Type size={16} /> Add Text Layer
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
                                    <input 
                                        type="text" 
                                        placeholder="Search photos..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-600 rounded pl-9 p-2 text-sm text-white focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {stockImages.map(img => (
                                        <div 
                                            key={img.id}
                                            className="aspect-square bg-gray-800 rounded overflow-hidden cursor-pointer hover:opacity-80 relative group"
                                            onClick={() => addElement('image', img.fullUrl)}
                                        >
                                            <img src={img.thumbUrl} alt="Stock" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <Plus size={20} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                     </div>
                 </div>

                 {/* Center: Canvas */}
                 <div className="flex-1 bg-[#151515] flex items-center justify-center p-8 relative overflow-hidden">
                     <div 
                        className="bg-black shadow-2xl relative overflow-hidden select-none"
                        style={{ 
                            width: '360px', 
                            height: '640px',
                            transform: 'scale(1)', // Could implement zoom
                        }}
                     >
                         {state.elements.map(el => {
                             // Visibility check based on time
                             if (currentTime < el.startTime || currentTime > el.startTime + el.duration) return null;
                             
                             const style: React.CSSProperties = {
                                 position: 'absolute',
                                 left: `${el.x}%`,
                                 top: `${el.y}%`,
                                 width: `${el.width}%`,
                                 height: el.type === 'text' ? 'auto' : `${el.height}%`,
                                 zIndex: el.track,
                                 cursor: 'move',
                                 border: selectedId === el.id ? '2px solid #6366f1' : 'none'
                             };

                             if (el.type === 'text') {
                                 return (
                                     <div 
                                        key={el.id}
                                        style={{ 
                                            ...style,
                                            color: el.fillColor,
                                            fontSize: `${el.fontSize}px`,
                                            textAlign: el.textAlign,
                                            fontFamily: 'Inter, sans-serif'
                                        }}
                                        onMouseDown={(e) => handleCanvasMouseDown(e, el.id)}
                                     >
                                         {el.text}
                                     </div>
                                 )
                             }
                             if (el.type === 'image') {
                                 return (
                                     <img
                                        key={el.id}
                                        src={el.src}
                                        style={{ ...style, objectFit: 'cover' }}
                                        draggable={false}
                                        onMouseDown={(e) => handleCanvasMouseDown(e, el.id)}
                                     />
                                 )
                             }
                             if (el.type === 'video') {
                                // Sync video playback manually
                                return (
                                    <video
                                        key={el.id}
                                        src={el.src}
                                        style={{ ...style, objectFit: 'cover' }}
                                        onMouseDown={(e) => handleCanvasMouseDown(e, el.id)}
                                        // Simple sync logic
                                        ref={ref => {
                                            if (ref) {
                                                const relTime = currentTime - el.startTime;
                                                if (Math.abs(ref.currentTime - relTime) > 0.3) {
                                                    ref.currentTime = relTime;
                                                }
                                                if (isPlaying && ref.paused) ref.play().catch(() => {});
                                                if (!isPlaying && !ref.paused) ref.pause();
                                            }
                                        }}
                                    />
                                )
                             }
                             return null;
                         })}
                     </div>
                 </div>

                 {/* Right: Properties */}
                 <div className="w-72 border-l border-gray-700 bg-[#252525] flex flex-col">
                    <div className="p-4 border-b border-gray-700 font-bold text-sm text-gray-400">PROPERTIES</div>
                    <div className="flex-1 overflow-y-auto p-4">
                        {selectedElement ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-bold text-white uppercase">{selectedElement.type}</span>
                                    <button onClick={() => deleteElement(selectedElement.id)} className="text-red-400 hover:text-red-300">
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                {/* Common Props */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">X (%)</label>
                                        <input 
                                            type="number" 
                                            value={Math.round(selectedElement.x)}
                                            onChange={(e) => updateElement(selectedElement.id, { x: Number(e.target.value) })}
                                            className="w-full bg-[#1e1e1e] border border-gray-600 rounded p-1 text-sm text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Y (%)</label>
                                        <input 
                                            type="number" 
                                            value={Math.round(selectedElement.y)}
                                            onChange={(e) => updateElement(selectedElement.id, { y: Number(e.target.value) })}
                                            className="w-full bg-[#1e1e1e] border border-gray-600 rounded p-1 text-sm text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Width (%)</label>
                                        <input 
                                            type="number" 
                                            value={Math.round(selectedElement.width)}
                                            onChange={(e) => updateElement(selectedElement.id, { width: Number(e.target.value) })}
                                            className="w-full bg-[#1e1e1e] border border-gray-600 rounded p-1 text-sm text-white"
                                        />
                                    </div>
                                    {selectedElement.type !== 'text' && (
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Height (%)</label>
                                            <input 
                                                type="number" 
                                                value={Math.round(selectedElement.height)}
                                                onChange={(e) => updateElement(selectedElement.id, { height: Number(e.target.value) })}
                                                className="w-full bg-[#1e1e1e] border border-gray-600 rounded p-1 text-sm text-white"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="border-t border-gray-700 pt-4">
                                     <label className="text-xs text-gray-500 block mb-1">Timing (Start / Duration)</label>
                                     <div className="flex gap-2">
                                         <input 
                                            type="number" 
                                            value={selectedElement.startTime}
                                            onChange={(e) => updateElement(selectedElement.id, { startTime: Number(e.target.value) })}
                                            className="w-full bg-[#1e1e1e] border border-gray-600 rounded p-1 text-sm text-white"
                                        />
                                        <input 
                                            type="number" 
                                            value={selectedElement.duration}
                                            onChange={(e) => updateElement(selectedElement.id, { duration: Number(e.target.value) })}
                                            className="w-full bg-[#1e1e1e] border border-gray-600 rounded p-1 text-sm text-white"
                                        />
                                     </div>
                                </div>

                                {/* Text Props */}
                                {selectedElement.type === 'text' && (
                                    <div className="border-t border-gray-700 pt-4 space-y-3">
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Content</label>
                                            <textarea 
                                                value={selectedElement.text} 
                                                onChange={(e) => updateElement(selectedElement.id, { text: e.target.value })}
                                                className="w-full bg-[#1e1e1e] border border-gray-600 rounded p-2 text-sm text-white h-20"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-xs text-gray-500 block mb-1">Font Size</label>
                                                <input 
                                                    type="number" 
                                                    value={selectedElement.fontSize}
                                                    onChange={(e) => updateElement(selectedElement.id, { fontSize: Number(e.target.value) })}
                                                    className="w-full bg-[#1e1e1e] border border-gray-600 rounded p-1 text-sm text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-500 block mb-1">Color</label>
                                                <input 
                                                    type="color" 
                                                    value={selectedElement.fillColor}
                                                    onChange={(e) => updateElement(selectedElement.id, { fillColor: e.target.value })}
                                                    className="w-full bg-[#1e1e1e] border border-gray-600 rounded p-1 h-8 cursor-pointer"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-center">
                                            {(['left', 'center', 'right'] as const).map(align => (
                                                <button
                                                    key={align}
                                                    onClick={() => updateElement(selectedElement.id, { textAlign: align })}
                                                    className={`p-1 rounded ${selectedElement.textAlign === align ? 'bg-indigo-600' : 'bg-gray-700'}`}
                                                >
                                                    <span className="uppercase text-[10px]">{align}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
                                <MousePointer2 size={32} className="mb-2 opacity-30" />
                                <p>Select an element on the canvas or timeline to edit properties.</p>
                            </div>
                        )}
                     </div>
                 </div>
             </div>

             {/* Bottom: Timeline */}
             <div className="h-64 border-t border-gray-700 bg-[#121212] flex flex-col select-none">
                 <div className="h-10 border-b border-gray-700 flex items-center px-4 gap-4 bg-[#1e1e1e]">
                     <button 
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="text-white hover:text-indigo-400 transition-colors"
                     >
                        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                     </button>
                     <div className="text-sm font-mono text-indigo-400 font-bold">
                        {new Date(currentTime * 1000).toISOString().substr(14, 5)} / {new Date(state.duration * 1000).toISOString().substr(14, 5)}
                     </div>
                     <input 
                        type="range"
                        min={0}
                        max={state.duration}
                        step={0.1}
                        value={currentTime}
                        onChange={(e) => {
                            setCurrentTime(Number(e.target.value));
                            setIsPlaying(false);
                        }}
                        className="flex-1 accent-indigo-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                     />
                 </div>
                 
                 <div className="flex-1 p-4 relative overflow-y-auto overflow-x-hidden">
                     {/* Timeline Tracks */}
                     <div className="relative min-h-full">
                         {/* Time Markers Background (Visual only) */}
                         <div className="absolute inset-0 flex pointer-events-none opacity-10">
                             {Array.from({ length: 10 }).map((_, i) => (
                                 <div key={i} className="flex-1 border-r border-white h-full" />
                             ))}
                         </div>

                         {state.elements.sort((a,b) => b.track - a.track).map(el => (
                             <div 
                                key={el.id}
                                onClick={() => setSelectedId(el.id)}
                                className={`h-12 mb-2 relative rounded-md transition-all cursor-pointer flex items-center px-2 text-xs font-bold overflow-hidden border ${
                                    selectedId === el.id 
                                    ? 'border-indigo-400 bg-indigo-900/60 text-white z-10 shadow-lg' 
                                    : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                                }`}
                                style={{
                                    left: `${(el.startTime / state.duration) * 100}%`,
                                    width: `${(el.duration / state.duration) * 100}%`
                                }}
                             >
                                {el.type === 'text' && <Type size={12} className="mr-2" />}
                                {el.type === 'image' && <ImageIcon size={12} className="mr-2" />}
                                {el.type === 'video' && <Video size={12} className="mr-2" />}
                                <span className="truncate">{el.name}</span>
                             </div>
                         ))}
                         
                         {/* Playhead Line */}
                         <div 
                            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-50 pointer-events-none transition-none"
                            style={{ left: `${(currentTime / state.duration) * 100}%` }}
                         >
                             <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full" />
                         </div>
                     </div>
                 </div>
             </div>
        </div>
    );
};

// ==========================================
// Main Editor Container
// ==========================================
export const Editor: React.FC<EditorProps> = (props) => {
    const { template, onBack } = props;

    // Render logic based on template "mode"
    let content;
    if (template.mode === 'TEXT_TO_VIDEO') {
        content = <TextToVideoEditor {...props} />;
    } else if (template.mode === 'UGC_PRODUCT') {
        content = <ProductUGCEditor {...props} />;
    } else if (template.mode === 'COMPOSITION') {
        content = <CompositionEditor {...props} />;
    } else if (template.mode === 'SHORTS') {
        content = <ShortMakerEditor {...props} />;
    } else if (template.mode === 'STORYBOOK') {
        content = <ShortMakerEditor {...props} />; // Re-use ShortMakerEditor for Storybook (it adapts internally)
    } else if (template.mode === 'AUDIOBOOK') {
        content = <AudiobookEditor {...props} />;
    } else if (template.mode === 'IMAGE_TO_VIDEO') {
        content = <ImageToVideoEditor {...props} />;
    } else {
        content = <AvatarEditor {...props} />;
    }

    return (
        <div className="h-full flex flex-col">
            {/* Shared Header */}
            <div className="flex items-center gap-3 mb-6 flex-shrink-0">
                <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors group">
                    <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-bold uppercase tracking-wide">Back</span>
                </button>
            </div>
            
            <div className="flex-1 overflow-hidden">
                {content}
            </div>
        </div>
    );
};
