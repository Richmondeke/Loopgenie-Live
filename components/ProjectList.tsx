
import React, { useState } from 'react';
import { Project, ProjectStatus } from '../types';
import { Clock, CheckCircle, AlertOctagon, Download, Play, RefreshCw, X, ExternalLink, Image as ImageIcon } from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  onPollStatus: () => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({ projects, onPollStatus }) => {
  const [selectedItem, setSelectedItem] = useState<{ url: string; name: string; type: string } | null>(null);
  const [activeCategory, setActiveCategory] = useState<'ALL' | 'STORYBOOK' | 'SHORTS' | 'AVATAR' | 'FASHION'>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter projects based on category
  const filteredProjects = projects.filter(p => {
      if (activeCategory === 'ALL') return true; // Show everything
      if (activeCategory === 'STORYBOOK') return p.type === 'STORYBOOK';
      if (activeCategory === 'SHORTS') return p.type === 'SHORTS' || p.type === 'UGC_PRODUCT' || p.type === 'TEXT_TO_VIDEO' || p.type === 'IMAGE_TO_VIDEO';
      if (activeCategory === 'AVATAR') return p.type === 'AVATAR' || p.type === 'AUDIOBOOK';
      if (activeCategory === 'FASHION') return p.type === 'FASHION_SHOOT';
      return false;
  });

  // Status Badge Component
  const StatusBadge = ({ status }: { status: ProjectStatus }) => {
    switch (status) {
      case ProjectStatus.COMPLETED:
        return <span className="flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded-full text-xs font-bold"><CheckCircle size={12} /> Ready</span>;
      case ProjectStatus.PROCESSING:
        return <span className="flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full text-xs font-bold"><RefreshCw size={12} className="animate-spin" /> Processing</span>;
      case ProjectStatus.FAILED:
        return <span className="flex items-center gap-1 text-red-700 bg-red-50 px-2 py-1 rounded-full text-xs font-bold"><AlertOctagon size={12} /> Failed</span>;
      default:
        return <span className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-1 rounded-full text-xs font-bold"><Clock size={12} /> Queued</span>;
    }
  };

  const handleOpenItem = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    if (project.videoUrl) {
      setSelectedItem({ url: project.videoUrl, name: project.templateName, type: project.type || 'VIDEO' });
    }
  };

  const handleRefresh = async () => {
      setIsRefreshing(true);
      await onPollStatus();
      setTimeout(() => setIsRefreshing(false), 800); // Visual feedback min duration
  };

  const categories = [
      { id: 'ALL', label: 'All Projects' },
      { id: 'AVATAR', label: 'Avatars & Audio' },
      { id: 'SHORTS', label: 'Shorts & Videos' },
      { id: 'STORYBOOK', label: 'Storybooks' },
      { id: 'FASHION', label: 'Photoshoots' },
  ];

  return (
    <>
      <div className="h-full flex flex-col p-4 md:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">My Projects</h2>
              <p className="text-gray-600 dark:text-gray-400 font-medium">History of your generated videos and images.</p>
          </div>
          <button 
              onClick={handleRefresh}
              className={`text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-white p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors self-end sm:self-auto ${isRefreshing ? 'animate-spin text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' : ''}`}
              title="Refresh Projects"
          >
              <RefreshCw size={20} />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="w-full mb-8">
            <div className="flex gap-3 overflow-x-auto pb-4 px-1 no-scrollbar snap-x">
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id as any)}
                        className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border snap-start ${
                            activeCategory === cat.id 
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 border-indigo-600 dark:border-indigo-500' 
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300'
                        }`}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl m-4 bg-gray-50/50 dark:bg-gray-900/50">
              <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 shadow-sm border border-gray-100 dark:border-gray-700">
                  <Clock size={32} className="text-gray-300 dark:text-gray-500" />
              </div>
              <p className="font-bold text-gray-600 dark:text-gray-300 text-lg">No projects found</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {activeCategory === 'ALL' 
                    ? "Create your first video from the Templates tab." 
                    : `No projects in the ${activeCategory.toLowerCase()} category.`}
              </p>
              <button onClick={handleRefresh} className="mt-4 text-indigo-600 dark:text-indigo-400 font-bold text-sm hover:underline">
                  Refresh List
              </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pb-10 pr-2">
              <div className="grid grid-cols-1 gap-4">
                  {filteredProjects.map(project => (
                      <div key={project.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-5 hover:shadow-lg transition-all duration-300 group">
                          <div className="w-full sm:w-40 aspect-video bg-gray-100 dark:bg-gray-900 rounded-xl overflow-hidden flex-shrink-0 relative shadow-inner border border-gray-100 dark:border-gray-700">
                              <img 
                                  src={project.thumbnailUrl || 'https://via.placeholder.com/320x180?text=Generating...'} 
                                  alt="Thumbnail" 
                                  className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" 
                              />
                              {project.status === ProjectStatus.COMPLETED && project.videoUrl && (
                                  <button 
                                      onClick={(e) => handleOpenItem(e, project)}
                                      className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors cursor-pointer"
                                  >
                                      <div className="bg-white/90 rounded-full p-3 shadow-lg transform scale-90 group-hover:scale-100 transition-transform hover:bg-white">
                                         {project.type === 'FASHION_SHOOT' ? (
                                             <ImageIcon className="text-rose-600" size={20} />
                                         ) : (
                                             <Play className="text-indigo-600 fill-current ml-0.5" size={20}/>
                                         )}
                                      </div>
                                  </button>
                              )}
                          </div>
                          
                          <div className="flex-1 min-w-0 py-1 w-full text-center sm:text-left">
                              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1.5">
                                  <h3 className="font-bold text-gray-900 dark:text-white truncate text-lg max-w-full">{project.templateName}</h3>
                                  <StatusBadge status={project.status} />
                              </div>
                              <div className="flex items-center justify-center sm:justify-start gap-3 mb-2 text-sm text-gray-500 dark:text-gray-400 font-medium">
                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wide font-bold">{project.type?.replace('_', ' ')}</span>
                                  <span>• {new Date(project.createdAt).toLocaleDateString()}</span>
                                  {project.cost && <span>• {project.cost} Credits</span>}
                              </div>
                              
                              {project.error && (
                                  <div className="text-xs text-red-600 dark:text-red-400 mt-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 max-w-full">
                                      <AlertOctagon size={12} />
                                      <span className="truncate">{project.error}</span>
                                  </div>
                              )}
                          </div>

                          <div className="flex items-center gap-3 w-full sm:w-auto justify-center">
                              {project.status === ProjectStatus.COMPLETED && project.videoUrl ? (
                                <>
                                    <button 
                                        onClick={(e) => handleOpenItem(e, project)}
                                        className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-bold hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm"
                                    >
                                        {project.type === 'FASHION_SHOOT' ? <ImageIcon size={16} /> : <Play size={16} />}
                                        <span>View</span>
                                    </button>
                                    <a 
                                        href={project.videoUrl} 
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download={`project-${project.id}.${project.type === 'FASHION_SHOOT' ? 'png' : 'mp4'}`}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 hover:shadow-md hover:-translate-y-0.5 transition-all shadow-sm w-full sm:w-auto justify-center"
                                    >
                                        <Download size={16} />
                                        <span className="sm:hidden">Download</span>
                                        <span className="hidden sm:inline">Download</span>
                                    </a>
                                </>
                              ) : project.status === ProjectStatus.FAILED ? (
                                 <div className="text-red-500 font-medium text-sm bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-xl border border-red-100 dark:border-red-900/30">Failed</div>
                              ) : (
                                 <div className="w-32 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                      <div className="h-full bg-indigo-500 animate-pulse w-2/3 rounded-full"></div>
                                 </div>
                              )}
                          </div>
                      </div>
                  ))}
              </div>
          </div>
        )}
      </div>

      {/* Media Viewer Modal Overlay */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-6xl bg-black rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh] border border-gray-800">
             {/* Header */}
             <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10 bg-gradient-to-b from-black/90 to-transparent pointer-events-none">
                <h3 className="text-white font-bold text-xl drop-shadow-md pointer-events-auto">{selectedItem.name}</h3>
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="bg-black/50 hover:bg-white/20 text-white rounded-full p-2.5 backdrop-blur-md transition-colors border border-white/10 pointer-events-auto"
                >
                  <X size={24} />
                </button>
             </div>

             {/* Player / Viewer */}
             <div className="flex-1 bg-black flex items-center justify-center relative p-4">
                {selectedItem.type === 'FASHION_SHOOT' ? (
                    <img 
                        src={selectedItem.url} 
                        alt={selectedItem.name}
                        className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
                    />
                ) : (
                    <video 
                      src={selectedItem.url} 
                      controls 
                      autoPlay 
                      className="max-w-full max-h-[85vh] w-auto h-auto outline-none rounded-lg shadow-2xl"
                    />
                )}
             </div>
          </div>
        </div>
      )}
    </>
  );
};
