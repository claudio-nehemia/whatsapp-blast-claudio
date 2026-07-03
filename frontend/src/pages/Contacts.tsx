import React, { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import { useLanguage } from '../hooks/useLanguage';
import { 
  Upload, 
  Trash2, 
  Search, 
  FileSpreadsheet,
  X,
  Database,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  headers: string[];
  contact_count: number;
  created_at: string;
}

interface Contact {
  id: string;
  campaign_id: string;
  campaign_name: string;
  phone: string;
  name: string;
  dynamic_fields: Record<string, string>;
  created_at: string;
}

const Contacts: React.FC = () => {
  const { t } = useLanguage();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [campaignNameInput, setCampaignNameInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCampaigns = async () => {
    try {
      const res = await api.get<Campaign[]>('/api/campaigns');
      setCampaigns(res.data);
    } catch (err) {
      console.error('Failed to fetch campaigns', err);
    }
  };

  const fetchContacts = async () => {
    try {
      const res = await api.get<Contact[]>('/api/contacts', {
        params: {
          campaign_id: selectedCampaignId,
          search: searchQuery
        }
      });
      setContacts(res.data);
    } catch (err) {
      console.error('Failed to fetch contacts', err);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [selectedCampaignId, searchQuery]);

  // Reset to page 1 when campaign or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCampaignId, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(contacts.length / ITEMS_PER_PAGE));
  const paginatedContacts = contacts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignNameInput.trim()) {
      setUploadError('Campaign name is required');
      return;
    }
    if (!selectedFile) {
      setUploadError('Please select an Excel file');
      return;
    }

    setUploadError('');
    setIsUploading(true);

    const formData = new FormData();
    formData.append('campaign_name', campaignNameInput.trim());
    formData.append('file', selectedFile);

    try {
      await api.post('/api/contacts/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Accept': 'application/json',
        },
      });
      
      setCampaignNameInput('');
      setSelectedFile(null);
      setIsModalOpen(false);
      fetchCampaigns();
      setSelectedCampaignId('all');
    } catch (err: any) {
      setUploadError(err.response?.data?.error || 'Failed to upload Excel file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteCampaign = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete campaign "${name}"? This will delete all its contacts.`)) {
      return;
    }
    try {
      await api.delete(`/api/campaigns/${id}`);
      fetchCampaigns();
      if (selectedCampaignId === id) {
        setSelectedCampaignId('all');
      } else {
        fetchContacts();
      }
    } catch (err) {
      console.error('Failed to delete campaign', err);
    }
  };

  const getTableHeaders = () => {
    if (selectedCampaignId === 'all') {
      return ['Campaign', 'Name', 'Phone', 'Details'];
    }
    const current = campaigns.find(c => c.id === selectedCampaignId);
    if (!current || current.headers.length === 0) return ['Name', 'Phone'];
    
    // Show ALL columns from the campaign as-is
    return current.headers.map(f => f.replaceAll('_', ' ').toUpperCase());
  };

  return (
    <div className="space-y-6 select-none relative">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-800 tracking-tight">{t('contacts')}</h1>
          <p className="text-xs text-zinc-500 mt-1">Upload and manage groups of recipients</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-lg text-xs transition-all shadow-md cursor-pointer"
        >
          <Upload className="h-3.5 w-3.5" />
          {t('add_campaign')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Side: Campaigns list */}
        <div className="lg:col-span-1 bg-white border border-zinc-200 shadow-sm rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-xs text-zinc-500 uppercase tracking-wider flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-emerald-600" />
            {t('campaigns')}
          </h3>
          
          <div className="space-y-1">
            <button
              onClick={() => setSelectedCampaignId('all')}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedCampaignId === 'all' 
                  ? 'bg-slate-100 text-zinc-950 border-l-2 border-emerald-600' 
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-slate-50'
              }`}
            >
              {t('all_contacts')} ({campaigns.reduce((acc, c) => acc + c.contact_count, 0)})
            </button>
            {campaigns.map((camp) => (
              <div 
                key={camp.id} 
                className={`group flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-all ${
                  selectedCampaignId === camp.id 
                    ? 'bg-slate-100 text-zinc-950 border-l-2 border-emerald-600' 
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-slate-50'
                }`}
              >
                <button
                  onClick={() => setSelectedCampaignId(camp.id)}
                  className="flex-1 text-left font-bold truncate pr-2 py-0.5 cursor-pointer"
                >
                  {camp.name} ({camp.contact_count})
                </button>
                <button
                  onClick={() => handleDeleteCampaign(camp.id, camp.name)}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-600 text-zinc-400 transition-opacity p-1 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Contacts Table */}
        <div className="lg:col-span-3 bg-white border border-zinc-200 shadow-sm rounded-xl p-6 space-y-6 flex flex-col">
          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder={t('search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 rounded-lg text-xs text-zinc-950 placeholder-zinc-400 transition-all outline-none"
              />
            </div>
            <div className="text-[10px] text-zinc-400 font-bold">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, contacts.length)} of {contacts.length} recipients
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-zinc-200 rounded-lg">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-zinc-200 text-zinc-500 font-bold uppercase tracking-wider">
                  {getTableHeaders().map((header) => (
                    <th key={header} className="p-3 select-none">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {paginatedContacts.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-zinc-400 font-medium">
                      {t('empty_contacts')}
                    </td>
                  </tr>
                ) : (
                  paginatedContacts.map((contact) => {
                    if (selectedCampaignId === 'all') {
                      const details = Object.entries(contact.dynamic_fields)
                        .filter(([k]) => k !== 'name' && k !== 'phone')
                        .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
                        .join(' | ');
                      
                      return (
                        <tr key={contact.id} className="hover:bg-slate-50/50 text-zinc-700">
                          <td className="p-3 font-bold text-zinc-800 truncate max-w-[120px]">{contact.campaign_name}</td>
                          <td className="p-3 font-medium text-zinc-800">{contact.name}</td>
                          <td className="p-3 font-mono">{contact.phone}</td>
                          <td className="p-3 text-zinc-400 truncate max-w-[200px]" title={details}>
                            {details || '-'}
                          </td>
                        </tr>
                      );
                    } else {
                      const currentCampaign = campaigns.find(c => c.id === selectedCampaignId);
                      const allKeys = currentCampaign ? currentCampaign.headers : [];
                      
                      return (
                        <tr key={contact.id} className="hover:bg-slate-50/50 text-zinc-700">
                          {allKeys.map((key) => (
                            <td key={key} className="p-3 text-zinc-700 truncate max-w-[180px]">
                              {contact.dynamic_fields[key] || '-'}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <div className="text-[10px] text-zinc-400 font-medium">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-md hover:bg-slate-100 text-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {getPageNumbers().map((page, idx) => (
                  typeof page === 'number' ? (
                    <button
                      key={idx}
                      onClick={() => setCurrentPage(page)}
                      className={`min-w-[28px] h-7 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                        currentPage === page
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-zinc-500 hover:bg-slate-100'
                      }`}
                    >
                      {page}
                    </button>
                  ) : (
                    <span key={idx} className="text-zinc-400 text-[10px] px-1">...</span>
                  )
                ))}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-md hover:bg-slate-100 text-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
            <button
              onClick={() => {
                setIsModalOpen(false);
                setSelectedFile(null);
                setUploadError('');
              }}
              className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 transition-colors p-1 cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-zinc-800">Import Contacts Excel</h3>
                <p className="text-[10px] text-zinc-500 mt-0.5 font-medium">Parse sheets automatically using AI</p>
              </div>
            </div>

            {uploadError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-bold text-center">
                {uploadError}
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('campaign_name_label')}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., PMB Gelombang 1"
                  value={campaignNameInput}
                  onChange={(e) => setCampaignNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 rounded-lg text-xs text-zinc-950 placeholder-zinc-400 transition-all outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Select Excel Document</label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-zinc-200 hover:border-zinc-400 rounded-xl p-6 text-center cursor-pointer transition-colors group bg-slate-50/50"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setSelectedFile(file);
                    }}
                  />
                  <Upload className="h-6 w-6 text-zinc-400 group-hover:text-zinc-600 transition-colors mx-auto mb-2" />
                  {selectedFile ? (
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-800 font-bold truncate px-2">{selectedFile.name}</p>
                      <p className="text-[10px] text-zinc-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-zinc-600 font-bold">{t('drop_files')}</p>
                      <p className="text-[10px] text-zinc-400 mt-1 font-medium">{t('only_xlsx')}</p>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isUploading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-lg text-xs transition-all shadow-md disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isUploading ? 'Parsing & Uploading...' : t('add_campaign')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Contacts;
