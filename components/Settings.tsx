
import React, { useState } from 'react';
import { Key, Save, Eye, EyeOff, CheckCircle, Volume2, Sparkles, RefreshCcw, ShieldCheck } from 'lucide-react';
import { GEMINI_API_KEYS } from '../constants';

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
  const [localGeminiKey, setLocalGeminiKey] = useState(localStorage.getItem('genavatar_gemini_key') || '');
  const [showGemini, setShowGemini] = useState(false);

  const [saved, setSaved] = useState(false);

  // Check if a default key exists in constants
  const hasDefaultGeminiKey = GEMINI_API_KEYS.length > 0 && !!GEMINI_API_KEYS[0];
  const isUsingDefaultGemini = !localGeminiKey && hasDefaultGeminiKey;

  const handleSave = () => {
    setHeyGenKey(localHeyGen);
    localStorage.setItem('genavatar_eleven_key', localElevenKey);
    
    // If user clears the box, remove from local storage to allow fallback to constant
    if (!localGeminiKey) {
        localStorage.removeItem('genavatar_gemini_key');
    } else {
        localStorage.setItem('genavatar_gemini_key', localGeminiKey);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const clearGeminiKey = () => {
      setLocalGeminiKey('');
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8 no-scrollbar">
      <div className="max-w-2xl mx-auto pt-4 pb-20">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Settings</h2>
        
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden transition-colors">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                      <Key size={20} />
                  </div>
                  <div>
                      <h3 className="font-bold text-gray-900 dark:text-white">API Configuration</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Manage your keys for video generation.</p>
                  </div>
              </div>

              <div className="space-y-6">
                  {/* Gemini Key (New) */}
                  <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                              Google Gemini API Key <Sparkles size={14} className="text-blue-500" />
                          </div>
                          {isUsingDefaultGemini && (
                              <span className="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full flex items-center gap-1 border border-green-100 dark:border-green-800">
                                  <ShieldCheck size={10} /> System Default Active
                              </span>
                          )}
                      </label>
                      <div className="relative group">
                          <input
                              type={showGemini ? "text" : "password"}
                              value={localGeminiKey}
                              onChange={(e) => setLocalGeminiKey(e.target.value)}
                              className={`w-full pl-4 pr-20 py-3 bg-white dark:bg-gray-900 border rounded-xl outline-none transition-all text-sm text-gray-900 dark:text-white placeholder-gray-400 ${
                                  isUsingDefaultGemini 
                                  ? 'border-green-300 dark:border-green-800/50 bg-green-50/10 focus:ring-2 focus:ring-green-500/20' 
                                  : 'border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-500/50 focus:border-indigo-500'
                              }`}
                              placeholder={isUsingDefaultGemini ? "Using System Default Key" : "AIza..."}
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              {localGeminiKey && (
                                  <button
                                      onClick={clearGeminiKey}
                                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                      title="Clear and use default"
                                  >
                                      <RefreshCcw size={14} />
                                  </button>
                              )}
                              <button
                                  onClick={() => setShowGemini(!showGemini)}
                                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                              >
                                  {showGemini ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                          </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-1">
                          {isUsingDefaultGemini 
                              ? "Your app is currently using the embedded system key. Override it here if needed." 
                              : "Required for Scripting, Storyboard, and Veo Video generation."}
                      </p>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-700" />

                  {/* HeyGen Key */}
                  <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">HeyGen API Key</label>
                      <div className="relative">
                          <input
                              type={showHeyGen ? "text" : "password"}
                              value={localHeyGen}
                              onChange={(e) => setLocalHeyGen(e.target.value)}
                              className="w-full pl-4 pr-10 py-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-sm text-gray-900 dark:text-white"
                              placeholder="Enter your HeyGen API Key"
                          />
                          <button
                              onClick={() => setShowHeyGen(!showHeyGen)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                          >
                              {showHeyGen ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-1">Required for Avatar video rendering.</p>
                  </div>

                  {/* ElevenLabs Key */}
                  <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                          ElevenLabs API Key <Volume2 size={14} className="text-gray-400" />
                      </label>
                      <div className="relative">
                          <input
                              type={showEleven ? "text" : "password"}
                              value={localElevenKey}
                              onChange={(e) => setLocalElevenKey(e.target.value)}
                              className="w-full pl-4 pr-10 py-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-sm text-gray-900 dark:text-white"
                              placeholder="Enter ElevenLabs API Key (Optional)"
                          />
                          <button
                              onClick={() => setShowEleven(!showEleven)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                          >
                              {showEleven ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-1">Required for high-quality audio in ShortMaker.</p>
                  </div>
              </div>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 flex justify-end">
              <button
                  onClick={handleSave}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg ${
                      saved 
                      ? 'bg-green-600 text-white' 
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'
                  }`}
              >
                  {saved ? <CheckCircle size={18} /> : <Save size={18} />}
                  {saved ? 'Saved' : 'Save Changes'}
              </button>
          </div>
        </div>

        <div className="mt-8 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4">
          <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 mb-1">Note on Security</h4>
          <p className="text-xs text-blue-800 dark:text-blue-400 leading-relaxed">
              This is a client-side demonstration application. Your keys are persisted only in your browser's local storage.
          </p>
        </div>
      </div>
    </div>
  );
};
