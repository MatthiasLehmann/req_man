import { useNavigate } from 'react-router-dom';
import { LogOut, User, Bell } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useProjectStore } from '../../store/projectStore';

export default function Header() {
  const { user, logout } = useAuthStore();
  const { currentProject } = useProjectStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        {currentProject && (
          <h1 className="text-base font-semibold text-gray-800">{currentProject.name}</h1>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <User className="w-4 h-4" />
          <span className="font-medium">{user?.full_name}</span>
          <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs capitalize text-gray-500">
            {user?.role}
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="btn-ghost text-gray-500 hover:text-red-600"
          title="Abmelden"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
