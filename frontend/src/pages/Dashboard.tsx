import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useLanguage } from '../hooks/useLanguage';
import { 
  Users, 
  Send, 
  CheckCircle, 
  XCircle, 
  ArrowRight,
  Activity
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  contact_count: number;
  created_at: string;
}

interface Blast {
  id: string;
  name: string;
  template_name: string;
  campaign_name: string;
  total_recipients: number;
  success_count: number;
  failed_count: number;
  status: string;
  created_at: string;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [stats, setStats] = useState({
    totalContacts: 0,
    totalBlasts: 0,
    successCount: 0,
    failedCount: 0,
    whatsappConnected: false,
    whatsappStatus: 'disconnected'
  });
  const [recentBlasts, setRecentBlasts] = useState<Blast[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setIsLoading(true);
        // Load Campaigns
        const campaignsRes = await api.get<Campaign[]>('/api/campaigns');
        const totalContacts = campaignsRes.data.reduce((acc, camp) => acc + camp.contact_count, 0);

        // Load Blasts
        const blastsRes = await api.get<Blast[]>('/api/blasts');
        const totalBlasts = blastsRes.data.length;
        
        let successCount = 0;
        let failedCount = 0;
        
        blastsRes.data.forEach(b => {
          successCount += b.success_count;
          failedCount += b.failed_count;
        });

        // Load WhatsApp Status
        let whatsappConnected = false;
        let whatsappStatus = 'disconnected';
        try {
          const waRes = await api.get<{ status: string }>('/api/whatsapp/status');
          whatsappStatus = waRes.data.status;
          whatsappConnected = waRes.data.status === 'connected';
        } catch (e) {
          console.error('Failed to get WA status', e);
        }

        setStats({
          totalContacts,
          totalBlasts,
          successCount,
          failedCount,
          whatsappConnected,
          whatsappStatus
        });

        setRecentBlasts(blastsRes.data.slice(0, 5));
      } catch (error) {
        console.error('Failed to load dashboard statistics', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="h-8 w-8 rounded-full border-2 border-zinc-200 border-t-emerald-600 animate-spin"></div>
      </div>
    );
  }

  const kpis = [
    {
      name: t('total_contacts'),
      value: stats.totalContacts.toLocaleString(),
      desc: 'Master data contacts',
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-zinc-200'
    },
    {
      name: t('total_blasts'),
      value: stats.totalBlasts.toLocaleString(),
      desc: 'Created activities',
      icon: Send,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-zinc-200'
    },
    {
      name: t('success_rate'),
      value: stats.successCount.toLocaleString(),
      desc: 'Messages sent successfully',
      icon: CheckCircle,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-zinc-200'
    },
    {
      name: t('failed_rate'),
      value: stats.failedCount.toLocaleString(),
      desc: 'Messages failed to send',
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-zinc-200'
    }
  ];

  return (
    <div className="space-y-8 select-none">
      {/* WhatsApp Status Alert */}
      {!stats.whatsappConnected ? (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-amber-50 border border-amber-100 text-amber-800 rounded-xl gap-4">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse"></div>
            <p className="text-sm font-semibold">
              WhatsApp is currently <strong className="uppercase font-extrabold">{stats.whatsappStatus}</strong>. Connect your WhatsApp to activate sending capabilities.
            </p>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-bold transition-colors duration-150 cursor-pointer shadow-sm"
          >
            {t('scan_qr')}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse"></div>
          <p className="text-sm font-semibold">WhatsApp Session is active and connected. You are ready to start blasting.</p>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.name} className="bg-white border border-zinc-200 rounded-xl p-5 relative overflow-hidden shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-zinc-500">{kpi.name}</span>
                <div className={`p-2.5 rounded-lg ${kpi.bgColor} ${kpi.color}`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-extrabold text-zinc-800 tracking-tight">{kpi.value}</h3>
                <span className="text-[10px] text-zinc-400 mt-1 block font-medium">{kpi.desc}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Launch Panel & Recent Blasts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Blast History */}
        <div className="lg:col-span-2 bg-white border border-zinc-200 shadow-sm rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-sm text-zinc-800 flex items-center gap-2">
                <Activity className="h-4.5 w-4.5 text-emerald-600" />
                {t('recent_blasts')}
              </h3>
              <Link to="/blast" className="text-xs text-emerald-600 hover:text-emerald-700 hover:underline font-bold flex items-center gap-1">
                View All Blasts
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {recentBlasts.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-zinc-200 rounded-lg">
                <Send className="h-8 w-8 text-zinc-400 mx-auto mb-3" />
                <p className="text-xs text-zinc-500">{t('no_blasts')}</p>
                <Link to="/blast/new" className="text-xs text-emerald-600 hover:underline font-bold mt-2 inline-block">
                  Create First Blast
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {recentBlasts.map((blast) => (
                  <div key={blast.id} className="py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors px-2 rounded-lg">
                    <div className="flex flex-col gap-1 pr-4">
                      <span className="font-bold text-xs text-zinc-800 truncate max-w-[200px]">{blast.name}</span>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                        <span>Campaign: {blast.campaign_name}</span>
                        <span>•</span>
                        <span>Template: {blast.template_name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <span className="font-bold text-xs text-zinc-800">{blast.success_count} / {blast.total_recipients}</span>
                        <div className="w-16 bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                          <div 
                            className="bg-emerald-600 h-full" 
                            style={{ width: `${Math.round((blast.success_count / blast.total_recipients) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide ${
                        blast.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' :
                        blast.status === 'Running' ? 'bg-blue-50 text-blue-700' :
                        blast.status === 'Cancelled' ? 'bg-slate-100 text-zinc-500' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {blast.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Quick Start Action */}
        <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-zinc-800 mb-3">Quick Actions</h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-6 font-medium">
              Launch a new campaign blast to your master contacts, import custom excel data pools, or adjust delay times to prevent phone number bans.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate('/blast/new')}
              disabled={!stats.whatsappConnected}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-lg text-xs transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:scale-100"
            >
              <Send className="h-3.5 w-3.5" />
              {t('start_blast')}
            </button>
            <button
              onClick={() => navigate('/contacts')}
              className="w-full py-2.5 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-zinc-800 font-bold rounded-lg text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              {t('add_campaign')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
