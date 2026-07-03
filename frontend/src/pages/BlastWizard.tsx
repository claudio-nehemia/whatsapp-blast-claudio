import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useLanguage } from '../hooks/useLanguage';
import { 
  Send, 
  ChevronRight, 
  ChevronLeft, 
  FileText, 
  Users, 
  CheckSquare, 
  Info,
  Calendar,
  AlertCircle,
  Clock,
  X,
  Loader
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  contact_count: number;
}

interface Template {
  id: string;
  name: string;
  body: string;
  image_path: string | null;
  campaign_ids?: string[];
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  campaign_id: string;
}

interface SystemSettings {
  min_delay: number;
  max_delay: number;
}

interface Sender {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
}

const BlastWizard: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  
  // Data Options
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({ min_delay: 5, max_delay: 10 });
  const [senders, setSenders] = useState<Sender[]>([]);

  // Form Selections
  const [blastName, setBlastName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState('');
  
  // Managing campaign contacts modal state
  const [managingCampaignId, setManagingCampaignId] = useState<string | null>(null);
  const [modalContacts, setModalContacts] = useState<Contact[]>([]);
  const [isModalLoading, setIsModalLoading] = useState(false);
  
  // Recipient checkboxes
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch initial choices
  useEffect(() => {
    const loadWizardData = async () => {
      try {
        setIsLoading(true);
        const [cRes, tRes, sRes, sendersRes] = await Promise.all([
          api.get<Campaign[]>('/api/campaigns'),
          api.get<Template[]>('/api/templates'),
          api.get<SystemSettings>('/api/settings'),
          api.get<Sender[]>('/api/senders')
        ]);

        setCampaigns(cRes.data);
        setTemplates(tRes.data);
        setSettings(sRes.data);
        setSenders(sendersRes.data);

        const connectedSenders = sendersRes.data.filter(s => s.status === 'connected');
        if (connectedSenders.length > 0) {
          setSelectedSenderId(connectedSenders[0].id);
        }

        if (tRes.data.length > 0) {
          const defaultTemp = tRes.data[0];
          setSelectedTemplateId(defaultTemp.id);
          if (defaultTemp.campaign_ids && defaultTemp.campaign_ids.length > 0) {
            setSelectedCampaignIds(defaultTemp.campaign_ids);
          } else if (cRes.data.length > 0) {
            setSelectedCampaignIds([cRes.data[0].id]);
          }
        } else if (cRes.data.length > 0) {
          setSelectedCampaignIds([cRes.data[0].id]);
        }
      } catch (err) {
        console.error('Failed to load wizard inputs', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadWizardData();
  }, []);

  // Fetch contacts when campaigns selection changes, preserving selections
  useEffect(() => {
    const fetchCampaignsContacts = async () => {
      if (selectedCampaignIds.length === 0) {
        setContacts([]);
        setSelectedContactIds([]);
        return;
      }
      try {
        const promises = selectedCampaignIds.map(cid =>
          api.get<Contact[]>('/api/contacts', { params: { campaign_id: cid } })
        );
        const responses = await Promise.all(promises);
        const allContacts = responses.flatMap(res => res.data);
        
        // Remove duplicates by ID
        const uniqueContactsMap: Record<string, Contact> = {};
        allContacts.forEach(c => {
          uniqueContactsMap[c.id] = c;
        });
        const uniqueContacts = Object.values(uniqueContactsMap);
        
        setContacts(uniqueContacts);

        // Preserve previous selections and auto-select any newly added contacts
        setSelectedContactIds(prevSelected => {
          const newContactIds = new Set(uniqueContacts.map(c => c.id));
          const oldContactIds = new Set(contacts.map(c => c.id));
          
          // Filter previous selections to only keep those still valid in new contacts
          const keptSelections = prevSelected.filter(id => newContactIds.has(id));
          
          // Find contacts that are newly added in this load
          const newlyAddedIds = uniqueContacts
            .filter(c => !oldContactIds.has(c.id))
            .map(c => c.id);
            
          return [...keptSelections, ...newlyAddedIds];
        });
      } catch (err) {
        console.error('Failed to load contacts for campaigns', err);
      }
    };
    fetchCampaignsContacts();
  }, [selectedCampaignIds]);

  const handleManageCampaign = async (campaignId: string) => {
    // Automatically select the campaign if not checked
    if (!selectedCampaignIds.includes(campaignId)) {
      setSelectedCampaignIds([...selectedCampaignIds, campaignId]);
    }
    
    setManagingCampaignId(campaignId);
    setIsModalLoading(true);
    try {
      const res = await api.get<Contact[]>('/api/contacts', { params: { campaign_id: campaignId } });
      setModalContacts(res.data);
    } catch (err) {
      console.error('Failed to load contacts for campaign management', err);
    } finally {
      setIsModalLoading(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const temp = templates.find(t => t.id === templateId);
    if (temp && temp.campaign_ids && temp.campaign_ids.length > 0) {
      setSelectedCampaignIds(temp.campaign_ids);
    }
  };

  const handleNext = () => {
    setError('');
    if (step === 1) {
      if (!blastName.trim()) {
        setError('Please name this blast campaign');
        return;
      }
      if (!selectedSenderId) {
        setError('Please select a connected WhatsApp sender account');
        return;
      }
    }
    if (step === 2 && !selectedTemplateId) {
      setError('Please select a message template');
      return;
    }
    if (step === 3 && selectedCampaignIds.length === 0) {
      setError('Please select at least 1 campaign group');
      return;
    }
    if (step === 4 && selectedContactIds.length === 0) {
      setError('Please select at least 1 recipient');
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setError('');
    setStep(step - 1);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContactIds(filteredContacts.map(c => c.id));
    } else {
      setSelectedContactIds([]);
    }
  };

  const handleCheckboxChange = (contactId: string, checked: boolean) => {
    if (checked) {
      setSelectedContactIds([...selectedContactIds, contactId]);
    } else {
      setSelectedContactIds(selectedContactIds.filter(id => id !== contactId));
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');
    
    const excludedContactIds = contacts
      .map(c => c.id)
      .filter(id => !selectedContactIds.includes(id));

    const payload = {
      name: blastName.trim(),
      template_id: selectedTemplateId,
      campaign_ids: selectedCampaignIds,
      sender_id: selectedSenderId,
      excluded_contact_ids: excludedContactIds
    };

    try {
      const res = await api.post('/api/blasts', payload);
      const newBlastId = res.data.id;
      navigate(`/blast/progress/${newBlastId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate blast operation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(recipientSearch.toLowerCase()) ||
    c.phone.includes(recipientSearch)
  );

  const getEstimatedDuration = () => {
    const avgDelay = (settings.min_delay + settings.max_delay) / 2;
    const totalSec = selectedContactIds.length * avgDelay;
    const totalMin = Math.round(totalSec / 60);
    return totalMin === 0 ? 'Under 1 minute' : `${totalMin} Minutes`;
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const selectedCampaignNames = selectedCampaignIds
    .map(id => campaigns.find(c => c.id === id)?.name)
    .filter(Boolean)
    .join(', ');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="h-8 w-8 rounded-full border-2 border-zinc-200 border-t-emerald-600 animate-spin"></div>
      </div>
    );
  }

  const connectedSenders = senders.filter(s => s.status === 'connected');
  const hasConnectedSenders = connectedSenders.length > 0;

  if (!hasConnectedSenders) {
    return (
      <div className="p-8 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl max-w-xl mx-auto text-center space-y-4 select-none">
        <AlertCircle className="h-10 w-10 mx-auto animate-bounce text-amber-600" />
        <h3 className="font-extrabold text-base">No Connected WhatsApp Senders</h3>
        <p className="text-xs text-zinc-600 leading-relaxed font-semibold">
          You don't have any connected WhatsApp senders. Starting a new blast requires at least one active WhatsApp connection. Please go to WhatsApp Senders page to link your accounts.
        </p>
        <button
          onClick={() => navigate('/senders')}
          className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-sm font-bold"
        >
          Go to WhatsApp Senders
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-8 max-w-3xl mx-auto shadow-xl select-none">
      {/* Step Indicators */}
      <div className="flex items-center justify-between mb-8 border-b border-zinc-100 pb-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step === i 
                ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' 
                : step > i 
                  ? 'bg-slate-200 text-zinc-800 font-bold' 
                  : 'bg-slate-50 border border-zinc-200 text-zinc-400'
            }`}>
              {i}
            </div>
            {i < 5 && <ChevronRight className="h-3.5 w-3.5 text-zinc-400 hidden sm:block" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-bold text-center">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="min-h-[220px]">
        {/* Step 1: Blast Name */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-emerald-600" />
              <h2 className="text-sm font-extrabold text-zinc-800 uppercase tracking-wider">{t('step_1')}</h2>
            </div>
            <p className="text-xs text-zinc-500 font-medium">Name this blast activity and select your sender gateway.</p>
            
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Activity Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Retreat Invitation Part 1"
                  value={blastName}
                  onChange={(e) => setBlastName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 rounded-lg text-xs text-zinc-950 placeholder-zinc-400 transition-all outline-none font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">WhatsApp Sender Account</label>
                <select
                  value={selectedSenderId}
                  onChange={(e) => setSelectedSenderId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 rounded-lg text-xs text-zinc-950 transition-all outline-none font-semibold cursor-pointer"
                >
                  <option value="">-- Select Sender --</option>
                  {connectedSenders.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.phone_number ? `+${s.phone_number}` : 'Unknown number'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Select Template */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-emerald-600" />
              <h2 className="text-sm font-extrabold text-zinc-800 uppercase tracking-wider">{t('step_2')}</h2>
            </div>
            <p className="text-xs text-zinc-500 font-medium">Select the formatted message design to deploy.</p>
            
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Template Preset</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 focus:border-emerald-600 rounded-lg text-xs text-zinc-950 transition-all outline-none font-medium"
                >
                  <option value="">-- Choose Template --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {selectedTemplate && (
                <div className="bg-slate-50 border border-zinc-200 rounded-xl p-4">
                  <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-bold block mb-2">Preset Preview</span>
                  <p className="text-[11px] text-zinc-700 whitespace-pre-line leading-relaxed font-semibold">{selectedTemplate.body}</p>
                  {selectedTemplate.image_path && (
                    <span className="text-[9px] text-emerald-600 font-bold font-mono block mt-3">🖼️ Attachment: {selectedTemplate.image_path}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Select Campaign */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-emerald-600" />
              <h2 className="text-sm font-extrabold text-zinc-800 uppercase tracking-wider">{t('step_3')}</h2>
            </div>
            <p className="text-xs text-zinc-500 font-medium">Select the excel campaign cohorts that contain the target recipient lists.</p>
            
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Campaign Cohorts (Select Multiple)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 border border-zinc-200 rounded-lg p-4 bg-slate-50/50 max-h-60 overflow-y-auto">
                  {campaigns.map(c => {
                    const checked = selectedCampaignIds.includes(c.id);
                    return (
                      <div key={c.id} className="flex items-center justify-between p-2 hover:bg-slate-100/50 rounded-lg transition-colors group">
                        <label className="flex items-center gap-2.5 text-xs font-semibold text-zinc-700 cursor-pointer select-none overflow-hidden flex-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              if (checked) {
                                setSelectedCampaignIds(selectedCampaignIds.filter(id => id !== c.id));
                              } else {
                                setSelectedCampaignIds([...selectedCampaignIds, c.id]);
                              }
                            }}
                            className="rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300 h-4 w-4"
                          />
                          <span className="truncate" title={`${c.name} (${c.contact_count} contacts)`}>
                            {c.name} ({c.contact_count} contacts)
                          </span>
                        </label>
                        
                        <button
                          type="button"
                          onClick={() => handleManageCampaign(c.id)}
                          className="px-2.5 py-1 text-[10px] font-extrabold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-100 rounded transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          Manage
                        </button>
                      </div>
                    );
                  })}
                  {campaigns.length === 0 && (
                    <span className="text-[10px] text-zinc-400 font-bold col-span-2">No campaigns available. Upload an Excel sheet first.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Configure Recipients list */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckSquare className="h-5 w-5 text-emerald-600" />
              <h2 className="text-sm font-extrabold text-zinc-800 uppercase tracking-wider">{t('step_4')}</h2>
            </div>
            <p className="text-xs text-zinc-500 font-medium">Check/uncheck recipients to include or exclude them from this blast campaign.</p>
            
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <input
                type="text"
                placeholder="Search name/phone..."
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                className="w-full sm:max-w-xs px-3.5 py-2 bg-white border border-zinc-200 focus:border-emerald-600 rounded-lg text-xs text-zinc-950 placeholder-zinc-400 outline-none font-medium"
              />
              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                Selected: {selectedContactIds.length} / {contacts.length}
              </div>
            </div>

            {/* Contacts selector list */}
            <div className="border border-zinc-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-zinc-200 text-zinc-500 font-bold uppercase tracking-wider">
                    <th className="p-3 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={selectedContactIds.length === filteredContacts.length && filteredContacts.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600 accent-emerald-600 cursor-pointer"
                      />
                    </th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredContacts.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/50 text-zinc-700">
                      <td className="p-3 text-center">
                        <input
                           type="checkbox"
                           checked={selectedContactIds.includes(c.id)}
                           onChange={(e) => handleCheckboxChange(c.id, e.target.checked)}
                           className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600 accent-emerald-600 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 font-bold text-zinc-800">{c.name}</td>
                      <td className="p-3 font-mono text-zinc-600">{c.phone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 5: Summary Review */}
        {step === 5 && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-emerald-600" />
              <h2 className="text-sm font-extrabold text-zinc-800 uppercase tracking-wider">{t('step_5')}</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 border border-zinc-200 rounded-xl space-y-1">
                <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-bold">Activity Name</span>
                <p className="text-xs font-bold text-zinc-800">{blastName}</p>
              </div>

              <div className="p-4 bg-slate-50 border border-zinc-200 rounded-xl space-y-1">
                <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-bold">WhatsApp Sender</span>
                <p className="text-xs font-bold text-zinc-800">
                  {senders.find(s => s.id === selectedSenderId)?.name || 'None selected'}
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-zinc-200 rounded-xl space-y-1">
                <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-bold">Template Selected</span>
                <p className="text-xs font-bold text-zinc-800">{selectedTemplate?.name}</p>
              </div>

              <div className="p-4 bg-slate-50 border border-zinc-200 rounded-xl space-y-1">
                <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-bold">Target Campaigns</span>
                <p className="text-xs font-bold text-zinc-800 truncate" title={selectedCampaignNames}>{selectedCampaignNames || 'None selected'}</p>
              </div>

              <div className="p-4 bg-slate-50 border border-zinc-200 rounded-xl space-y-1 md:col-span-2">
                <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-bold">Total Recipients</span>
                <p className="text-xs font-extrabold text-emerald-600">{selectedContactIds.length} Recipients</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-slate-50 border border-zinc-200 rounded-xl text-zinc-600 text-xs font-medium">
              <Clock className="h-4.5 w-4.5 text-zinc-400" />
              <p>
                Estimated sending time: <strong className="text-zinc-800">{getEstimatedDuration()}</strong> (simulating random delay of {settings.min_delay}-{settings.max_delay}s per message).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between border-t border-zinc-200 pt-5 mt-8">
        {step > 1 ? (
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-zinc-800 font-bold rounded-lg text-xs transition-all cursor-pointer"
          >
            <ChevronLeft className="h-4.5 w-4.5" />
            {t('prev')}
          </button>
        ) : (
          <div></div> // Spacer
        )}

        {step < 5 ? (
          <button
            type="button"
            onClick={handleNext}
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-lg text-xs transition-all cursor-pointer shadow-md"
          >
            {t('next')}
            <ChevronRight className="h-4.5 w-4.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-extrabold rounded-lg text-xs transition-all cursor-pointer shadow-md shadow-emerald-600/10 disabled:opacity-50"
          >
            {isSubmitting ? 'Deploying Blast...' : t('finish')}
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* Manage Campaign Contacts Modal */}
      {managingCampaignId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-zinc-200 shadow-2xl rounded-2xl p-6 relative flex flex-col max-h-[80vh]">
            <button 
              type="button"
              onClick={() => setManagingCampaignId(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <h3 className="font-extrabold text-sm text-zinc-800 uppercase tracking-wider mb-1">
              Manage Campaign Contacts
            </h3>
            <p className="text-xs text-zinc-500 font-medium mb-4">
              Select which contacts from **{campaigns.find(c => c.id === managingCampaignId)?.name}** to include in this blast.
            </p>

            {isModalLoading ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <Loader className="h-7 w-7 text-emerald-600 animate-spin" />
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 space-y-4">
                {/* Search / Stats */}
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                    Selected in campaign: {modalContacts.filter(c => selectedContactIds.includes(c.id)).length} / {modalContacts.length}
                  </span>
                </div>

                {/* Table */}
                <div className="flex-1 border border-zinc-200 rounded-xl overflow-hidden overflow-y-auto max-h-96">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-zinc-200 text-zinc-500 font-bold uppercase tracking-wider sticky top-0 z-10">
                        <th className="p-3 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={modalContacts.length > 0 && modalContacts.every(c => selectedContactIds.includes(c.id))}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSelectedContactIds(prev => {
                                const modalIds = modalContacts.map(c => c.id);
                                if (checked) {
                                  // Add all modal contacts
                                  const toAdd = modalIds.filter(id => !prev.includes(id));
                                  return [...prev, ...toAdd];
                                } else {
                                  // Remove all modal contacts
                                  return prev.filter(id => !modalIds.includes(id));
                                }
                              });
                            }}
                            className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                          />
                        </th>
                        <th className="p-3">Name</th>
                        <th className="p-3">Phone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {modalContacts.map(c => {
                        const isSelected = selectedContactIds.includes(c.id);
                        return (
                          <tr key={c.id} className="hover:bg-slate-50/50 text-zinc-700">
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setSelectedContactIds(prev => {
                                    if (checked) {
                                      return [...prev, c.id];
                                    } else {
                                      return prev.filter(id => id !== c.id);
                                    }
                                  });
                                }}
                                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                              />
                            </td>
                            <td className="p-3 font-bold text-zinc-800">{c.name}</td>
                            <td className="p-3 font-mono text-zinc-600">{c.phone}</td>
                          </tr>
                        );
                      })}
                      {modalContacts.length === 0 && (
                        <tr>
                          <td colSpan={3} className="p-6 text-center text-zinc-400 font-bold">
                            No contacts in this campaign.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setManagingCampaignId(null)}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/10 cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BlastWizard;
