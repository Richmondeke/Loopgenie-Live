import React, { useState } from 'react';
import { Video, Sparkles, Zap, Mic, Users, ArrowRight, CheckCircle, Smartphone, ChevronDown, ChevronUp, Layout } from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
  onSignup: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onSignup }) => {
  return (
    <div className="h-full bg-white text-gray-900 font-sans overflow-y-auto scroll-smooth">
        {/* Navigation */}
        <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto sticky top-0 bg-white/80 backdrop-blur-md z-50 border-b border-gray-100/50">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                    L
                </div>
                <span className="text-xl font-bold tracking-tight">LoopGenie</span>
            </div>
            <div className="flex items-center gap-4">
                <button onClick={onLogin} className="text-gray-600 hover:text-indigo-600 font-medium transition-colors">
                    Log in
                </button>
                <button onClick={onSignup} className="px-5 py-2.5 bg-indigo-600 text-white rounded-full font-bold hover:bg-indigo-700 transition-all hover:shadow-lg transform hover:-translate-y-0.5">
                    Sign Up Free
                </button>
            </div>
        </nav>

        {/* Hero Section */}
        <header className="px-6 pt-12 pb-20 lg:pt-24 lg:pb-32 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
            <div className="flex-1 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-bold mb-6 border border-indigo-100">
                    <Sparkles size={14} />
                    <span>AI Video Generation Suite</span>
                </div>
                <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-gray-900 mb-6 leading-tight">
                    Create professional <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">AI videos</span> in minutes.
                </h1>
                <p className="text-xl text-gray-500 mb-8 leading-relaxed max-w-2xl mx-auto lg:mx-0">
                    The all-in-one platform for creators. Generate AI avatars, product videos, audiobooks, and viral shorts with the power of Gemini and HeyGen.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                    <button onClick={onSignup} className="w-full sm:w-auto px-8 py-4 bg-gray-900 text-white rounded-full font-bold text-lg hover:bg-black transition-all flex items-center justify-center gap-2 shadow-xl hover:shadow-2xl hover:-translate-y-1">
                        Start Creating <ArrowRight size={20} />
                    </button>
                </div>
                <div className="mt-8 flex items-center justify-center lg:justify-start gap-6 text-sm text-gray-500 font-medium">
                    <div className="flex items-center gap-2"><CheckCircle size={16} className="text-green-500" /> No credit card required</div>
                    <div className="flex items-center gap-2"><CheckCircle size={16} className="text-green-500" /> Free starter credits</div>
                </div>
            </div>
            
            <div className="flex-1 relative w-full max-w-lg lg:max-w-none">
                <div className="relative z-10 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden transform rotate-2 hover:rotate-0 transition-transform duration-500">
                    <img 
                        src="https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=800&q=80" 
                        alt="App Dashboard" 
                        className="w-full h-auto"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                    <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-xl flex items-center gap-4 shadow-lg border border-white/50">
                        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                            <Video className="text-indigo-600" />
                        </div>
                        <div>
                            <div className="font-bold text-gray-900">Generating Scene 1...</div>
                            <div className="text-xs text-gray-500">AI Processing • 85% Complete</div>
                        </div>
                    </div>
                </div>
                {/* Decorative blobs */}
                <div className="absolute -top-10 -right-10 w-64 h-64 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" />
                <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000" />
            </div>
        </header>

        {/* Features Grid */}
        <section className="py-20 bg-gray-50" id="features">
            <div className="max-w-7xl mx-auto px-6">
                <div className="text-center mb-16">
                    <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">Powerful Creative Tools</h2>
                    <p className="text-gray-500 max-w-2xl mx-auto">Explore the suite of AI models integrated directly into your dashboard.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <FeatureCard 
                        icon={<Users className="text-blue-600" size={24} />}
                        title="AI Avatars"
                        description="Generate professional spokesperson videos using HeyGen's avatar technology."
                        color="bg-blue-50"
                        status="LIVE"
                    />
                    <FeatureCard 
                        icon={<Video className="text-purple-600" size={24} />}
                        title="Text to Video"
                        description="Create cinematic clips from simple text descriptions using Google Veo."
                        color="bg-purple-50"
                        status="LIVE"
                    />
                    <FeatureCard 
                        icon={<Zap className="text-orange-600" size={24} />}
                        title="Product UGC"
                        description="Turn static product images into dynamic video ads for social media."
                        color="bg-orange-50"
                        status="BETA"
                    />
                    <FeatureCard 
                        icon={<Smartphone className="text-pink-600" size={24} />}
                        title="ShortMaker"
                        description="Idea to fully edited YouTube Short with scripts, visuals, and voiceovers."
                        color="bg-pink-50"
                        status="BETA"
                    />
                    <FeatureCard 
                        icon={<Mic className="text-green-600" size={24} />}
                        title="Audiobooks"
                        description="Convert articles or stories into narrated audio with emotive AI voices."
                        color="bg-green-50"
                        status="LIVE"
                    />
                    <FeatureCard 
                        icon={<Layout className="text-indigo-600" size={24} />}
                        title="Video Editor"
                        description="A drag-and-drop timeline editor to compose text, images, and video layers."
                        color="bg-indigo-50"
                        status="COMING SOON"
                    />
                </div>
            </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 bg-white">
            <div className="max-w-3xl mx-auto px-6">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
                    <p className="text-gray-500">Everything you need to know about LoopGenie.</p>
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
        <footer className="bg-white py-12 border-t border-gray-100">
            <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8 text-center md:text-left">
                 <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                        L
                    </div>
                    <div>
                        <span className="font-bold text-gray-900 block text-lg">LoopGenie</span>
                        <span className="text-xs text-gray-500">AI Video Production</span>
                    </div>
                </div>
                
                <div className="flex items-center gap-8">
                    <button onClick={onSignup} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                        Sign Up Now
                    </button>
                    <span className="text-sm text-gray-400 font-medium">
                        Created by <span className="text-gray-600 font-bold">Guava Labs</span>
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
    status: 'LIVE' | 'BETA' | 'COMING SOON'
}> = ({icon, title, description, color, status}) => (
    <div className="bg-white p-8 rounded-2xl border border-gray-100 hover:border-indigo-100 hover:shadow-xl transition-all duration-300 group cursor-default relative overflow-hidden">
        <div className={`absolute top-4 right-4 text-[10px] font-bold px-2 py-1 rounded-full border ${
            status === 'LIVE' ? 'bg-green-50 text-green-700 border-green-100' : 
            status === 'BETA' ? 'bg-orange-50 text-orange-700 border-orange-100' :
            'bg-gray-50 text-gray-600 border-gray-100'
        }`}>
            {status}
        </div>

        <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
            {icon}
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
        <p className="text-gray-500 leading-relaxed">{description}</p>
    </div>
);

const FAQItem = ({ question, answer }: { question: string, answer: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <div className="border-b border-gray-100 last:border-0">
        <button 
          className="w-full py-6 flex items-center justify-between text-left focus:outline-none group"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className={`text-lg font-medium transition-colors ${isOpen ? 'text-indigo-600' : 'text-gray-900 group-hover:text-indigo-600'}`}>
            {question}
          </span>
          {isOpen ? (
            <ChevronUp className="text-indigo-600 transition-transform duration-300" />
          ) : (
            <ChevronDown className="text-gray-400 group-hover:text-indigo-600 transition-transform duration-300" />
          )}
        </button>
        <div 
            className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 pb-6' : 'grid-rows-[0fr] opacity-0'}`}
        >
          <div className="overflow-hidden">
            <p className="text-gray-500 leading-relaxed pr-8">{answer}</p>
          </div>
        </div>
      </div>
    );
};