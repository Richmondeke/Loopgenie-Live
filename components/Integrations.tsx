
import React, { useState, useEffect } from 'react';
import {

    Youtube, Plus, Trash2, ExternalLink, RefreshCw, Loader2, CheckCircle,
    AlertCircle, Settings, Users, Video, BarChart2, LogOut, ChevronRight,
    PlayCircle, Upload, Eye, ThumbsUp, MessageSquare, TrendingUp, Globe
} from 'lucide-react';
import { getCurrentUser } from '../services/authService';
import { db } from '../firebase';
import {
    collection, query, where, getDocs, doc, setDoc, deleteDoc,
    serverTimestamp, onSnapshot, orderBy
} from 'firebase/firestore';

// --- Types ---
interface YouTubeAccount {
    id: string;
    channelId: string;
    channelName: string;
    channelHandle: string;
    channelAvatar: string;
    subscriberCount?: string;
    videoCount?: string;
    viewCount?: string;
    connected: boolean;
    connectedAt: any;
}

interface ChannelStats {
    subscribers: string;
    videos: string;
    views: string;
    recentUploads: { title: string; views: string; thumb: string }[];
}

// --- Helpers ---
const formatCount = (count?: string) => {
    if (!count) return '—';
    const n = parseInt(count);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return count;
};

// --- Sub-component: Channel Card ---
const ChannelCard: React.FC<{
    account: YouTubeAccount;
    isSelected: boolean;
    onSelect: () => void;
    onDisconnect: () => void;
}> = ({ account, isSelected, onSelect, onDisconnect }) => (
    <div
        onClick={onSelect}
        className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 group relative ${isSelected
            ? 'bg-red-950/30 border-red-500/40 shadow-[0_4px_24px_-8px_rgba(239,68,68,0.3)]'
            : 'bg-gray-900/60 border-gray-800 hover:border-gray-700 hover:bg-gray-900/80'
            }`}
    >
        <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
                <img
                    src={account.channelAvatar}
                    alt={account.channelName}
                    className="w-12 h-12 rounded-full border-2 border-gray-700 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(account.channelName)}&background=cc0000&color=fff&bold=true`; }}
                />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-950" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-sm truncate">{account.channelName}</div>
                <div className="text-xs text-gray-400 truncate">{account.channelHandle}</div>
            </div>

            {isSelected && <ChevronRight size={16} className="text-red-400 flex-shrink-0" />}
        </div>

        <div className="flex gap-4 mt-3 pt-3 border-t border-gray-800/60">
            <div className="text-center flex-1">
                <div className="text-sm font-bold text-white">{formatCount(account.subscriberCount)}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Subs</div>
            </div>
            <div className="text-center flex-1">
                <div className="text-sm font-bold text-white">{formatCount(account.videoCount)}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Videos</div>
            </div>
            <div className="text-center flex-1">
                <div className="text-sm font-bold text-white">{formatCount(account.viewCount)}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Views</div>
            </div>
        </div>

        {/* Disconnect button */}
        <button
            onClick={(e) => { e.stopPropagation(); onDisconnect(); }}
            className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-gray-600 hover:text-red-400 hover:bg-red-900/20"
            title="Disconnect channel"
        >
            <LogOut size={13} />
        </button>
    </div>
);

