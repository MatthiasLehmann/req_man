import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FolderOpen, FileText, ChevronRight, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { listProjects, createProject } from '../api/client';
import { useProjectStore } from '../store/projectStore';
import { Project } from '../types';

export default function DashboardPage() {
  const { data: projectsRes, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });
  const projects: Project[] = projectsRes?.data || [];

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const { setCurrentProject } = useProjectStore();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => createProject({ name: newName, description: newDesc }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projekt erstellt');
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setCurrentProject(res.data);
      navigate(`/requirements/${res.data.id}`);
    },
    onError: () => toast.error('Fehler beim Erstellen des Projekts'),
  });

  const openProject = (project: Project) => {
    setCurrentProject(project);
    navigate(`/requirements/${project.id}`);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projekte</h1>
          <p className="text-gray-500 text-sm mt-1">Requirements Management mit Doorstop</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Neues Projekt
        </button>
      </div>

      {/* Create Project Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Neues Projekt erstellen</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  className="input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="z.B. Fahrzeugsteuerung 2024"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Kurze Beschreibung..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={!newName || createMutation.isPending}
                  className="btn-primary flex-1 justify-center"
                >
                  {createMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Erstellen...</>
                  ) : 'Erstellen'}
                </button>
                <button onClick={() => setShowCreate(false)} className="btn-secondary">
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Projects Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">Noch keine Projekte</h3>
          <p className="text-gray-400 text-sm mb-4">Erstellen Sie Ihr erstes Requirements-Projekt</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Erstes Projekt erstellen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => openProject(project)}
              className="card p-5 text-left hover:border-primary-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-primary-700">
                      {project.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">ID: {project.id}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary-600 mt-1" />
              </div>
              {project.description && (
                <p className="text-sm text-gray-500 mt-3 line-clamp-2">{project.description}</p>
              )}
              <div className="mt-3 text-xs text-gray-400 font-mono truncate">{project.path}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
