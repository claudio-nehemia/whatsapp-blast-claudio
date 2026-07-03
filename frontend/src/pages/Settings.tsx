import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useLanguage } from '../hooks/useLanguage';
import { 
  Sliders,
  Save
} from 'lucide-react';

interface Settings {
  min_delay: number;
  max_delay: number;
  max_retry: number;
  typing_simulation: boolean;
  auto_retry: boolean;
}

const Settings: React.FC = () => {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<Settings>({
    min_delay: 5,
    max_delay: 10,
    max_retry: 3,
    typing_simulation: true,
    auto_retry: true
  });
  
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  const loadData = async () => {
    try {
      setIsLoadingSettings(true);
      const settingsRes = await api.get<Settings>('/api/settings');
      setSettings(settingsRes.data);
    } catch (err) {
      console.error('Failed to load settings data', err);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsMessage('');
    try {
      const res = await api.put<Settings>('/api/settings', settings);
      setSettings(res.data);
      setSettingsMessage('Settings saved successfully!');
      setTimeout(() => setSettingsMessage(''), 3000);
    } catch (err) {
      console.error('Failed to save settings', err);
      setSettingsMessage('Failed to save settings.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="h-8 w-8 rounded-full border-2 border-zinc-200 border-t-emerald-600 animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-none">
      <div>
        <h1 className="text-xl font-extrabold text-zinc-800 tracking-tight">{t('settings')}</h1>
        <p className="text-xs text-zinc-500 mt-1">Adjust WhatsApp gateway delays and configure platform behaviors</p>
      </div>

      <div className="max-w-2xl bg-white border border-zinc-200 shadow-sm rounded-xl p-6 space-y-5">
        <h3 className="font-bold text-xs text-zinc-500 uppercase tracking-wider flex items-center gap-2 mb-2">
          <Sliders className="h-3.5 w-3.5 text-emerald-600" />
          {t('system_settings')}
        </h3>

        {settingsMessage && (
          <div className={`p-3 border rounded-lg text-xs font-bold text-center ${
            settingsMessage.includes('successfully')
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-600'
          }`}>
            {settingsMessage}
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('min_delay')} (Seconds)</label>
              <input
                type="number"
                required
                min={1}
                max={60}
                value={settings.min_delay}
                onChange={(e) => setSettings({ ...settings, min_delay: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 rounded-lg text-xs text-zinc-950 outline-none font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('max_delay')} (Seconds)</label>
              <input
                type="number"
                required
                min={1}
                max={60}
                value={settings.max_delay}
                onChange={(e) => setSettings({ ...settings, max_delay: parseInt(e.target.value) || 1 })}
                className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 rounded-lg text-xs text-zinc-950 outline-none font-medium"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('max_retry')}</label>
            <input
              type="number"
              required
              min={0}
              max={10}
              value={settings.max_retry}
              onChange={(e) => setSettings({ ...settings, max_retry: parseInt(e.target.value) || 0 })}
              className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 rounded-lg text-xs text-zinc-950 outline-none font-medium"
            />
          </div>

          {/* Toggle Switches */}
          <div className="space-y-3.5 pt-2">
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <p className="text-xs font-bold text-zinc-800">{t('typing_sim')}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 font-medium">Show "typing..." status before sending messages</p>
              </div>
              <input
                type="checkbox"
                checked={settings.typing_simulation}
                onChange={(e) => setSettings({ ...settings, typing_simulation: e.target.checked })}
                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600 accent-emerald-600 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <p className="text-xs font-bold text-zinc-800">{t('auto_retry')}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5 font-medium">Attempt re-sending when network dropouts occur</p>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_retry}
                onChange={(e) => setSettings({ ...settings, auto_retry: e.target.checked })}
                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600 accent-emerald-600 cursor-pointer"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSavingSettings}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-lg text-xs transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 font-bold"
          >
            <Save className="h-3.5 w-3.5" />
            {isSavingSettings ? 'Saving...' : t('save_settings')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Settings;
