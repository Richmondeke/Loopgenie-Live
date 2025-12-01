
import React, { useState, useEffect } from 'react';
import { IntegrationStatus, ScheduledPost } from '../types';
import { Twitter, Send, Calendar, Clock, Image as ImageIcon, X, Trash2, CheckCircle, AlertCircle, Loader2, Linkedin, Instagram, ExternalLink, RefreshCw, User, Link as LinkIcon } from 'lucide-react';
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
    const [selectedPlatform, setSelectedPlatform] = useState<'twitter' | 'linkedin'>('twitter');
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const [connectingId, setConnectingId] = useState<string | null>(null);

    // --- Verification Modal State ---
    const [verifyingPlatform, setVerifyingPlatform] = useState<string | null>(null);
    const [verifyUsername, setVerifyUsername] = useState('');

    // --- Load Data ---
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            
            // 1. Fetch Integrations
            if (user) {
                const { data: dbInteg } = await supabase
                    .from('social_integrations')
                    .select('*')
                    .eq('user_id', user.id);

                if (dbInteg && dbInteg.length > 0) {
                    setIntegrations(prev => prev.map(p => {
                        const found = dbInteg.find((row: any) => row.platform === p.id);
                        if (found) {
                            return { 
                                ...p, 
                                connected: true, 
                                username: found.username, 
                                avatarUrl: found.avatar_url || `https://ui-avatars.com/api/?name=${p.name}&background=random`
                            };
                        }
                        return { ...p, connected: false, username: undefined };
                    }));
                } else {
                    // Fallback to local storage if DB empty (or for unauth users)
                    const local = localStorage.getItem('loopgenie_integrations');
                    if (local) setIntegrations(JSON.parse(local));
                }

                // 2. Fetch Posts
                const { data: dbPosts } = await supabase
                    .from('social_posts')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (dbPosts) {
                    setPosts(dbPosts.map((row: any) => ({
                        id: row.id,
                        content: row.content,
                        platform: row.platform,
                        scheduledAt: row.scheduled_at,
                        status: row.status
                    })));
                } else {
                     const localPosts = localStorage.getItem('loopgenie_posts');
                     if (localPosts) setPosts(JSON.parse(localPosts));
                }
            } else {
                // Not logged in, use local storage
                const local = localStorage.getItem('loopgenie_integrations');
                if (local) setIntegrations(JSON.parse(local));
                const localPosts = localStorage.getItem('loopgenie_posts');
                if (localPosts) setPosts(JSON.parse(localPosts));
            }
        } catch (e) {
            console.error("Error loading integration data:", e);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Actions ---
    const handleConnect = async (id: string) => {
        setConnectingId(id);
        
        // 1. Visual Auth Popup (Simulation of OAuth redirect)
        const width = 600;
        const height = 700;
        const left = (window.innerWidth - width) / 2;
        const top = (window.innerHeight - height) / 2;
        
        const authUrl = id === 'twitter' ? 'https://twitter.com/i/flow/login' : 
                       id === 'linkedin' ? 'https://www.linkedin.com/login' : 
                       'https://www.instagram.com/accounts/login/';
                       
        const popup = window.open(
            authUrl, 
            `Connect ${id}`, 
            `width=${width},height=${height},top=${top},left=${left}`
        );

        // 2. Poll for popup closure (Wait for user to finish)
        const timer = setInterval(() => {
            if (popup && popup.closed) {
                clearInterval(timer);
                // When popup closes, we assume they logged in.
                // Now prompt for their handle to "finalize" the link in our system.
                setConnectingId(null);
                setVerifyingPlatform(id);
                setVerifyUsername('');
            }
        }, 1000);
    };

    const confirmConnection = async () => {
        if (!verifyingPlatform) return;
        const id = verifyingPlatform;
        const rawUser = verifyUsername.trim();
        const username = (id !== 'linkedin' && rawUser && !rawUser.startsWith('@')) ? `@${rawUser}` : (rawUser || 'User');

        // 3. Persist "Connected" state to DB
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
            // Upsert to DB
            const { error } = await supabase.from('social_integrations').upsert({
                user_id: user.id,
                platform: id,
                connected: true,
                username: username,
                avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff`,
                access_token: `mock_token_${Date.now()}` // In a real app, this comes from the callback
            }, { onConflict: 'user_id, platform' });

            if (error) console.error("Failed to save integration:", error);
        }

        // 4. Update Local State immediately for responsiveness
        const newIntegrations = integrations.map(i => i.id === id ? { 
            ...i, 
            connected: true, 
            username: username,
            avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff`
        } : i);
        
        setIntegrations(newIntegrations);
        localStorage.setItem('loopgenie_integrations', JSON.stringify(newIntegrations));
        
        // Auto-select
        if (!integrations.some(i => i.connected)) {
            setSelectedPlatform(id as any);
        }
        
        setVerifyingPlatform(null);
    };

    const handleDisconnect = async (id: string) => {
        if (!window.confirm(`Disconnect ${id}? This will remove stored tokens.`)) return;

        // DB Removal
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('social_integrations').delete().match({ user_id: user.id, platform: id });
        }

        // State Update
        const newIntegrations = integrations.map(i => i.id === id ? { ...i, connected: false, username: undefined } : i);
        setIntegrations(newIntegrations);
        localStorage.setItem('loopgenie_integrations', JSON.stringify(newIntegrations));
    };

    const handleSchedule = async () => {
        if (!content.trim()) return;
        setIsPosting(true);

        // Simulate API latency
        await new Promise(r => setTimeout(r, 1500));

        const isScheduled = scheduleDate && scheduleTime;
        const timestamp = isScheduled 
            ? new Date(`${scheduleDate}T${scheduleTime}`).getTime() 
            : Date.now();

        const newPost: ScheduledPost = {
            id: `post_${Date.now()}`,
            content,
            platform: selectedPlatform,
            scheduledAt: timestamp,
            status: isScheduled ? 'scheduled' : 'posted'
        };

        // Persist Post
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('social_posts').insert({
                user_id: user.id,
                content: content,
                platform: selectedPlatform,
                scheduled_at: timestamp,
                status: newPost.status
            });
        }

        const updatedPosts = [newPost, ...posts];
        setPosts(updatedPosts);
        localStorage.setItem('loopgenie_posts', JSON.stringify(updatedPosts));

        setContent('');
        setScheduleDate('');
        setScheduleTime('');
        setIsPosting(false);
    };

    const getIcon = (platform: string) => {
        if (platform === 'twitter') return <Twitter size={18} fill="currentColor" className="text-white" />;
        if (platform === 'linkedin') return <Linkedin size={18} fill="currentColor" className="text-white" />;
        if (platform === 'instagram') return <Instagram size={18} className="text-white" />;
        return null;
    };

    const isAnyConnected = integrations.some(i => i.connected);

    return (
        <div className="h-full overflow-y-auto p-4 md:p-8 no-scrollbar bg-gray-50 dark:bg-black text-gray-900 dark:text-white transition-colors duration-300 relative">
            
            {/* Verification Modal */}
            {verifyingPlatform && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 transform scale-100 transition-all">
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center mx-auto mb-3 text-indigo-600 dark:text-indigo-400">
                                <LinkIcon size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Verify Connection</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Enter your {integrations.find(i => i.id === verifyingPlatform)?.name} handle to finalize the link.
                            </p>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Username / Handle</label>
                                <input 
                                    type="text" 
                                    value={verifyUsername}
                                    onChange={(e) => setVerifyUsername(e.target.value)}
                                    placeholder={verifyingPlatform === 'linkedin' ? "Your Name" : "@username"}
                                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white transition-all"
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && confirmConnection()}
                                />
                            </div>
                            
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setVerifyingPlatform(null)}
                                    className="flex-1 py-2.5 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={confirmConnection}
                                    disabled={!verifyUsername.trim()}
                                    className="flex-1 py-2.5 text-sm font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-6xl mx-auto space-y-8">
                
                {/* Header */}
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Integrations</h1>
                        <p className="text-gray-500 dark:text-gray-400">Connect your social accounts to auto-post your generated content.</p>
                    </div>
                    {isLoading && <Loader2 className="animate-spin text-indigo-500" />}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* LEFT: Connected Accounts List */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1 h-6 bg-indigo-500 rounded-full"></div>
                            <h2 className="text-lg font-bold">Connected Accounts</h2>
                        </div>
                        
                        <div className="space-y-4">
                            {integrations.map(integ => (
                                <div key={integ.id} className={`p-5 rounded-2xl border transition-all relative overflow-hidden group ${
                                    integ.connected 
                                    ? 'bg-gray-800/50 border-gray-700' 
                                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
                                }`}>
                                    <div className="flex items-center justify-between mb-4 relative z-10">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${
                                                integ.id === 'twitter' ? 'bg-black text-white border border-gray-700' :
                                                integ.id === 'linkedin' ? 'bg-[#0077b5] text-white' :
                                                'bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] text-white'
                                            }`}>
                                                {getIcon(integ.id)}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-base text-gray-900 dark:text-white">{integ.name}</h3>
                                                {integ.connected ? (
                                                    <span className="text-xs text-green-500 flex items-center gap-1.5 font-medium mt-0.5">
                                                        Connected as {integ.username}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                                        Not connected
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="relative z-10">
                                        {connectingId === integ.id ? (
                                            <button disabled className="w-full py-2.5 text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-xl flex items-center justify-center gap-2">
                                                <Loader2 size={14} className="animate-spin" /> Waiting for Popup...
                                            </button>
                                        ) : integ.connected ? (
                                            <button 
                                                onClick={() => handleDisconnect(integ.id)}
                                                className="w-full py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors"
                                            >
                                                Disconnect {integ.name}
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => handleConnect(integ.id)}
                                                className="w-full py-2.5 text-sm font-bold bg-gray-100 dark:bg-white text-gray-900 dark:text-black rounded-xl hover:bg-gray-200 dark:hover:bg-gray-200 transition-all shadow-sm"
                                            >
                                                Connect {integ.name}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* CENTER/RIGHT: Composer & Queue */}
                    <div className="lg:col-span-2 space-y-8">
                        
                        {/* New Post Composer */}
                        <div className="bg-white dark:bg-[#0F1218] border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-sm relative overflow-hidden">
                             <div className="flex items-center gap-2 mb-6">
                                <Send size={20} className="text-indigo-500" />
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">New Post</h2>
                            </div>
                            
                            {!isAnyConnected ? (
                                <div className="bg-gray-50 dark:bg-[#151921] rounded-2xl flex flex-col items-center justify-center text-center p-12 border border-dashed border-gray-300 dark:border-gray-700/50">
                                    <div className="w-16 h-16 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                                        <AlertCircle className="text-gray-400" size={32} />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No accounts connected</h3>
                                    <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm text-sm">Connect X (Twitter) to start scheduling posts.</p>
                                    <button 
                                        onClick={() => handleConnect('twitter')} 
                                        className="text-indigo-400 font-bold text-sm hover:text-indigo-300 hover:underline"
                                    >
                                        Connect Now
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-5 animate-in fade-in duration-300">
                                    {/* Platform Selector */}
                                    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                                        {integrations.filter(i => i.connected).map(i => (
                                            <button 
                                                key={i.id}
                                                onClick={() => setSelectedPlatform(i.id as any)}
                                                className={`px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold border transition-all whitespace-nowrap ${
                                                    selectedPlatform === i.id 
                                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/20' 
                                                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 bg-white dark:bg-gray-900'
                                                }`}
                                            >
                                                <span className={selectedPlatform === i.id ? 'text-white' : 'text-gray-500'}>
                                                    {i.id === 'twitter' ? <Twitter size={14} fill="currentColor" /> : i.id === 'linkedin' ? <Linkedin size={14} fill="currentColor" /> : <Instagram size={14} />}
                                                </span>
                                                {i.name}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Text Area */}
                                    <div className="relative group">
                                        <textarea
                                            value={content}
                                            onChange={(e) => setContent(e.target.value)}
                                            placeholder={`What's happening?`}
                                            maxLength={280}
                                            className="w-full h-32 bg-gray-50 dark:bg-[#151921] border border-gray-200 dark:border-gray-700 rounded-2xl p-5 resize-none outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-all text-gray-900 dark:text-white"
                                        />
                                        <div className="absolute bottom-4 right-4 flex items-center gap-4">
                                            <span className={`text-xs font-bold ${content.length > 260 ? 'text-red-500' : 'text-gray-400'}`}>
                                                {content.length}/280
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions Bar */}
                                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 dark:bg-[#151921] p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                                        <div className="flex items-center gap-3 w-full sm:w-auto">
                                            <div className="relative flex-1 sm:flex-none">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                                    <Calendar size={14} />
                                                </div>
                                                <input 
                                                    type="date" 
                                                    value={scheduleDate}
                                                    onChange={(e) => setScheduleDate(e.target.value)}
                                                    className="w-full sm:w-36 pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-indigo-500 dark:text-white font-medium" 
                                                />
                                            </div>
                                            <div className="relative flex-1 sm:flex-none">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                                    <Clock size={14} />
                                                </div>
                                                <input 
                                                    type="time" 
                                                    value={scheduleTime}
                                                    onChange={(e) => setScheduleTime(e.target.value)}
                                                    className="w-full sm:w-28 pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-indigo-500 dark:text-white font-medium" 
                                                />
                                            </div>
                                        </div>

                                        <button 
                                            onClick={handleSchedule}
                                            disabled={!content.trim() || isPosting}
                                            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                                        >
                                            {isPosting ? <Loader2 className="animate-spin" size={16} /> : (scheduleDate ? 'Schedule Post' : 'Post Now')}
                                            {!isPosting && <Send size={14} />}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Queue / History */}
                        <div className="pt-2">
                             <div className="flex items-center gap-2 mb-4">
                                <div className="w-1 h-6 bg-green-500 rounded-full"></div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Queue & History</h2>
                            </div>
                            
                            {posts.length === 0 ? (
                                <div className="text-center py-10 border border-dashed border-gray-200 dark:border-gray-800 rounded-3xl text-gray-400 bg-gray-50/50 dark:bg-black/20">
                                    <p className="text-sm font-medium">No scheduled posts yet.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {posts.map(post => (
                                        <div key={post.id} className="bg-white dark:bg-[#0F1218] border border-gray-200 dark:border-gray-800 p-5 rounded-2xl flex items-start gap-5 hover:border-indigo-300 dark:hover:border-gray-600 transition-all group shadow-sm hover:shadow-md">
                                            <div className={`mt-1 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                post.platform === 'twitter' ? 'bg-black text-white border border-gray-700' :
                                                post.platform === 'linkedin' ? 'bg-[#0077b5] text-white' :
                                                'bg-gradient-to-tr from-[#f09433] to-[#bc1888] text-white'
                                            }`}>
                                                {getIcon(post.platform)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-gray-800 dark:text-gray-200 mb-3 leading-relaxed whitespace-pre-wrap">{post.content}</p>
                                                <div className="flex flex-wrap items-center gap-3 text-xs">
                                                    <span className={`px-2.5 py-1 rounded-md font-bold uppercase tracking-wide flex items-center gap-1.5 ${
                                                        post.status === 'posted' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                    }`}>
                                                        {post.status === 'posted' ? <CheckCircle size={10} /> : <Clock size={10} />}
                                                        {post.status}
                                                    </span>
                                                    <span className="text-gray-400 font-medium flex items-center gap-1">
                                                        <Calendar size={12} />
                                                        {new Date(post.scheduledAt).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => setPosts(prev => prev.filter(p => p.id !== post.id))}
                                                className="text-gray-300 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-all"
                                                title="Delete Post"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};
