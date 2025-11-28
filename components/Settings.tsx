import React, { useState } from 'react';
import { Key, Save, Eye, EyeOff, CheckCircle, Volume2, Sparkles } from 'lucide-react';

interface SettingsProps {
  heyGenKey: string;
  setHeyGenKey: (key: string) => void;
}

export const Settings: React.FC<SettingsProps> = ({ 
  heyGenKey, 
  setHeyGenKey,
}) => {
  const [showHeyGen, setShowHeyGen] = useState(false);
  const [localHeyGen, setLocalHeyGen] = useState(heyGenKey);
  
  // ElevenLabs Key State
  const [localElevenKey, setLocalElevenKey] = useState(localStorage.getItem('genavatar_eleven_key') || '');
  const [showEleven, setShowEleven] = useState(false);

  // Gemini Key State
  const [localGeminiKey, setLocalGeminiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [showGemini, setShowGemini] = useState(false);

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setHeyGenKey(localHeyGen);
    localStorage.setItem('genavatar_eleven_key', localElevenKey);
    localStorage.setItem('gemini_api_key', localGeminiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto pt-10 px-4">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Settings</h2>
      
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                    <Key size={20} />
                </div>
                <div>
                    <h3 className="font-semibold text-gray-900">API Configuration</h3>
                    <p className="text-sm text-gray-500">Manage your keys for video generation.</p>
                </div>
            </div>

            <div className="space-y-6">
                {/* Gemini API Key */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        Google Gemini API Key <Sparkles size={14} className="text-blue-500" />
                    </label>
                    <div className="relative">
                        <input
                            type={showGemini ? "text" : "password"}
                            value={localGeminiKey}
                            onChange={(e) => setLocalGeminiKey(e.target.value)}
                            className="w-full pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            placeholder="Enter Gemini API Key (Required for AI features)"
                        />
                        <button
                            onClick={() => setShowGemini(!showGemini)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showGemini ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Required if running outside of AI Studio.</p>
                </div>

                {/* HeyGen Key */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">HeyGen API Key</label>
                    <div className="relative">
                        <input
                            type={showHeyGen ? "text" : "password"}
                            value={localHeyGen}
                            onChange={(e) => setLocalHeyGen(e.target.value)}
                            className="w-full pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            placeholder="Enter your HeyGen API Key"
                        />
                        <button
                            onClick={() => setShowHeyGen(!showHeyGen)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showHeyGen ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Required for Avatar video rendering.</p>
                </div>

                {/* ElevenLabs Key */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                        ElevenLabs API Key <Volume2 size={14} className="text-gray-400" />
                    </label>
                    <div className="relative">
                        <input
                            type={showEleven ? "text" : "password"}
                            value={localElevenKey}
                            onChange={(e) => setLocalElevenKey(e.target.value)}
                            className="w-full pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            placeholder="Enter ElevenLabs API Key (Optional)"
                        />
                        <button
                            onClick={() => setShowEleven(!showEleven)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showEleven ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Required for high-quality audio in ShortMaker.</p>
                </div>
            </div>
        </div>
        <div className="p-4 bg-gray-50 flex justify-end">
            <button
                onClick={handleSave}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${
                    saved 
                    ? 'bg-green-600 text-white' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
            >
                {saved ? <CheckCircle size={18} /> : <Save size={18} />}
                {saved ? 'Saved' : 'Save Changes'}
            </button>
        </div>
      </div>

      <div className="mt-8 bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-1">Note on Security</h4>
        <p className="text-xs text-blue-800 leading-relaxed">
            This is a client-side demonstration application. Your keys are persisted only in your browser's local storage.
        </p>
      </div>
    </div>
  );
};