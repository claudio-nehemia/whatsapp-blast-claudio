import React, { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import { useLanguage } from '../hooks/useLanguage';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Edit3, 
  Image as ImageIcon,
  HelpCircle,
  ArrowLeft,
  Save,
  Smile,
  Loader
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  headers: string[];
}

interface Template {
  id: string;
  name: string;
  body: string;
  image_path: string | null;
  campaign_ids: string[];
  created_at: string;
}

const Templates: React.FC = () => {
  const { t } = useLanguage();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  
  // Editor State
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [bodyInput, setBodyInput] = useState('');
  const [imagePathInput, setImagePathInput] = useState('');
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  
  const getBaseCampaignName = (name: string) => {
    const index = name.indexOf(' - ');
    if (index !== -1) {
      return name.substring(0, index);
    }
    return name;
  };

  const [selectedPlaceholderBaseName, setSelectedPlaceholderBaseName] = useState<string>('');
  const [editorError, setEditorError] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchTemplates = async () => {
    try {
      const res = await api.get<Template[]>('/api/templates');
      setTemplates(res.data);
    } catch (err) {
      console.error('Failed to fetch templates', err);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const res = await api.get<Campaign[]>('/api/campaigns');
      setCampaigns(res.data);
      if (res.data.length > 0) {
        const firstBaseName = getBaseCampaignName(res.data[0].name);
        setSelectedPlaceholderBaseName(firstBaseName);
      }
    } catch (err) {
      console.error('Failed to fetch campaigns', err);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setEditorError('Image size exceeds 5MB limit');
      return;
    }

    setIsUploadingImage(true);
    setEditorError('');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await api.post<{ filePath: string }>('/api/templates/upload-image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setImagePathInput(res.data.filePath);
    } catch (err: any) {
      console.error('Failed to upload template image', err);
      setEditorError(err.response?.data || 'Failed to upload image. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchCampaigns();
  }, []);

  const handleEditClick = (template: Template) => {
    setEditId(template.id);
    setNameInput(template.name);
    setBodyInput(template.body);
    setImagePathInput(template.image_path || '');
    setSelectedCampaignIds(template.campaign_ids || []);
    setIsEditing(true);
    setEditorError('');
  };

  const handleCreateClick = () => {
    setEditId(null);
    setNameInput('');
    setBodyInput('');
    setImagePathInput('');
    setSelectedCampaignIds([]);
    setIsEditing(true);
    setEditorError('');
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete template "${name}"?`)) {
      return;
    }
    try {
      await api.delete(`/api/templates/${id}`);
      fetchTemplates();
    } catch (err) {
      console.error('Failed to delete template', err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) {
      setEditorError('Template Name is required');
      return;
    }
    if (!bodyInput.trim()) {
      setEditorError('Message body content is required');
      return;
    }

    const payload = {
      name: nameInput.trim(),
      body: bodyInput,
      image_path: imagePathInput.trim() || null,
      campaign_ids: selectedCampaignIds
    };

    try {
      if (editId) {
        await api.put(`/api/templates/${editId}`, payload);
      } else {
        await api.post('/api/templates', payload);
      }
      setIsEditing(false);
      fetchTemplates();
    } catch (err: any) {
      setEditorError(err.response?.data?.error || 'Failed to save template');
    }
  };

  const injectPlaceholder = (placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = bodyInput;
    const injected = `{{${placeholder}}}`;
    
    const updated = val.substring(0, start) + injected + val.substring(end);
    setBodyInput(updated);
    
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + injected.length;
    }, 0);
  };

  const getPlaceholders = () => {
    const defaultPlaceholders = ['name', 'phone'];
    if (!selectedPlaceholderBaseName) return defaultPlaceholders;

    const matchedCampaigns = campaigns.filter(c => getBaseCampaignName(c.name) === selectedPlaceholderBaseName);
    const allHeaders = new Set<string>();
    matchedCampaigns.forEach(c => {
      c.headers.forEach(h => {
        const cleaned = h.toLowerCase().trim();
        if (cleaned !== 'name' && cleaned !== 'phone' && cleaned !== 'wa' && cleaned !== 'nomor_wa') {
          allHeaders.add(h);
        }
      });
    });

    return [...defaultPlaceholders, ...Array.from(allHeaders)];
  };

  const getPreview = (body: string) => {
    let preview = body.slice(0, 100);
    if (body.length > 100) preview += '...';
    return preview;
  };

  return (
    <div className="space-y-6 select-none">
      {isEditing ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsEditing(false)}
              className="flex items-center gap-2 text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer text-xs font-bold"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to templates
            </button>
            <h1 className="text-sm font-extrabold text-zinc-800 tracking-tight">
              {editId ? 'Edit Message Template' : t('new_template')}
            </h1>
          </div>

          {editorError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-bold text-center">
              {editorError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Editor Area */}
            <form onSubmit={handleSave} className="lg:col-span-2 bg-white border border-zinc-200 shadow-sm rounded-xl p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('template_name')}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Retreat Invitation"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 rounded-lg text-xs text-zinc-950 placeholder-zinc-400 transition-all outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('message_body')}</label>
                  <span className="text-[9px] text-zinc-400 font-bold">{t('click_to_insert')}</span>
                </div>
                <textarea
                  ref={textareaRef}
                  required
                  rows={8}
                  placeholder="Halo {{name}}, we invite you to..."
                  value={bodyInput}
                  onChange={(e) => setBodyInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 rounded-lg text-xs text-zinc-950 placeholder-zinc-400 transition-all outline-none resize-none font-sans leading-relaxed"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  <ImageIcon className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Image Attachment (Optional)</span>
                </div>
                
                {imagePathInput ? (
                  <div className="p-4 border border-zinc-200 rounded-xl bg-slate-50/50 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="h-12 w-12 rounded-lg border border-zinc-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                        <ImageIcon className="h-6 w-6 text-emerald-600" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-bold text-zinc-800 truncate">Image Attached</p>
                        <p className="text-[10px] text-zinc-500 font-mono truncate" title={imagePathInput}>
                          {imagePathInput.split(/[/\\]/).pop()}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImagePathInput('')}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100/60 text-red-600 border border-red-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="relative border-2 border-dashed border-zinc-200 hover:border-emerald-500 rounded-xl p-6 bg-white hover:bg-slate-50/50 transition-all flex flex-col items-center justify-center text-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={isUploadingImage}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    {isUploadingImage ? (
                      <div className="flex flex-col items-center space-y-2">
                        <Loader className="h-6 w-6 text-emerald-600 animate-spin" />
                        <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider animate-pulse">Uploading Image...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center space-y-1">
                        <Plus className="h-5 w-5 text-zinc-400 mb-1" />
                        <p className="text-xs font-bold text-zinc-700">Choose Image File</p>
                        <p className="text-[10px] text-zinc-400 font-medium">PNG, JPG, JPEG up to 5MB</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Default Linked Campaigns (Select Multiple)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-zinc-200 rounded-lg p-3 max-h-[120px] overflow-y-auto bg-slate-50/50">
                  {campaigns.map(c => {
                    const checked = selectedCampaignIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer select-none">
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
                          className="rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300"
                        />
                        <span className="truncate">{c.name}</span>
                      </label>
                    );
                  })}
                  {campaigns.length === 0 && (
                    <span className="col-span-2 text-[10px] text-zinc-400 font-bold">No campaigns available. Upload an Excel sheet first.</span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-lg text-xs transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center gap-2 cursor-pointer mt-6"
              >
                <Save className="h-3.5 w-3.5" />
                {t('save_template')}
              </button>
            </form>

            {/* Sidebar Placeholders */}
            <div className="lg:col-span-1 bg-white border border-zinc-200 shadow-sm rounded-xl p-5 space-y-4">
              <h3 className="font-bold text-xs text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <Smile className="h-4 w-4 text-emerald-600" />
                {t('variables')}
              </h3>
              
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Inspect Campaign Data Pool</label>
                <select
                  value={selectedPlaceholderBaseName}
                  onChange={(e) => setSelectedPlaceholderBaseName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 focus:border-emerald-600 rounded-lg text-xs text-zinc-950 transition-all outline-none font-bold"
                >
                  {Array.from(new Set(campaigns.map(c => getBaseCampaignName(c.name)))).map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Available Tokens</label>
                <div className="flex flex-wrap gap-2">
                  {getPlaceholders().map(ph => (
                    <button
                      key={ph}
                      type="button"
                      onClick={() => injectPlaceholder(ph)}
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 text-[10px] font-bold font-mono text-emerald-700 rounded-md transition-all hover:scale-105 cursor-pointer"
                    >
                      {`{{${ph}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <h4 className="text-[10px] font-bold text-zinc-800 flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-zinc-400" />
                  Template Guidelines
                </h4>
                <ul className="text-[10px] text-zinc-500 space-y-1 list-disc pl-4 leading-relaxed font-semibold">
                  <li>Placeholders are case-sensitive and match headers dynamically.</li>
                  <li>If an Excel column is added to the campaign, it will automatically show up as a token above.</li>
                  <li>WhatsApp markdown formatting like *bold*, _italics_, and ~strikethrough~ are supported.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Template List Screen */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-extrabold text-zinc-800 tracking-tight">{t('templates_list')}</h1>
              <p className="text-xs text-zinc-500 mt-1">Manage reusable layout presets</p>
            </div>
            <button
              onClick={handleCreateClick}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-lg text-xs transition-all shadow-md cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('new_template')}
            </button>
          </div>

          {templates.length === 0 ? (
            <div className="text-center py-20 bg-white border border-zinc-200 shadow-sm rounded-2xl">
              <FileText className="h-12 w-12 text-zinc-300 mx-auto mb-4" />
              <p className="text-sm font-bold text-zinc-500">No templates found</p>
              <p className="text-xs text-zinc-400 mt-1 mb-6">Create a message template format to get started.</p>
              <button
                onClick={handleCreateClick}
                className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg text-xs hover:bg-emerald-700 transition-colors cursor-pointer"
              >
                {t('new_template')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map((temp) => (
                <div key={temp.id} className="bg-white border border-zinc-200 hover:border-emerald-600/30 rounded-xl p-5 flex flex-col justify-between transition-all duration-200 shadow-sm relative group overflow-hidden">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-bold text-sm text-zinc-800 truncate">{temp.name}</h3>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditClick(temp)}
                          className="hover:bg-slate-100 text-zinc-400 hover:text-zinc-800 p-1.5 rounded-md transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(temp.id, temp.name)}
                          className="hover:bg-red-50 text-zinc-400 hover:text-red-600 p-1.5 rounded-md transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="bg-slate-50/50 border border-slate-100 rounded-lg p-3 min-h-[90px]">
                      <p className="text-[11px] text-zinc-600 font-sans leading-relaxed whitespace-pre-line font-medium">
                        {getPreview(temp.body)}
                      </p>
                    </div>

                    {temp.campaign_ids && temp.campaign_ids.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {temp.campaign_ids.map(cid => {
                          const c = campaigns.find(camp => camp.id === cid);
                          if (!c) return null;
                          return (
                            <span key={cid} className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-md text-[8px] font-extrabold tracking-tight">
                              {c.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-zinc-100 pt-4 mt-5 flex items-center justify-between text-[9px] text-zinc-400">
                    <span className="font-bold text-zinc-500">
                      {temp.image_path ? '🖼️ With image attachment' : '📝 Text only'}
                    </span>
                    <span className="font-medium">Created {new Date(temp.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Templates;
