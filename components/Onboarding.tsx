import React, { useState } from 'react';
import { ArrowRight, Key, Zap, Shield, ExternalLink } from 'lucide-react';

interface OnboardingProps {
  onComplete: (keys: { heyGen?: string }) => void;
  onSkip: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onSkip }) => {
  const [heyGenKey, setHeyGenKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (heyGenKey.trim()) {
        onComplete({ heyGen: heyGenKey });
    } else {
        onSkip();
    }
  };

  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-950 z-50 flex flex-col items-center justify-center p-4 animate-in fade-in duration-500">
        <div className="max-w-md w-full">
            <div className="text-center mb-10">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                    <Zap className="text-white" size={32} />
                </div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Welcome to LoopGenie</h1>
                <p className="text-gray-500 dark:text-gray-400">Let's set up your creative studio to get started.</p>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-8 shadow-xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Connect HeyGen API (Optional)</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                                <Key size={18} />
                            </div>
                            <input 
                                type="text" 
                                value={heyGenKey}
                                onChange={(e) => setHeyGenKey(e.target.value)}
                                placeholder="Enter your API Key"
                                className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-gray-900 dark:text-white"
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                            Don't have one? <a href="https://app.heygen.com/settings?nav=API" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline flex items-center gap-0.5">Get it here <ExternalLink size={10} /></a>
                        </p>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 rounded-xl p-4 flex gap-3">
                        <Shield className="text-blue-600 dark:text-blue-400 flex-shrink-0" size={20} />
                        <div className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                            <span className="font-bold block mb-1">Why do I need this?</span>
                            Adding your own key ensures higher limits and watermark-free videos. You can skip this and use our trial key, but limits apply.
                        </div>
                    </div>

                    <div className="pt-2 flex flex-col gap-3">
                        <button 
                            type="submit"
                            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
                        >
                            {heyGenKey ? 'Connect & Continue' : 'Continue'} <ArrowRight size={20} />
                        </button>
                        {!heyGenKey && (
                            <button 
                                type="button"
                                onClick={onSkip}
                                className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
                            >
                                Skip Setup (Use Trial Mode)
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    </div>
  );
};