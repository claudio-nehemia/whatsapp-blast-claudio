import React from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { 
  LayoutDashboard, 
  Send, 
  Users, 
  FileText, 
  Settings as SettingsIcon, 
  User, 
  LogOut,
  MessageSquare,
  Smartphone
} from 'lucide-react';

const MainLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { name: t('dashboard'), path: '/', icon: LayoutDashboard },
    { name: t('blasts'), path: '/blast', icon: Send },
    { name: t('contacts'), path: '/contacts', icon: Users },
    { name: t('templates'), path: '/templates', icon: FileText },
    { name: 'WhatsApp Senders', path: '/senders', icon: Smartphone },
    { name: t('settings'), path: '/settings', icon: SettingsIcon },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getPageTitle = () => {
    const current = menuItems.find(
      item => location.pathname === item.path || 
      (item.path !== '/' && location.pathname.startsWith(item.path))
    );
    return current ? current.name : 'WhatsApp Blast';
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-200 bg-white flex flex-col justify-between select-none">
        <div>
          {/* Brand header */}
          <div className="h-16 border-b border-zinc-100 flex items-center px-6 gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 pulse-primary">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight text-zinc-800">WA Blast Platform</h1>
              <span className="text-[10px] text-zinc-400 font-mono">v2.0 Stable</span>
            </div>
          </div>

          {/* Navigation items */}
          <nav className="p-4 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || 
                (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 group ${
                    isActive 
                      ? 'bg-slate-100 text-zinc-950 border-l-2 border-emerald-600' 
                      : 'text-zinc-600 hover:text-zinc-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 transition-transform duration-200 group-hover:scale-105 ${
                    isActive ? 'text-emerald-600' : 'text-zinc-400 group-hover:text-zinc-800'
                  }`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User profile & Logout */}
        <div className="p-4 border-t border-zinc-200 bg-slate-50/50">
          <div className="flex items-center gap-3 px-2 py-2 mb-3">
            <div className="h-9 w-9 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 font-bold">
              {user?.name ? user.name.charAt(0).toUpperCase() : <User className="h-4.5 w-4.5" />}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-zinc-800 truncate">{user?.name}</p>
              <p className="text-[10px] text-zinc-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors duration-150 cursor-pointer"
          >
            <LogOut className="h-4.5 w-4.5" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        <header className="h-16 border-b border-zinc-200 flex items-center justify-between px-8 bg-white/80 backdrop-blur-sm z-10">
          <div>
            <h2 className="text-sm font-bold text-zinc-800 uppercase tracking-wider">
              {getPageTitle()}
            </h2>
          </div>
          <div className="flex items-center gap-6">
            {/* Language Switcher Pill */}
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
              <button 
                onClick={() => setLanguage('id')} 
                className={`px-2.5 py-1 rounded-md transition-all duration-150 cursor-pointer ${
                  language === 'id' 
                    ? 'bg-white text-zinc-900 shadow-sm' 
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                ID
              </button>
              <button 
                onClick={() => setLanguage('en')} 
                className={`px-2.5 py-1 rounded-md transition-all duration-150 cursor-pointer ${
                  language === 'en' 
                    ? 'bg-white text-zinc-900 shadow-sm' 
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                EN
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs text-zinc-500 font-semibold">Gateway Active</span>
            </div>
          </div>
        </header>

        {/* Content Outlet */}
        <section className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </section>
      </main>
    </div>
  );
};

export default MainLayout;
