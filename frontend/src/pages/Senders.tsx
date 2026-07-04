import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { 
  Smartphone,
  Plus,
  RefreshCw,
  Power,
  Trash2,
  CheckCircle,
  AlertCircle,
  QrCode,
  Loader,
  Edit2,
  X
} from 'lucide-react';

interface WhatsappSender {
  id: string;
  name: string;
  phone_number: string | null;
  session_id: string;
  status: string;
  qr_code: string | null;
  created_at: string;
}

const Senders: React.FC = () => {
  const [senders, setSenders] = useState<WhatsappSender[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Add Sender Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSenderName, setNewSenderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // Active QR Modal State
  const [activeQrSender, setActiveQrSender] = useState<WhatsappSender | null>(null);

  // Editing Name State
  const [editingSenderId, setEditingSenderId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');

  const fetchSenders = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<WhatsappSender[]>('/api/senders');
      setSenders(res.data);
    } catch (err) {
      console.error('Failed to fetch senders', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSenders();

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.port === '5173' ? `${window.location.hostname}:8000` : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws`;
    let socket: WebSocket | null = null;
    let reconnectTimeout: number;

    const connectWs = () => {
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'whatsapp_status' && data.sender) {
            const updated = data.sender;
            setSenders(prev => prev.map(s => s.id === updated.id ? updated : s));
            
            // If the sender that got updated is currently open in the QR modal, update it or close if connected
            setActiveQrSender(current => {
              if (current && current.id === updated.id) {
                if (updated.status === 'connected') {
                  // Autoclose modal with a tiny delay for visual confirmation
                  setTimeout(() => setActiveQrSender(null), 1000);
                }
                return updated;
              }
              return current;
            });
          }
        } catch (e) {
          // Non-JSON or other event
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
  }, []);

  const handleAddSender = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSenderName.trim()) return;
    
    setIsCreating(true);
    try {
      const res = await api.post<WhatsappSender>('/api/senders', { name: newSenderName.trim() });
      setSenders(prev => [res.data, ...prev]);
      setNewSenderName('');
      setShowAddModal(false);
    } catch (err) {
      console.error('Failed to create sender', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateName = async (senderId: string) => {
    if (!tempName.trim()) {
      setEditingSenderId(null);
      return;
    }
    try {
      const res = await api.put<WhatsappSender>(`/api/senders/${senderId}/name`, { name: tempName.trim() });
      setSenders(prev => prev.map(s => s.id === senderId ? res.data : s));
    } catch (err) {
      console.error('Failed to update sender name', err);
    } finally {
      setEditingSenderId(null);
    }
  };

  const handleConnect = async (sender: WhatsappSender) => {
    // Open the QR Modal right away so user sees the connecting state
    setActiveQrSender(sender);
    try {
      await api.post(`/api/senders/${sender.id}/connect`);
      // Status update will come via WebSocket
    } catch (err) {
      console.error('Failed to trigger connection', err);
    }
  };

  const handleDisconnect = async (sender: WhatsappSender) => {
    if (!confirm(`Are you sure you want to disconnect ${sender.name}?`)) {
      return;
    }
    try {
      await api.post(`/api/senders/${sender.id}/disconnect`);
    } catch (err) {
      console.error('Failed to trigger disconnect', err);
    }
  };

  const handleDelete = async (sender: WhatsappSender) => {
    if (!confirm(`Are you sure you want to delete ${sender.name}? This will clear its credentials session.`)) {
      return;
    }
    try {
      await api.delete(`/api/senders/${sender.id}`);
      setSenders(prev => prev.filter(s => s.id !== sender.id));
    } catch (err) {
      console.error('Failed to delete sender', err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wide">
            <CheckCircle className="h-3 w-3" />
            Connected
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wide animate-pulse">
            <Loader className="h-3 w-3 animate-spin" />
            Connecting
          </span>
        );
      case 'qr':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wide">
            <QrCode className="h-3 w-3" />
            Scan QR
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-50 text-zinc-500 border border-slate-200 uppercase tracking-wide">
            <AlertCircle className="h-3 w-3" />
            Offline
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-800 tracking-tight">WhatsApp Senders</h1>
          <p className="text-xs text-zinc-500 mt-1">Manage multiple WhatsApp device connections for broadcasting</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold rounded-lg text-xs transition-all shadow-md shadow-emerald-600/10 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Add New Sender
        </button>
      </div>

      {/* Senders Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-[40vh]">
          <div className="h-8 w-8 rounded-full border-2 border-zinc-200 border-t-emerald-600 animate-spin"></div>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 shadow-sm rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-55 border-b border-zinc-200">
                  <th className="px-6 py-3.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Name / Alias</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">WA Number</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Session ID</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-xs font-semibold text-zinc-700">
                {senders.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/55 transition-colors">
                    {/* Name / Alias Input */}
                    <td className="px-6 py-4">
                      {editingSenderId === s.id ? (
                        <input
                          type="text"
                          value={tempName}
                          autoFocus
                          onChange={(e) => setTempName(e.target.value)}
                          onBlur={() => handleUpdateName(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateName(s.id);
                            if (e.key === 'Escape') setEditingSenderId(null);
                          }}
                          className="px-2 py-1 border border-emerald-500 rounded bg-white text-zinc-950 font-bold outline-none text-xs w-44"
                        />
                      ) : (
                        <div className="flex items-center gap-2 group">
                          <span className="font-bold text-zinc-800">{s.name}</span>
                          <button
                            onClick={() => {
                              setEditingSenderId(s.id);
                              setTempName(s.name);
                            }}
                            className="text-zinc-400 hover:text-zinc-700 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="Edit Name"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Phone Number */}
                    <td className="px-6 py-4 text-zinc-600 font-mono">
                      {s.phone_number ? `+${s.phone_number}` : '-'}
                    </td>

                    {/* Session ID */}
                    <td className="px-6 py-4 text-[10px] font-bold font-mono text-zinc-400">
                      {s.session_id}
                    </td>

                    {/* Status Badge */}
                    <td className="px-6 py-4">
                      {getStatusBadge(s.status)}
                    </td>

                    {/* Action Buttons */}
                    <td className="px-6 py-4 text-right space-x-2">
                      {s.status === 'connected' ? (
                        <button
                          onClick={() => handleDisconnect(s)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100/50 transition-colors cursor-pointer"
                          title="Disconnect Sender"
                        >
                          <Power className="h-3 w-3" />
                          Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnect(s)}
                          disabled={s.status === 'connecting'}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100/50 transition-colors cursor-pointer disabled:opacity-50"
                          title="Connect to WhatsApp"
                        >
                          <RefreshCw className={`h-3 w-3 ${s.status === 'connecting' ? 'animate-spin' : ''}`} />
                          {s.status === 'qr' ? 'Scan QR' : 'Connect'}
                        </button>
                      )}
                      
                      <button
                        onClick={() => handleDelete(s)}
                        className="inline-flex items-center p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg transition-all cursor-pointer"
                        title="Delete Sender Session"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}

                {senders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-zinc-400 font-bold">
                      No senders configured yet. Click "Add New Sender" to start!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Sender Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white border border-zinc-200 shadow-xl rounded-xl p-6 relative">
            <button 
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="font-extrabold text-sm text-zinc-800 uppercase tracking-wider mb-2">Configure New Sender</h3>
            <p className="text-xs text-zinc-500 font-medium mb-4">Provide a clear description or name for this WhatsApp gateway account.</p>

            <form onSubmit={handleAddSender} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Sender Description Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Claudio Main Account, Sales Dept"
                  value={newSenderName}
                  onChange={(e) => setNewSenderName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 rounded-lg text-xs text-zinc-950 outline-none font-semibold"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-zinc-700 border border-zinc-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-600/10 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isCreating ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create Sender
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Scan Modal */}
      {activeQrSender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-white border border-zinc-200 shadow-2xl rounded-2xl p-6 relative flex flex-col items-center">
            <button 
              onClick={() => setActiveQrSender(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <Smartphone className="h-8 w-8 text-emerald-600 mb-2" />
            <h3 className="font-extrabold text-sm text-zinc-800 uppercase tracking-wider text-center">{activeQrSender.name} Connection</h3>
            <p className="text-xs text-zinc-500 font-medium text-center mb-5">Link your WhatsApp device by scanning the QR code below.</p>

            {/* Connection States */}
            {activeQrSender.status === 'connected' ? (
              <div className="py-8 flex flex-col items-center space-y-3.5">
                <div className="h-14 w-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center animate-bounce">
                  <CheckCircle className="h-8 w-8" />
                </div>
                <p className="text-xs font-extrabold text-emerald-600 uppercase tracking-wider">Device Linked Successfully!</p>
              </div>
            ) : activeQrSender.status === 'qr' && activeQrSender.qr_code ? (
              <div className="space-y-4 flex flex-col items-center">
                <div className="p-3.5 bg-white rounded-xl shadow-md border border-zinc-150 transition-all duration-200">
                  <img 
                    src={activeQrSender.qr_code} 
                    alt="WhatsApp QR Code" 
                    className="h-48 w-48 object-contain select-none"
                  />
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed text-center px-4 font-semibold">
                  Open WhatsApp on your phone &rarr; Linked Devices &rarr; Scan QR Code.
                </p>
              </div>
            ) : (
              <div className="py-10 flex flex-col items-center space-y-3">
                <Loader className="h-8 w-8 text-emerald-600 animate-spin" />
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider animate-pulse">
                  {activeQrSender.status === 'connecting' ? 'Contacting Gateway...' : 'Booting WhatsApp...'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Senders;
