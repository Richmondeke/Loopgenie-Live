
import React, { useState } from 'react';
import { Project, ProjectStatus } from '../types';
import { Clock, CheckCircle, AlertOctagon, Download, Play, RefreshCw, X, ExternalLink } from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  onPollStatus: () => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({ projects, onPollStatus }) => {
  const [selectedVideo, setSelectedVideo] = useState<{ url: string; name: string } | null>(null);

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

  const handleOpenVideo = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    if (project.videoUrl) {
      setSelectedVideo({ url: project.videoUrl, name: project.templateName });
    }
  };

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <div>
              <h2 className="text-2xl font-bold text-gray-900">My Projects</h2>
              <p className="text-gray-600 font-medium">History of your generated videos.</p>
          </div>
          <button 
              onClick={onPollStatus}
              className="text-gray-600 hover:text-indigo-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
              title="Refresh Status"
          >
              <RefreshCw size={20} />
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-300 rounded-xl m-4">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                  <Clock size={32} />
              </div>
              <p className="font-bold text-gray-500">No projects yet</p>
              <p className="text-sm text-gray-500">Create your first video from the Templates tab.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 overflow-y-auto pb-10">
              {projects.map(project => (
                  <div key={project.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
                      <div className="w-32 aspect-video bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 relative group">
                          <img 
                              src={project.thumbnailUrl || 'https://via.placeholder.com/320x180?text=Generating...'} 
                              alt="Thumbnail" 
                              className="w-full h-full object-cover" 
                          />
                          {project.status === ProjectStatus.COMPLETED && project.videoUrl && (
                              <button 
                                  onClick={(e) => handleOpenVideo(e, project)}
                                  className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-10 group-hover:bg-opacity-40 transition-all cursor-pointer"
                              >
                                  <div className="bg-white/90 rounded-full p-2 shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                                     <Play className="text-indigo-600 fill-current" size={20}/>
                                  </div>
                              </button>
                          )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-gray-900 truncate">{project.templateName}</h3>
                              <StatusBadge status={project.status} />
                          </div>
                          <p className="text-xs text-gray-600 font-medium mb-2">Created {new Date(project.createdAt).toLocaleDateString()}</p>
                          <div className="text-xs text-gray-500 font-mono truncate">ID: {project.id}</div>
                          {project.error && (
                              <div className="text-xs text-red-500 mt-1 truncate max-w-md" title={project.error}>
                                  Error: {project.error}
                              </div>
                          )}
                      </div>

                      <div className="flex items-center gap-2">
                          {project.status === ProjectStatus.COMPLETED && project.videoUrl ? (
                            <>
                                <button 
                                    onClick={(e) => handleOpenVideo(e, project)}
                                    className="hidden sm:flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors"
                                >
                                    <Play size={16} />
                                    <span>Watch</span>
                                </button>
                                <a 
                                    href={project.videoUrl} 
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download={`video-${project.id}.mp4`}
                                    className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors"
                                >
                                    <Download size={16} />
                                    <span className="hidden sm:inline">Download</span>
                                </a>
                            </>
                          ) : project.status === ProjectStatus.FAILED ? (
                             <div className="text-red-500 text-sm font-medium">Generation Failed</div>
                          ) : (
                             <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 animate-pulse w-2/3"></div>
                             </div>
                          )}
                      </div>
                  </div>
              ))}
          </div>
        )}
      </div>

      {/* Video Modal Overlay */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-5xl bg-black rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
             {/* Header */}
             <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
                <h3 className="text-white font-bold text-lg drop-shadow-md">{selectedVideo.name}</h3>
                <button 
                  onClick={() => setSelectedVideo(null)}
                  className="bg-black/50 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-sm transition-colors"
                >
                  <X size={24} />
                </button>
             </div>

             {/* Player */}
             <div className="flex-1 bg-black flex items-center justify-center">
                <video 
                  src={selectedVideo.url} 
                  controls 
                  autoPlay 
                  className="max-w-full max-h-[80vh] w-auto h-auto outline-none"
                />
             </div>
          </div>
        </div>
      )}
    </>
  );
};
