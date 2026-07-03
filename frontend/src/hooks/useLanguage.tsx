import React, { createContext, useContext, useState } from 'react';

type Language = 'en' | 'id';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Auth
    login: "Log In",
    register: "Register",
    email: "Email Address",
    password: "Password",
    name: "Full Name",
    no_account: "Don't have an account?",
    has_account: "Already have an account?",
    login_btn: "Sign In",
    register_btn: "Create Account",
    
    // Sidebar
    dashboard: "Dashboard",
    contacts: "Contacts",
    templates: "Templates",
    blasts: "WhatsApp Blast",
    settings: "Settings",
    logout: "Log Out",
    
    // Dashboard
    welcome: "Welcome back",
    summary: "Overview",
    total_contacts: "Total Contacts",
    total_blasts: "Total Blasts",
    success_rate: "Success Rate",
    failed_rate: "Failed Rate",
    wa_status: "WhatsApp Status",
    wa_connected: "Connected",
    wa_disconnected: "Disconnected",
    recent_blasts: "Recent Blast Activities",
    no_blasts: "No blast activities recorded.",
    
    // Contacts
    campaigns: "Campaign Groups",
    add_campaign: "Upload Excel",
    campaign_name_label: "Campaign Name",
    upload_success: "Campaign uploaded successfully!",
    all_contacts: "All Contacts",
    search_placeholder: "Search by name or phone...",
    empty_contacts: "No contacts found.",
    drop_files: "Drag & drop your Excel file here, or click to browse",
    only_xlsx: "Only .xlsx and .xls files are supported",
    
    // Templates
    templates_list: "Message Templates",
    new_template: "Create Template",
    template_name: "Template Name",
    message_body: "Message Content",
    save_template: "Save Template",
    variables: "Available Variables",
    click_to_insert: "Click a variable to insert it at cursor position.",
    
    // Settings
    system_settings: "System Configuration",
    whatsapp_connection: "WhatsApp Linkage",
    delay_label: "Delay Between Messages (seconds)",
    min_delay: "Minimum Delay",
    max_delay: "Maximum Delay",
    max_retry: "Max Retries",
    typing_sim: "Simulate Typing Status",
    auto_retry: "Auto-retry on failure",
    save_settings: "Save Configuration",
    scan_qr: "Scan QR Code",
    disconnect_wa: "Disconnect WhatsApp",
    
    // Blast Wizard
    start_blast: "Start New Blast",
    step_1: "Campaign Details",
    step_2: "Select Template",
    step_3: "Target Audience",
    step_4: "Filter Recipients",
    step_5: "Review & Start",
    next: "Next Step",
    prev: "Previous",
    finish: "Launch Blast",
  },
  id: {
    // Auth
    login: "Masuk",
    register: "Daftar",
    email: "Alamat Email",
    password: "Kata Sandi",
    name: "Nama Lengkap",
    no_account: "Belum punya akun?",
    has_account: "Sudah punya akun?",
    login_btn: "Masuk Sekarang",
    register_btn: "Buat Akun Baru",
    
    // Sidebar
    dashboard: "Dasbor",
    contacts: "Kontak",
    templates: "Template Pesan",
    blasts: "WhatsApp Blast",
    settings: "Pengaturan",
    logout: "Keluar",
    
    // Dashboard
    welcome: "Selamat datang kembali",
    summary: "Ringkasan",
    total_contacts: "Total Kontak",
    total_blasts: "Total Blast",
    success_rate: "Tingkat Sukses",
    failed_rate: "Tingkat Gagal",
    wa_status: "Status WhatsApp",
    wa_connected: "Terhubung",
    wa_disconnected: "Terputus",
    recent_blasts: "Aktivitas Pengiriman Terbaru",
    no_blasts: "Belum ada riwayat aktivitas blast.",
    
    // Contacts
    campaigns: "Kelompok Campaign",
    add_campaign: "Unggah Excel",
    campaign_name_label: "Nama Campaign",
    upload_success: "Campaign berhasil diunggah!",
    all_contacts: "Semua Kontak",
    search_placeholder: "Cari berdasarkan nama atau telepon...",
    empty_contacts: "Kontak tidak ditemukan.",
    drop_files: "Seret & lepas file Excel Anda di sini, atau klik untuk memilih",
    only_xlsx: "Hanya mendukung file format .xlsx dan .xls",
    
    // Templates
    templates_list: "Daftar Template",
    new_template: "Buat Template Baru",
    template_name: "Nama Template",
    message_body: "Isi Pesan",
    save_template: "Simpan Template",
    variables: "Variabel Kolom",
    click_to_insert: "Klik variabel untuk menyisipkannya ke posisi kursor.",
    
    // Settings
    system_settings: "Konfigurasi Sistem",
    whatsapp_connection: "Sambungan WhatsApp",
    delay_label: "Jeda Antar Pesan (detik)",
    min_delay: "Jeda Minimum",
    max_delay: "Jeda Maksimum",
    max_retry: "Percobaan Ulang Maksimal",
    typing_sim: "Simulasi Status Mengetik",
    auto_retry: "Coba ulang otomatis jika gagal",
    save_settings: "Simpan Konfigurasi",
    scan_qr: "Pindai Kode QR",
    disconnect_wa: "Putuskan Sambungan WhatsApp",
    
    // Blast Wizard
    start_blast: "Mulai Blast Baru",
    step_1: "Detail Kampanye",
    step_2: "Pilih Template",
    step_3: "Target Kontak",
    step_4: "Saring Penerima",
    step_5: "Tinjau & Kirim",
    next: "Langkah Berikutnya",
    prev: "Sebelumnya",
    finish: "Mulai Pengiriman",
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('lang') as Language) || 'id';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('lang', lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
