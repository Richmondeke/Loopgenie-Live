
import React, { useEffect, useState } from 'react';
import { getAllProfiles } from '../services/authService';
import { fetchAllProjectsAdmin, fetchProjectStatsAdmin } from '../services/projectService';
import { UserProfile, Project, ProjectStatus } from '../types';
import { Users, Activity, DollarSign, ShieldCheck, Search, ChevronLeft, ChevronRight, User, CreditCard, Calendar, X, Play, Image as ImageIcon, FileAudio, RefreshCw } from 'lucide-react';

interface AdminDashboardProps {
    initialTab?: 'OVERVIEW' | 'USERS' | 'ACTIVITY';
}

const ITEMS_PER_PAGE = 10;

// ESTIMATION HELPER 
const getEstProviderCost = (project: Project): number => {
    switch (project.type) {
        case 'AVATAR': return 2.00;
        case 'UGC_PRODUCT': return project.cost && project.cost > 10 ? 1.60 : 0.50; 
        case 'TEXT_TO_VIDEO': return project.cost && project.cost > 20 ? 1.50 : 0.50; 
        case 'IMAGE_TO_VIDEO': return 0.50;
        case 'FASHION_SHOOT': return 0.10;
        case 'AUDIOBOOK': return 0.30;
        case 'SHORTS': 
        case 'STORYBOOK':
            if (project.cost === 5) return 0.32; 
            if (project.cost === 9) return 0.54; 
            if (project.cost === 16) return 1.03; 
            return 0.50;
        default: return 0.10;
    }
};

