
import React, { useState, useEffect } from 'react';
import { IntegrationStatus, ScheduledPost, Project } from '../types';
import { Twitter, Send, Calendar, Clock, LogOut, Linkedin, Instagram, Loader2, AlertCircle, ExternalLink, RefreshCw, Zap, Save, CheckCircle, Video, ChevronDown, Search } from 'lucide-react';
import { getCurrentUser, getUserProfile, updateUserProfile } from '../services/authService';
import { dispatchManualWebhook, dispatchProjectToWebhook } from '../services/webhookService';
import { fetchProjects } from '../services/projectService';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, orderBy, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';

export const Integrations: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingCallback, setIsProcessingCallback] = useState(false);
    const [integrations, setIntegrations] = useState<IntegrationStatus[]>([
        { id: 'twitter', name: 'X (Twitter)', connected: false },
        { id: 'linkedin', name: 'LinkedIn', connected: false },
        { id: 'instagram', name: 'Instagram', connected: false }
    ]);
    const [posts, setPosts] = useState<ScheduledPost[]>([]);
    const [userProjects, setUserProjects] = useState<Project[]>([]);

    // --- Webhook State ---
    const [webhookUrl, setWebhookUrl] = useState('');
    const [webhookMethod, setWebhookMethod] = useState<'POST' | 'GET'>('POST');
    const [isSavingWebhook, setIsSavingWebhook] = useState(false);
    const [webhookSaved, setWebhookSaved] = useState(false);

    // --- Composer State ---
    const [dispatchMode, setDispatchMode] = useState<'TEXT' | 'PROJECT'>('TEXT');
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [content, setContent] = useState('');
    const [selectedPlatform, setSelectedPlatform] = useState<'twitter' | 'linkedin' | 'instagram' | 'webhook'>('webhook');
    const [isPosting, setIsPosting] = useState(false);

    // --- Load Data & Handle Callback ---
    useEffect(() => {
        const init = async () => {
            await handleAuthCallback();
            await fetchData();
        };
        init();
    }, []);

    // Effect to auto-select Webhook if social accounts aren't connected
    useEffect(() => {
        const hasSocial = integrations.some(i => i.connected);
        if (!hasSocial && webhookUrl && selectedPlatform !== 'webhook') {
            setSelectedPlatform('webhook');
        }
    }, [integrations, webhookUrl]);

    const handleAuthCallback = async () => {
        const params = new URLSearchParams(window.location.search);
        const connected = params.get('connected');
        const platform = params.get('platform');
        const error = params.get('error');

        if (error) {
            alert(`Connection failed: ${error}`);
            window.history.replaceState({}, '', window.location.pathname);
            return;
        }

        if (connected === 'true' && platform) {
            setIsProcessingCallback(true);
            try {
                const user = await getCurrentUser();
                if (user) {
                    const mockUsername = params.get('username') || user.user_metadata?.full_name?.replace(/\s/g, '').toLowerCase() || 'connected_user';
                    const handle = mockUsername.startsWith('@') ? mockUsername : `@${mockUsername}`;

                    const profileRef = doc(db, 'social_integrations', `${user.id}_${platform}`);
                    await setDoc(profileRef, {
                        user_id: user.id,
                        platform: platform,
                        username: handle,
                        connected: true,
                        avatar_url: `https://ui-avatars.com/api/?name=${mockUsername}&background=random&color=fff&bold=true`,
                        updated_at: serverTimestamp()
                    });

                    window.history.replaceState({}, '', window.location.pathname);
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
        setIsLoading(true);
        try {
            // Load from Local Storage FIRST (Fallback for everyone)
            const localUrl = localStorage.getItem('loopgenie_webhook_url') || '';
            const localMethod = (localStorage.getItem('loopgenie_webhook_method') as any) || 'POST';

            setWebhookUrl(localUrl);
            setWebhookMethod(localMethod);

            // Load Projects for picker
            const { projects: loadedProjects } = await fetchProjects();
            setUserProjects(loadedProjects.filter(p => p.status === 'completed'));

            // setIsLoading(false) is handled by the onSnapshot for integrations now.
            // If there are no integrations, it will still set isLoading to false.
        } catch (e) {
            console.warn("Failed to load projects or local webhook settings:", e);
            setIsLoading(false); // Ensure isLoading is set to false even if projects fail
        }
    };

    const handleSaveWebhook = async () => {
        setIsSavingWebhook(true);
        try {
            // 1. ALWAYS update localStorage for immediate offline availability
            localStorage.setItem('loopgenie_webhook_url', webhookUrl);
            localStorage.setItem('loopgenie_webhook_method', webhookMethod);

            // 2. ALSO update DB if logged in
            const user = await getCurrentUser();
            if (user) {
                const result = await updateUserProfile(user.id, {
                    webhook_url: webhookUrl,
                    webhook_method: webhookMethod
                });

                if (!result.success) {
                    throw new Error(result.error || "Failed to save to database");
                }

                console.log("[Integrations] Webhook saved to Firestore successfully.");
            }

            setWebhookSaved(true);
            setTimeout(() => setWebhookSaved(false), 2000);
        } catch (e: any) {
            console.error("[Integrations] Save failed:", e.message || e);
            alert("Settings saved locally, but could not sync to cloud: " + (e.message || "Database configuration issue. Check SCHEMA.md."));
        } finally {
            setIsSavingWebhook(false);
        }
    };

    const initiateConnection = async (platform: string) => {
        // NOTE: Social OAuth via Firebase Cloud Functions is pending backend implementation.
        // For now, we will notify that this feature is being migrated.
        alert(`Social connection for ${platform} is currently being migrated to Firebase Cloud Functions and will be available soon.`);
    };
    const handleDisconnect = async (platform: string) => {
        const user = await getCurrentUser();
        if (!user) return;
        if (!confirm(`Disconnect ${platform}?`)) return;
        setIntegrations(prev => prev.map(p => p.id === platform ? { ...p, connected: false } : p));

        const q = query(
            collection(db, 'social_integrations'),
            where('user_id', '==', user.id),
            where('platform', '==', platform)
        );
        const snapshot = await getDocs(q);
        snapshot.forEach(async (d) => {
            await deleteDoc(doc(db, 'social_integrations', d.id));
        });

        await fetchData();
    };

    const handlePost = async () => {
        if (dispatchMode === 'TEXT' && !content.trim()) return;
        if (dispatchMode === 'PROJECT' && !selectedProjectId) return;

        setIsPosting(true);
        try {
            const user = await getCurrentUser();
            const project = userProjects.find(p => p.id === selectedProjectId);

            // 1. Platform Specific Dispatch
            if (selectedPlatform === 'webhook') {
                let result;
                if (dispatchMode === 'PROJECT' && project) {
                    result = await dispatchProjectToWebhook(webhookUrl, project, webhookMethod);
                } else {
                    result = await dispatchManualWebhook(webhookUrl, content, webhookMethod);
                }

                if (!result.success) {
                    throw new Error(result.error);
                }

                alert("Data successfully pushed to Webhook!");
            } else {
                // Social platform logic (Limited to Text for now)
                let textToPost = dispatchMode === 'PROJECT' && project ? `Check out my new video: ${project.templateName}` : content;
                let intentUrl = '';
                const encodedText = encodeURIComponent(textToPost);

                if (selectedPlatform === 'twitter') {
                    intentUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
                    window.open(intentUrl, '_blank', 'width=550,height=420');
                } else {
                    await navigator.clipboard.writeText(textToPost);
                    alert("Content copied! Opening platform...");
                    window.open(selectedPlatform === 'linkedin' ? 'https://www.linkedin.com/feed/' : 'https://www.instagram.com/', '_blank');
                }
            }

            // 2. Database Logging (after successful dispatch)
            if (user) {
                const logContent = dispatchMode === 'PROJECT' && project ? `Project: ${project.templateName}` : content;
                await addDoc(collection(db, 'social_posts'), {
                    user_id: user.id,
                    content: logContent,
                    platform: selectedPlatform,
                    status: 'posted',
                    scheduled_at: Date.now(),
                    created_at: serverTimestamp(),
                    media_url: dispatchMode === 'PROJECT' && project ? project.videoUrl : null
                });
            }

            setContent('');
            setSelectedProjectId('');
            await fetchData();
        } catch (e: any) {
            console.error("Manual post failed:", e);
            alert("Dispatch Failed: " + e.message);
        } finally {
            setIsPosting(false);
        }
    };

    const connectedCount = integrations.filter(i => i.connected).length + (webhookUrl ? 1 : 0);
    const isLocalWebhook = webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1');

    const getPlatformColor = (id: string) => {
        if (id === 'twitter') return 'bg-black text-white border-gray-700';
        if (id === 'linkedin') return 'bg-[#0077b5] text-white border-transparent';
        if (id === 'instagram') return 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 text-white border-transparent';
        if (id === 'webhook') return 'bg-orange-600 text-white border-transparent';
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

    const selectedProject = userProjects.find(p => p.id === selectedProjectId);

    return (
        <div className="h-full overflow-y-auto p-4 md:p-8 bg-black text-gray-100 font-sans">
            <div className="max-w-6xl mx-auto">
                <div className="mb-8 flex justify-between items-end">
                    <div>
                        <h2 className="text-3xl font-bold text-white mb-2">Integrations</h2>
                        <p className="text-gray-400">Connect your social accounts or automation webhooks (N8n, Zapier) to pass your generated content.</p>
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

                        {/* Webhook Integration Card */}
                        <div className={`p-5 rounded-2xl border transition-all duration-200 relative overflow-hidden ${webhookUrl
                            ? 'bg-gray-900/80 border-orange-500/30 shadow-[0_4px_20px_-10px_rgba(249,115,22,0.3)]'
                            : 'bg-gray-900/40 border-gray-800 hover:border-gray-700'
                            }`}>
                            <div className="flex items-center gap-4 mb-4 relative z-10">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg bg-orange-600 text-white`}>
                                    <Zap size={24} fill="currentColor" />
                                </div>
                                <div>
                                    <div className="font-bold text-white text-base">Automation (N8n / Webhook)</div>
                                    <div className={`text-xs font-medium ${webhookUrl ? 'text-green-400' : 'text-gray-500'}`}>
                                        {webhookUrl ? 'Active Automation' : 'Connect your workflow'}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 relative z-10">
                                <div className="flex gap-2">
                                    <select
                                        value={webhookMethod}
                                        onChange={(e) => setWebhookMethod(e.target.value as any)}
                                        className="bg-black/60 border border-gray-800 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-300 outline-none focus:ring-1 focus:ring-orange-500"
                                    >
                                        <option value="POST">POST</option>
                                        <option value="GET">GET</option>
                                    </select>
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            value={webhookUrl}
                                            onChange={(e) => setWebhookUrl(e.target.value)}
                                            placeholder="https://n8n.your-instance.com/webhook/..."
                                            className="w-full bg-black/60 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-300 placeholder-gray-600 focus:ring-1 focus:ring-orange-500 outline-none transition-all"
                                        />
                                        <button
                                            onClick={handleSaveWebhook}
                                            disabled={isSavingWebhook}
                                            className={`absolute right-1 top-1 bottom-1 px-3 rounded-lg flex items-center justify-center transition-all ${webhookSaved ? 'bg-green-600 text-white' : 'bg-orange-600 hover:bg-orange-500 text-white'
                                                }`}
                                        >
                                            {isSavingWebhook ? <Loader2 size={16} className="animate-spin" /> : webhookSaved ? <CheckCircle size={16} /> : <Save size={16} />}
                                        </button>
                                    </div>
                                </div>
                                {isLocalWebhook && (
                                    <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-2 text-[10px] text-yellow-500 flex items-start gap-2">
                                        <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                                        <span>Local URLs (localhost) require manual CORS configuration on your server to work with direct browser requests.</span>
                                    </div>
                                )}
                                <p className="text-[10px] text-gray-500 leading-tight px-1 italic">
                                    Every completed video/image will be {webhookMethod}ed to this URL. Perfect for N8n or Zapier pipelines.
                                </p>
                            </div>
                        </div>

                        {integrations.map((integ) => (
                            <div
                                key={integ.id}
                                className={`p-5 rounded-2xl border transition-all duration-200 relative overflow-hidden ${integ.connected
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
                        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-1 relative overflow-hidden shadow-2xl">
                            <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 absolute inset-0 pointer-events-none" />

                            <div className="p-5 relative">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2 text-indigo-400">
                                        <Send size={18} />
                                        <h3 className="font-bold text-white">Manual Dispatch</h3>
                                    </div>
                                    <div className="flex bg-black/40 p-1 rounded-lg border border-gray-800">
                                        <button
                                            onClick={() => setDispatchMode('TEXT')}
                                            className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${dispatchMode === 'TEXT' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
                                        >
                                            Custom Text
                                        </button>
                                        <button
                                            onClick={() => setDispatchMode('PROJECT')}
                                            className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${dispatchMode === 'PROJECT' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
                                        >
                                            Project MP4
                                        </button>
                                    </div>
                                </div>

                                <div className="relative rounded-xl overflow-hidden bg-black/50 border border-gray-700/50 focus-within:border-indigo-500/50 transition-colors min-h-[160px] flex flex-col">
                                    {connectedCount === 0 && (
                                        <div className="absolute inset-0 z-20 bg-gray-900/90 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6">
                                            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 mb-3 ring-1 ring-gray-700">
                                                <AlertCircle size={24} />
                                            </div>
                                            <h4 className="text-white font-bold mb-1">No channels connected</h4>
                                            <p className="text-gray-400 text-sm mb-4 max-w-xs">Connect a social account or webhook to push content manually.</p>
                                        </div>
                                    )}

                                    {dispatchMode === 'TEXT' ? (
                                        <textarea
                                            value={content}
                                            onChange={(e) => setContent(e.target.value)}
                                            placeholder="Send a test payload or shared text..."
                                            className="w-full bg-transparent border-none p-4 text-white placeholder-gray-500 focus:ring-0 outline-none resize-none h-32 text-base leading-relaxed"
                                            disabled={connectedCount === 0}
                                        />
                                    ) : (
                                        <div className="p-4 flex-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase mb-2 block">Select Video Project</label>
                                            <div className="relative">
                                                <select
                                                    value={selectedProjectId}
                                                    onChange={(e) => setSelectedProjectId(e.target.value)}
                                                    className="w-full bg-black/60 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white appearance-none outline-none focus:ring-1 focus:ring-indigo-500"
                                                >
                                                    <option value="">Select a completed project...</option>
                                                    {userProjects.map(p => (
                                                        <option key={p.id} value={p.id}>{p.templateName} ({new Date(p.createdAt).toLocaleDateString()})</option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                            </div>

                                            {selectedProject && (
                                                <div className="mt-4 flex items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/10 animate-in slide-in-from-top-2 duration-300">
                                                    <div className="w-20 aspect-video rounded-lg overflow-hidden bg-black border border-white/10">
                                                        <img src={selectedProject.thumbnailUrl} className="w-full h-full object-cover" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-bold text-white truncate">{selectedProject.templateName}</div>
                                                        <div className="text-[10px] text-indigo-400 font-mono mt-0.5">{selectedProject.type} • {selectedProject.cost} Credits</div>
                                                    </div>
                                                    <button onClick={() => setSelectedProjectId('')} className="p-1.5 hover:bg-white/10 rounded-full text-gray-500 hover:text-white">
                                                        <RefreshCw size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="px-4 pb-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-800/50 pt-3 mt-auto">
                                        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
                                            {webhookUrl && (
                                                <button
                                                    onClick={() => setSelectedPlatform('webhook')}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${selectedPlatform === 'webhook'
                                                        ? 'bg-orange-600 text-white border-orange-500'
                                                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
                                                        }`}
                                                >
                                                    <Zap size={12} fill="currentColor" /> Webhook
                                                </button>
                                            )}
                                            {integrations.filter(i => i.connected).map(integ => (
                                                <button
                                                    key={integ.id}
                                                    onClick={() => setSelectedPlatform(integ.id as any)}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${selectedPlatform === integ.id
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

                                        <button
                                            onClick={handlePost}
                                            disabled={connectedCount === 0 || (dispatchMode === 'TEXT' && !content.trim()) || (dispatchMode === 'PROJECT' && !selectedProjectId) || isPosting}
                                            className="bg-white hover:bg-gray-200 text-black px-6 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg active:scale-95"
                                        >
                                            {isPosting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                            Push Data
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center gap-2 text-green-400 mb-4 px-2">
                                <Calendar size={18} />
                                <h3 className="font-bold text-white">Event History</h3>
                            </div>

                            <div className="border border-dashed border-gray-800 rounded-3xl p-4 bg-gray-900/20 min-h-[150px]">
                                {posts.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center py-10 text-gray-600">
                                        <div className="w-12 h-12 bg-gray-800/50 rounded-full flex items-center justify-center mb-3">
                                            <Clock size={20} className="opacity-50" />
                                        </div>
                                        <p className="text-sm font-medium">No activity history yet.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {posts.map(post => (
                                            <div key={post.id} className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex items-start gap-4 group hover:border-gray-700 transition-colors shadow-sm">
                                                <div className={`p-2 rounded-lg text-white flex-shrink-0 ${post.platform === 'twitter' ? 'bg-black' : post.platform === 'webhook' ? 'bg-orange-600' : 'bg-[#0077b5]'}`}>
                                                    {post.platform === 'twitter' ? <Twitter size={16} fill="currentColor" /> : post.platform === 'webhook' ? <Zap size={16} fill="currentColor" /> : <Linkedin size={16} fill="currentColor" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-gray-300 text-sm mb-2 line-clamp-2 leading-relaxed">{post.content}</p>
                                                    {post.mediaUrl && (
                                                        <div className="mb-3 w-32 aspect-video rounded-lg overflow-hidden border border-white/5 relative group/media">
                                                            <img src={`https://via.placeholder.com/160x90/111/fff?text=Video`} className="w-full h-full object-cover opacity-50" />
                                                            <div className="absolute inset-0 flex items-center justify-center">
                                                                <Video size={16} className="text-white/40" />
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
                                                        <span className={`px-2 py-0.5 rounded uppercase font-bold text-[10px] ${post.status === 'posted' ? 'bg-green-900/30 text-green-400 border border-green-900/50' : 'bg-yellow-900/30 text-yellow-400 border border-yellow-900/50'
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
        </div>
    );
};
