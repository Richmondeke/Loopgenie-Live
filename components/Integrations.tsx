
import React, { useState, useEffect } from 'react';
import { IntegrationStatus, ScheduledPost } from '../types';
import { Twitter, Send, Calendar, Clock, Image as ImageIcon, X, Trash2, CheckCircle, AlertCircle, Loader2, Linkedin, Instagram, LogOut, Copy, ExternalLink, RefreshCw } from 'lucide-react';
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

    // --- Connection Modal State ---
    const [connectModalOpen, setConnectModalOpen] = useState(false);
    const [platformToConnect, setPlatformToConnect] = useState<string | null>(null);
    const [usernameInput, setUsernameInput] = useState('');
    const [isSavingConnection, setIsSavingConnection] = useState(false);

    // --- Load Data ---
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            
            if (user) {
                // 1. Fetch Integrations
                const { data: dbInteg, error: integError } = await supabase
                    .from('social_integrations')
                    .select('*')
                    .eq('user_id', user.id);

                if (!integError && dbInteg) {
                    setIntegrations(prev => prev.map(p => {
                        const found = dbInteg.find((d: any) => d.platform === p.id);
                        return found 
                            ? { ...p, connected: true, username: found.username, avatarUrl: found.avatar_url } 
                            : { ...p, connected: false, username: undefined, avatarUrl: undefined };
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

    const openConnectModal = (platform: string) => {
        setPlatformToConnect(platform);
        setUsernameInput('');
        setConnectModalOpen(true);
    };

    const handleSaveConnection = async () => {
        if (!usernameInput || !platformToConnect) return;
        
        setIsSavingConnection(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Please log in to save connections.");

            const handle = usernameInput.startsWith('@') ? usernameInput : `@${usernameInput}`;
            
            // Persist to DB
            const { error } = await supabase
                .from('social_integrations')
                .upsert({
                    user_id: user.id,
                    platform: platformToConnect,
                    username: handle,
                    connected: true,
                    avatar_url: `https://ui-avatars.com/api/?name=${handle}&background=random&color=fff`
                }, { onConflict: 'user_id, platform' });

            if (error) throw error;
            
            // Refresh local state immediately
            await fetchData();
            setConnectModalOpen(false);

        } catch (e: any) {
            console.error(e);
            alert("Failed to connect: " + (e.message || "Unknown error"));
        } finally {
            setIsSavingConnection(false);
        }
    };

    const handleDisconnect = async (platform: string) => {
         const { data: { user } } = await supabase.auth.getUser();
         if (!user) return;

         if (!confirm(`Disconnect ${platform}? This will remove it from your dashboard.`)) return;

         // Optimistic Update
         setIntegrations(prev => prev.map(p => p.id === platform ? { ...p, connected: false } : p));

         await supabase
            .from('social_integrations')
            .delete()
            .match({ user_id: user.id, platform: platform });
         
         fetchData();
    };

    const handlePost = async () => {
        if (!content.trim()) return;
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            alert("Please sign in to post.");
            return;
        }

        setIsPosting(true);
        
        try {
            // 1. Save to History (DB)
            const newPost = {
                id: `post_${Date.now()}`,
                user_id: user.id,
                content,
                platform: selectedPlatform,
                status: 'posted', 
                scheduled_at: Date.now(),
                created_at: new Date().toISOString()
            };

            const { error } = await supabase.from('social_posts').insert(newPost);
            if (error) throw error;

            // 2. Perform "Real" Action (Web Intent)
            let intentUrl = '';
            const encodedText = encodeURIComponent(content);
            
            if (selectedPlatform === 'twitter') {
                intentUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
                window.open(intentUrl, '_blank', 'width=550,height=420');
            } else if (selectedPlatform === 'linkedin') {
                // LinkedIn text sharing is limited via URL, usually shares a URL. 
                // We'll fallback to copying to clipboard for LinkedIn/Instagram
                await navigator.clipboard.writeText(content);
                alert("Text copied to clipboard! Opening LinkedIn...");
                window.open('https://www.linkedin.com/feed/', '_blank');
            } else {
                 await navigator.clipboard.writeText(content);
                 alert("Text copied to clipboard! Opening Instagram...");
                 window.open('https://www.instagram.com/', '_blank');
            }

            // Update UI
            setContent('');
            fetchData();

        } catch (e: any) {
            alert("Failed to post: " + e.message);
        } finally {
            setIsPosting(false);
        }
    };

    const connectedCount = integrations.filter(i => i.connected).length;
    const activePlatform = integrations.find(i => i.id === selectedPlatform);

    // Colors helper
    const getPlatformColor = (id: string) => {
        if (id === 'twitter') return 'bg-black text-white border-gray-700';
        if (id === 'linkedin') return 'bg-[#0077b5] text-white border-transparent';
        if (id === 'instagram') return 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 text-white border-transparent';
        return 'bg-gray-700';
    };

    return (
        <div className="h-full overflow-y-auto p-4 md:p-8 bg-black text-gray-100 font-sans">
            <div className="max-w-6xl mx-auto">
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">Integrations</h2>
                    <p className="text-gray-400">Connect your social accounts to auto-post your generated content.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    {/* --- LEFT COLUMN: CONNECTED ACCOUNTS --- */}
                    <div className="lg:col-span-5 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-1 h-5 bg-indigo-500 rounded-full"></div>
                            <h3 className="text-lg font-bold text-white">Connected Accounts</h3>
                        </div>

                        {integrations.map((integ) => (
                            <div 
                                key={integ.id} 
                                className={`p-5 rounded-2xl border transition-all duration-200 relative overflow-hidden ${
                                    integ.connected 
                                    ? 'bg-gray-900/80 border-indigo-500/30 shadow-[0_4px_20px_-10px_rgba(99,102,241,0.3)]' 
                                    : 'bg-gray-900/40 border-gray-800 hover:border-gray-700'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-4 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${getPlatformColor(integ.id)}`}>
                                            {integ.id === 'twitter' && <Twitter size={24} fill="currentColor" />}
                                            {integ.id === 'linkedin' && <Linkedin size={24} fill="currentColor" />}
                                            {integ.id === 'instagram' && <Instagram size={24} />}
                                        </div>
                                        <div>
                                            <div className="font-bold text-white text-base">{integ.name}</div>
                                            <div className={`text-xs font-medium ${integ.connected ? 'text-green-400' : 'text-gray-500'}`}>
                                                {integ.connected ? 'Active Connection' : 'Not connected'}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {integ.connected ? (
                                    <div className="bg-black/40 rounded-xl p-3 flex items-center justify-between border border-gray-800 relative z-10">
                                        <div className="flex items-center gap-3">
                                            <img 
                                                src={integ.avatarUrl || `https://ui-avatars.com/api/?name=${integ.username}&background=random`} 
                                                alt="Avatar" 
                                                className="w-8 h-8 rounded-full border border-gray-700"
                                            />
                                            <span className="text-sm font-mono text-gray-300 font-bold">{integ.username}</span>
                                        </div>
                                        <button 
                                            onClick={() => handleDisconnect(integ.id)}
                                            className="text-gray-500 hover:text-red-400 transition-colors p-2 hover:bg-red-900/10 rounded-lg"
                                            title="Disconnect"
                                        >
                                            <LogOut size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => openConnectModal(integ.id)}
                                        className="w-full py-3 bg-white hover:bg-gray-100 text-black text-sm font-bold rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 relative z-10"
                                    >
                                        Connect {integ.name}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* --- RIGHT COLUMN: POST COMPOSER & HISTORY --- */}
                    <div className="lg:col-span-7 space-y-8">
                        
                        {/* COMPOSER CARD */}
                        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-1 relative overflow-hidden shadow-2xl">
                             <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 absolute inset-0 pointer-events-none" />
                             
                             <div className="p-5 relative">
                                <div className="flex items-center gap-2 mb-4 text-indigo-400">
                                    <Send size={18} />
                                    <h3 className="font-bold text-white">New Post</h3>
                                </div>

                                <div className="relative rounded-xl overflow-hidden bg-black/50 border border-gray-700/50 focus-within:border-indigo-500/50 transition-colors">
                                    {/* DISABLED STATE OVERLAY */}
                                    {connectedCount === 0 && (
                                        <div className="absolute inset-0 z-20 bg-gray-900/90 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6">
                                            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 mb-3 ring-1 ring-gray-700">
                                                <AlertCircle size={24} />
                                            </div>
                                            <h4 className="text-white font-bold mb-1">No accounts connected</h4>
                                            <p className="text-gray-400 text-sm mb-4 max-w-xs">Connect X (Twitter) or LinkedIn on the left to start scheduling posts.</p>
                                            <button 
                                                onClick={() => openConnectModal('twitter')}
                                                className="text-indigo-400 text-sm font-bold hover:text-indigo-300 transition-colors"
                                            >
                                                Connect Now &rarr;
                                            </button>
                                        </div>
                                    )}

                                    <textarea
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        placeholder="What would you like to share?"
                                        className="w-full bg-transparent border-none p-4 text-white placeholder-gray-500 focus:ring-0 outline-none resize-none h-32 text-base leading-relaxed"
                                        disabled={connectedCount === 0}
                                    />
                                    
                                    <div className="px-4 pb-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-800/50 pt-3">
                                        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
                                            {integrations.filter(i => i.connected).map(integ => (
                                                <button
                                                    key={integ.id}
                                                    onClick={() => setSelectedPlatform(integ.id as any)}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${
                                                        selectedPlatform === integ.id 
                                                        ? 'bg-indigo-600 text-white border-indigo-500' 
                                                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
                                                    }`}
                                                >
                                                    {integ.id === 'twitter' && <Twitter size={12} fill="currentColor" />}
                                                    {integ.id === 'linkedin' && <Linkedin size={12} fill="currentColor" />}
                                                    {integ.id === 'instagram' && <Instagram size={12} />}
                                                    {integ.name}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <button 
                                                onClick={handlePost}
                                                disabled={connectedCount === 0 || !content.trim() || isPosting}
                                                className="flex-1 sm:flex-none bg-white hover:bg-gray-200 text-black px-6 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-95"
                                            >
                                                {isPosting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                                Post Now
                                            </button>
                                        </div>
                                    </div>
                                </div>
                             </div>
                        </div>

                        {/* QUEUE & HISTORY */}
                        <div>
                            <div className="flex items-center gap-2 text-green-400 mb-4 px-2">
                                <Calendar size={18} />
                                <h3 className="font-bold text-white">Queue & History</h3>
                            </div>
                            
                            <div className="border border-dashed border-gray-800 rounded-3xl p-4 bg-gray-900/20 min-h-[150px]">
                                {posts.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center py-10 text-gray-600">
                                        <div className="w-12 h-12 bg-gray-800/50 rounded-full flex items-center justify-center mb-3">
                                            <Clock size={20} className="opacity-50" />
                                        </div>
                                        <p className="text-sm font-medium">No scheduled posts yet.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {posts.map(post => (
                                            <div key={post.id} className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex items-start gap-4 group hover:border-gray-700 transition-colors shadow-sm">
                                                <div className={`p-2 rounded-lg text-white flex-shrink-0 ${post.platform === 'twitter' ? 'bg-black' : 'bg-[#0077b5]'}`}>
                                                    {post.platform === 'twitter' ? <Twitter size={16} fill="currentColor" /> : <Linkedin size={16} fill="currentColor" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-gray-300 text-sm mb-2 line-clamp-2 leading-relaxed">{post.content}</p>
                                                    <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
                                                        <span className={`px-2 py-0.5 rounded uppercase font-bold text-[10px] ${
                                                            post.status === 'posted' ? 'bg-green-900/30 text-green-400 border border-green-900/50' : 'bg-yellow-900/30 text-yellow-400 border border-yellow-900/50'
                                                        }`}>
                                                            {post.status}
                                                        </span>
                                                        <span>{new Date(post.scheduledAt).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                                {post.status === 'posted' && (
                                                    <a href="#" className="text-gray-600 hover:text-indigo-400 transition-colors self-center p-2"><ExternalLink size={16} /></a>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* --- CONNECTION MODAL --- */}
            {connectModalOpen && platformToConnect && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-gray-900 border border-gray-700 rounded-3xl w-full max-w-md p-8 shadow-2xl relative overflow-hidden">
                        
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                        
                        <button 
                            onClick={() => setConnectModalOpen(false)} 
                            className="absolute top-4 right-4 text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 p-1.5 rounded-full transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <div className="text-center mb-8">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl ${getPlatformColor(platformToConnect)}`}>
                                {platformToConnect === 'twitter' && <Twitter size={40} fill="currentColor" />}
                                {platformToConnect === 'linkedin' && <Linkedin size={40} fill="currentColor" />}
                                {platformToConnect === 'instagram' && <Instagram size={40} />}
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">Connect {platformToConnect === 'twitter' ? 'X (Twitter)' : 'Account'}</h3>
                            <p className="text-gray-400 text-sm leading-relaxed px-4">
                                Enter your handle below to link this account. We'll use this to tag your posts and manage your history.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Username / Handle</label>
                                <div className="relative group">
                                    <span className="absolute left-4 top-3.5 text-gray-500 font-bold group-focus-within:text-indigo-500 transition-colors">@</span>
                                    <input 
                                        type="text" 
                                        value={usernameInput}
                                        onChange={(e) => setUsernameInput(e.target.value)}
                                        className="w-full bg-black border border-gray-700 rounded-xl py-3 pl-8 pr-4 text-white font-bold placeholder-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                        placeholder="username"
                                        autoFocus
                                    />
                                </div>
                            </div>
                            
                            <button 
                                onClick={handleSaveConnection}
                                disabled={!usernameInput.trim() || isSavingConnection}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95 flex items-center justify-center gap-2"
                            >
                                {isSavingConnection ? <Loader2 className="animate-spin" /> : <CheckCircle size={18} />}
                                Save Connection
                            </button>
                            
                            <p className="text-center text-xs text-gray-600">
                                By connecting, you agree to our Terms of Service.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