const PaginationControls = ({ totalItems, currentPage, onPageChange }: any) => {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    if (totalPages <= 1) return null;
    return (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 dark:bg-gray-700/50">
            <div className="text-xs text-gray-500 dark:text-gray-400">Page {currentPage} of {totalPages}</div>
            <div className="flex gap-2">
                <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-600 dark:text-gray-300"><ChevronLeft size={16} /></button>
                <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-600 dark:text-gray-300"><ChevronRight size={16} /></button>
            </div>
        </div>
    );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ initialTab = 'OVERVIEW' }) => {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [stats, setStats] = useState({ totalCost: 0, totalFailed: 0, totalCount: 0, activeUsers: 0 });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'USERS' | 'ACTIVITY'>(initialTab);
    const [searchTerm, setSearchTerm] = useState('');
    const [usersPage, setUsersPage] = useState(1);
    const [activityPage, setActivityPage] = useState(1);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [selectedMedia, setSelectedMedia] = useState<{ url: string; name: string; type: string } | null>(null);

    useEffect(() => { if (!selectedUser) setActiveTab(initialTab); }, [initialTab, selectedUser]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // Parallel fetching with stats separated for speed
                const [usersData, statsData, projectsData] = await Promise.all([
                    getAllProfiles(),
                    fetchProjectStatsAdmin(),
                    fetchAllProjectsAdmin()
                ]);
                setUsers(usersData);
                setStats(statsData);
                setProjects(projectsData);
            } catch (e) { 
                console.error("Failed to load admin data", e); 
            } finally { 
                setLoading(false); 
            }
        };
        loadData();
    }, []);

    const filteredUsers = users.filter(u => (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (u.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()));
    const filteredProjects = projects.filter(p => (p.templateName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (p.user_email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (p.id?.toLowerCase() || '').includes(searchTerm.toLowerCase()));

    // Use lightweight stats for top cards instead of recalculating from heavy array
    const estimatedRevenue = stats.totalCost * 0.10; 
    // We roughly estimate provider cost from the limited project list we have, or scale it
    // For accuracy we'd need full data, but for speed we use the stats + heuristic on loaded projects
    const estimatedProviderCost = projects.reduce((acc, p) => acc + getEstProviderCost(p), 0);
    const estimatedProfit = estimatedRevenue - estimatedProviderCost;
    
    const handleUserClick = (user: UserProfile) => { setSelectedUser(user); setActivityPage(1); window.scrollTo(0, 0); };
    const handleBackToUsers = () => { setSelectedUser(null); setActiveTab('USERS'); };
    const handleOpenMedia = (project: Project) => {
        const url = project.videoUrl || project.thumbnailUrl;
        if (url && project.status === ProjectStatus.COMPLETED) {
            setSelectedMedia({ url: url, name: project.templateName, type: project.type || 'VIDEO' });
        }
    };

    if (loading) return (
        <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-500 animate-pulse flex flex-col items-center gap-2">
                <RefreshCw className="animate-spin" />
                <span>Loading Dashboard...</span>
            </div>
        </div>
    );

    if (selectedUser) {
        const userProjects = projects.filter(p => p.user_email === selectedUser.email || (selectedUser.email && (p.user_email || '').toLowerCase() === (selectedUser.email || '').toLowerCase()));
        const userCreditsUsed = userProjects.reduce((acc, p) => acc + (p.cost || 0), 0);
        const paginatedUserProjects = userProjects.slice((activityPage - 1) * ITEMS_PER_PAGE, activityPage * ITEMS_PER_PAGE);

        return (
            <div className="h-full overflow-y-auto p-4 md:p-8">
                <div className="max-w-7xl mx-auto pb-10">
                    <button onClick={handleBackToUsers} className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 font-medium transition-colors"><ChevronLeft size={20} /> Back to Users</button>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm md:col-span-1">
                            <div className="flex flex-col items-center text-center">
                                <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4"><User size={40} /></div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedUser.full_name || 'Anonymous User'}</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{selectedUser.email}</p>
                                <div className="w-full space-y-3 mt-2">
                                    <div className="flex justify-between items-center text-sm p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"><span className="flex items-center gap-2 text-gray-600 dark:text-gray-300"><CreditCard size={14}/> Balance</span><span className="font-bold text-indigo-600 dark:text-indigo-400">{selectedUser.credits_balance} Credits</span></div>
                                    <div className="flex justify-between items-center text-sm p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"><span className="flex items-center gap-2 text-gray-600 dark:text-gray-300"><Activity size={14}/> Total Spent</span><span className="font-bold text-gray-900 dark:text-white">{userCreditsUsed} Credits</span></div>
                                    <div className="flex justify-between items-center text-sm p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"><span className="flex items-center gap-2 text-gray-600 dark:text-gray-300"><Calendar size={14}/> Joined</span><span className="font-medium text-gray-900 dark:text-white">Unknown</span></div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm md:col-span-2 flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 font-bold text-gray-700 dark:text-gray-300 flex justify-between items-center"><span>User Activity History</span><span className="text-xs font-normal text-gray-500">{userProjects.length} Projects</span></div>
                            <div className="overflow-x-auto flex-1">
                                <table className="w-full text-sm text-left text-gray-600 dark:text-gray-300">
                                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600">
                                        <tr>
                                            <th className="px-6 py-3">Project</th>
                                            <th className="px-6 py-3">Type</th>
                                            <th className="px-6 py-3">Status</th>
                                            <th className="px-6 py-3 text-right">Cost (Creds)</th>
                                            <th className="px-6 py-3 text-right">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedUserProjects.length === 0 ? (<tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No activity recorded for this user.</td></tr>) : (
                                            paginatedUserProjects.map(p => (
                                                <tr key={p.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                    <td className="px-6 py-3">
                                                        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => handleOpenMedia(p)}>
                                                            {p.thumbnailUrl ? (
                                                                <div className="relative w-10 h-10 rounded overflow-hidden bg-gray-200 flex-shrink-0 border border-gray-200 group-hover:border-indigo-300 transition-colors">
                                                                    <img src={p.thumbnailUrl} className="w-full h-full object-cover" alt="" />
                                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                                                        <Play size={14} className="text-white opacity-0 group-hover:opacity-100 fill-current" />
                                                                    </div>
                                                                </div>
                                                            ) : <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0"><Activity size={16} /></div>}
                                                            <div className="font-medium text-gray-900 dark:text-white truncate max-w-[150px] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{p.templateName}</div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 text-xs text-gray-500">{p.type}</td>
                                                    <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${p.status === 'completed' ? 'bg-green-100 text-green-700' : p.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{p.status}</span></td>
                                                    <td className="px-6 py-3 text-right font-mono">{p.cost}</td>
                                                    <td className="px-6 py-3 text-right text-gray-500 text-xs">{new Date(p.createdAt).toLocaleDateString()}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <PaginationControls totalItems={userProjects.length} currentPage={activityPage} onPageChange={setActivityPage} />
                        </div>
                    </div>
                    {selectedMedia && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-4 animate-in fade-in duration-200">
                            <div className="relative w-full max-w-5xl bg-black rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                                <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent"><h3 className="text-white font-bold text-lg drop-shadow-md">{selectedMedia.name}</h3><button onClick={() => setSelectedMedia(null)} className="bg-black/50 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-sm transition-colors"><X size={24} /></button></div>
                                <div className="flex-1 bg-black flex items-center justify-center relative">
                                    {selectedMedia.type === 'FASHION_SHOOT' ? <img src={selectedMedia.url} alt={selectedMedia.name} className="max-w-full max-h-[80vh] w-auto h-auto object-contain" /> : selectedMedia.type === 'AUDIOBOOK' ? <div className="w-full p-20 flex flex-col items-center justify-center"><div className="w-32 h-32 bg-orange-100 rounded-full flex items-center justify-center mb-8 animate-bounce"><FileAudio size={64} className="text-orange-600" /></div><audio controls src={selectedMedia.url} className="w-full max-w-md" /></div> : <video src={selectedMedia.url} controls autoPlay className="max-w-full max-h-[80vh] w-auto h-auto outline-none" />}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const paginatedUsers = filteredUsers.slice((usersPage - 1) * ITEMS_PER_PAGE, usersPage * ITEMS_PER_PAGE);
    const paginatedProjects = filteredProjects.slice((activityPage - 1) * ITEMS_PER_PAGE, activityPage * ITEMS_PER_PAGE);

    return (
        <div className="h-full overflow-y-auto p-4 md:p-8">
            <div className="max-w-7xl mx-auto pb-10">
                <div className="flex items-center justify-between mb-8">
                    <div><h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><ShieldCheck className="text-indigo-600 dark:text-indigo-400" /> Admin Dashboard</h1><p className="text-gray-500 dark:text-gray-400">System Overview & User Management</p></div>
                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                        {['OVERVIEW', 'USERS', 'ACTIVITY'].map((tab) => (
                            <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === tab ? 'bg-white dark:bg-gray-700 shadow text-indigo-700 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>{tab.charAt(0) + tab.slice(1).toLowerCase()}</button>
                        ))}
                    </div>
                </div>

                {activeTab === 'OVERVIEW' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                                <div className="flex items-center gap-4 mb-2"><div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl"><Users size={24} /></div><div><div className="text-xs font-bold text-gray-400 uppercase">Total Users</div><div className="text-2xl font-black text-gray-900 dark:text-white">{users.length}</div></div></div>
                                <div className="text-xs text-green-600 font-bold bg-green-50 dark:bg-green-900/30 inline-block px-2 py-1 rounded">+{stats.activeUsers} Active recently</div>
                            </div>
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                                <div className="flex items-center gap-4 mb-2"><div className="p-3 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl"><DollarSign size={24} /></div><div><div className="text-xs font-bold text-gray-400 uppercase">Est. Revenue</div><div className="text-2xl font-black text-gray-900 dark:text-white">${estimatedRevenue.toFixed(2)}</div></div></div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">From {stats.totalCost} Credits</div>
                            </div>
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                                <div className="flex items-center gap-4 mb-2"><div className="p-3 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl"><Activity size={24} /></div><div><div className="text-xs font-bold text-gray-400 uppercase">Est. Provider Cost</div><div className="text-2xl font-black text-gray-900 dark:text-white">${estimatedProviderCost.toFixed(2)}</div></div></div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Est. Margin: <span className="font-bold text-green-600 dark:text-green-400">${estimatedProfit.toFixed(2)}</span></div>
                            </div>
                             <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                                <div className="flex items-center gap-4 mb-2"><div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl"><Activity size={24} /></div><div><div className="text-xs font-bold text-gray-400 uppercase">Failed Jobs</div><div className="text-2xl font-black text-gray-900 dark:text-white">{stats.totalFailed}</div></div></div>
                                 <div className="text-xs text-red-500 font-medium">Rate: {((stats.totalFailed / stats.totalCount) * 100 || 0).toFixed(1)}%</div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'USERS' && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm animate-in fade-in duration-300">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 flex items-center justify-between">
                             <div className="relative"><Search className="absolute left-3 top-2.5 text-gray-400" size={16} /><input type="text" placeholder="Search users..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setUsersPage(1); }} className="pl-9 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-64 text-gray-900 dark:text-white"/></div>
                             <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">{filteredUsers.length} Users</div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-600 dark:text-gray-300">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                    <tr><th className="px-6 py-3">User ID</th><th className="px-6 py-3">Full Name</th><th className="px-6 py-3">Email</th><th className="px-6 py-3">Role</th><th className="px-6 py-3 text-right">Credits</th><th className="px-6 py-3 text-right">Actions</th></tr>
                                </thead>
                                <tbody>
                                    {paginatedUsers.map(user => (
                                        <tr key={user.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group cursor-pointer" onClick={() => handleUserClick(user)}>
                                            <td className="px-6 py-4 text-gray-500 font-mono text-xs">{user.id.substring(0, 8)}...</td>
                                            <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{user.full_name || 'Anonymous'}</td>
                                            <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{user.email || 'No Email'}</td>
                                            <td className="px-6 py-4">{user.isAdmin ? <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-bold border border-purple-200">Admin</span> : <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs font-bold border border-gray-200">User</span>}</td>
                                            <td className="px-6 py-4 text-right"><span className={`px-3 py-1 rounded-full text-xs font-bold ${user.credits_balance > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{user.credits_balance}</span></td>
                                            <td className="px-6 py-4 text-right"><span className="text-indigo-600 font-bold text-xs opacity-0 group-hover:opacity-100 transition-opacity">View &rarr;</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <PaginationControls totalItems={filteredUsers.length} currentPage={usersPage} onPageChange={setUsersPage} />
                    </div>
                )}

                {activeTab === 'ACTIVITY' && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm animate-in fade-in duration-300">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 flex items-center justify-between">
                             <div className="relative"><Search className="absolute left-3 top-2.5 text-gray-400" size={16} /><input type="text" placeholder="Search projects..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setActivityPage(1); }} className="pl-9 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-64 text-gray-900 dark:text-white"/></div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-600 dark:text-gray-300">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                    <tr>
                                        <th className="px-6 py-3">Project</th>
                                        <th className="px-6 py-3">User Email</th>
                                        <th className="px-6 py-3">Type</th>
                                        <th className="px-6 py-3">User Spent</th>
                                        <th className="px-6 py-3">Est. Prov Cost</th>
                                        <th className="px-6 py-3">Margin</th>
                                        <th className="px-6 py-3 text-right">Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedProjects.map(project => {
                                        const revenue = (project.cost || 0) * 0.10;
                                        const providerCost = getEstProviderCost(project);
                                        const margin = revenue - providerCost;
                                        return (
                                            <tr key={project.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3 cursor-pointer group" onClick={() => handleOpenMedia(project)}>
                                                        {project.thumbnailUrl ? <div className="relative w-8 h-8 rounded overflow-hidden bg-gray-200 border border-gray-200 group-hover:border-indigo-300 transition-colors"><img src={project.thumbnailUrl} className="w-full h-full object-cover" alt="" /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center"><Play size={12} className="text-white opacity-0 group-hover:opacity-100 fill-current" /></div></div> : <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-400"><Activity size={14} /></div>}
                                                        <div className="font-medium text-gray-900 dark:text-white truncate max-w-[150px] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{project.templateName}</div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{project.user_email || 'Unknown'}</td>
                                                <td className="px-6 py-4"><span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">{project.type}</span></td>
                                                <td className="px-6 py-4 font-bold text-gray-700 dark:text-gray-300">{project.cost || 1} Cr (${revenue.toFixed(2)})</td>
                                                <td className="px-6 py-4 text-gray-500 dark:text-gray-400">${providerCost.toFixed(2)}</td>
                                                <td className="px-6 py-4 font-bold text-green-600 dark:text-green-400">+${margin.toFixed(2)}</td>
                                                <td className="px-6 py-4 text-right text-gray-500 dark:text-gray-400 text-xs">{new Date(project.createdAt).toLocaleDateString()}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <PaginationControls totalItems={filteredProjects.length} currentPage={activityPage} onPageChange={setActivityPage} />
                    </div>
                )}
                
                {selectedMedia && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-4 animate-in fade-in duration-200">
                        <div className="relative w-full max-w-5xl bg-black rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent"><h3 className="text-white font-bold text-lg drop-shadow-md">{selectedMedia.name}</h3><button onClick={() => setSelectedMedia(null)} className="bg-black/50 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-sm transition-colors"><X size={24} /></button></div>
                            <div className="flex-1 bg-black flex items-center justify-center relative">
                                {selectedMedia.type === 'FASHION_SHOOT' ? <img src={selectedMedia.url} alt={selectedMedia.name} className="max-w-full max-h-[80vh] w-auto h-auto object-contain" /> : selectedMedia.type === 'AUDIOBOOK' ? <div className="w-full p-20 flex flex-col items-center justify-center"><div className="w-32 h-32 bg-orange-100 rounded-full flex items-center justify-center mb-8 animate-bounce"><FileAudio size={64} className="text-orange-600" /></div><audio controls src={selectedMedia.url} className="w-full max-w-md" /></div> : <video src={selectedMedia.url} controls autoPlay className="max-w-full max-h-[80vh] w-auto h-auto outline-none" />}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
