import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { 
  Play, 
  Pause, 
  StopCircle, 
  Loader, 
  ArrowLeft,
  Activity
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

interface Recipient {
  id: string;
  contact_name: string;
  phone: string;
  status: string;
  error_message: string | null;
  retry_count: number;
  sent_at: string | null;
}

const BlastProgress: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [blast, setBlast] = useState<Blast | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Controller states
  const [isActing, setIsActing] = useState(false);

  const loadBlastData = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const [blastRes, recipientsRes] = await Promise.all([
        api.get<Blast>(`/api/blasts/${id}`),
        api.get<Recipient[]>(`/api/blasts/${id}/recipients`)
      ]);
      setBlast(blastRes.data);
      setRecipients(recipientsRes.data);
    } catch (err) {
      console.error('Failed to load blast details', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBlastData();

    const wsUrl = `ws://${window.location.hostname}:8000/ws`;
    let socket: WebSocket | null = null;
    let reconnectTimeout: number;

    const connectWs = () => {
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.blast_id !== id) return;

          if (data.type === 'recipient_update') {
            setRecipients(prev => prev.map(r => {
              if (r.id === data.recipient_id) {
                return {
                  ...r,
                  status: data.status,
                  error_message: data.error_message,
                  sent_at: data.sent_at
                };
              }
              return r;
            }));

            setBlast(prev => {
              if (!prev) return null;
              
              const isSuccess = data.status === 'Success';
              const isFailed = data.status === 'Failed';
              
              return {
                ...prev,
                success_count: isSuccess ? prev.success_count + 1 : prev.success_count,
                failed_count: isFailed ? prev.failed_count + 1 : prev.failed_count,
              };
            });
          }

          if (data.type === 'blast_status') {
            setBlast(prev => {
              if (!prev) return null;
              return {
                ...prev,
                status: data.status
              };
            });
          }
        } catch (e) {
          // ignore
        }
      };

      socket.onclose = () => {
        reconnectTimeout = window.setTimeout(connectWs, 3000);
      };
    };

    connectWs();

    return () => {
      if (socket) socket.close();
      clearTimeout(reconnectTimeout);
    };
  }, [id]);

  const handleAction = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!id || isActing) return;
    
    if (action === 'cancel' && !confirm('Are you sure you want to stop this blast? Remaining messages will not be sent.')) {
      return;
    }

    setIsActing(true);
    try {
      await api.post(`/api/blasts/${id}/${action}`);
      const res = await api.get<Blast>(`/api/blasts/${id}`);
      setBlast(res.data);
    } catch (err) {
      console.error(`Failed to trigger blast ${action}`, err);
    } finally {
      setIsActing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="h-8 w-8 rounded-full border-2 border-zinc-200 border-t-emerald-600 animate-spin"></div>
      </div>
    );
  }

  if (!blast) {
    return (
      <div className="p-8 text-center text-zinc-500 max-w-md mx-auto font-bold">
        <p>Blast campaign details not found.</p>
        <button onClick={() => navigate('/blast')} className="text-xs text-emerald-600 hover:underline font-bold mt-3 cursor-pointer">
          Back to list
        </button>
      </div>
    );
  }

  const sentCount = blast.success_count + blast.failed_count;
  const progressPercent = blast.total_recipients > 0 
    ? Math.round((sentCount / blast.total_recipients) * 100) 
    : 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Success':
        return <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700">SUCCESS</span>;
      case 'Failed':
        return <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-700">FAILED</span>;
      case 'Sending':
        return <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-50 text-blue-700 flex items-center gap-1">SENDING</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-50 text-zinc-500 border border-slate-200">PENDING</span>;
    }
  };

  return (
    <div className="space-y-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/blast')}
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer text-xs font-bold"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Blasts
        </button>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${
            blast.status === 'Running' ? 'bg-blue-500 animate-pulse' :
            blast.status === 'Completed' ? 'bg-emerald-500' :
            blast.status === 'Paused' ? 'bg-amber-500' :
            'bg-zinc-400'
          }`}></div>
          <span className="text-xs text-zinc-800 font-extrabold uppercase tracking-wider">{blast.status}</span>
        </div>
      </div>

      {/* Progress Card */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-extrabold text-zinc-800 tracking-tight">{blast.name}</h1>
            <p className="text-[10px] text-zinc-400 mt-1 font-bold">
              Campaign: <span className="text-zinc-600">{blast.campaign_name}</span> | Template: <span className="text-zinc-600">{blast.template_name}</span>
            </p>
          </div>

          {/* Action Controller buttons */}
          {blast.status !== 'Completed' && blast.status !== 'Cancelled' && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {blast.status === 'Running' ? (
                <button
                  onClick={() => handleAction('pause')}
                  disabled={isActing}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-600 font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-sm"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </button>
              ) : (
                <button
                  onClick={() => handleAction('resume')}
                  disabled={isActing}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-600 font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-sm"
                >
                  <Play className="h-3.5 w-3.5" />
                  Resume
                </button>
              )}
              <button
                onClick={() => handleAction('cancel')}
                disabled={isActing}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-sm"
              >
                <StopCircle className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Progress Bar & Stats */}
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-zinc-500">Blast Progress</span>
              <span className="text-zinc-800 font-mono">{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-100 border border-slate-200 h-3 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-600 h-full transition-all duration-500" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div className="p-4 bg-slate-50 border border-zinc-200 rounded-xl text-center space-y-1">
              <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-bold">Total Recipients</span>
              <p className="text-lg font-extrabold text-zinc-800">{blast.total_recipients}</p>
            </div>
            <div className="p-4 bg-slate-50 border border-zinc-200 rounded-xl text-center space-y-1">
              <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-bold">Successful</span>
              <p className="text-lg font-extrabold text-emerald-700">{blast.success_count}</p>
            </div>
            <div className="p-4 bg-slate-50 border border-zinc-200 rounded-xl text-center space-y-1">
              <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-bold">Failed</span>
              <p className="text-lg font-extrabold text-red-600">{blast.failed_count}</p>
            </div>
            <div className="p-4 bg-slate-50 border border-zinc-200 rounded-xl text-center space-y-1">
              <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-bold">Pending</span>
              <p className="text-lg font-extrabold text-zinc-500">{blast.total_recipients - (blast.success_count + blast.failed_count)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recipient Details Table */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4 shadow-sm">
        <h3 className="font-bold text-xs text-zinc-500 uppercase tracking-wider flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-600" />
          Live Delivery Status
        </h3>

        <div className="border border-zinc-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-zinc-200 text-zinc-500 font-bold uppercase tracking-wider">
                <th className="p-3">Name</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Status</th>
                <th className="p-3">Delivery Logs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {recipients.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 text-zinc-700">
                  <td className="p-3 font-bold text-zinc-800">{r.contact_name}</td>
                  <td className="p-3 font-mono text-zinc-600">{r.phone}</td>
                  <td className="p-3">{getStatusBadge(r.status)}</td>
                  <td className="p-3 font-mono text-[10px] text-zinc-500 truncate max-w-[200px]" title={r.error_message || ''}>
                    {r.status === 'Failed' && r.error_message ? (
                      <span className="text-red-600 font-semibold">{r.error_message}</span>
                    ) : r.status === 'Success' && r.sent_at ? (
                      <span className="text-zinc-400 font-medium">Sent at {new Date(r.sent_at).toLocaleTimeString()}</span>
                    ) : r.status === 'Sending' ? (
                      <span className="text-blue-600 flex items-center gap-1.5 font-bold animate-pulse">
                        <Loader className="h-3 w-3 animate-spin text-blue-500" />
                        Simulating delays...
                      </span>
                    ) : (
                      <span className="text-zinc-400 font-medium">Awaiting queue...</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BlastProgress;
