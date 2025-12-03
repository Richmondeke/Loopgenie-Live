
import React, { useState, useRef } from 'react';
import { Headphones, Play, Pause, Download, Volume2, ChevronRight, Loader2 } from 'lucide-react';
import { Template } from '../types';
import { generateSpeech } from '../services/geminiService';
import { uploadToStorage } from '../services/storageService';

interface AudiobookEditorProps {
    onBack: () => void;
    onGenerate: (data: any) => Promise<void> | void;
    userCredits: number;
    template: Template;
}

const VOICES = [
    { id: 'Fenrir', label: 'Fenrir', gender: 'Male', tone: 'Deep', desc: 'Great for thrillers' },
    { id: 'Kore', label: 'Kore', gender: 'Female', tone: 'Calm', desc: 'Perfect for storybooks' },
    { id: 'Puck', label: 'Puck', gender: 'Male', tone: 'Energetic', desc: 'Good for ads' },
    { id: 'Charon', label: 'Charon', gender: 'Male', tone: 'Steady', desc: 'News & Info' },
    { id: 'Zephyr', label: 'Zephyr', gender: 'Female', tone: 'Gentle', desc: 'Educational' },
];

export const AudiobookEditor: React.FC<AudiobookEditorProps> = ({ onBack, onGenerate, userCredits, template }) => {
    const [text, setText] = useState('');
    const [selectedVoice, setSelectedVoice] = useState('Kore');
    const [isProcessing, setIsProcessing] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const handleGenerate = async () => {
        if (!text.trim()) return;
        if (userCredits < 1) {
            alert("Insufficient credits");
            return;
        }

        setIsProcessing(true);
        try {
            const url = await generateSpeech(text, selectedVoice);
            setAudioUrl(url);
            
            // Auto Save
            const permUrl = await uploadToStorage(url, `audiobook_${Date.now()}.wav`, 'audio');
            await onGenerate({
                isDirectSave: true,
                videoUrl: permUrl,
                thumbnailUrl: 'https://cdn-icons-png.flaticon.com/512/3050/3050431.png',
                cost: 1,
                type: 'AUDIOBOOK',
                templateName: `Audio: ${text.substring(0, 15)}...`,
                shouldRedirect: false
            });
        } catch (e: any) {
            alert("Generation failed: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play();
            setIsPlaying(true);
        }
    };

    return (
        <div className="h-full bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col md:flex-row overflow-hidden">
            {/* Left Controls */}
            <div className="w-full md:w-[400px] bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full overflow-y-auto">
                <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                    <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors">
                        <ChevronRight className="rotate-180" size={16} /> Back to Studio
                    </button>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Headphones className="text-orange-500" /> Generate Audio
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Convert text to lifelike speech.</p>
                </div>

                <div className="p-6 space-y-6 flex-1">
                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Voice Selection</label>
                        <div className="grid grid-cols-1 gap-2">
                            {VOICES.map(voice => (
                                <button
                                    key={voice.id}
                                    onClick={() => setSelectedVoice(voice.id)}
                                    className={`px-4 py-3 rounded-xl text-left border transition-all flex justify-between items-center ${
                                        selectedVoice === voice.id 
                                        ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-500 text-orange-700 dark:text-orange-400' 
                                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-orange-300'
                                    }`}
                                >
                                    <div>
                                        <div className="font-bold text-sm">{voice.label}</div>
                                        <div className="text-xs opacity-70">{voice.tone}</div>
                                    </div>
                                    {selectedVoice === voice.id && <Volume2 size={16} />}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Script</label>
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Type your text here..."
                            className="w-full h-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-sm focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                        />
                        <div className="text-right text-xs text-gray-400 mt-2">{text.length} chars</div>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <button 
                        onClick={handleGenerate}
                        disabled={isProcessing || !text}
                        className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl ${
                            isProcessing || !text
                            ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-orange-500 to-amber-600 text-white hover:scale-[1.02]'
                        }`}
                    >
                        {isProcessing ? <Loader2 className="animate-spin" /> : <Volume2 />} 
                        {isProcessing ? 'Generating...' : 'Generate Audio'}
                    </button>
                </div>
            </div>

            {/* Right Result */}
            <div className="flex-1 bg-gray-100 dark:bg-black p-8 flex items-center justify-center">
                {audioUrl ? (
                    <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-xl w-full max-w-lg text-center">
                         <div className="w-24 h-24 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-orange-600">
                             {isPlaying ? <Loader2 className="animate-spin" size={40} /> : <Headphones size={40} />}
                         </div>
                         <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Audio Ready!</h3>
                         <p className="text-gray-500 mb-8 text-sm line-clamp-2">"{text}"</p>
                         
                         <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} className="hidden" />
                         
                         <div className="flex justify-center gap-4">
                             <button onClick={togglePlay} className="px-8 py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 transition-colors flex items-center gap-2">
                                 {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                                 {isPlaying ? 'Pause' : 'Play Preview'}
                             </button>
                             <a href={audioUrl} download={`audio_${Date.now()}.wav`} className="px-6 py-3 border border-gray-300 dark:border-gray-700 rounded-xl font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2">
                                 <Download size={20} /> Download
                             </a>
                         </div>
                    </div>
                ) : (
                    <div className="text-center text-gray-400">
                        <div className="w-20 h-20 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Volume2 size={32} />
                        </div>
                        <p>Enter text and click generate to hear it.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
