
import React, { useState } from 'react';
import { Calendar, Clock, Youtube, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { scheduleVideoUpload } from '../services/youtubeService';

interface ScheduleModalProps {
    project: any;
    channels: any[];
    onClose: () => void;
    userId: string;
}

export const ScheduleModal: React.FC<ScheduleModalProps> = ({ project, channels, onClose, userId }) => {
    const [selectedChannelId, setSelectedChannelId] = useState(channels[0]?.channelId || '');
    const [scheduledDate, setScheduledDate] = useState('');
    const [scheduledTime, setScheduledTime] = useState('');
    const [privacyStatus, setPrivacyStatus] = useState<'public' | 'private' | 'unlisted'>('public');
    const [title, setTitle] = useState(project.templateName || '');
    const [description, setDescription] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!scheduledDate || !scheduledTime) {
            setError("Please pick a date and time.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
            if (scheduledAt < new Date()) {
                throw new Error("Schedule time must be in the future.");
            }

            await scheduleVideoUpload({
                userId,
                channelId: selectedChannelId,
                projectId: project.id,
                videoUrl: project.videoUrl,
                title,
                description,
                scheduledAt,
                privacyStatus
            });

            setSuccess(true);
            setTimeout(onClose, 2000);
        } catch (e: any) {
            setError(e.message || "Failed to schedule upload.");
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="bg-gray-900 border border-green-500/30 rounded-3xl p-10 max-w-sm w-full text-center shadow-2xl">
                    <CheckCircle2 size={64} className="text-green-500 mx-auto mb-6 animate-bounce" />
                    <h3 className="text-2xl font-bold text-white mb-2">Scheduled!</h3>
                    <p className="text-gray-400">Your video will be uploaded automatically at the set time.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-950/50">
                            <Youtube size={20} className="text-white" />
                        </div>
                        <h2 className="text-xl font-bold text-white">Schedule YouTube Upload</h2>
                    </div>
                </div>

                <form onSubmit={handleSchedule} className="p-6 space-y-5">
                    {/* Project Preview */}
                    <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-2xl border border-gray-800/80">
                        <img src={project.thumbnailUrl} className="w-24 h-14 rounded-lg object-cover" alt="Preview" />
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-white truncate">{project.templateName}</div>
                            <div className="text-xs text-gray-500 uppercase tracking-wide">Ready to schedule</div>
                        </div>
                    </div>

                    {/* Channel Selector */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">YouTube Channel</label>
                        <select
                            value={selectedChannelId}
                            onChange={(e) => setSelectedChannelId(e.target.value)}
                            className="w-full bg-gray-850 border border-gray-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-red-600/50 transition-all font-medium"
                        >
                            {channels.map(c => (
                                <option key={c.channelId} value={c.channelId}>{c.channelName}</option>
                            ))}
                        </select>
                    </div>

                    {/* Title & Description */}
                    <div className="space-y-3">
                        <input
                            type="text"
                            placeholder="Video Title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-gray-850 border border-gray-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-red-600/50 transition-all"
                        />
                        <textarea
                            placeholder="Video Description"
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-gray-850 border border-gray-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-red-600/50 transition-all resize-none"
                        />
                    </div>

                    {/* Date/Time Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Date</label>
                            <div className="relative">
                                <Calendar size={16} className="absolute left-4 top-3.5 text-gray-500" />
                                <input
                                    type="date"
                                    value={scheduledDate}
                                    onChange={(e) => setScheduledDate(e.target.value)}
                                    className="w-full bg-gray-850 border border-gray-800 rounded-xl pl-11 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-red-600/50 transition-all"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Time</label>
                            <div className="relative">
                                <Clock size={16} className="absolute left-4 top-3.5 text-gray-500" />
                                <input
                                    type="time"
                                    value={scheduledTime}
                                    onChange={(e) => setScheduledTime(e.target.value)}
                                    className="w-full bg-gray-850 border border-gray-800 rounded-xl pl-11 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-red-600/50 transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Visibility */}
                    <div className="flex gap-3">
                        {(['public', 'private', 'unlisted'] as const).map((status) => (
                            <button
                                key={status}
                                type="button"
                                onClick={() => setPrivacyStatus(status)}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all capitalize ${privacyStatus === status
                                    ? 'bg-red-600/10 border-red-500/50 text-red-500'
                                    : 'bg-gray-850 border-gray-800 text-gray-500 hover:border-gray-700'}`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>

                    {error && (
                        <div className="bg-red-950/30 border border-red-500/30 p-3 rounded-xl flex items-center gap-2 text-red-400 text-xs font-medium">
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-2xl transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-[2] py-3.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shadow-lg shadow-red-950/50 flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Calendar size={18} />}
                            Schedule Publication
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
