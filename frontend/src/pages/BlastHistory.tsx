import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useLanguage } from '../hooks/useLanguage';
import { 
  Send, 
  Plus, 
  ExternalLink,
  Search
} from 'lucide-react';

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

const BlastHistory: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [blasts, setBlasts] = useState<Blast[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const fetchBlasts = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<Blast[]>('/api/blasts');
      setBlasts(res.data);
    } catch (err) {
      console.error('Failed to load blast history', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBlasts();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'Running':
        return 'bg-blue-50 text-blue-700 border border-blue-100';
      case 'Paused':
        return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'Cancelled':
        return 'bg-slate-100 text-zinc-500 border border-slate-200';
      default:
        return 'bg-slate-50 text-zinc-400 border border-slate-150';
    }
  };

  const filteredBlasts = blasts.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.campaign_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.template_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="h-8 w-8 rounded-full border-2 border-zinc-200 border-t-emerald-600 animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-800 tracking-tight">{t('blasts')}</h1>
          <p className="text-xs text-zinc-500 mt-1">Deploy and monitor message broadcasts</p>
        </div>
        <button
          onClick={() => navigate('/blast/new')}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-lg text-xs transition-all shadow-md cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('start_blast')}
        </button>
      </div>

      {blasts.length === 0 ? (
        <div className="text-center py-20 bg-white border border-zinc-200 shadow-sm rounded-2xl">
          <Send className="h-12 w-12 text-zinc-300 mx-auto mb-4" />
          <p className="text-sm font-bold text-zinc-500">{t('no_blasts')}</p>
          <p className="text-xs text-zinc-400 mt-1 mb-6 font-medium">Start a new blast wizard to send messages to your contacts.</p>
          <button
            onClick={() => navigate('/blast/new')}
            className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg text-xs hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            Start First Blast
          </button>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-6 space-y-6 flex flex-col">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search blasts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 focus:border-emerald-600 rounded-lg text-xs text-zinc-950 placeholder-zinc-400 outline-none transition-all"
              />
            </div>
            <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Total dispatches: {blasts.length}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-zinc-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-zinc-200 text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="p-3">Blast Details</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Success Rate</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 w-28 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredBlasts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-zinc-400 font-medium">
                      No matching blasts found.
                    </td>
                  </tr>
                ) : (
                  filteredBlasts.map((b) => {
                    const rate = b.total_recipients > 0 
                      ? Math.round((b.success_count / b.total_recipients) * 100) 
                      : 0;

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/50 text-zinc-700">
                        <td className="p-3 py-4 space-y-1 max-w-[220px]">
                          <span className="font-extrabold text-zinc-800 block truncate">{b.name}</span>
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-semibold">
                            <span className="truncate">Campaign: {b.campaign_name}</span>
                            <span>•</span>
                            <span className="truncate">Template: {b.template_name}</span>
                          </div>
                        </td>
                        <td className="p-3 font-semibold text-zinc-500">
                          {new Date(b.created_at).toLocaleDateString()}
                          <span className="block text-[9px] text-zinc-400 mt-0.5">{new Date(b.created_at).toLocaleTimeString()}</span>
                        </td>
                        <td className="p-3 space-y-1.5">
                          <div className="flex justify-between w-24">
                            <span className="font-bold text-zinc-800 font-mono">{rate}%</span>
                            <span className="text-zinc-400 font-mono font-bold">{b.success_count}/{b.total_recipients}</span>
                          </div>
                          <div className="w-24 bg-slate-100 border border-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-emerald-600 h-full" 
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                        </td>
                        <td className="p-3">{getStatusColor(b.status) && (
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider ${getStatusColor(b.status)}`}>
                            {b.status}
                          </span>
                        )}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => navigate(`/blast/progress/${b.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-zinc-800 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer hover:scale-[1.03]"
                          >
                            <span>Monitor</span>
                            <ExternalLink className="h-3 w-3 text-zinc-500" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlastHistory;
