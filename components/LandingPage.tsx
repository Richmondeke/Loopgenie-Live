import React, { useState } from 'react';
import { Video, Sparkles, Zap, Mic, Users, ArrowRight, CheckCircle, Smartphone, ChevronDown, ChevronUp, Camera, Moon, Sun } from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
  onSignup: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onSignup, isDarkMode, toggleTheme }) => {
  return (
    <div className="h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-sans overflow-y-auto scroll-smooth transition-colors duration-200">
        {/* Navigation */}
        <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md z-50 border-b border-gray-100/50 dark:border-gray-800/50">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                    L
                </div>
                <span className="text-xl font-bold tracking-tight">LoopGenie</span>
            </div>
            <div className="flex items-center gap-4">
                <button 
                    onClick={toggleTheme}
                    className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                    title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                </button>
                <button onClick={onLogin} className="text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors">
                    Log in
                </button>
                <button onClick={onSignup} className="px-5 py-2.5 bg-indigo-600 text-white rounded-full font-bold hover:bg-indigo-700 transition-all hover:shadow-lg transform hover:-translate-y-0.5">
                    Sign Up Free
                </button>
            </div>
        </nav>

        {/* Hero Section (Redesigned & Centralized) */}
        <header className="px-6 pt-20 pb-20 lg:pt-32 lg:pb-32 max-w-7xl mx-auto text-center relative overflow-hidden">
            {/* Background Blurs */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-full pointer-events-none">
                <div className="absolute top-20 left-10 w-72 h-72 bg-purple-200 dark:bg-purple-900/30 rounded-full mix-blend-multiply dark:mix-blend-normal filter blur-3xl opacity-30 animate-blob" />
                <div className="absolute top-20 right-10 w-72 h-72 bg-indigo-200 dark:bg-indigo-900/30 rounded-full mix-blend-multiply dark:mix-blend-normal filter blur-3xl opacity-30 animate-blob animation-delay-2000" />
            </div>

            <div className="relative z-10 max-w-4xl mx-auto">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-bold mb-8 border border-indigo-100 dark:border-indigo-800">
                    <Sparkles size={14} />
                    <span>AI Video Generation Suite</span>
                </div>
                
                <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-8 leading-tight">
                    Create professional <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">AI videos</span> in minutes.
                </h1>
                
                <p className="text-xl text-gray-500 dark:text-gray-400 mb-10 leading-relaxed max-w-2xl mx-auto">
                    The all-in-one platform for creators. Generate AI avatars, product videos, audiobooks, and viral shorts with the power of Gemini and HeyGen.
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <button onClick={onSignup} className="w-full sm:w-auto px-10 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full font-bold text-lg hover:bg-black dark:hover:bg-gray-100 transition-all flex items-center justify-center gap-2 shadow-xl hover:shadow-2xl hover:-translate-y-1">
                        Start Creating <ArrowRight size={20} />
                    </button>
                </div>
                
                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-gray-500 dark:text-gray-400 font-medium">
                    <div className="flex items-center gap-2"><CheckCircle size={16} className="text-green-500" /> No credit card required</div>
                    <div className="flex items-center gap-2"><CheckCircle size={16} className="text-green-500" /> Free starter credits</div>
                </div>
            </div>
        </header>

        {/* Features Grid */}
        <section className="py-20 bg-gray-50 dark:bg-gray-800/50" id="features">
            <div className="max-w-7xl mx-auto px-6">
                <div className="text-center mb-16">
                    <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-4">Powerful Creative Tools</h2>
                    <p className="text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">Explore the suite of AI models integrated directly into your dashboard.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <FeatureCard 
                        icon={<Users className="text-blue-600 dark:text-blue-400" size={24} />}
                        title="AI Avatars"
                        description="Generate professional spokesperson videos using HeyGen's avatar technology."
                        color="bg-blue-50 dark:bg-blue-900/20"
                        status="LIVE"
                    />
                    <FeatureCard 
                        icon={<Video className="text-purple-600 dark:text-purple-400" size={24} />}
                        title="Text to Video"
                        description="Create cinematic clips from simple text descriptions using Google Veo."
                        color="bg-purple-50 dark:bg-purple-900/20"
                        status="LIVE"
                    />
                    <FeatureCard 
                        icon={<Zap className="text-orange-600 dark:text-orange-400" size={24} />}
                        title="Product UGC"
                        description="Turn static product images into dynamic video ads for social media."
                        color="bg-orange-50 dark:bg-orange-900/20"
                        status="LIVE"
                    />
                    <FeatureCard 
                        icon={<Smartphone className="text-pink-600 dark:text-pink-400" size={24} />}
                        title="ShortMaker"
                        description="Idea to fully edited YouTube Short with scripts, visuals, and voiceovers."
                        color="bg-pink-50 dark:bg-pink-900/20"
                        status="LIVE"
                    />
                    <FeatureCard 
                        icon={<Mic className="text-green-600 dark:text-green-400" size={24} />}
                        title="Audiobooks"
                        description="Convert articles or stories into narrated audio with emotive AI voices."
                        color="bg-green-50 dark:bg-green-900/20"
                        status="LIVE"
                    />
                    <FeatureCard 
                        icon={<Camera className="text-rose-600 dark:text-rose-400" size={24} />}
                        title="Fashion Photoshoot"
                        description="Professional model photography for your merch with customizable settings."
                        color="bg-rose-50 dark:bg-rose-900/20"
                        status="NEW"
                    />
                </div>
            </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 bg-white dark:bg-gray-900">
            <div className="max-w-3xl mx-auto px-6">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Frequently Asked Questions</h2>
                    <p className="text-gray-500 dark:text-gray-400">Everything you need to know about LoopGenie.</p>
                </div>
                
                <div className="space-y-2">
                    <FAQItem 
                        question="Is LoopGenie free to use?" 
                        answer="Yes! You get 5 free credits upon signing up to try out all the features. No credit card is required to start."
                    />
                    <FAQItem 
                        question="Do I need my own API keys?" 
                        answer="For the best experience and higher limits, you can add your own HeyGen or Google Gemini API keys in the Settings. However, we provide starter access for free accounts."
                    />
                    <FAQItem 
                        question="Can I use the videos for commercial purposes?" 
                        answer="Yes, videos generated with your own API keys or paid credits are yours to use commercially. Please check the specific terms of the underlying AI models (HeyGen, Google Veo) for details."
                    />
                    <FAQItem 
                        question="What AI models are used?" 
                        answer="We leverage the best-in-class models: Google Gemini 2.5 for text and scripting, Google Veo for video generation, HeyGen for avatars, and ElevenLabs for speech synthesis."
                    />
                    <FAQItem 
                        question="How do I get more credits?" 
                        answer="Currently, we are in beta. If you run out of credits, please contact us or use your own API keys in the Settings panel for unlimited generation."
                    />
                </div>
            </div>
        </section>

        {/* Footer */}
        <footer className="bg-white dark:bg-gray-900 py-12 border-t border-gray-100 dark:border-gray-800">
            <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8 text-center md:text-left">
                 <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center text-white dark:text-gray-900 font-bold text-lg">
                        L
                    </div>
                    <div>
                        <span className="font-bold text-gray-900 dark:text-white block text-lg">LoopGenie</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">AI Video Production</span>
                    </div>
                </div>
                
                <div className="flex items-center gap-8">
                    <button onClick={onSignup} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors">
                        Sign Up Now
                    </button>
                    <span className="text-sm text-gray-400 font-medium">
                        Created by <span className="text-gray-600 dark:text-gray-300 font-bold">Guava Labs</span>
                    </span>
                </div>
            </div>
        </footer>
    </div>
  );
};

// --- Subcomponents ---

const FeatureCard: React.FC<{
    icon: React.ReactNode, 
    title: string, 
    description: string, 
    color: string, 
    status: 'LIVE' | 'BETA' | 'COMING SOON' | 'NEW'
}> = ({icon, title, description, color, status}) => (
    <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-indigo-100 dark:hover:border-indigo-900 hover:shadow-xl transition-all duration-300 group cursor-default relative overflow-hidden">
        <div className={`absolute top-4 right-4 text-[10px] font-bold px-2 py-1 rounded-full border ${
            status === 'LIVE' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-100 dark:border-green-800' : 
            status === 'BETA' ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-100 dark:border-orange-800' :
            status === 'NEW' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-800' :
            'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-100 dark:border-gray-600'
        }`}>
            {status}
        </div>

        <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
            {icon}
        </div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
    </div>
);

const FAQItem = ({ question, answer }: { question: string, answer: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <div className="border-b border-gray-100 dark:border-gray-800 last:border-0">
        <button 
          className="w-full py-6 flex items-center justify-between text-left focus:outline-none group"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className={`text-lg font-medium transition-colors ${isOpen ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400'}`}>
            {question}
          </span>
          {isOpen ? (
            <ChevronUp className="text-indigo-600 dark:text-indigo-400 transition-transform duration-300" />
          ) : (
            <ChevronDown className="text-gray-400 transition-transform duration-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
          )}
        </button>
        <div 
            className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 pb-6' : 'grid-rows-[0fr] opacity-0'}`}
        >
          <div className="overflow-hidden">
            <p className="text-gray-500 dark:text-gray-400 leading-relaxed pr-8">{answer}</p>
          </div>
        </div>
      </div>
    );
};