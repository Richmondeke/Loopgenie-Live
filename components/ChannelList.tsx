
import React from 'react';
import { YouTubeChannel } from '../types';
import { Youtube, Plus, Play, Clock, ChevronRight, Settings, ExternalLink, Trash2 } from 'lucide-react';

interface ChannelListProps {
    channels: YouTubeChannel[];
    onEditChannel: (channel: YouTubeChannel) => void;
    onCreateChannel: () => void;
}

export const ChannelList: React.FC<ChannelListProps> = ({ channels, onEditChannel, onCreateChannel }) => {
    return (
        <div className="h-full flex flex-col p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">My Series</h2>
                    <p className="text-gray-500 font-medium">Manage your automated YouTube channels and content pipelines.</p>
                </div>
                <button
                    onClick={onCreateChannel}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-500/20 hover:scale-105 transition-all active:scale-95"
                >
                    <Plus size={18} />
                    New Series
                </button>
            </div>

            {channels.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border-4 border-dashed border-gray-100 dark:border-gray-800 rounded-[3rem] bg-gray-50/50 dark:bg-gray-900/30">
                    <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <Youtube size={40} className="text-gray-300 dark:text-gray-600" />
                    </div>
                    <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">No active series yet</h3>
                    <p className="text-gray-500 font-medium max-w-sm mb-8">
                        Launch your first automated YouTube channel to start generating consistent episodic content.
                    </p>
                    <button
                        onClick={onCreateChannel}
                        className="px-8 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-black transition-all hover:scale-105 active:scale-95"
                    >
                        Start Creating
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {channels.map(channel => (
                        <div
                            key={channel.id}
                            onClick={() => onEditChannel(channel)}
                            className="group bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-[2.5rem] p-6 hover:shadow-2xl transition-all duration-500 cursor-pointer relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-indigo-500/10 transition-colors"></div>

                            <div className="flex items-start gap-5 mb-6 relative z-10">
                                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-900 rounded-2xl overflow-hidden shadow-inner flex-shrink-0 flex items-center justify-center border border-gray-100 dark:border-gray-700">
                                    {channel.logoUrl ? (
                                        <img src={channel.logoUrl} className="w-full h-full object-cover" />
                                    ) : (
                                        <Youtube className="text-gray-300 dark:text-gray-600" size={24} />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-xl font-black text-gray-900 dark:text-white truncate mb-1 tracking-tight">{channel.name}</h4>
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${channel.connected ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{channel.connected ? 'Connected' : 'Draft'}</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium line-clamp-2 mb-6 h-10 leading-relaxed">
                                {channel.bio || channel.description}
                            </p>

                            <div className="flex items-center justify-between pt-6 border-t border-gray-50 dark:border-gray-700/50 relative z-10">
                                <div className="flex -space-x-2">
                                    {channel.episodes.slice(0, 3).map((ep, i) => (
                                        <div key={ep.id} className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 bg-gray-100 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
                                            {ep.thumbnailUrl ? <img src={ep.thumbnailUrl} className="w-full h-full object-cover" /> : <Play size={12} className="text-indigo-600" />}
                                        </div>
                                    ))}
                                    {channel.episodes.length > 3 && (
                                        <div className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 bg-gray-100 dark:bg-gray-900 flex items-center justify-center text-[10px] font-black text-gray-400">
                                            +{channel.episodes.length - 3}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-black text-xs uppercase tracking-widest group-hover:gap-3 transition-all">
                                    Manage
                                    <ChevronRight size={16} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