// --- Sub-component: Channel Detail Panel ---
const ChannelDetailPanel: React.FC<{ account: YouTubeAccount }> = ({ account }) => {
    const stats = [
        { icon: Users, label: 'Subscribers', value: formatCount(account.subscriberCount), color: 'text-red-400' },
        { icon: Video, label: 'Total Videos', value: formatCount(account.videoCount), color: 'text-blue-400' },
        { icon: Eye, label: 'Total Views', value: formatCount(account.viewCount), color: 'text-green-400' },
    ];

    return (
        <div className="space-y-6">
            {/* Channel Header */}
            <div className="bg-gradient-to-br from-red-950/40 to-gray-900 border border-red-900/30 rounded-3xl p-6">
                <div className="flex items-start gap-5">
                    <img
                        src={account.channelAvatar}
                        alt={account.channelName}
                        className="w-20 h-20 rounded-2xl border-2 border-red-900/40 object-cover shadow-xl"
                        onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(account.channelName)}&background=cc0000&color=fff&bold=true&size=80`; }}
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-xl font-bold text-white truncate">{account.channelName}</h3>
                            <CheckCircle size={16} className="text-red-400 flex-shrink-0" />
                        </div>
                        <div className="text-sm text-gray-400 mb-3">{account.channelHandle}</div>
                        <div className="flex flex-wrap gap-2">
                            <a
                                href={`https://studio.youtube.com/channel/${account.channelId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                                <Settings size={12} /> YouTube Studio
                                <ExternalLink size={10} />
                            </a>
                            <a
                                href={`https://www.youtube.com/${account.channelHandle}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold rounded-lg transition-colors border border-gray-700"
                            >
                                <Globe size={12} /> View Channel
                                <ExternalLink size={10} />
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
                {stats.map(({ icon: Icon, label, value, color }) => (
                    <div key={label} className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 text-center hover:border-gray-700 transition-colors">
                        <Icon size={20} className={`mx-auto mb-2 ${color}`} />
                        <div className="text-2xl font-bold text-white mb-0.5">{value}</div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
                    </div>
                ))}
            </div>

            {/* Auto-Upload Info */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Upload size={16} className="text-red-400" />
                    <h4 className="font-bold text-white text-sm">Auto-Upload Settings</h4>
                </div>
                <div className="space-y-3">
                    <div className="flex items-center justify-between py-2.5 border-b border-gray-800/60">
                        <div>
                            <div className="text-sm text-gray-300 font-medium">Publish completed videos</div>
                            <div className="text-xs text-gray-500">Automatically upload finished projects to this channel</div>
                        </div>
                        <div className="w-11 h-6 bg-red-600 rounded-full relative cursor-pointer flex-shrink-0">
                            <div className="w-4 h-4 bg-white rounded-full absolute top-1 right-1 shadow-sm" />
                        </div>
                    </div>
                    <div className="flex items-center justify-between py-2.5 border-b border-gray-800/60">
                        <div>
                            <div className="text-sm text-gray-300 font-medium">Default visibility</div>
                            <div className="text-xs text-gray-500">Set how new uploads appear on your channel</div>
                        </div>
                        <select className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-red-500">
                            <option>Public</option>
                            <option>Unlisted</option>
                            <option>Private</option>
                        </select>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                        <div>
                            <div className="text-sm text-gray-300 font-medium">Notify subscribers</div>
                            <div className="text-xs text-gray-500">Send notification bell alert on each upload</div>
                        </div>
                        <div className="w-11 h-6 bg-gray-700 rounded-full relative cursor-pointer flex-shrink-0">
                            <div className="w-4 h-4 bg-white rounded-full absolute top-1 left-1 shadow-sm" />
                        </div>
                    </div>
                </div>
                <p className="text-[10px] text-gray-600 mt-3 italic">These settings apply when the YouTube Channel Maker publishes episodic series to this channel.</p>
            </div>
        </div>
    );
};

// --- Main Component ---
export const Integrations: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [isConnecting, setIsConnecting] = useState(false);
    const [accounts, setAccounts] = useState<YouTubeAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

    useEffect(() => {
        let unsubscribe: (() => void) | null = null;

        const init = async () => {
            const user = await getCurrentUser();
            if (!user) {
                setIsLoading(false);
                return;
            }

            const q = query(
                collection(db, 'youtube_accounts'),
                where('user_id', '==', user.id),
                orderBy('connectedAt', 'desc')
            );

            unsubscribe = onSnapshot(q,
                (snapshot) => {
                    const loadedAccounts: YouTubeAccount[] = snapshot.docs.map(d => ({
                        id: d.id,
                        ...d.data()
                    } as YouTubeAccount));
                    setAccounts(loadedAccounts);
                    if (loadedAccounts.length > 0 && !selectedAccountId) {
                        setSelectedAccountId(loadedAccounts[0].id);
                    }
                    setIsLoading(false);
                },
                (error) => {
                    console.warn('[Integrations] Firestore error, falling back:', error);
                    // Fallback without orderBy
                    getDocs(query(collection(db, 'youtube_accounts'), where('user_id', '==', user.id)))
                        .then(snap => {
                            const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as YouTubeAccount));
                            setAccounts(items);
                            if (items.length > 0 && !selectedAccountId) setSelectedAccountId(items[0].id);
                        })
                        .finally(() => setIsLoading(false));
                }
            );
        };

        init();
        return () => { if (unsubscribe) unsubscribe(); };
    }, []);

    const handleConnectYouTube = async () => {
        setIsConnecting(true);
        try {
            const user = await getCurrentUser();
            if (!user) {
                alert('Please log in to connect a YouTube account.');
                setIsConnecting(false);
                return;
            }

            // In production, this would redirect to Google OAuth for YouTube scope.
            // For now, we simulate the connection with a mock channel.
            const mockChannels = [
                { channelId: 'UCmock1', channelName: 'My Creative Channel', channelHandle: '@mycreativechannel', subscriberCount: '12400', videoCount: '87', viewCount: '450200' },
                { channelId: 'UCmock2', channelName: 'Tech Shorts Daily', channelHandle: '@techshortsdaily', subscriberCount: '3100', videoCount: '234', viewCount: '89000' },
                { channelId: 'UCmock3', channelName: 'Story Time Hub', channelHandle: '@storytimehub', subscriberCount: '890', videoCount: '45', viewCount: '21000' },
            ];

            // Pick one not already connected
            const existingHandles = accounts.map(a => a.channelHandle);
            const next = mockChannels.find(c => !existingHandles.includes(c.channelHandle));

            if (!next) {
                alert('All demo channels are connected. In production, you can connect unlimited real YouTube channels via Google OAuth.');
                setIsConnecting(false);
                return;
            }

            const docId = `${user.id}_${next.channelId}`;
            await setDoc(doc(db, 'youtube_accounts', docId), {
                user_id: user.id,
                channelId: next.channelId,
                channelName: next.channelName,
                channelHandle: next.channelHandle,
                channelAvatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(next.channelName)}&background=cc0000&color=fff&bold=true&size=200`,
                subscriberCount: next.subscriberCount,
                videoCount: next.videoCount,
                viewCount: next.viewCount,
                connected: true,
                connectedAt: serverTimestamp(),
            });
        } catch (e: any) {
            console.error('Connect failed:', e);
            alert('Failed to connect: ' + e.message);
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDisconnect = async (accountId: string) => {
        const account = accounts.find(a => a.id === accountId);
        if (!account) return;
        if (!confirm(`Disconnect "${account.channelName}"? This will stop auto-publishing to this channel.`)) return;

        try {
            await deleteDoc(doc(db, 'youtube_accounts', accountId));
            if (selectedAccountId === accountId) {
                const remaining = accounts.filter(a => a.id !== accountId);
                setSelectedAccountId(remaining.length > 0 ? remaining[0].id : null);
            }
        } catch (e: any) {
            console.error('Disconnect failed:', e);
            alert('Failed to disconnect: ' + e.message);
        }
    };

    const selectedAccount = accounts.find(a => a.id === selectedAccountId);

    return (
        <div className="h-full overflow-y-auto p-4 md:p-8 bg-black text-gray-100 font-sans">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-8 flex items-end justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-950/50">
                                <Youtube size={22} className="text-white" />
                            </div>
                            <h2 className="text-3xl font-bold text-white">YouTube Channels</h2>
                        </div>
                        <p className="text-gray-400 text-sm ml-13">
                            Connect and manage your YouTube channels. Auto-publish completed videos directly from LoopGenie.
                        </p>
                    </div>
                    <button
                        onClick={handleConnectYouTube}
                        disabled={isConnecting}
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-red-950/40 active:scale-95 disabled:opacity-60 flex-shrink-0"
                    >
                        {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        Add Channel
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-gray-600">
                        <Loader2 size={40} className="animate-spin text-red-600 mb-4" />
                        <p className="text-sm">Loading your channels...</p>
                    </div>
                ) : accounts.length === 0 ? (
                    /* --- Empty State --- */
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-24 h-24 bg-red-950/30 border border-red-900/30 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-red-950/20">
                            <Youtube size={48} className="text-red-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-3">No YouTube Channels Connected</h3>
                        <p className="text-gray-400 max-w-sm mb-8 leading-relaxed">
                            Connect your YouTube channels to automatically publish AI-generated videos, manage uploads, and track performance — all from one place.
                        </p>

                        <button
                            onClick={handleConnectYouTube}
                            disabled={isConnecting}
                            className="flex items-center gap-3 px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold text-base rounded-2xl transition-all shadow-xl shadow-red-950/40 active:scale-95 disabled:opacity-60"
                        >
                            {isConnecting ? <Loader2 size={20} className="animate-spin" /> : <Youtube size={20} />}
                            Connect YouTube Channel
                        </button>

                        <div className="flex items-center gap-6 mt-10 text-sm text-gray-600">
                            <div className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500" /> Multiple channels</div>
                            <div className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500" /> Auto-publish</div>
                            <div className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500" /> Channel analytics</div>
                        </div>
                    </div>
                ) : (
                    /* --- Connected Accounts View --- */
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Left: Account List */}
                        <div className="lg:col-span-4 space-y-4">
                            <div className="flex items-center justify-between mb-1 px-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-5 bg-red-500 rounded-full" />
                                    <span className="font-bold text-white text-sm">Connected Channels</span>
                                    <span className="text-xs bg-red-900/40 text-red-400 border border-red-900/50 px-2 py-0.5 rounded-full font-bold">{accounts.length}</span>
                                </div>
                            </div>

                            {accounts.map(account => (
                                <ChannelCard
                                    key={account.id}
                                    account={account}
                                    isSelected={selectedAccountId === account.id}
                                    onSelect={() => setSelectedAccountId(account.id)}
                                    onDisconnect={() => handleDisconnect(account.id)}
                                />
                            ))}

                            {/* Add Another */}
                            <button
                                onClick={handleConnectYouTube}
                                disabled={isConnecting}
                                className="w-full py-3.5 border border-dashed border-gray-700 rounded-2xl text-sm text-gray-500 hover:text-white hover:border-red-600/50 hover:bg-red-950/10 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
                            >
                                {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} className="group-hover:text-red-400 transition-colors" />}
                                Add Another Channel
                            </button>
                        </div>

                        {/* Right: Channel Detail */}
                        <div className="lg:col-span-8">
                            {selectedAccount ? (
                                <ChannelDetailPanel account={selectedAccount} />
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-600 py-20">
                                    <Youtube size={40} className="mb-3 opacity-30" />
                                    <p className="text-sm">Select a channel to manage it</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
