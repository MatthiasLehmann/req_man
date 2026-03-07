import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { login, getMe } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { User } from '../types';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const tokenRes = await login(username, password);
      const token = tokenRes.data.access_token;

      // Temporarily set token for getMe call
      localStorage.setItem('token', token);
      const meRes = await getMe();
      const user: User = meRes.data;

      setAuth(user, token);
      navigate('/');
      toast.success(`Willkommen, ${user.full_name}!`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Anmeldung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4 shadow-lg">
            <Database className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">ReqMan</h1>
          <p className="text-gray-400 mt-1">Requirements Management System</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Anmelden</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Benutzername
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="Benutzername eingeben"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Passwort
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="Passwort eingeben"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Anmelden...</>
              ) : (
                'Anmelden'
              )}
            </button>
          </form>

          <div className="mt-6 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            <strong>Standard-Login:</strong> admin / admin123
            <br />
            Passwort nach erster Anmeldung ändern!
          </div>
        </div>
      </div>
    </div>
  );
}
