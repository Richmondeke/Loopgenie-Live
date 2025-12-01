
import React, { useState, useEffect } from 'react';
import { IntegrationStatus, ScheduledPost } from '../types';
import { Twitter, Send, Calendar, Clock, Image as ImageIcon, X, Trash2, CheckCircle, AlertCircle, Loader2, Linkedin, Instagram, ExternalLink, RefreshCw, User, Link as LinkIcon, Info, Plus, LogOut } from 'lucide-react';
import { supabase } from '../supabaseClient';

export const Integrations: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [integrations, setIntegrations] = useState<IntegrationStatus[]>([
        { id: 'twitter', name: 'X (Twitter)', connected: false },
        { id: 'linkedin', name: 'LinkedIn', connected: false },
        { id: 'instagram', name: 'Instagram', connected: false }
    ]);
    const [posts, setPosts] = useState<ScheduledPost[]>([]);

    // --- Composer State ---
    const [content, setContent] = useState('');
    const [selectedPlatform, setSelectedPlatform] = useState<'twitter' | 'linkedin' | 'instagram'>('twitter');
    const [isPosting, setIsPosting] = useState(false);

    // --- Verification Modal State ---
    const [verifyingPlatform, setVerifyingPlatform] = useState<string | null>(null);
    const [verifyUsername, setVerifyUsername] = useState('');
    const [authWindowRef, setAuthWindowRef] = useState<Window | null>(null);

    // --- Load Data ---
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            
            // 1. Fetch Integrations
            if (user) {
                const { data: dbInteg, error: integError } = await supabase
                    .from('social_integrations')
                    .select('*')
                    .eq('user_id', user.id);

                if (!integError && dbInteg) {
                    setIntegrations(prev => prev.map(p => {
                        const found = dbInteg.find((d: any) => d.platform === p.id);
                        return found ? { ...p, connected: true, username: found.username, avatarUrl: found.avatar_url } : { ...p, connected: false, username: undefined };
                    }));
                }

                // 2. Fetch Posts
                const { data: dbPosts, error: postsError } = await supabase
                    .from('social_posts')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (!postsError && dbPosts) {
                    setPosts(dbPosts.map((row: any) => ({
                        id: row.id,
                        content: row.content,
                        platform: row.platform,
                        scheduledAt: parseInt(row.scheduled_at) || Date.now(),
                        status: row.status,
                        mediaUrl: row.media_url
                    })));
                }
            }
        } catch (e) {
            console.error("Fetch error", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnect = (platform: string) => {
        // 1. Open official login URL in popup to simulate auth flow
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        
        let url = '';
        if (platform === 'twitter') url = 'https://twitter.com/i/flow/login';
        if (platform === 'linkedin') url = 'https://www.linkedin.com/login';
        if (platform === 'instagram') url = 'https://www.instagram.com/accounts/login/';

        const win = window.open(url, `Connect ${platform}`, `width=${width},height=${height},top=${top},left=${left}`);
        setAuthWindowRef(win);

        // 2. Immediately open local verification modal to capture the result
        setVerifyUsername('');
        setVerifyingPlatform(platform);
    };

    const handleConfirmConnection = async () => {
        if (!verifyUsername || !verifyingPlatform) return;
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            alert("Please log in to save connections.");
            return;
        }

        // Close external window if open
        if (authWindowRef) authWindowRef.close();

        // Optimistic UI Update
        setIntegrations(prev => prev.map(p => p.id === verifyingPlatform ? { ...p, connected: true, username: verifyUsername } : p));
        
        try {
            // Persist to DB
            const { error } = await supabase
                .from('social_integrations')
                .upsert({
                    user_id: user.id,
                    platform: verifyingPlatform,
                    username: verifyUsername.startsWith('@') ? verifyUsername : `@${verifyUsername}`,
                    connected: true,
                    avatar_url: `https://ui-avatars.com/api/?name=${verifyUsername}&background=random`
                }, { onConflict: 'user_id, platform' });

            if (error) throw error;
            
            // Refresh to ensure sync
            fetchData();
            setVerifyingPlatform(null);

        } catch (e: any) {
            console.error(e);
            alert("Failed to save connection: " + e.message);
            // Revert UI on failure
            fetchData();
        }
    };

    const handleDisconnect = async (platform: string) => {
         const { data: { user } } = await supabase.auth.getUser();
         if (!user) return;

         if (!confirm(`Are you sure you want to disconnect ${platform}?`)) return;

         // Optimistic
         setIntegrations(prev => prev.map(p => p.id === platform ? { ...p, connected: false, username: undefined } : p));

         await supabase
            .from('social_integrations')
            .delete()
            .match({ user_id: user.id, platform: platform });
    };

    const handlePost = async () => {
        if (!content.trim()) return;
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        setIsPosting(true);
        
        try {
            // Save post to DB
            const newPost = {
                id: `post_${Date.now()}`,
                user_id: user.id,
                content,
                platform: selectedPlatform,
                status: 'scheduled', // In a real app, this would be 'queued'
                scheduled_at: Date.now(),
                created_at: new Date().toISOString()
            };

            const { error } = await supabase.from('social_posts').insert(newPost);
            if (error) throw error;

            // Update UI
            setContent('');
            fetchData();
            alert("Post scheduled successfully!");

        } catch (e: any) {
            alert("Failed to schedule post: " + e.message);
        } finally {
            setIsPosting(false);
        }
    };

    const connectedCount = integrations.filter(i => i.connected).length;
    const activePlatform = integrations.find(i => i.id === selectedPlatform);

    return (
        <div className="h-full overflow-y-auto p-4 md:p-8 bg-black/95 text-gray-100">
            <div className="max-w-6xl mx-auto">
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">Integrations</h2>
                    <p className="text-gray-400">Connect your social accounts to auto-post your generated content.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Column: Connected Accounts */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-1 h-6 bg-indigo-500 rounded-full"></div>
                            <h3 className="text-lg font-bold text-white">Connected Accounts</h3>
                        </div>

                        {integrations.map((integ) => (
                            <div 
                                key={integ.id} 
                                className={`p-5 rounded-2xl border transition-all duration-200 ${
                                    integ.connected 
                                    ? 'bg-gray-900 border-indigo-500/30 shadow-lg shadow-indigo-900/10' 
                                    : 'bg-gray-900/50 border-gray-800 hover:border-gray-700'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2.5 rounded-xl ${
                                            integ.id === 'twitter' ? 'bg-blue-950 text-blue-400' :
                                            integ.id === 'linkedin' ? 'bg-blue-900 text-blue-300' :
                                            'bg-pink-950 text-pink-400'
                                        }`}>
                                            {integ.id === 'twitter' && <Twitter size={20} />}
                                            {integ.id === 'linkedin' && <Linkedin size={20} />}
                                            {integ.id === 'instagram' && <Instagram size={20} />}
                                        </div>
                                        <div>
                                            <div className="font-bold text-white text-sm">{integ.name}</div>
                                            <div className="text-xs text-gray-500">
                                                {integ.connected ? 'Connected' : 'Not connected'}
                                            </div>
                                        </div>
                                    </div>
                                    {integ.connected && (
                                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                                    )}
                                </div>

                                {integ.connected ? (
                                    <div className="bg-black/30 rounded-xl p-3 flex items-center justify-between border border-gray-800">
                                        <div className="flex items-center gap-3">
                                            <img 
                                                src={integ.avatarUrl || `https://ui-avatars.com/api/?name=${integ.username}&background=random`} 
                                                alt="Avatar" 
                                                className="w-8 h-8 rounded-full border border-gray-700"
                                            />
                                            <span className="text-sm font-mono text-gray-300">{integ.username}</span>
                                        </div>
                                        <button 
                                            onClick={() => handleDisconnect(integ.id)}
                                            className="text-gray-500 hover:text-red-400 transition-colors p-1.5 hover:bg-red-900/20 rounded-lg"
                                            title="Disconnect"
                                        >
                                            <LogOut size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => handleConnect(integ.id)}
                                        className="w-full py-2.5 bg-white text-black text-sm font-bold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                                    >
                                        Connect {integ.name}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Right Column: Post Composer & History */}
                    <div className="lg:col-span-8 space-y-8">
                        
                        {/* Composer */}
                        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 relative overflow-hidden group">
                            <div className="flex items-center gap-2 mb-4 text-indigo-400">
                                <Send size={18} />
                                <h3 className="font-bold text-white">New Post</h3>
                            </div>

                            <div className="relative">
                                {/* Disabled Overlay */}
                                {connectedCount === 0 && (
                                    <div className="absolute inset-0 z-10 bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 border border-gray-700 border-dashed rounded-xl">
                                        <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 mb-3">
                                            <AlertCircle size={24} />
                                        </div>
                                        <h4 className="text-white font-bold mb-1">No accounts connected</h4>
                                        <p className="text-gray-400 text-sm mb-4">Connect X (Twitter) or LinkedIn to start scheduling posts.</p>
                                        <button 
                                            onClick={() => handleConnect('twitter')}
                                            className="text-indigo-400 text-sm font-bold hover:underline"
                                        >
                                            Connect Now
                                        </button>
                                    </div>
                                )}

                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="What would you like to share?"
                                    className="w-full bg-black/40 border border-gray-700 rounded-xl p-4 text-white placeholder-gray-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none h-32 text-base transition-all"
                                    disabled={connectedCount === 0}
                                />
                                
                                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
                                        {integrations.filter(i => i.connected).map(integ => (
                                            <button
                                                key={integ.id}
                                                onClick={() => setSelectedPlatform(integ.id as any)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${
                                                    selectedPlatform === integ.id 
                                                    ? 'bg-indigo-900/30 text-indigo-300 border-indigo-500/50' 
                                                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                                                }`}
                                            >
                                                {integ.id === 'twitter' && <Twitter size={12} />}
                                                {integ.id === 'linkedin' && <Linkedin size={12} />}
                                                {integ.name}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex items-center gap-3 w-full sm:w-auto">
                                        <button 
                                            className="p-2 text-gray-400 hover:text-white bg-gray-800 rounded-lg transition-colors"
                                            title="Add Image (Demo)"
                                            disabled={connectedCount === 0}
                                        >
                                            <ImageIcon size={18} />
                                        </button>
                                        <button 
                                            className="p-2 text-gray-400 hover:text-white bg-gray-800 rounded-lg transition-colors"
                                            title="Schedule (Demo)"
                                            disabled={connectedCount === 0}
                                        >
                                            <Calendar size={18} />
                                        </button>
                                        <button 
                                            onClick={handlePost}
                                            disabled={connectedCount === 0 || !content.trim() || isPosting}
                                            className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isPosting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                            Post Now
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Queue / History */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-green-400">
                                <Calendar size={18} />
                                <h3 className="font-bold text-white">Queue & History</h3>
                            </div>
                            
                            <div className="border border-dashed border-gray-800 rounded-2xl p-1 bg-gray-900/30 min-h-[100px]">
                                {posts.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center p-8 text-gray-500">
                                        <p className="text-sm">No scheduled posts yet.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {posts.map(post => (
                                            <div key={post.id} className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex items-start gap-4 group hover:border-gray-700 transition-colors">
                                                <div className="p-2 bg-gray-800 rounded-lg text-gray-400">
                                                    {post.platform === 'twitter' ? <Twitter size={16} /> : <Linkedin size={16} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-gray-300 text-sm mb-2 line-clamp-2">{post.content}</p>
                                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                                        <span className={`px-2 py-0.5 rounded uppercase font-bold ${
                                                            post.status === 'posted' ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'
                                                        }`}>
                                                            {post.status}
                                                        </span>
                                                        <span>{new Date(post.scheduledAt).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* Verification Modal */}
            {verifyingPlatform && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
                        <button 
                            onClick={() => { setVerifyingPlatform(null); if(authWindowRef) authWindowRef.close(); }} 
                            className="absolute top-4 right-4 text-gray-500 hover:text-white"
                        >
                            <X size={20} />
                        </button>

                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-700">
                                {verifyingPlatform === 'twitter' ? <Twitter size={32} className="text-blue-400" /> : <Linkedin size={32} className="text-blue-600" />}
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Verify Connection</h3>
                            <p className="text-gray-400 text-sm">
                                We opened {verifyingPlatform === 'twitter' ? 'X (Twitter)' : verifyingPlatform} in a new window. 
                                Please log in there, then enter your handle below to confirm the link.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Your {verifyingPlatform} Handle</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-3.5 text-gray-500">@</span>
                                    <input 
                                        type="text" 
                                        value={verifyUsername}
                                        onChange={(e) => setVerifyUsername(e.target.value)}
                                        className="w-full bg-black border border-gray-700 rounded-xl py-3 pl-8 pr-4 text-white placeholder-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        placeholder="username"
                                        autoFocus
                                    />
                                </div>
                            </div>
                            
                            <button 
                                onClick={handleConfirmConnection}
                                disabled={!verifyUsername.trim()}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
                            >
                                Verify & Connect Account
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
