
import React, { useEffect, useState } from 'react';
import { getAllProfiles } from '../services/authService';
import { fetchAllProjectsAdmin } from '../services/projectService';
import { UserProfile, Project, ProjectStatus } from '../types';
import { Users, Activity, DollarSign, ShieldCheck, Search, ChevronLeft, ChevronRight, User, Mail, CreditCard, Calendar } from 'lucide-react';

interface AdminDashboardProps {
    initialTab?: 'OVERVIEW' | 'USERS' | 'ACTIVITY';
}

const ITEMS_PER_PAGE = 10;

// Reusable Pagination Component
const PaginationControls = ({ 
    totalItems, 
    currentPage, 
    onPageChange 
}: { 
    totalItems: number; 
    currentPage: number; 
    onPageChange: (page: number) => void 
}) => {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    if (totalPages <= 1) return null;

    return (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <div className="text-xs text-gray-500">
                Page {currentPage} of {totalPages}
            </div>
            <div className="flex gap-2">
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronLeft size={16} />
                </button>
                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronRight size={16} />
                </button>
            </div>
        </div>
    );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ initialTab = 'OVERVIEW' }) => {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'USERS' | 'ACTIVITY'>(initialTab);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Pagination States
    const [usersPage, setUsersPage] = useState(1);
    const [activityPage, setActivityPage] = useState(1);

    // Drill-down State
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

    useEffect(() => {
        if (!selectedUser) {
            setActiveTab(initialTab);
        }
    }, [initialTab, selectedUser]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // Fetch data (services handle caching now)
                const [usersData, projectsData] = await Promise.all([
                    getAllProfiles(),
                    fetchAllProjectsAdmin()
                ]);
                setUsers(usersData);
                setProjects(projectsData);
            } catch (e) {
                console.error("Failed to load admin data", e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    // Filter Logic
    const filteredUsers = users.filter(u => 
        (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
        (u.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    const filteredProjects = projects.filter(p => 
        (p.templateName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (p.user_email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
        (p.id?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    // Stats Calculation
    const totalCreditsUsed = projects.reduce((acc, p) => acc + (p.cost || 0), 0);
    const totalFailed = projects.filter(p => p.status === ProjectStatus.FAILED).length;
    const totalUsers = users.length;
    const activeUsers = new Set(projects.map(p => p.user_email)).size;

    // View Switching Logic
    const handleUserClick = (user: UserProfile) => {
        setSelectedUser(user);
        setActivityPage(1); // Reset activity page for user view
        window.scrollTo(0, 0);
    };

    const handleBackToUsers = () => {
        setSelectedUser(null);
        setActiveTab('USERS');
    };

    if (loading) {
        return <div className="p-10 text-center text-gray-500 animate-pulse">Loading Admin Data...</div>;
    }

    // --- USER DETAIL VIEW ---
    if (selectedUser) {
        const userProjects = projects.filter(p => 
            p.user_email === selectedUser.email || 
            (selectedUser.email && p.user_email?.toLowerCase() === selectedUser.email.toLowerCase())
        );
        
        const userCreditsUsed = userProjects.reduce((acc, p) => acc + (p.cost || 0), 0);
        
        const paginatedUserProjects = userProjects.slice(
            (activityPage - 1) * ITEMS_PER_PAGE,
            activityPage * ITEMS_PER_PAGE
        );

        return (
            <div className="max-w-7xl mx-auto pb-10">
                <button 
                    onClick={handleBackToUsers}
                    className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6 font-medium transition-colors"
                >
                    <ChevronLeft size={20} /> Back to Users
                </button>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* User Profile Card */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm md:col-span-1">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-4">
                                <User size={40} />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">{selectedUser.full_name || 'Anonymous User'}</h2>
                            <p className="text-sm text-gray-500 mb-4">{selectedUser.email}</p>
                            
                            <div className="w-full space-y-3 mt-2">
                                <div className="flex justify-between items-center text-sm p-3 bg-gray-50 rounded-lg">
                                    <span className="flex items-center gap-2 text-gray-600"><CreditCard size={14}/> Balance</span>
                                    <span className="font-bold text-indigo-600">{selectedUser.credits_balance} Credits</span>
                                </div>
                                <div className="flex justify-between items-center text-sm p-3 bg-gray-50 rounded-lg">
                                    <span className="flex items-center gap-2 text-gray-600"><Activity size={14}/> Total Spent</span>
                                    <span className="font-bold text-gray-900">{userCreditsUsed} Credits</span>
                                </div>
                                <div className="flex justify-between items-center text-sm p-3 bg-gray-50 rounded-lg">
                                    <span className="flex items-center gap-2 text-gray-600"><Calendar size={14}/> Joined</span>
                                    <span className="font-medium text-gray-900">Unknown</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* User Activity Table */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm md:col-span-2 flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-gray-50 font-bold text-gray-700 flex justify-between items-center">
                            <span>User Activity History</span>
                            <span className="text-xs font-normal text-gray-500">{userProjects.length} Projects</span>
                        </div>
                        <div className="overflow-x-auto flex-1">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-3">Project</th>
                                        <th className="px-6 py-3">Type</th>
                                        <th className="px-6 py-3">Status</th>
                                        <th className="px-6 py-3 text-right">Cost</th>
                                        <th className="px-6 py-3 text-right">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedUserProjects.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                                                No activity recorded for this user.
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedUserProjects.map(p => (
                                            <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                <td className="px-6 py-3 font-medium text-gray-900 truncate max-w-[150px]">{p.templateName}</td>
                                                <td className="px-6 py-3 text-xs text-gray-500">{p.type}</td>
                                                <td className="px-6 py-3">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                        p.status === 'completed' ? 'bg-green-100 text-green-700' : 
                                                        p.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                        {p.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 text-right font-mono">{p.cost}</td>
                                                <td className="px-6 py-3 text-right text-gray-500 text-xs">
                                                    {new Date(p.createdAt).toLocaleDateString()}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <PaginationControls 
                            totalItems={userProjects.length} 
                            currentPage={activityPage} 
                            onPageChange={setActivityPage} 
                        />
                    </div>
                </div>
            </div>
        );
    }

    // --- MAIN DASHBOARD TABS ---
    
    // Paginate Data
    const paginatedUsers = filteredUsers.slice((usersPage - 1) * ITEMS_PER_PAGE, usersPage * ITEMS_PER_PAGE);
    const paginatedProjects = filteredProjects.slice((activityPage - 1) * ITEMS_PER_PAGE, activityPage * ITEMS_PER_PAGE);

    return (
        <div className="max-w-7xl mx-auto pb-10">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <ShieldCheck className="text-indigo-600" /> Admin Dashboard
                    </h1>
                    <p className="text-gray-500">System Overview & User Management</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    {['OVERVIEW', 'USERS', 'ACTIVITY'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${
                                activeTab === tab ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab.charAt(0) + tab.slice(1).toLowerCase()}
                        </button>
                    ))}
                </div>
            </div>

            {activeTab === 'OVERVIEW' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-4 mb-2">
                                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                                    <Users size={24} />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-gray-400 uppercase">Total Users</div>
                                    <div className="text-2xl font-black text-gray-900">{totalUsers}</div>
                                </div>
                            </div>
                            <div className="text-xs text-green-600 font-bold bg-green-50 inline-block px-2 py-1 rounded">
                                +{activeUsers} Active recently
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-4 mb-2">
                                <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                                    <Activity size={24} />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-gray-400 uppercase">Total Projects</div>
                                    <div className="text-2xl font-black text-gray-900">{projects.length}</div>
                                </div>
                            </div>
                            <div className="text-xs text-gray-500 font-medium">
                                Across all tools
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-4 mb-2">
                                <div className="p-3 bg-orange-50 text-orange-600 rounded-xl">
                                    <DollarSign size={24} />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-gray-400 uppercase">Credits Consumed</div>
                                    <div className="text-2xl font-black text-gray-900">{totalCreditsUsed}</div>
                                </div>
                            </div>
                            <div className="text-xs text-gray-500 font-medium">
                                Estimated Value: ${totalCreditsUsed * 0.25}
                            </div>
                        </div>

                         <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-4 mb-2">
                                <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                                    <Activity size={24} />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-gray-400 uppercase">Failed Jobs</div>
                                    <div className="text-2xl font-black text-gray-900">{totalFailed}</div>
                                </div>
                            </div>
                             <div className="text-xs text-red-500 font-medium">
                                Rate: {((totalFailed / projects.length) * 100 || 0).toFixed(1)}%
                            </div>
                        </div>
                    </div>

                    {/* Recent Users Preview */}
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                         <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-gray-900">Recent Users</h3>
                            <button onClick={() => setActiveTab('USERS')} className="text-indigo-600 text-sm font-bold hover:underline">View All</button>
                         </div>
                         <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3">Email</th>
                                        <th className="px-6 py-3">Name</th>
                                        <th className="px-6 py-3">Credits Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.slice(0, 5).map(user => (
                                        <tr 
                                            key={user.id} 
                                            onClick={() => handleUserClick(user)}
                                            className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                                        >
                                            <td className="px-6 py-4 font-medium text-gray-900">{user.email || 'N/A'}</td>
                                            <td className="px-6 py-4 text-gray-600">{user.full_name || 'Anonymous'}</td>
                                            <td className="px-6 py-4">
                                                <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-bold text-xs">{user.credits_balance}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                         </div>
                    </div>
                </div>
            )}

            {activeTab === 'USERS' && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm animate-in fade-in duration-300">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                         <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                            <input 
                                type="text" 
                                placeholder="Search users..." 
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setUsersPage(1); }}
                                className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                            />
                         </div>
                         <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                            {filteredUsers.length} Users
                         </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3">User ID</th>
                                    <th className="px-6 py-3">Full Name</th>
                                    <th className="px-6 py-3">Email</th>
                                    <th className="px-6 py-3">Role</th>
                                    <th className="px-6 py-3 text-right">Credits</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedUsers.map(user => (
                                    <tr 
                                        key={user.id} 
                                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors group cursor-pointer"
                                        onClick={() => handleUserClick(user)}
                                    >
                                        <td className="px-6 py-4 text-gray-500 font-mono text-xs">{user.id.substring(0, 8)}...</td>
                                        <td className="px-6 py-4 font-bold text-gray-900">{user.full_name || 'Anonymous'}</td>
                                        <td className="px-6 py-4 text-gray-600">{user.email || 'No Email'}</td>
                                        <td className="px-6 py-4">
                                            {user.isAdmin ? (
                                                <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-bold border border-purple-200">Admin</span>
                                            ) : (
                                                <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs font-bold border border-gray-200">User</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${user.credits_balance > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {user.credits_balance}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-indigo-600 font-bold text-xs opacity-0 group-hover:opacity-100 transition-opacity">View &rarr;</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <PaginationControls 
                        totalItems={filteredUsers.length} 
                        currentPage={usersPage} 
                        onPageChange={setUsersPage} 
                    />
                </div>
            )}

            {activeTab === 'ACTIVITY' && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm animate-in fade-in duration-300">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                         <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                            <input 
                                type="text" 
                                placeholder="Search projects or emails..." 
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setActivityPage(1); }}
                                className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                            />
                         </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3">Project</th>
                                    <th className="px-6 py-3">User Email</th>
                                    <th className="px-6 py-3">Type</th>
                                    <th className="px-6 py-3">Cost</th>
                                    <th className="px-6 py-3">Status</th>
                                    <th className="px-6 py-3 text-right">Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedProjects.map(project => (
                                    <tr key={project.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {project.thumbnailUrl && (
                                                    <img src={project.thumbnailUrl} className="w-8 h-8 rounded object-cover bg-gray-200" alt="" />
                                                )}
                                                <div className="font-medium text-gray-900 truncate max-w-[150px]">{project.templateName}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">{project.user_email || 'Unknown'}</td>
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">{project.type}</span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-gray-700">{project.cost || 1}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                project.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                project.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {project.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right text-gray-500 text-xs">
                                            {new Date(project.createdAt).toLocaleDateString()} <br/>
                                            {new Date(project.createdAt).toLocaleTimeString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <PaginationControls 
                        totalItems={filteredProjects.length} 
                        currentPage={activityPage} 
                        onPageChange={setActivityPage} 
                    />
                </div>
            )}
        </div>
    );
};
