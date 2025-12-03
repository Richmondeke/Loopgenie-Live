
import React, { useState, useEffect } from 'react';
import { IntegrationStatus, ScheduledPost } from '../types';
import { Twitter, Send, Calendar, Clock, LogOut, Linkedin, Instagram, Loader2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';

export const Integrations: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingCallback, setIsProcessingCallback] = useState(false);
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

    // --- Load Data & Handle Callback ---
    useEffect(() => {
        const init = async () => {
            await handleAuthCallback();
            await fetchData();
        };
        init();
    }, []);

    const handleAuthCallback = async () => {
        // Check for URL params returned from the Edge Function
        // Expected format: ?connected=true&platform=twitter&username=someuser
        const params = new URLSearchParams(window.location.search);
        const connected = params.get('connected');
        const platform = params.get('platform');
        const error = params.get('error');
        
        if (error) {
            alert(`Connection failed: ${error}`);
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
            return;
        }

        if (connected === 'true' && platform) {
            setIsProcessingCallback(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    // We use the username returned by the Edge Function, or fallback to user metadata
                    const mockUsername = params.get('username') || user.user_metadata?.full_name?.replace(/\s/g, '').toLowerCase() || 'connected_user';
                    const handle = mockUsername.startsWith('@') ? mockUsername : `@${mockUsername}`;

                    // Persist connection to ensure UI state is synced
                    // Even if Edge Function saves it, this double-check ensures the frontend has the record immediately.
                    const { error } = await supabase
                        .from('social_integrations')
                        .upsert({
                            user_id: user.id,
                            platform: platform,
                            username: handle,
                            connected: true,
                            avatar_url: `https://ui-avatars.com/api/?name=${mockUsername}&background=random&color=fff&bold=true`
                        }, { onConflict: 'user_id, platform' });

                    if (error) throw error;

                    // Clean URL to prevent re-processing on refresh
                    window.history.replaceState({}, '', window.location.pathname);
                    
                    // Force refresh data
                    await fetchData();
                }
            } catch (e) {
                console.error("Callback processing failed:", e);
            } finally {
                setIsProcessingCallback(false);
            }
        }
    };

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

    const initiateConnection = async (platform: string) => {
        setIsLoading(true);

        try {
            // 1. Get current URL to return to after auth
            const returnUrl = window.location.origin + window.location.pathname;
            
            // 2. Determine function name based on platform
            let functionName = `auth-${platform}`;
            if (platform === 'twitter') {
                functionName = 'x_oauth_login';
            }
            
            console.log(`Invoking Edge Function: ${functionName} with redirect: ${returnUrl}`);
            
            // 3. Invoke Function Securely (Supabase attaches Auth Header automatically)
            // We pass the redirect_url in the body.
            const { data, error } = await supabase.functions.invoke(functionName, {
                body: { redirect_url: returnUrl },
                method: 'POST', // Assuming function accepts POST. 
            });

            if (error) {
                console.error("Invoke Error Object:", error);
                throw new Error(error.message || "Edge Function invocation failed");
            }

            console.log("Edge Function Response:", data);

            // 4. Handle Redirect
            if (data?.url) {
                // The function returned a JSON object with the auth URL
                window.location.href = data.url;
            } else if (typeof data === 'string' && data.startsWith('http')) {
                // The function returned the raw URL string
                window.location.href = data;
            } else {
                console.warn("Unexpected response format:", data);
                alert("Received unexpected response from authentication server. Please check console.");
            }

        } catch (e: any) {
            console.error("Failed to initiate connection", e);
            alert(`Connection Error: ${e.message}`);
        } finally {
            setIsLoading(false);
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
                await navigator.clipboard.writeText(content);
                alert("Text copied! Opening LinkedIn...");
                window.open('https://www.linkedin.com/feed/', '_blank');
            } else {
                 await navigator.clipboard.writeText(content);
                 alert("Text copied! Opening Instagram...");
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

    // Colors helper
    const getPlatformColor = (id: string) => {
        if (id === 'twitter') return 'bg-black text-white border-gray-700';
        if (id === 'linkedin') return 'bg-[#0077b5] text-white border-transparent';
        if (id === 'instagram') return 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 text-white border-transparent';
        return 'bg-gray-700';
    };

    if (isProcessingCallback) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-black text-white">
                <Loader2 size={48} className="animate-spin text-indigo-500 mb-4" />
                <h2 className="text-xl font-bold">Connecting Account...</h2>
                <p className="text-gray-400">Verifying tokens and saving connection.</p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-4 md:p-8 bg-black text-gray-100 font-sans">
            <div className="max-w-6xl mx-auto">
                <div className="mb-8 flex justify-between items-end">
                    <div>
                        <h2 className="text-3xl font-bold text-white mb-2">Integrations</h2>
                        <p className="text-gray-400">Connect your social accounts to auto-post your generated content.</p>
                    </div>
                    <button onClick={fetchData} className="p-2 text-gray-500 hover:text-white transition-colors" title="Refresh Connections">
                        <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
                    </button>
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
                                        onClick={() => initiateConnection(integ.id)}
                                        disabled={isLoading}
                                        className="w-full py-3 bg-white hover:bg-gray-100 text-black text-sm font-bold rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 relative z-10 disabled:opacity-70 disabled:cursor-wait"
                                    >
                                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
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
                                                onClick={() => initiateConnection('twitter')}
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
        </div>
    );
};
