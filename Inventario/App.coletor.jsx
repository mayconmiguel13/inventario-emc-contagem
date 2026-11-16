import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import './velzon.css';
import './mobile.css';

const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.port === '5173' ? 'http://localhost:5000/api' : '/api');

// Utilitário global de exportação de dados para Excel/CSV com acentuação UTF-8 BOM
export function exportToCsv(filename, headers, rows) {
  if (!rows || rows.length === 0) return;
  const BOM = '\uFEFF';
  const csvContent = [
    headers.map((h) => `"${String(h ?? '').replace(/"/g, '""')}"`).join(';'),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')
    )
  ].join('\r\n');

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmWord, setResetConfirmWord] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [topbarSearchInput, setTopbarSearchInput] = useState('');
  const [contratoInitialFilter, setContratoInitialFilter] = useState({ search: '', status: '' });
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'light');

  // PWA Install & Prompt Control
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showIosInstallModal, setShowIosInstallModal] = useState(false);

  useEffect(() => {
    // Detectar se já está executando como PWA instalado (standalone)
    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
    if (isStandalone) {
      setIsAppInstalled(true);
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIos) {
      setShowIosInstallModal(true);
      return;
    }

    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsAppInstalled(true);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.warn('Erro ao abrir prompt de instalação:', err);
      }
    } else {
      showNotification('info', 'Para instalar, toque nos 3 pontinhos (⋮) ou botão Compartilhar do seu navegador e escolha "Instalar aplicativo" ou "Adicionar à tela inicial".', 'Instalar Aplicativo');
    }
  };

  const handleNav = (tabName, filterObj = null) => {
    if (filterObj) {
      setContratoInitialFilter(filterObj);
    }
    setActiveTab(tabName);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGlobalSearch = (e) => {
    e.preventDefault();
    if (!topbarSearchInput.trim()) return;
    setContratoInitialFilter({ search: topbarSearchInput.trim(), status: '' });
    setActiveTab('contrato');
    setMobileMenuOpen(false);
    setTopbarSearchInput('');
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('app_theme', nextTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-layout', 'vertical');
    document.documentElement.setAttribute('data-layout-mode', theme);
    document.documentElement.setAttribute('data-bs-theme', theme);
    document.documentElement.setAttribute('data-topbar', theme);
    document.documentElement.setAttribute('data-sidebar', theme);
  }, [theme]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/stats`);
      const json = await res.json();
      if (json.success) {
        setStats(json.data);
      }
    } catch (e) {
      console.error('Erro ao carregar stats:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const showNotification = (type, message, customTitle = null) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    const id = Date.now();
    const duration = 3800;
    const normalizedType = type === 'danger' ? 'error' : (type || 'info');
    const defaultTitle =
      normalizedType === 'success' ? 'Sucesso!' :
      normalizedType === 'warning' ? 'Atenção!' :
      normalizedType === 'info' ? 'Informação' : 'Erro!';

    setToast({
      id,
      type: normalizedType,
      message,
      title: customTitle || defaultTitle,
      duration,
      isClosing: false
    });

    toastTimeoutRef.current = setTimeout(() => {
      setToast(prev => (prev && prev.id === id ? { ...prev, isClosing: true } : prev));
      setTimeout(() => {
        setToast(prev => (prev && prev.id === id ? null : prev));
      }, 300);
    }, duration);
  };

  const closeToast = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast(prev => (prev ? { ...prev, isClosing: true } : null));
    setTimeout(() => {
      setToast(null);
    }, 300);
  };

  const handleResetDatabase = async () => {
    setIsResetting(true);
    try {
      const res = await fetch(`${API_BASE}/sistema/reset-conferencias`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showNotification('success', json.message);
        setShowResetModal(false);
        setResetConfirmWord('');
        fetchStats();
      } else {
        showNotification('error', json.message || 'Erro ao resetar banco.');
      }
    } catch (e) {
      showNotification('error', 'Falha ao conectar com o servidor.');
    } finally {
      setIsResetting(false);
    }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  return (
    <div id="layout-wrapper" className={`${sidebarCollapsed ? 'sidebar-enable vertical-collpsed' : ''} ${mobileMenuOpen ? 'vertical-sidebar-enable' : ''}`}>
      {/* MODAL DE AJUDA PARA INSTALAR NO IOS / SAFARI */}
      {showIosInstallModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 1060 }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg border-0" style={{ borderRadius: '16px' }}>
              <div className="modal-header bg-primary text-white py-3">
                <h5 className="modal-title fs-16 fw-bold d-flex align-items-center gap-2">
                  <i className="ri-apple-fill fs-20"></i> Como Instalar no Celular (iPhone / iPad)
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowIosInstallModal(false)}
                  aria-label="Fechar"
                ></button>
              </div>
              <div className="modal-body p-4 text-dark fs-14">
                <p className="text-muted mb-3">
                  Para abrir em tela cheia com a câmera ultra-rápida, instale o aplicativo na sua tela inicial:
                </p>
                <div className="d-flex flex-column gap-3">
                  <div className="d-flex align-items-start gap-3 p-2 rounded bg-light border">
                    <span className="badge bg-primary rounded-circle p-2 fs-12 fw-bold" style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
                    <div>
                      <strong className="d-block text-dark">Toque em Compartilhar</strong>
                      <span className="text-muted fs-12">No Safari, toque no ícone do quadrado com a seta para cima (<i className="ri-share-box-line fs-14"></i>) na barra inferior.</span>
                    </div>
                  </div>
                  <div className="d-flex align-items-start gap-3 p-2 rounded bg-light border">
                    <span className="badge bg-primary rounded-circle p-2 fs-12 fw-bold" style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>2</span>
                    <div>
                      <strong className="d-block text-dark">Adicionar à Tela de Início</strong>
                      <span className="text-muted fs-12">Role a lista para baixo e toque em <strong>"Adicionar à Tela de Início"</strong> (<i className="ri-add-box-line fs-14"></i>).</span>
                    </div>
                  </div>
                  <div className="d-flex align-items-start gap-3 p-2 rounded bg-light border">
                    <span className="badge bg-primary rounded-circle p-2 fs-12 fw-bold" style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3</span>
                    <div>
                      <strong className="d-block text-dark">Confirmar</strong>
                      <span className="text-muted fs-12">Toque em <strong>"Adicionar"</strong> no canto superior direito. O ícone aparecerá direto na tela do seu iPhone!</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer bg-light py-2">
                <button
                  type="button"
                  className="btn btn-primary rounded-pill px-4"
                  onClick={() => setShowIosInstallModal(false)}
                >
                  Entendi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING TOAST NOTIFICATION CONTAINER (AUTO-DISMISS & MODERN GLASSMORPHISM) */}
      <div className="toast-floating-container" aria-live="polite" aria-atomic="true">
        {toast && (
          <div
            key={toast.id}
            className={`toast-glass-card toast-${toast.type} ${toast.isClosing ? 'toast-closing' : ''}`}
            role="alert"
          >
            <div className="toast-icon-wrapper">
              {toast.type === 'success' && <i className="ri-checkbox-circle-fill"></i>}
              {toast.type === 'error' && <i className="ri-error-warning-fill"></i>}
              {toast.type === 'warning' && <i className="ri-alert-fill"></i>}
              {toast.type === 'info' && <i className="ri-information-fill"></i>}
            </div>

            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              <div className="toast-message">{toast.message}</div>
            </div>

            <button
              type="button"
              className="toast-close-btn"
              onClick={closeToast}
              aria-label="Fechar notificação"
              title="Fechar"
            >
              <i className="ri-close-line fs-18"></i>
            </button>

            <div
              className="toast-progress-bar"
              style={{ animationDuration: `${toast.duration}ms` }}
            />
          </div>
        )}
      </div>

      {/* TOPBAR HEADER (VELZON AUTHENTIC DESIGN) */}
      <header id="page-topbar">
        <div className="layout-width">
          <div className="navbar-header">
            <div className="d-flex align-items-center">
              <div className="navbar-brand-box horizontal-logo">
                <a href="#" className="logo logo-dark" onClick={(e) => { e.preventDefault(); handleNav('dashboard'); }}>
                  <span className="logo-sm">
                    <span className="avatar-title bg-primary text-white rounded-2 d-inline-flex align-items-center justify-content-center" style={{ width: '28px', height: '28px' }}>
                      <i className="ri-qr-scan-2-line fs-16"></i>
                    </span>
                  </span>
                  <span className="logo-lg">
                    <span className="d-flex align-items-center gap-2">
                      <span className="avatar-title bg-primary text-white rounded-2 d-inline-flex align-items-center justify-content-center shadow-sm" style={{ width: '32px', height: '32px' }}>
                        <i className="ri-qr-scan-2-line fs-18"></i>
                      </span>
                      <span className="d-flex flex-column text-start lh-1">
                        <span className="fs-15 fw-bold text-dark text-nowrap">
                          Coletor Inventário
                        </span>
                        <span className="fs-10 fw-bold text-primary text-uppercase mt-1" style={{ letterSpacing: '0.6px' }}>
                          Gestão EMC • Contagem
                        </span>
                      </span>
                    </span>
                  </span>
                </a>
                <a href="#" className="logo logo-light" onClick={(e) => { e.preventDefault(); handleNav('dashboard'); }}>
                  <span className="logo-sm">
                    <span className="avatar-title bg-primary text-white rounded-2 d-inline-flex align-items-center justify-content-center" style={{ width: '28px', height: '28px' }}>
                      <i className="ri-qr-scan-2-line fs-16"></i>
                    </span>
                  </span>
                  <span className="logo-lg">
                    <span className="d-flex align-items-center gap-2">
                      <span className="avatar-title bg-primary text-white rounded-2 d-inline-flex align-items-center justify-content-center shadow-sm" style={{ width: '32px', height: '32px' }}>
                        <i className="ri-qr-scan-2-line fs-18"></i>
                      </span>
                      <span className="d-flex flex-column text-start lh-1">
                        <span className="fs-15 fw-bold text-white text-nowrap">
                          Coletor Inventário
                        </span>
                        <span className="fs-10 fw-bold text-info text-uppercase mt-1" style={{ letterSpacing: '0.6px' }}>
                          Gestão EMC • Contagem
                        </span>
                      </span>
                    </span>
                  </span>
                </a>
              </div>

              <button
                type="button"
                className="btn btn-sm px-2 px-sm-3 fs-16 header-item vertical-menu-btn topnav-hamburger"
                onClick={() => {
                  if (window.innerWidth <= 991) {
                    setMobileMenuOpen(!mobileMenuOpen);
                  } else {
                    setSidebarCollapsed(!sidebarCollapsed);
                  }
                }}
                aria-label="Menu Principal"
              >
                <i className={mobileMenuOpen ? "ri-close-line fs-20 text-danger" : "ri-menu-2-line fs-20"}></i>
              </button>

              <form onSubmit={handleGlobalSearch} className="app-search d-none d-md-block ms-2">
                <div className="position-relative">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Buscar patrimônio, serial ou secretaria... (Enter)"
                    style={{ minWidth: '340px', borderRadius: '30px' }}
                    value={topbarSearchInput}
                    onChange={(e) => setTopbarSearchInput(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="border-0 bg-transparent p-0 position-absolute end-0 top-50 translate-middle-y me-3 text-muted"
                    title="Buscar na Base Contratual"
                  >
                    <span className="ri-search-line search-widget-icon position-static"></span>
                  </button>
                </div>
              </form>
            </div>

            <div className="d-flex align-items-center gap-1 gap-sm-2">
              <div className="header-item d-none d-sm-flex">
                <span className="badge badge-soft-info fs-12 px-3 py-2 rounded-pill">
                  <i className="ri-shield-check-line align-middle me-1"></i> 4.344 Contratados EMC | 1.960 Form Servidores
                </span>
              </div>

              {/* Botão de Acesso Rápido ao Coletor com Câmera */}
              <button
                type="button"
                className={`btn btn-sm rounded-pill px-2 px-sm-3 d-flex align-items-center gap-1 ${activeTab === 'coletor' ? 'btn-info text-white' : 'btn-soft-info'}`}
                onClick={() => handleNav('coletor')}
                title="Abrir Coletor com Câmera (Mobile PWA)"
              >
                <i className="ri-qr-scan-2-line fs-14"></i>
                <span className="d-none d-sm-inline">Coletor</span>
              </button>

              {/* Botão de Acesso Rápido a Rotas de Coleta */}
              <button
                type="button"
                className={`btn btn-sm rounded-pill px-2 px-sm-3 d-flex align-items-center gap-1 ${activeTab === 'rotas' ? 'btn-warning text-dark' : 'btn-soft-warning'}`}
                onClick={() => handleNav('rotas')}
                title="Rotas e Logística de Coleta em Campo"
              >
                <i className="ri-map-pin-range-line fs-14"></i>
                <span className="d-none d-sm-inline">Rotas</span>
              </button>

              {/* Botão de Acesso Rápido a Novos Municipais */}
              <button
                type="button"
                className={`btn btn-sm rounded-pill px-2 px-sm-3 d-flex align-items-center gap-1 ${activeTab === 'novos' ? 'btn-success text-white' : 'btn-soft-success'}`}
                onClick={() => handleNav('novos')}
                title="Expedição de Equipamentos Novos Municipais (BNDES/PMAT)"
              >
                <i className="ri-inbox-unarchive-line fs-14"></i>
                <span className="d-none d-sm-inline">Novos</span>
              </button>

              {/* Botão de Instalar Aplicativo no Celular (PWA) */}
              {!isAppInstalled && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary rounded-pill px-2 px-sm-3 d-flex align-items-center gap-1 shadow-sm"
                  onClick={handleInstallApp}
                  title="Instalar Aplicativo no Celular (PWA)"
                >
                  <i className="ri-download-2-line fs-14"></i>
                  <span className="fw-bold d-none d-sm-inline">Instalar App</span>
                  <span className="fw-bold d-inline d-sm-none">Instalar</span>
                </button>
              )}

              {/* Alternância de Modo Claro / Escuro (Velzon Dark Mode) */}
              <button
                type="button"
                className="btn btn-icon btn-topbar btn-ghost-secondary rounded-circle"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro (Dark Mode)'}
              >
                <i className={theme === 'dark' ? 'ri-sun-line fs-18 text-warning' : 'ri-moon-line fs-18 text-dark'}></i>
              </button>

              <button
                type="button"
                className="btn btn-soft-danger btn-sm rounded-pill px-2 px-sm-3"
                onClick={() => setShowResetModal(true)}
                title="Zerar dados de galpão para reiniciar conferências"
              >
                <i className="ri-refresh-line me-sm-1"></i>
                <span className="d-none d-sm-inline">Zerar</span>
              </button>

              <div className="header-item d-none d-sm-flex">
                <button
                  type="button"
                  className="btn btn-icon btn-topbar btn-ghost-secondary rounded-circle"
                  onClick={toggleFullScreen}
                  title="Tela cheia"
                >
                  <i className="ri-fullscreen-line fs-22"></i>
                </button>
              </div>

              <div className="dropdown ms-sm-3 header-item topbar-user">
                <button type="button" className="btn shadow-none d-flex align-items-center">
                  <span className="d-flex align-items-center">
                    <div className="avatar-xs me-2">
                      <span className="avatar-title rounded-circle bg-soft-primary text-primary fs-14 fw-bold">
                        TI
                      </span>
                    </div>
                    <span className="text-start d-none d-xl-inline-block">
                      <span className="d-block fw-medium user-name-text">Prefeitura Contagem</span>
                      <span className="d-block fs-12 text-muted user-name-sub-text">Gestão de Contratos EMC</span>
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* LEFT SIDEBAR NAVIGATION (VELZON DARK THEME) */}
      <div className="app-menu navbar-menu">
        <div className="navbar-brand-box d-flex align-items-center justify-content-between px-3">
          <a href="#" className="logo logo-dark" onClick={(e) => { e.preventDefault(); handleNav('dashboard'); }}>
            <span className="logo-sm">
              <span className="avatar-title bg-primary text-white rounded-2 d-inline-flex align-items-center justify-content-center" style={{ width: '28px', height: '28px' }}>
                <i className="ri-qr-scan-2-line fs-16"></i>
              </span>
            </span>
            <span className="logo-lg">
              <span className="d-flex align-items-center gap-2">
                <span className="avatar-title bg-primary text-white rounded-2 d-inline-flex align-items-center justify-content-center shadow-sm" style={{ width: '32px', height: '32px' }}>
                  <i className="ri-qr-scan-2-line fs-18"></i>
                </span>
                <span className="d-flex flex-column text-start lh-1">
                  <span className="fs-14 fw-bold text-white text-nowrap">
                    Coletor Inventário
                  </span>
                  <span className="fs-10 fw-semibold text-warning text-uppercase mt-1" style={{ letterSpacing: '0.6px' }}>
                    Gestão EMC • Contagem
                  </span>
                </span>
              </span>
            </span>
          </a>
          <a href="#" className="logo logo-light" onClick={(e) => { e.preventDefault(); handleNav('dashboard'); }}>
            <span className="logo-sm">
              <span className="avatar-title bg-primary text-white rounded-2 d-inline-flex align-items-center justify-content-center" style={{ width: '28px', height: '28px' }}>
                <i className="ri-qr-scan-2-line fs-16"></i>
              </span>
            </span>
            <span className="logo-lg">
              <span className="d-flex align-items-center gap-2">
                <span className="avatar-title bg-primary text-white rounded-2 d-inline-flex align-items-center justify-content-center shadow-sm" style={{ width: '32px', height: '32px' }}>
                  <i className="ri-qr-scan-2-line fs-18"></i>
                </span>
                <span className="d-flex flex-column text-start lh-1">
                  <span className="fs-14 fw-bold text-white text-nowrap">
                    Coletor Inventário
                  </span>
                  <span className="fs-10 fw-semibold text-warning text-uppercase mt-1" style={{ letterSpacing: '0.6px' }}>
                    Gestão EMC • Contagem
                  </span>
                </span>
              </span>
            </span>
          </a>
          <button
            type="button"
            className="btn btn-sm btn-icon btn-ghost-light rounded-circle d-lg-none"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fechar menu"
          >
            <i className="ri-close-line fs-22 text-white"></i>
          </button>
        </div>

        <div id="scrollbar">
          <div className="container-fluid">
            <div id="two-column-menu"></div>
            <ul className="navbar-nav" id="navbar-nav">
              <li className="menu-title"><span>Painel Principal</span></li>

              <li className="nav-item">
                <a
                  className={`nav-link menu-link ${activeTab === 'dashboard' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleNav('dashboard'); }}
                >
                  <i className="ri-dashboard-2-line"></i>
                  <span>Dashboard Executivo</span>
                </a>
              </li>

              <li className="menu-title"><span>Dupla Conferência (Galpão x EMC)</span></li>

              <li className="nav-item">
                <a
                  className={`nav-link menu-link ${activeTab === 'coletor' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleNav('coletor'); }}
                >
                  <i className="ri-qr-scan-2-line text-info"></i>
                  <span>Coletor Câmera (Mobile PWA)</span>
                  <span className="badge badge-pill badge-soft-info ms-auto">CÂMERA</span>
                </a>
              </li>

              <li className="nav-item">
                <a
                  className={`nav-link menu-link ${activeTab === 'rotas' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleNav('rotas'); }}
                >
                  <i className="ri-map-pin-range-line text-warning"></i>
                  <span>Rotas de Coleta em Campo</span>
                  <span className="badge badge-pill badge-soft-warning ms-auto">ROTAS</span>
                </a>
              </li>

              <li className="nav-item">
                <a
                  className={`nav-link menu-link ${activeTab === 'novos' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleNav('novos'); }}
                >
                  <i className="ri-inbox-unarchive-line text-success"></i>
                  <span>Expedição de Novos (Município)</span>
                  <span className="badge badge-pill badge-soft-success ms-auto">NOVOS</span>
                </a>
              </li>

              <li className="nav-item">
                <a
                  className="nav-link menu-link text-info"
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleInstallApp(); }}
                >
                  <i className="ri-download-cloud-2-line text-info"></i>
                  <span className="fw-semibold">{isAppInstalled ? '✓ App Instalado' : 'Instalar no Celular (PWA)'}</span>
                </a>
              </li>

              <li className="nav-item">
                <a
                  className={`nav-link menu-link ${activeTab === 'galpao' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleNav('galpao'); }}
                >
                  <i className="ri-inbox-archive-line"></i>
                  <span>1ª Conf: Galpão (Prefeitura)</span>
                  {stats && stats.totalAguardandoEMC > 0 && (
                    <span className="badge badge-pill badge-soft-warning ms-auto">{stats.totalAguardandoEMC}</span>
                  )}
                </a>
              </li>

              <li className="nav-item">
                <a
                  className={`nav-link menu-link ${activeTab === 'baixa_emc' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleNav('baixa_emc'); }}
                >
                  <i className="ri-checkbox-multiple-line"></i>
                  <span>2ª Conf: Baixa EMC (PDF/Coleta)</span>
                  {stats && stats.totalDevolvidosEMC > 0 && (
                    <span className="badge badge-pill badge-soft-success ms-auto">{stats.totalDevolvidosEMC}</span>
                  )}
                </a>
              </li>

              <li className="menu-title"><span>Bases de Referência</span></li>

              <li className="nav-item">
                <a
                  className={`nav-link menu-link ${activeTab === 'contrato' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleNav('contrato'); }}
                >
                  <i className="ri-file-paper-2-line"></i>
                  <span>Base Contratual EMC</span>
                  <span className="badge badge-pill badge-soft-primary ms-auto">4.344</span>
                </a>
              </li>

              <li className="nav-item">
                <a
                  className={`nav-link menu-link ${activeTab === 'equipamentos' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleNav('equipamentos'); }}
                >
                  <i className="ri-survey-line"></i>
                  <span>Formulário Servidores</span>
                  <span className="badge badge-pill badge-soft-info ms-auto">1.960</span>
                </a>
              </li>

              <li className="nav-item">
                <a
                  className={`nav-link menu-link ${activeTab === 'secretarias' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleNav('secretarias'); }}
                >
                  <i className="ri-building-line"></i>
                  <span>Balanço por Secretaria</span>
                </a>
              </li>

              <li className="menu-title"><span>Auditoria & Baixas</span></li>

              <li className="nav-item">
                <a
                  className={`nav-link menu-link ${activeTab === 'auditoria' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleNav('auditoria'); }}
                >
                  <i className="ri-scales-3-line"></i>
                  <span>Auditoria & Discrepâncias</span>
                  <span className="badge badge-pill badge-soft-danger ms-auto">1.222</span>
                </a>
              </li>

              <li className="nav-item">
                <a
                  className={`nav-link menu-link ${activeTab === 'romaneios' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleNav('romaneios'); }}
                >
                  <i className="ri-truck-line"></i>
                  <span>Romaneios & Devoluções</span>
                </a>
              </li>

              <li className="nav-item">
                <a
                  className={`nav-link menu-link ${activeTab === 'manutencao' ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleNav('manutencao'); }}
                >
                  <i className="ri-settings-4-line"></i>
                  <span>Manutenção & Reset</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="sidebar-background"></div>
      </div>

      {/* MOBILE DRAWER BACKDROP OVERLAY */}
      {mobileMenuOpen && (
        <div
          className="mobile-drawer-overlay"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* MAIN CONTENT AREA */}
      <div className="main-content">
        <div className="page-content">
          <div className="container-fluid">
            <div className="row">
              <div className="col-12">
                <div className="page-title-box d-sm-flex align-items-center justify-content-between">
                  <h4 className="mb-sm-0">
                    {activeTab === 'dashboard' && 'Dashboard Executivo — Dupla Conferência EMC'}
                    {activeTab === 'coletor' && 'Coletor Mobile — Leitor Óptico com Câmera (PWA)'}
                    {activeTab === 'rotas' && 'Rotas & Logística de Coleta em Campo'}
                    {activeTab === 'novos' && 'Expedição de Equipamentos Novos Municipais (PMAT / BNDES)'}
                    {activeTab === 'galpao' && '1ª Conferência — Entrada no Galpão (Aguardando Retirada EMC)'}
                    {activeTab === 'baixa_emc' && '2ª Conferência — Baixa Oficial EMC (Leitura de PDF / Coleta)'}
                    {activeTab === 'contrato' && 'Base Contratual Completa da EMC (4.344 Itens)'}
                    {activeTab === 'equipamentos' && 'Formulário Declarado pelos Servidores (1.960 Registros)'}
                    {activeTab === 'auditoria' && 'Auditoria Contratual & Relatório de Discrepâncias (Fantasmas x Excedentes)'}
                    {activeTab === 'excedentes' && 'Auditoria de Equipamentos Excedentes'}
                    {activeTab === 'secretarias' && 'Balanço Físico por Secretaria'}
                    {activeTab === 'romaneios' && 'Romaneios & Termos de Entrega EMC'}
                    {activeTab === 'manutencao' && 'Gestão de Dados & Reset de Conferências'}
                  </h4>
                  <div className="page-title-right">
                    <ol className="breadcrumb m-0">
                      <li className="breadcrumb-item"><a href="#">Inventário</a></li>
                      <li className="breadcrumb-item active">
                        {activeTab === 'dashboard' && 'Visão Geral'}
                        {activeTab === 'coletor' && 'Coletor Câmera'}
                        {activeTab === 'rotas' && 'Rotas de Coleta'}
                        {activeTab === 'novos' && 'Expedição de Novos'}
                        {activeTab === 'galpao' && '1ª Conferência Galpão'}
                        {activeTab === 'baixa_emc' && '2ª Conferência EMC'}
                        {activeTab === 'contrato' && 'Contrato EMC'}
                        {activeTab === 'equipamentos' && 'Formulário'}
                        {activeTab === 'auditoria' && 'Auditoria & Discrepâncias'}
                        {activeTab === 'excedentes' && 'Excedentes'}
                        {activeTab === 'secretarias' && 'Secretarias'}
                        {activeTab === 'romaneios' && 'Romaneios'}
                        {activeTab === 'manutencao' && 'Manutenção'}
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            {activeTab === 'dashboard' && <DashboardView stats={stats} onNavigate={handleNav} onOpenReset={() => { setResetConfirmWord(''); setShowResetModal(true); }} />}
            {activeTab === 'coletor' && <ColetorMobileView onUpdated={fetchStats} notify={showNotification} onNavigate={handleNav} />}
            {activeTab === 'rotas' && <RotasColetaView onNavigate={handleNav} notify={showNotification} />}
            {activeTab === 'novos' && <ExpedicaoNovosView notify={showNotification} onNavigate={handleNav} />}
            {activeTab === 'galpao' && <GalpaoConferenciaView onUpdated={fetchStats} notify={showNotification} onNavigate={handleNav} stats={stats} />}
            {activeTab === 'baixa_emc' && <BaixaEMCView onUpdated={fetchStats} notify={showNotification} onNavigate={handleNav} />}
            {activeTab === 'contrato' && <ContratoView initialFilter={contratoInitialFilter} onClearInitialFilter={() => setContratoInitialFilter({ search: '', status: '' })} />}
            {activeTab === 'equipamentos' && <EquipamentosView />}
            {activeTab === 'auditoria' && <AuditoriaView onNavigate={handleNav} notify={showNotification} />}
            {activeTab === 'excedentes' && <GalpaoConferenciaView onUpdated={fetchStats} notify={showNotification} onNavigate={handleNav} stats={stats} initialStatus="excedente" />}
            {activeTab === 'secretarias' && <SecretariasView stats={stats} onNavigate={handleNav} />}
            {activeTab === 'romaneios' && <RomaneiosView stats={stats} notify={showNotification} />}
            {activeTab === 'manutencao' && <ManutencaoView stats={stats} onResetDatabase={() => { setResetConfirmWord(''); setShowResetModal(true); }} notify={showNotification} />}
          </div>
        </div>

        <footer className="footer">
          <div className="container-fluid">
            <div className="row">
              <div className="col-sm-6">
                © {new Date().getFullYear()} Prefeitura Municipal de Contagem.
              </div>
              <div className="col-sm-6 text-sm-end">
                Diretoria de Tecnologia da Informação — Sistema de Dupla Conferência EMC
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE RESET SEGURO COM DIGITAÇÃO OBRIGATÓRIA */}
      {showResetModal && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-soft-danger">
                <h5 className="modal-title text-danger">
                  <i className="ri-error-warning-line me-2"></i> Confirmar Limpeza de Conferências
                </h5>
                <button type="button" className="btn-close" onClick={() => { setShowResetModal(false); setResetConfirmWord(''); }}></button>
              </div>
              <div className="modal-body">
                <p className="fs-15 mb-2">
                  Esta ação irá <strong>limpar do banco de dados todas as conferências de galpão e baixas anteriores</strong>, permitindo que você reimporte os arquivos do zero com a nova regra de dupla conferência.
                </p>
                <div className="alert alert-info py-2 px-3 fs-13 mb-3">
                  <i className="ri-shield-check-line me-1"></i>
                  <strong>100% Seguro:</strong> A <strong>Base Contratual EMC (4.344)</strong> e a <strong>Base do Formulário dos Servidores (1.960)</strong> serão <u>totalmente preservadas</u>!
                </div>
                <div className="p-3 bg-light rounded border">
                  <label className="form-label fs-12 fw-bold text-danger mb-1">
                    Para habilitar o reset, digite a palavra <span className="badge bg-danger">ZERAR</span> abaixo:
                  </label>
                  <input
                    type="text"
                    className="form-control font-monospace fw-bold text-center text-uppercase fs-14"
                    placeholder="Digite ZERAR"
                    value={resetConfirmWord}
                    onChange={(e) => setResetConfirmWord(e.target.value.toUpperCase())}
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-light" onClick={() => { setShowResetModal(false); setResetConfirmWord(''); }}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-danger px-3 fw-bold"
                  disabled={resetConfirmWord !== 'ZERAR' || isResetting}
                  onClick={handleResetDatabase}
                >
                  {isResetting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span> Zerando...
                    </>
                  ) : (
                    <>
                      <i className="ri-delete-bin-line me-1"></i> Sim, Zerar Conferências
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="mobile-bottom-nav">
        <button
          type="button"
          className={`mobile-bottom-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleNav('dashboard')}
          title="Dashboard Executivo"
        >
          <i className="ri-dashboard-2-line"></i>
          <span>Painel</span>
        </button>

        <button
          type="button"
          className={`mobile-bottom-nav-item ${activeTab === 'galpao' ? 'active' : ''}`}
          onClick={() => handleNav('galpao')}
          title="1ª Conf: Galpão"
        >
          <i className="ri-inbox-archive-line"></i>
          <span>Galpão</span>
          {stats && stats.totalAguardandoEMC > 0 && (
            <span className="mobile-nav-badge">{stats.totalAguardandoEMC}</span>
          )}
        </button>

        {/* CENTER FLOATING ACTION SCANNER BUTTON */}
        <button
          type="button"
          className={`mobile-bottom-nav-item mobile-bottom-nav-center ${activeTab === 'coletor' ? 'active' : ''}`}
          onClick={() => handleNav('coletor')}
          title="Bipar / Coletor com Câmera"
        >
          <div className="center-scanner-btn">
            <i className="ri-qr-scan-2-line"></i>
          </div>
          <span>BIPAR</span>
        </button>

        <button
          type="button"
          className={`mobile-bottom-nav-item ${activeTab === 'auditoria' ? 'active' : ''}`}
          onClick={() => handleNav('auditoria')}
          title="Auditoria & Discrepâncias"
        >
          <i className="ri-scales-3-line"></i>
          <span>Auditoria</span>
          <span className="mobile-nav-badge badge-danger">1.2k</span>
        </button>

        <button
          type="button"
          className={`mobile-bottom-nav-item ${mobileMenuOpen ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          title="Todas as opções"
        >
          <i className={mobileMenuOpen ? 'ri-close-line text-danger' : 'ri-menu-4-line'}></i>
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}

// ==========================================
// VIEW: DASHBOARD EXECUTIVO (DUPLA CONFERÊNCIA)
// ==========================================
function DashboardView({ stats, onNavigate, onOpenReset }) {
  if (!stats) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary mb-3" role="status">
          <span className="visually-hidden">Carregando painel...</span>
        </div>
        <h5 className="fs-15 fw-bold text-dark mb-1">Carregando painel executivo...</h5>
        <p className="text-muted fs-12 mb-3">Conectando à base de dados do inventário...</p>
        <button
          type="button"
          className="btn btn-soft-primary btn-sm rounded-pill px-3"
          onClick={() => window.location.reload()}
        >
          <i className="ri-refresh-line me-1"></i> Tentar novamente
        </button>
      </div>
    );
  }

  const cpusTotal = stats.contractTypeCounts?.cpus || 1705;
  const monitoresTotal = stats.contractTypeCounts?.monitores || 2152;
  const notebooksTotal = stats.contractTypeCounts?.notebooks || 315;
  const outrosTotal = stats.contractTypeCounts?.outros || 172;

  const pctCpus = Math.min(100, Math.round(((stats.cpusDevolvidos || 0) / cpusTotal) * 100));
  const pctMonitores = Math.min(100, Math.round(((stats.monitoresDevolvidos || 0) / monitoresTotal) * 100));
  const pctNotebooks = Math.min(100, Math.round(((stats.notebooksDevolvidos || 0) / notebooksTotal) * 100));
  const taxaGeral = stats.taxaDevolucao || Math.min(100, Math.round((stats.totalDevolvidosEMC / (stats.totalContratadoEMC || 1)) * 100));

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. HERO OPERATIONAL BANNER */}
      <div className="card shadow-sm border-0 mb-1" style={{ background: 'linear-gradient(135deg, #1f273e 0%, #29385c 100%)', color: '#fff' }}>
        <div className="card-body p-4">
          <div className="row align-items-center g-3">
            <div className="col-lg-7">
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="badge bg-success-subtle text-success fs-11 px-2 py-1 fw-bold">
                  <i className="ri-checkbox-circle-fill me-1 align-bottom"></i> Sistema Operacional Online
                </span>
                <span className="badge bg-light text-dark fs-11 px-2 py-1 font-monospace">
                  Contrato EMC nº 22645
                </span>
              </div>
              <h3 className="text-white fw-bold mb-1 fs-20">
                Painel Integrado de Gestão de Ativos & Dupla Conferência
              </h3>
              <p className="text-white-50 fs-13 mb-0" style={{ maxWidth: '650px' }}>
                Acompanhamento em tempo real da desmobilização de equipamentos locados pela Prefeitura de Contagem, da entrada no galpão central à baixa definitiva com a empresa EMC.
              </p>
            </div>

            <div className="col-lg-5 text-lg-end">
              <div className="d-flex flex-wrap gap-2 justify-content-lg-end">
                <button
                  type="button"
                  className="btn btn-warning btn-sm fw-semibold shadow-sm"
                  onClick={() => onNavigate('galpao')}
                >
                  <i className="ri-barcode-box-line me-1"></i> 1ª Conf: Galpão
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm fw-semibold shadow-sm"
                  onClick={() => onNavigate('baixa_emc')}
                >
                  <i className="ri-file-pdf-fill me-1"></i> 2ª Conf: Baixa EMC
                </button>
                <button
                  type="button"
                  className="btn btn-light btn-sm fw-semibold shadow-sm text-dark"
                  onClick={() => onNavigate('contrato')}
                >
                  <i className="ri-file-list-3-line me-1"></i> Base Contratual
                </button>
                <button
                  type="button"
                  className="btn btn-soft-info btn-sm fw-semibold shadow-sm"
                  onClick={() => window.print()}
                  title="Imprimir relatório executivo do painel"
                >
                  <i className="ri-printer-line me-1"></i> Imprimir Painel
                </button>
                <button
                  type="button"
                  className="btn btn-outline-light btn-sm"
                  onClick={onOpenReset}
                  title="Zerar dados de conferências e reimportar"
                >
                  <i className="ri-refresh-line"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. TOP 4 EXECUTIVE KPI CARDS */}
      <div className="row g-3">
        {/* CARD 1: BASE CONTRATUAL */}
        <div className="col-6 col-md-6 col-xl-3">
          <div
            className="card card-animate border border-light shadow-sm"
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => onNavigate('contrato')}
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-bold text-muted text-truncate fs-11 mb-1">
                    Base Contratual EMC
                  </p>
                  <h4 className="fs-22 fw-bold text-primary mb-0 font-monospace">
                    {stats.totalContratadoEMC.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    <strong>{stats.contratadosDeclaradosNoForm}</strong> no formulário • <strong>{stats.contratadosSemFormulario}</strong> sem local
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-sm rounded bg-soft-primary text-primary d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-file-paper-2-fill"></i>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-top d-flex justify-content-between align-items-center">
                <span className="text-muted fs-11">Total de Ativos Contratados</span>
                <span className="text-primary fs-11 fw-bold">Ver Base <i className="ri-arrow-right-line"></i></span>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: DEVOLVIDOS À EMC */}
        <div className="col-6 col-md-6 col-xl-3">
          <div
            className="card card-animate border border-success shadow-sm"
            style={{ cursor: 'pointer', transition: 'all 0.2s', background: 'linear-gradient(180deg, #ffffff 0%, #f7fdfb 100%)' }}
            onClick={() => onNavigate('contrato')}
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-bold text-success text-truncate fs-11 mb-1">
                    2ª Conf: Devolvidos à EMC
                  </p>
                  <h4 className="fs-22 fw-bold text-success mb-0 font-monospace">
                    {stats.totalDevolvidosEMC.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    <strong>{stats.cpusDevolvidos}</strong> CPUs • <strong>{stats.monitoresDevolvidos}</strong> Monitores
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-sm rounded bg-soft-success text-success d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-checkbox-circle-fill"></i>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-top d-flex justify-content-between align-items-center">
                <div className="progress progress-sm flex-grow-1 me-2" style={{ height: '6px' }}>
                  <div className="progress-bar bg-success" style={{ width: `${stats.taxaDevolucao}%` }}></div>
                </div>
                <span className="text-success fs-11 fw-bold text-nowrap">{stats.taxaDevolucao}% baixado</span>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 3: NO GALPÃO */}
        <div className="col-6 col-md-6 col-xl-3">
          <div
            className="card card-animate border border-warning shadow-sm"
            style={{ cursor: 'pointer', transition: 'all 0.2s', background: 'linear-gradient(180deg, #ffffff 0%, #fffdf8 100%)' }}
            onClick={() => onNavigate('galpao')}
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-bold text-warning text-truncate fs-11 mb-1">
                    1ª Conf: No Galpão
                  </p>
                  <h4 className="fs-22 fw-bold text-warning mb-0 font-monospace">
                    {stats.totalAguardandoEMC.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    {stats.totalAguardandoEMC === 0 ? (
                      <span className="text-muted">Nenhum pendente de retirada</span>
                    ) : (
                      <span><strong>{stats.cpusGalpao}</strong> CPUs • <strong>{stats.monitoresGalpao}</strong> Monitores</span>
                    )}
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-sm rounded bg-soft-warning text-warning d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-inbox-archive-fill"></i>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-top d-flex justify-content-between align-items-center">
                <span className="text-muted fs-11">Aguardando Coleta EMC</span>
                <span className="text-warning fs-11 fw-bold">Ver Galpão <i className="ri-arrow-right-line"></i></span>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 4: EM CAMPO */}
        <div className="col-6 col-md-6 col-xl-3">
          <div
            className="card card-animate border border-light shadow-sm"
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => onNavigate('contrato', { status: 'em_campo' })}
            title="Ver equipamentos em campo na Base Contratual"
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-bold text-info text-truncate fs-11 mb-1">
                    Em Campo / Secretarias
                  </p>
                  <h4 className="fs-22 fw-bold text-info mb-0 font-monospace">
                    {stats.totalEmCampo.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    Equipamentos ativos nas secretarias
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-sm rounded bg-soft-info text-info d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-building-line"></i>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-top d-flex justify-content-between align-items-center">
                <span className="text-muted fs-11">Ver no Contrato</span>
                <span
                  className="text-info fs-11 fw-bold"
                  onClick={(e) => { e.stopPropagation(); onNavigate('secretarias'); }}
                  title="Ver balanço por secretaria"
                >
                  Por Secretaria <i className="ri-arrow-right-line"></i>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. FLUXO VISUAL DA DUPLA CONFERÊNCIA */}
      <div className="card shadow-sm border">
        <div className="card-body p-3">
          <div className="row align-items-center g-3">
            {/* ETAPA 1 */}
            <div className="col-lg-5 col-md-6">
              <div className="d-flex align-items-start gap-3 p-3 bg-light rounded border">
                <div className="avatar-sm rounded-circle bg-warning text-white d-flex align-items-center justify-content-center fw-bold fs-16 flex-shrink-0">
                  1
                </div>
                <div className="flex-grow-1">
                  <div className="d-flex justify-content-between align-items-center">
                    <h5 className="fs-14 fw-bold mb-0 text-dark">1ª Conferência — Galpão Central</h5>
                    <span className="badge badge-soft-warning fs-11">Prefeitura</span>
                  </div>
                  <p className="text-muted fs-12 mb-2 mt-1">
                    Equipamentos descarregados são bipados um a um. Ficam com status <strong>No Galpão (Aguardando Retirada)</strong>.
                  </p>
                  <button
                    type="button"
                    className="btn btn-warning btn-sm py-1 px-2 fs-11 fw-semibold"
                    onClick={() => onNavigate('galpao')}
                  >
                    <i className="ri-qr-scan-2-line me-1"></i> Bipar / Importar TXT Galpão
                  </button>
                </div>
              </div>
            </div>

            {/* DIVIDER ICON */}
            <div className="col-lg-2 d-none d-lg-flex justify-content-center">
              <div className="text-center">
                <div className="avatar-xs rounded-circle bg-light border d-flex align-items-center justify-content-center mx-auto text-primary fs-16">
                  <i className="ri-arrow-right-line"></i>
                </div>
                <small className="text-muted fs-11 fw-semibold mt-1 d-block">Transporte EMC</small>
              </div>
            </div>

            {/* ETAPA 2 */}
            <div className="col-lg-5 col-md-6">
              <div className="d-flex align-items-start gap-3 p-3 bg-light rounded border">
                <div className="avatar-sm rounded-circle bg-success text-white d-flex align-items-center justify-content-center fw-bold fs-16 flex-shrink-0">
                  2
                </div>
                <div className="flex-grow-1">
                  <div className="d-flex justify-content-between align-items-center">
                    <h5 className="fs-14 fw-bold mb-0 text-dark">2ª Conferência — Coleta & Baixa EMC</h5>
                    <span className="badge badge-soft-success fs-11">Empresa EMC</span>
                  </div>
                  <p className="text-muted fs-12 mb-2 mt-1">
                    EMC recolhe e emite o PDF de Movimentação. O sistema audita o arquivo e grava a <strong>Baixa Definitiva</strong>.
                  </p>
                  <button
                    type="button"
                    className="btn btn-success btn-sm py-1 px-2 fs-11 fw-semibold"
                    onClick={() => onNavigate('baixa_emc')}
                  >
                    <i className="ri-file-pdf-line me-1"></i> Importar Comprovante PDF EMC
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. PROGRESSO POR TIPO DE EQUIPAMENTO & LOTES DA EMC */}
      <div className="row g-3">
        {/* PROGRESSO POR TIPO */}
        <div className="col-xl-7">
          <div className="card shadow-sm border card-height-100">
            <div className="card-header bg-light border-bottom d-flex align-items-center justify-content-between py-3">
              <div>
                <h5 className="card-title mb-0 fs-15 fw-bold text-dark">
                  <i className="ri-pie-chart-2-line text-primary me-2"></i>
                  Progresso das Devoluções por Categoria de Ativo
                </h5>
                <span className="text-muted fs-12">
                  Total de <strong>{stats.totalDevolvidosEMC}</strong> equipamentos devolvidos à EMC de <strong>{stats.totalContratadoEMC}</strong>
                </span>
              </div>
              <span className="badge badge-soft-primary fs-12">
                {stats.taxaDevolucao}% Concluído
              </span>
            </div>

            <div className="card-body">
              <div className="row g-3">
                {/* MONITORES */}
                <div className="col-md-6">
                  <div className="p-3 border rounded bg-light">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fw-bold text-dark fs-13 d-flex align-items-center gap-1">
                        <i className="ri-tv-line text-success fs-16"></i> Monitores DELL
                      </span>
                      <span className="badge badge-soft-success font-monospace fs-11">
                        {stats.monitoresDevolvidos} / {monitoresTotal}
                      </span>
                    </div>
                    <div className="progress progress-sm my-2" style={{ height: '7px' }}>
                      <div className="progress-bar bg-success" style={{ width: `${pctMonitores}%` }}></div>
                    </div>
                    <div className="d-flex justify-content-between fs-11 text-muted">
                      <span><strong>{pctMonitores}%</strong> devolvidos</span>
                      <span>Restam: <strong>{Math.max(0, monitoresTotal - stats.monitoresDevolvidos)}</strong></span>
                    </div>
                  </div>
                </div>

                {/* CPUS */}
                <div className="col-md-6">
                  <div className="p-3 border rounded bg-light">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fw-bold text-dark fs-13 d-flex align-items-center gap-1">
                        <i className="ri-computer-line text-primary fs-16"></i> CPUs / Desktops DELL
                      </span>
                      <span className="badge badge-soft-primary font-monospace fs-11">
                        {stats.cpusDevolvidos} / {cpusTotal}
                      </span>
                    </div>
                    <div className="progress progress-sm my-2" style={{ height: '7px' }}>
                      <div className="progress-bar bg-primary" style={{ width: `${pctCpus}%` }}></div>
                    </div>
                    <div className="d-flex justify-content-between fs-11 text-muted">
                      <span><strong>{pctCpus}%</strong> devolvidos</span>
                      <span>Restam: <strong>{Math.max(0, cpusTotal - stats.cpusDevolvidos)}</strong></span>
                    </div>
                  </div>
                </div>

                {/* NOTEBOOKS */}
                <div className="col-md-6">
                  <div className="p-3 border rounded bg-light">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fw-bold text-dark fs-13 d-flex align-items-center gap-1">
                        <i className="ri-macbook-line text-info fs-16"></i> Notebooks DELL
                      </span>
                      <span className="badge badge-soft-info font-monospace fs-11">
                        {stats.notebooksDevolvidos || 0} / {notebooksTotal}
                      </span>
                    </div>
                    <div className="progress progress-sm my-2" style={{ height: '7px' }}>
                      <div className="progress-bar bg-info" style={{ width: `${pctNotebooks}%` }}></div>
                    </div>
                    <div className="d-flex justify-content-between fs-11 text-muted">
                      <span><strong>{pctNotebooks}%</strong> devolvidos</span>
                      <span>Restam: <strong>{Math.max(0, notebooksTotal - (stats.notebooksDevolvidos || 0))}</strong></span>
                    </div>
                  </div>
                </div>

                {/* TABLETS E OUTROS */}
                <div className="col-md-6">
                  <div className="p-3 border rounded bg-light">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fw-bold text-dark fs-13 d-flex align-items-center gap-1">
                        <i className="ri-tablet-line text-secondary fs-16"></i> Tablets & Outros
                      </span>
                      <span className="badge badge-soft-secondary font-monospace fs-11">
                        0 / {outrosTotal}
                      </span>
                    </div>
                    <div className="progress progress-sm my-2" style={{ height: '7px' }}>
                      <div className="progress-bar bg-secondary" style={{ width: '0%' }}></div>
                    </div>
                    <div className="d-flex justify-content-between fs-11 text-muted">
                      <span><strong>0%</strong> devolvidos</span>
                      <span>Restam: <strong>{outrosTotal}</strong></span>
                    </div>
                  </div>
                </div>
              </div>

              {/* PROGRESS OVERVIEW STRIP */}
              <div className="mt-3 p-3 bg-soft-primary rounded border border-primary-subtle d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div className="d-flex align-items-center gap-2">
                  <i className="ri-shield-check-fill fs-22 text-primary"></i>
                  <div>
                    <strong className="d-block text-dark fs-13">Integridade de Baixa Comprovada</strong>
                    <span className="text-muted fs-11">Todos os 415 equipamentos possuem comprovante digital emitido pela EMC.</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onNavigate('contrato')}
                >
                  <i className="ri-search-line me-1"></i> Consultar Itens Baixados
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* LOTES / COMPROVANTES DA EMC */}
        <div className="col-xl-5">
          <div className="card shadow-sm border card-height-100">
            <div className="card-header bg-light border-bottom d-flex align-items-center justify-content-between py-3">
              <div>
                <h5 className="card-title mb-0 fs-15 fw-bold text-dark">
                  <i className="ri-truck-line text-success me-2"></i>
                  Comprovantes de Devolução EMC
                </h5>
                <span className="text-muted fs-12">Romaneios e termos de coleta emitidos</span>
              </div>
              <button
                type="button"
                className="btn btn-soft-secondary btn-sm"
                onClick={() => onNavigate('romaneios')}
              >
                Ver Todos ({stats.totalRomaneios})
              </button>
            </div>

            <div className="card-body p-0">
              {stats.lotesList && stats.lotesList.length > 0 ? (
                <div className="list-group list-group-flush">
                  {stats.lotesList.map((lote) => (
                    <div
                      key={lote.id}
                      className="list-group-item list-group-item-action p-3 d-flex align-items-center justify-content-between"
                      style={{ cursor: 'pointer' }}
                      onClick={() => onNavigate('romaneios')}
                    >
                      <div className="d-flex align-items-center gap-3">
                        <div className="avatar-xs rounded bg-soft-success text-success d-flex align-items-center justify-content-center fs-16 flex-shrink-0">
                          <i className="ri-file-check-line"></i>
                        </div>
                        <div>
                          <div className="d-flex align-items-center gap-2">
                            <span className="fw-bold text-dark fs-13 font-monospace">{lote.comprovante_pdf_emc || lote.numero_romaneio}</span>
                            <span className="badge badge-soft-success fs-10">Baixado</span>
                          </div>
                          <span className="text-muted fs-11 d-block mt-1">
                            <i className="ri-calendar-line me-1"></i>
                            {lote.data_fechamento ? new Date(lote.data_fechamento).toLocaleDateString('pt-BR') : '-'}
                            {lote.responsavel_ti && ` • Resp: ${lote.responsavel_ti}`}
                          </span>
                        </div>
                      </div>

                      <div className="text-end">
                        <span className="badge bg-primary fs-12 font-monospace px-2 py-1">
                          {lote.total_geral} itens
                        </span>
                        <small className="text-muted d-block fs-10 mt-1">
                          {lote.total_monitores > 0 ? `${lote.total_monitores} mon.` : ''}
                          {lote.total_cpus > 0 ? `${lote.total_cpus} cpus` : ''}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-muted">
                  <i className="ri-inbox-line fs-32 text-secondary mb-2 d-block"></i>
                  Nenhum romaneio registrado.
                </div>
              )}
            </div>

            <div className="card-footer bg-light border-top p-2 text-center">
              <button
                type="button"
                className="btn btn-soft-success btn-sm w-100"
                onClick={() => onNavigate('baixa_emc')}
              >
                <i className="ri-file-add-line me-1"></i> Efetivar Nova Baixa Definitiva via PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. BALANÇO POR SECRETARIA & FEED DE ATIVIDADES RECENTES */}
      <div className="row g-3">
        {/* BALANÇO POR SECRETARIA */}
        <div className="col-xl-7">
          <div className="card shadow-sm border card-height-100">
            <div className="card-header bg-light border-bottom d-flex align-items-center justify-content-between py-3">
              <div>
                <h5 className="card-title mb-0 fs-15 fw-bold text-dark">
                  <i className="ri-building-4-line text-primary me-2"></i>
                  Balanço das Devoluções por Secretaria
                </h5>
                <span className="text-muted fs-12">Progresso do recolhimento nas secretarias municipais</span>
              </div>
              <button
                type="button"
                className="btn btn-soft-primary btn-sm"
                onClick={() => onNavigate('secretarias')}
              >
                Ver Todas ({stats.secretariasList?.length || 0})
              </button>
            </div>

            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-striped table-hover align-middle table-nowrap mb-0 border-top">
                  <thead className="table-light text-uppercase fs-11 fw-bold text-muted border-bottom">
                    <tr>
                      <th>Secretaria Municipal</th>
                      <th className="text-center" style={{ width: '90px' }}>Previsto</th>
                      <th className="text-center" style={{ width: '90px' }}>No Galpão</th>
                      <th className="text-center" style={{ width: '100px' }}>Devolvido EMC</th>
                      <th style={{ minWidth: '140px' }}>Progresso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.secretariasList.slice(0, 7).map((s, idx) => (
                      <tr key={s.secretaria}>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <span className="badge bg-light text-dark font-monospace border fs-10" style={{ width: '22px', textAlign: 'center' }}>
                              {idx + 1}º
                            </span>
                            <span className="fw-bold text-dark fs-12">{s.secretaria}</span>
                          </div>
                        </td>
                        <td className="text-center font-monospace fw-semibold fs-12 text-muted">
                          {s.previsto}
                        </td>
                        <td className="text-center">
                          {s.noGalpao > 0 ? (
                            <span className="badge badge-soft-warning font-monospace fs-11">{s.noGalpao}</span>
                          ) : (
                            <span className="text-muted fs-12">-</span>
                          )}
                        </td>
                        <td className="text-center">
                          {s.devolvidoEMC > 0 ? (
                            <span className="badge badge-soft-success font-monospace fs-11 fw-bold">
                              ✓ {s.devolvidoEMC}
                            </span>
                          ) : (
                            <span className="text-muted fs-12">-</span>
                          )}
                        </td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <div className="progress progress-sm flex-grow-1" style={{ height: '6px' }}>
                              <div
                                className={`progress-bar ${s.taxaConclusao >= 80 ? 'bg-success' : s.taxaConclusao > 0 ? 'bg-primary' : 'bg-secondary'}`}
                                style={{ width: `${s.taxaConclusao}%` }}
                              ></div>
                            </div>
                            <span className="fs-11 text-muted fw-bold font-monospace" style={{ minWidth: '35px' }}>
                              {s.taxaConclusao}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* FEED DE MOVIMENTAÇÕES RECENTES */}
        <div className="col-xl-5">
          <div className="card shadow-sm border card-height-100">
            <div className="card-header bg-light border-bottom d-flex align-items-center justify-content-between py-3">
              <div>
                <h5 className="card-title mb-0 fs-15 fw-bold text-dark">
                  <i className="ri-history-line text-primary me-2"></i>
                  Últimos Equipamentos Processados
                </h5>
                <span className="text-muted fs-12">Auditoria de conferência em tempo real</span>
              </div>
              <button
                type="button"
                className="btn btn-soft-secondary btn-sm"
                onClick={() => onNavigate('galpao')}
              >
                Ver Galpão
              </button>
            </div>

            <div className="card-body p-0">
              {stats.recentScans.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="ri-inbox-line fs-36 text-secondary mb-2 d-block"></i>
                  Nenhum equipamento conferido recentemente.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-striped table-hover align-middle table-nowrap mb-0 border-top">
                    <thead className="table-light text-uppercase fs-11 fw-bold text-muted border-bottom">
                      <tr>
                        <th>Patrimônio</th>
                        <th>Tipo</th>
                        <th>Documento / Origem</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentScans.slice(0, 8).map((item) => (
                        <tr key={item.id}>
                          <td>
                            <span className="font-monospace fw-bold text-primary fs-12">
                              {item.codigo_bipado}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-soft-dark fs-10 text-uppercase">
                              {item.tipo_equipamento}
                            </span>
                          </td>
                          <td>
                            <div className="d-flex flex-column" style={{ maxWidth: '140px' }}>
                              <span className="fs-11 fw-semibold text-dark text-truncate">
                                {item.comprovante_baixa_emc || item.secretaria_prevista || item.localidade_coletada}
                              </span>
                              {item.servidor_previsto && item.servidor_previsto !== 'Não Declarado' && (
                                <small className="text-muted fs-10 text-truncate">
                                  {item.servidor_previsto}
                                </small>
                              )}
                            </div>
                          </td>
                          <td>
                            {item.status_etapa === 'devolvido_emc' ? (
                              <span className="badge badge-soft-success fs-10 d-inline-flex align-items-center">
                                <i className="ri-checkbox-circle-fill me-1"></i> Baixado EMC
                              </span>
                            ) : (
                              <span className="badge badge-soft-warning fs-10 d-inline-flex align-items-center">
                                <i className="ri-inbox-archive-fill me-1"></i> No Galpão
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// VIEW: COLETOR MOBILE COM CÂMERA (PWA)
// ==========================================
// Singleton AudioContext for instant zero-latency beeps
let sharedAudioCtx = null;
function getAudioContext() {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

function playScannerSound(type = 'success') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'success') {
      // Dual-tone high-frequency Zebra/Honeywell POS chime: 920Hz (50ms) -> 1350Hz (80ms)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(920, now);
      osc.frequency.setValueAtTime(1350, now + 0.05);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
      if (navigator.vibrate) navigator.vibrate(60);
    } else if (type === 'duplicate') {
      // Distinctive triple-tone alarm for duplicate scan lock
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.setValueAtTime(360, now + 0.08);
      osc.frequency.setValueAtTime(480, now + 0.16);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
      if (navigator.vibrate) navigator.vibrate([100, 60, 100, 60, 100]);
    } else if (type === 'warning') {
      // Alert double beep: 620Hz down to 460Hz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.setValueAtTime(460, now + 0.08);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
      if (navigator.vibrate) navigator.vibrate([80, 50, 80]);
    } else {
      // Low buzz error
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
      if (navigator.vibrate) navigator.vibrate(200);
    }
  } catch (e) {}
}

// Analisador inteligente e rigoroso de código de barras para equipamentos da Prefeitura / EMC (Dell)
function parseEmcBarcode(rawCode) {
  if (!rawCode) return { valid: false, reason: 'empty', message: 'Código vazio.' };

  let clean = String(rawCode).trim().toUpperCase();

  // 1. Remover prefixos de leitura comuns: EMC, PATRIMONIO, PAT
  clean = clean.replace(/^(EMC|PATRIMONIO|PAT)[\s\-_.:]*/i, '').trim();

  // 2. Telefone impresso no cabeçalho da etiqueta branca EMC: (31) 21212121
  const onlyDigits = clean.replace(/\D/g, '');
  if (onlyDigits === '21212121' || onlyDigits === '3121212121') {
    return {
      valid: false,
      reason: 'phone',
      message: 'Telefone da EMC (21212121) ignorado. Foque nas barras pretas do código!'
    };
  }

  // 3. Dell Express Service Code (10 a 11 dígitos numéricos, ex: 7459197088, 35505254415)
  if (/^\d{10,12}$/.test(clean)) {
    return {
      valid: false,
      reason: 'express_code',
      message: `Express Service Code (${clean}) descartado. Foque na etiqueta branca EMC!`
    };
  }

  // 4. Patrimônio Oficial EMC: exatamente 5 ou 6 dígitos numéricos (99%+ dos itens contratuais EMC)
  if (/^\d{5,6}$/.test(clean)) {
    return {
      valid: true,
      code: clean,
      type: 'patrimonio',
      label: 'Patrimônio EMC',
      isOfficial: true
    };
  }

  // 5. Dell Service Tag: exatamente 7 caracteres alfanuméricos contendo letras (ex: 3FD0HB4, GB6WTN3)
  if (/^[A-Z0-9]{7}$/.test(clean) && /[A-Z]/.test(clean)) {
    return {
      valid: true,
      code: clean,
      type: 'service_tag',
      label: 'Dell Service Tag',
      isOfficial: false
    };
  }

  return {
    valid: false,
    reason: 'unrecognized',
    message: `Código lido (${clean}) descartado. O patrimônio oficial EMC possui 5 ou 6 dígitos.`
  };
}

function ColetorMobileView({ onUpdated, notify, onNavigate }) {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [tipoEquipamento, setTipoEquipamento] = useState('CPU');
  const [localidade, setLocalidade] = useState('Recolhimento em Campo');
  const [manualCode, setManualCode] = useState('');
  const [processing, setProcessing] = useState(false);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);
  const [discardAlert, setDiscardAlert] = useState(null);
  const [sessionScans, setSessionScans] = useState(() => {
    try {
      const saved = localStorage.getItem('coletor_session_scans');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('coletor_session_scans', JSON.stringify(sessionScans.slice(0, 300)));
    } catch (e) {}
  }, [sessionScans]);

  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [flashFeedback, setFlashFeedback] = useState(null); // 'success' | 'warning' | 'error' | 'duplicate'

  // Trava anti-duplicidade e alerta
  const [bloquearDuplicados, setBloquearDuplicados] = useState(true);
  const [duplicateAlert, setDuplicateAlert] = useState(null);

  // Controle de Zoom
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hasZoom, setHasZoom] = useState(false);
  const [zoomMinMax, setZoomMinMax] = useState({ min: 1, max: 3, step: 0.1 });

  const html5QrCodeRef = useRef(null);
  const lastScannedCodeRef = useRef('');
  const lastScannedTimeRef = useRef(0);
  const candidateRef = useRef({ code: '', count: 0, time: 0 }); // Filtro de consenso duplo
  const isProcessingRef = useRef(false);
  const sessionScansRef = useRef(sessionScans);
  sessionScansRef.current = sessionScans;

  const handleRegisterCode = (parsedOrCode, forceAllow = false) => {
    if (!parsedOrCode) return;
    let parseResult;
    if (typeof parsedOrCode === 'object' && parsedOrCode.code) {
      parseResult = parsedOrCode;
    } else {
      parseResult = parseEmcBarcode(parsedOrCode);
      if (!parseResult.valid && !forceAllow) {
        if (notify) notify('warning', parseResult.message || 'Código não reconhecido como patrimônio EMC.');
        return;
      }
    }

    const clean = parseResult.code || String(parsedOrCode).trim().toUpperCase();
    if (!clean) return;

    // Trava de Leitura Duplicada: se já foi lido nesta sessão e não for forçado
    if (bloquearDuplicados && !forceAllow) {
      const alreadyInSession = sessionScansRef.current.find(
        (s) => s.codigo === clean || (s.codigoNormalizado && s.codigoNormalizado === clean)
      );

      if (alreadyInSession) {
        // Alerta sonoro e visual de duplicado sem salvar novamente
        playScannerSound('duplicate');
        setFlashFeedback('duplicate');
        setTimeout(() => setFlashFeedback(null), 800);

        const hora = alreadyInSession.timestamp || 'neste lote';
        setDuplicateAlert({
          codigo: clean,
          prevTime: hora,
          message: `Código ${clean} já está na lista atual (lido às ${hora}). Trava anti-duplicidade impediu duplicar!`
        });

        setTimeout(() => {
          setDuplicateAlert((curr) => (curr && curr.codigo === clean ? null : curr));
        }, 5000);

        return; // BLOQUEIA A LEITURA DUPLICADA
      }
    }

    // Feedback sonoro e tátil instantâneo (sem salvar no banco ainda)
    playScannerSound('success');
    if (navigator.vibrate) {
      try { navigator.vibrate([60, 40, 60]); } catch (e) {}
    }
    setFlashFeedback('success');
    setTimeout(() => setFlashFeedback(null), 500);

    const nowTime = new Date().toLocaleTimeString('pt-BR');
    const newItem = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      codigo: clean,
      tipo: tipoEquipamento,
      tipoEtiqueta: parseResult.label || 'Patrimônio EMC',
      isOfficial: !!parseResult.isOfficial,
      localidade: localidade || 'Galpão Central',
      timestamp: nowTime,
      descricao: 'Consultando base contratual...',
      status: 'verificando'
    };

    setLastScanResult(newItem);
    setDuplicateAlert(null);
    setDiscardAlert(null);

    // Adiciona à lista de conferência local da sessão
    setSessionScans((prev) => [newItem, ...prev]);

    // Consulta instantânea em background na base contratual da EMC (leitura pura em memória, 0ms)
    fetch(`${API_BASE}/conciliacao/consultar?codigo=${encodeURIComponent(clean)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.encontrado) {
          const desc = json.descricao || (json.noContrato ? 'Ativo Oficial Contrato EMC' : 'Equipamento Localizado');
          setSessionScans((prev) =>
            prev.map((s) =>
              s.id === newItem.id
                ? {
                    ...s,
                    descricao: desc,
                    tipo: json.tipo || s.tipo,
                    status: json.status,
                    secretariaPrevista: json.secretaria,
                    servidorPrevisto: json.servidor,
                    noContrato: json.noContrato
                  }
                : s
            )
          );
          setLastScanResult((curr) =>
            curr && curr.id === newItem.id
              ? {
                  ...curr,
                  descricao: desc,
                  tipo: json.tipo || curr.tipo,
                  status: json.status,
                  secretariaPrevista: json.secretaria,
                  servidorPrevisto: json.servidor,
                  noContrato: json.noContrato
                }
              : curr
          );
        } else {
          setSessionScans((prev) =>
            prev.map((s) =>
              s.id === newItem.id
                ? {
                    ...s,
                    descricao: 'Não localizado no contrato EMC (Excedente)',
                    status: 'excedente',
                    noContrato: false
                  }
                : s
            )
          );
          setLastScanResult((curr) =>
            curr && curr.id === newItem.id
              ? {
                  ...curr,
                  descricao: 'Não localizado no contrato EMC (Excedente)',
                  status: 'excedente',
                  noContrato: false
                }
              : curr
          );
        }
      })
      .catch(() => {});
  };

  const onBarcodeDetected = (decodedText) => {
    if (!decodedText || isProcessingRef.current) return;
    const now = Date.now();

    // 1. Analisador inteligente da etiqueta física
    const parseResult = parseEmcBarcode(decodedText);

    // Se for etiqueta descartada (Dell Express ou Telefone EMC), emitir feedback de alerta
    if (!parseResult.valid) {
      if (parseResult.reason === 'phone' || parseResult.reason === 'express_code') {
        if (now - lastScannedTimeRef.current > 3000) {
          lastScannedTimeRef.current = now;
          playScannerSound('warning');
          setFlashFeedback('warning');
          setDiscardAlert({
            code: decodedText,
            message: parseResult.message
          });
          setTimeout(() => setFlashFeedback(null), 800);
          setTimeout(() => {
            setDiscardAlert((curr) => (curr && curr.code === decodedText ? null : curr));
          }, 4500);
        }
      }
      return;
    }

    const clean = parseResult.code;

    // Cooldown de 3.5 segundos para o MESMO código já confirmado
    if (clean === lastScannedCodeRef.current && (now - lastScannedTimeRef.current < 3500)) {
      return;
    }

    // 2. Filtro de Consenso Duplo (Anti-Falso Positivo):
    // Exige 2 detecções idênticas consecutivas na janela de 500ms para confirmar o código
    const cand = candidateRef.current;
    if (cand.code === clean && (now - cand.time < 500)) {
      cand.count += 1;
    } else {
      candidateRef.current = { code: clean, count: 1, time: now };
      return; // Aguarda 2º frame consecutivo de confirmação
    }

    if (cand.count < 2) {
      return;
    }

    // Confirmado com 2 frames idênticos!
    candidateRef.current = { code: '', count: 0, time: 0 };
    lastScannedCodeRef.current = clean;
    lastScannedTimeRef.current = now;

    handleRegisterCode(parseResult);
  };

  const startCamera = async (camId) => {
    setCameraError(null);
    getAudioContext(); // warm up audio context on user gesture
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
      }

      // Scanner de alta precisão focado estritamente em CODE_128 (elimina leituras parciais de ITF/Codabar)
      const scanner = new Html5Qrcode("camera-reader", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE
        ],
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true // BarcodeDetector nativo no Chromium / Android
        }
      });
      html5QrCodeRef.current = scanner;

      const cameraConfig = camId ? camId : { facingMode: "environment" };

      // Resolução HD 720p otimizada para macro focus rápido + Mira quadrada que lê na horizontal e vertical
      await scanner.start(
        cameraConfig,
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const boxSize = Math.max(220, Math.min(Math.floor(minEdge * 0.82), 340));
            return {
              width: boxSize,
              height: boxSize
            };
          },
          aspectRatio: 1.0,
          videoConstraints: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
            focusMode: { ideal: "continuous" }
          }
        },
        onBarcodeDetected,
        () => {}
      );

      setIsScanning(true);

      // Detectar suporte a Lanterna e Zoom
      try {
        const track = scanner.getRunningTrackCameraCapabilities();
        if (track) {
          if (typeof track.torchFeature === 'function' && track.torchFeature().isSupported()) {
            setHasTorch(true);
          }
          if (typeof track.zoomFeature === 'function' && track.zoomFeature().isSupported()) {
            const zf = track.zoomFeature();
            setHasZoom(true);
            setZoomMinMax({
              min: zf.min() || 1,
              max: Math.min(zf.max() || 4, 3),
              step: zf.step() || 0.1
            });
            setZoomLevel(zf.value() || 1);
          }
        }
      } catch (e) {
        try {
          const video = document.querySelector("#camera-reader video");
          const track = video?.srcObject?.getVideoTracks?.()[0];
          const caps = track?.getCapabilities?.() || {};
          if (caps.torch) setHasTorch(true);
          if (caps.zoom) {
            setHasZoom(true);
            setZoomMinMax({ min: caps.zoom.min || 1, max: Math.min(caps.zoom.max || 4, 3), step: caps.zoom.step || 0.1 });
          }
        } catch (err2) {}
      }
    } catch (err) {
      console.error('Erro ao ligar câmera:', err);
      setCameraError('Permissão de câmera negada ou dispositivo indisponível. Você pode usar a entrada manual abaixo.');
      setIsScanning(false);
    }
  };

  const handleZoomChange = async (newZoom) => {
    setZoomLevel(newZoom);
    if (!html5QrCodeRef.current) return;
    try {
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ zoom: Number(newZoom) }]
      });
    } catch (e) {
      try {
        const video = document.querySelector("#camera-reader video");
        const track = video?.srcObject?.getVideoTracks?.()[0];
        if (track && track.applyConstraints) {
          await track.applyConstraints({ advanced: [{ zoom: Number(newZoom) }] });
        }
      } catch (err2) {}
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) {}
    }
    setIsScanning(false);
    setTorchOn(false);
    setDuplicateAlert(null);
  };

  const toggleTorch = async () => {
    if (!html5QrCodeRef.current) return;
    try {
      const nextTorch = !torchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch }]
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch não suportado:', e);
    }
  };

  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setAvailableCameras(devices);
          const backCam = devices.find(
            (d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('traseira') || d.label.toLowerCase().includes('rear')
          );
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        }
      })
      .catch((e) => {
        console.warn('Erro ao listar câmeras:', e);
      });

    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        try {
          html5QrCodeRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const handleRemoveItem = (id, codigo) => {
    setSessionScans((prev) => prev.filter((s) => s.id !== id));
    if (lastScanResult && (lastScanResult.id === id || lastScanResult.codigo === codigo)) {
      setLastScanResult(null);
    }
    if (notify) {
      notify('info', `Item ${codigo} removido da lista de conferência.`);
    }
  };

  const handleClearSession = () => {
    if (sessionScans.length === 0) return;
    if (window.confirm(`Deseja limpar todos os ${sessionScans.length} itens desta lista de conferência? Eles ainda não foram enviados para o Galpão.`)) {
      setSessionScans([]);
      localStorage.removeItem('coletor_session_scans');
      setLastScanResult(null);
      if (notify) notify('info', 'Lista de conferência limpa.');
    }
  };

  const handleFinalizarColeta = async () => {
    if (sessionScans.length === 0 || isSubmittingBatch) return;

    const count = sessionScans.length;
    const confirmMsg = `Confirma a entrada de ${count} equipamento(s) no Galpão?\n\nEles serão gravados permanentemente no banco de dados e sincronizados na nuvem Turso.`;
    if (!window.confirm(confirmMsg)) return;

    setIsSubmittingBatch(true);
    try {
      const res = await fetch(`${API_BASE}/conciliacao/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: sessionScans.map((s) => ({
            codigo: s.codigo,
            tipo: s.tipo || tipoEquipamento,
            hora: s.timestamp
          })),
          rawText: sessionScans.map((s) => `${s.tipo || 'CPU'}: ${s.codigo}`).join('\n'),
          localidadeFallback: localidade || 'Galpão Central',
          nomeArquivo: `coleta_campo_${new Date().toISOString().slice(0, 10)}.txt`
        })
      });

      const json = await res.json();
      if (json.success) {
        playScannerSound('success');
        setSessionScans([]);
        localStorage.removeItem('coletor_session_scans');
        setLastScanResult(null);

        if (notify) {
          notify('success', `🎉 Sucesso! ${count} equipamentos deram entrada no Galpão e foram salvos no banco de dados e nuvem Turso!`);
        } else {
          alert(`Sucesso! ${count} equipamentos gravados no Galpão e nuvem Turso!`);
        }

        if (onUpdated) onUpdated();
      } else {
        playScannerSound('error');
        if (notify) notify('error', json.message || 'Erro ao registrar no banco de dados.');
        else alert(json.message || 'Erro ao gravar no banco.');
      }
    } catch (e) {
      playScannerSound('error');
      if (notify) notify('error', 'Falha ao conectar com o servidor para gravar o lote.');
      else alert('Falha ao conectar com o servidor.');
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    const parsed = parseEmcBarcode(manualCode.trim());
    if (!parsed.valid) {
      if (window.confirm(`O código digitado (${manualCode.trim()}) não parece ser patrimônio EMC padrão (5 ou 6 dígitos). Deseja adicionar à lista mesmo assim?`)) {
        handleRegisterCode(manualCode.trim(), true);
        setManualCode('');
      }
    } else {
      handleRegisterCode(parsed);
      setManualCode('');
    }
  };

  const handleExportSessionCSV = () => {
    if (sessionScans.length === 0) return;
    let csv = '\ufeff#;Código;Tipo;Etiqueta;Localidade;Hora_Coleta\r\n';
    sessionScans.forEach((s, idx) => {
      csv += `"${idx + 1}";"${s.codigo}";"${s.tipo || 'CPU'}";"${s.tipoEtiqueta || 'Patrimônio EMC'}";"${s.localidade || localidade}";"${s.timestamp}"\r\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coleta_campo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. TOP METRICS & QUICK CONFIG BANNER */}
      <div className="card shadow-sm border mb-0">
        <div className="card-body p-3">
          <div className="row align-items-center g-3">
            <div className="col-lg-5 col-md-12">
              <div className="d-flex align-items-center gap-2">
                <div className="avatar-xs rounded bg-info text-white d-flex align-items-center justify-content-center">
                  <i className="ri-qr-scan-2-line fs-14"></i>
                </div>
                <div>
                  <h5 className="card-title mb-0 fs-15 fw-bold text-dark">
                    Modo Coletor Mobile (Lote com Revisão Pré-Galpão)
                  </h5>
                  <span className="text-muted fs-12">
                    Filtro óptico inteligente para etiquetas EMC com conferência antes do envio
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Session Counter Badges */}
            <div className="col-lg-7 col-md-12 d-flex flex-wrap align-items-center justify-content-lg-end gap-2">
              <button
                type="button"
                className="btn btn-sm btn-soft-secondary d-flex align-items-center gap-1 rounded-pill"
                onClick={() => playScannerSound('success')}
                title="Testar bip sonoro"
              >
                <i className="ri-volume-up-line text-success fs-14"></i>
                <span className="fs-11">Testar Bip</span>
              </button>

              <button
                type="button"
                className={`btn btn-sm ${bloquearDuplicados ? 'btn-soft-success text-success border border-success' : 'btn-soft-warning text-dark border border-warning'} d-flex align-items-center gap-1 rounded-pill`}
                onClick={() => setBloquearDuplicados(!bloquearDuplicados)}
                title={bloquearDuplicados ? "Trava Anti-Duplicidade Ativa: Impede ler o mesmo código mais de uma vez no lote" : "Trava Desativada: Permite ler o mesmo código várias vezes"}
              >
                <i className={`ri-${bloquearDuplicados ? 'shield-check-fill' : 'shield-line'} fs-14`}></i>
                <span className="fs-11 fw-bold">
                  {bloquearDuplicados ? 'Trava Duplicados: ATIVA' : 'Trava Duplicados: DESLIGADA'}
                </span>
              </button>

              <span className="badge bg-primary fs-12 px-3 py-2 rounded-pill font-monospace">
                Itens no Lote: <strong>{sessionScans.length}</strong>
              </span>

              {sessionScans.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-success fw-bold d-flex align-items-center gap-1 rounded-pill px-3 shadow-sm"
                  onClick={handleFinalizarColeta}
                  disabled={isSubmittingBatch}
                >
                  <i className="ri-inbox-archive-line"></i>
                  <span>Enviar ao Galpão ({sessionScans.length})</span>
                </button>
              )}

              {availableCameras.length > 1 && (
                <select
                  className="form-select form-select-sm"
                  style={{ width: '170px' }}
                  value={selectedCameraId}
                  onChange={(e) => {
                    setSelectedCameraId(e.target.value);
                    if (isScanning) {
                      stopCamera().then(() => startCamera(e.target.value));
                    }
                  }}
                >
                  {availableCameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.label || `Câmera ${cam.id.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Quick Collection Context Preset Bar */}
          <div className="row g-2 mt-2 pt-2 border-top align-items-center">
            <div className="col-md-5 col-12">
              <label className="text-muted fs-11 text-uppercase fw-bold mb-1 d-block">
                Localidade / Prédio Sendo Coletado:
              </label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Ex: Galpão Central, Sala 102..."
                value={localidade}
                onChange={(e) => setLocalidade(e.target.value)}
              />
            </div>

            <div className="col-md-7 col-12">
              <label className="text-muted fs-11 text-uppercase fw-bold mb-1 d-block">
                Tipo de Ativo Atual (Selecione para coletar o lote):
              </label>
              <div className="btn-group w-100" role="group">
                <button
                  type="button"
                  className={`btn btn-sm ${tipoEquipamento === 'CPU' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}`}
                  onClick={() => setTipoEquipamento('CPU')}
                >
                  <i className="ri-computer-line me-1"></i> CPU
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${tipoEquipamento === 'MONITOR' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}`}
                  onClick={() => setTipoEquipamento('MONITOR')}
                >
                  <i className="ri-tv-line me-1"></i> Monitor
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${tipoEquipamento === 'NOTEBOOK' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}`}
                  onClick={() => setTipoEquipamento('NOTEBOOK')}
                >
                  <i className="ri-macbook-line me-1"></i> Notebook
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${tipoEquipamento === 'OUTRO' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}`}
                  onClick={() => setTipoEquipamento('OUTRO')}
                >
                  Outro
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CAMERA VIEWFINDER & LIVE SCANNING DECK */}
      <div className="row g-3">
        {/* Left Column: Interactive Camera Viewfinder */}
        <div className="col-lg-7">
          <div className="card border shadow-sm h-100">
            <div className="card-header bg-dark text-white d-flex align-items-center justify-content-between py-2">
              <div className="d-flex align-items-center gap-2">
                <span className={`badge ${isScanning ? 'bg-success' : 'bg-secondary'} rounded-pill`}>
                  {isScanning ? '● CÂMERA AO VIVO (HD 1080p)' : '○ CÂMERA DESLIGADA'}
                </span>
                <span className="fs-12 text-light d-none d-sm-inline">Foco Automático Contínuo</span>
              </div>

              <div className="d-flex align-items-center gap-1">
                {/* Hardware Zoom Selector */}
                {hasZoom && isScanning && (
                  <div className="btn-group btn-group-sm me-1" role="group">
                    {[1, 1.5, 2, 2.5].filter(z => z <= (zoomMinMax.max || 3)).map((z) => (
                      <button
                        key={z}
                        type="button"
                        className={`btn btn-xs ${zoomLevel === z ? 'btn-primary fw-bold' : 'btn-outline-light'}`}
                        onClick={() => handleZoomChange(z)}
                        title={`Zoom ${z}x`}
                      >
                        {z}x
                      </button>
                    ))}
                  </div>
                )}

                {hasTorch && isScanning && (
                  <button
                    type="button"
                    className={`btn btn-sm btn-icon ${torchOn ? 'btn-warning' : 'btn-outline-light'}`}
                    onClick={toggleTorch}
                    title="Alternar Lanterna / Flash"
                  >
                    <i className="ri-flashlight-line fs-14"></i>
                  </button>
                )}
                {isScanning ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger px-3 py-1 d-flex align-items-center gap-1"
                    onClick={stopCamera}
                  >
                    <i className="ri-stop-circle-line"></i> Pausar Câmera
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm btn-success px-3 py-1 d-flex align-items-center gap-1"
                    onClick={() => startCamera(selectedCameraId)}
                  >
                    <i className="ri-camera-lens-line"></i> Iniciar Câmera
                  </button>
                )}
              </div>
            </div>

            <div
              className="card-body p-0 bg-dark text-center position-relative overflow-hidden"
              style={{
                minHeight: '340px',
                transition: 'box-shadow 0.15s ease',
                boxShadow: flashFeedback === 'success'
                  ? 'inset 0 0 0 10px #0ab39c, 0 0 40px #0ab39c'
                  : flashFeedback === 'warning'
                  ? 'inset 0 0 0 10px #f7b84b, 0 0 40px #f7b84b'
                  : flashFeedback === 'duplicate'
                  ? 'inset 0 0 0 12px #ff9800, 0 0 45px #ff9800'
                  : flashFeedback === 'error'
                  ? 'inset 0 0 0 10px #f06548, 0 0 40px #f06548'
                  : 'none'
              }}
            >
              {/* Target Viewfinder Container */}
              <div
                id="camera-reader"
                style={{ width: '100%', minHeight: '340px', background: '#000' }}
              ></div>

              {/* Floating Counter Badge on Viewfinder */}
              <div
                className="position-absolute top-0 start-50 translate-middle-x mt-2 px-3 py-1 rounded-pill bg-dark bg-opacity-75 text-white fs-12 fw-bold shadow-sm d-flex align-items-center gap-2"
                style={{ zIndex: 6, backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <span className="badge bg-info text-dark font-monospace">{sessionScans.length}</span>
                <span>no Lote Atual</span>
                {sessionScans.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-link text-white-50 p-0 fs-11 ms-1 text-decoration-none"
                    onClick={handleClearSession}
                    title="Limpar lote atual"
                  >
                    <i className="ri-close-circle-line fs-14 text-white"></i>
                  </button>
                )}
              </div>

              {/* Mira Óptica com Retículo de 4 Cantos e Guias Horizontal + Vertical */}
              {isScanning && (
                <div
                  className="position-absolute top-50 start-50 translate-middle pointer-events-none"
                  style={{
                    width: '240px',
                    height: '240px',
                    border: '1.5px dashed rgba(255, 255, 255, 0.45)',
                    borderRadius: '16px',
                    zIndex: 4,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.38)'
                  }}
                >
                  {/* Cantos de Enquadramento */}
                  <div style={{ position: 'absolute', top: '-2px', left: '-2px', width: '22px', height: '22px', borderTop: '4px solid #10b981', borderLeft: '4px solid #10b981', borderTopLeftRadius: '14px' }}></div>
                  <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '22px', height: '22px', borderTop: '4px solid #10b981', borderRight: '4px solid #10b981', borderTopRightRadius: '14px' }}></div>
                  <div style={{ position: 'absolute', bottom: '-2px', left: '-2px', width: '22px', height: '22px', borderBottom: '4px solid #10b981', borderLeft: '4px solid #10b981', borderBottomLeftRadius: '14px' }}></div>
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '22px', height: '22px', borderBottom: '4px solid #10b981', borderRight: '4px solid #10b981', borderBottomRightRadius: '14px' }}></div>

                  {/* Guia Laser Horizontal */}
                  <div style={{ position: 'absolute', top: '50%', left: '8px', right: '8px', height: '2px', background: 'rgba(239, 68, 68, 0.9)', boxShadow: '0 0 8px #ef4444' }}></div>

                  {/* Guia Laser Vertical Central */}
                  <div style={{ position: 'absolute', left: '50%', top: '8px', bottom: '8px', width: '1px', background: 'rgba(239, 68, 68, 0.45)' }}></div>

                  {/* Dica de Enquadramento */}
                  <span
                    style={{
                      position: 'absolute',
                      top: '-22px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: '11px',
                      color: '#34d399',
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                      whiteSpace: 'nowrap',
                      textShadow: '0 1px 3px rgba(0,0,0,0.95)'
                    }}
                  >
                    FOQUE A ETIQUETA BRANCA EMC
                  </span>

                  <span
                    style={{
                      position: 'absolute',
                      bottom: '6px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: '10px',
                      color: 'rgba(255,255,255,0.85)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      textShadow: '0 1px 3px rgba(0,0,0,0.95)'
                    }}
                  >
                    Lê na Horizontal e Vertical
                  </span>
                </div>
              )}

              {/* Floating Detection Flash Banner Overlay */}
              {flashFeedback && (
                <div
                  className={`position-absolute top-0 start-0 end-0 p-3 text-white fw-bold text-center fs-16 shadow ${
                    flashFeedback === 'success'
                      ? 'bg-success'
                      : flashFeedback === 'warning'
                      ? 'bg-warning text-dark'
                      : flashFeedback === 'duplicate'
                      ? 'bg-warning text-dark border-bottom border-dark'
                      : 'bg-danger'
                  }`}
                  style={{ zIndex: 10, animation: 'fadeIn 0.15s' }}
                >
                  <i className={`ri-${flashFeedback === 'success' ? 'checkbox-circle-fill' : flashFeedback === 'duplicate' ? 'lock-2-fill' : 'error-warning-fill'} me-2 fs-18`}></i>
                  {flashFeedback === 'duplicate'
                    ? `⚠️ ATENÇÃO: Código ${lastScannedCodeRef.current} já foi adicionado ao lote!`
                    : flashFeedback === 'warning'
                    ? `⚠️ FILTRO: Etiqueta não reconhecida descartada`
                    : lastScanResult
                    ? `✓ ${lastScanResult.codigo} (${lastScanResult.tipo}) Adicionado à Lista!`
                    : '✓ CÓDIGO ADICIONADO À LISTA!'}
                </div>
              )}

              {!isScanning && (
                <div
                  className="position-absolute top-50 start-50 translate-middle text-center w-100 p-4"
                  style={{ zIndex: 5 }}
                >
                  <div className="avatar-lg rounded-circle bg-soft-info mx-auto d-flex align-items-center justify-content-center text-info fs-36 mb-3">
                    <i className="ri-qr-scan-2-line"></i>
                  </div>
                  <h5 className="text-white fs-16 mb-2">Câmera Pronta para Escaneamento</h5>
                  <p className="text-muted fs-12 mb-3" style={{ maxWidth: '380px', margin: '0 auto' }}>
                    Toque no botão abaixo para ativar a câmera. Aponte para a etiqueta branca EMC de cada máquina: o leitor adiciona à lista local com bip sonoro!
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg rounded-pill px-4 shadow"
                    onClick={() => startCamera(selectedCameraId)}
                  >
                    <i className="ri-camera-fill me-2"></i> Ativar Leitor Óptico
                  </button>
                </div>
              )}

              {cameraError && (
                <div className="alert alert-warning m-3 text-start fs-12" role="alert">
                  <i className="ri-error-warning-line me-1"></i> {cameraError}
                </div>
              )}
            </div>

            {/* Alerta de Descarte pelo Filtro de Etiquetas */}
            {discardAlert && (
              <div
                className="alert alert-warning border border-warning shadow-sm mx-3 mt-3 mb-0 d-flex align-items-center justify-content-between p-2"
                style={{ borderRadius: '8px' }}
              >
                <div className="d-flex align-items-center gap-2">
                  <div className="avatar-xs rounded-circle bg-warning text-dark d-flex align-items-center justify-content-center flex-shrink-0">
                    <i className="ri-filter-3-line fs-16"></i>
                  </div>
                  <div>
                    <div className="fw-bold fs-12 text-dark">
                      Filtro Inteligente: Etiqueta Ignorada
                    </div>
                    <div className="fs-11 text-muted">
                      {discardAlert.message}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-xs btn-outline-dark fw-bold ms-2 flex-shrink-0"
                  onClick={() => setDiscardAlert(null)}
                >
                  OK
                </button>
              </div>
            )}

            {/* Alerta de Trava Anti-Duplicidade */}
            {duplicateAlert && (
              <div
                className="alert alert-warning border border-warning shadow-sm mx-3 mt-3 mb-0 d-flex align-items-center justify-content-between p-2"
                style={{ borderRadius: '8px' }}
              >
                <div className="d-flex align-items-center gap-2">
                  <div className="avatar-xs rounded-circle bg-warning text-dark d-flex align-items-center justify-content-center flex-shrink-0">
                    <i className="ri-shield-alert-line fs-16"></i>
                  </div>
                  <div>
                    <div className="fw-bold fs-12 text-dark">
                      Trava Anti-Duplicidade: <span className="font-monospace text-primary">{duplicateAlert.codigo}</span>
                    </div>
                    <div className="fs-11 text-muted">
                      {duplicateAlert.message}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-xs btn-outline-dark fw-bold ms-2 flex-shrink-0"
                  onClick={() => handleRegisterCode(duplicateAlert.codigo, true)}
                  title="Registrar este código mesmo sendo duplicado"
                >
                  Registrar Assim Mesmo
                </button>
              </div>
            )}

            {/* Manual Backup Input Form */}
            <div className="card-footer bg-light border-top p-3">
              <form onSubmit={handleManualSubmit}>
                <label className="text-muted fs-11 text-uppercase fw-bold mb-1">
                  Ou digite / bipe com leitor USB externo:
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-white">
                    <i className="ri-barcode-line text-muted"></i>
                  </span>
                  <input
                    type="text"
                    className="form-control font-monospace fw-bold"
                    placeholder="Ex: 181066, 136008, 156012..."
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                  />
                  <button
                    className="btn btn-primary px-4"
                    type="submit"
                    disabled={!manualCode.trim()}
                  >
                    Adicionar à Lista
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Right Column: Staging List & Submission Deck */}
        <div className="col-lg-5">
          {/* Action Callout: Submit Batch to Warehouse */}
          <div className="card border-0 shadow-sm mb-3" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: '12px' }}>
            <div className="card-body p-3 text-white text-center">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="badge bg-white text-success fw-bold fs-12 px-2 py-1 rounded-pill">
                  {sessionScans.length} {sessionScans.length === 1 ? 'item coletado' : 'itens coletados'}
                </span>
                <span className="fs-11 text-white-50">
                  <i className="ri-database-2-line me-1"></i> Pré-Galpão
                </span>
              </div>
              <h5 className="text-white fw-bold mb-1 fs-16">
                Pronto para Dar Entrada no Galpão?
              </h5>
              <p className="text-white-50 fs-12 mb-3">
                Revise os patrimônios abaixo. Quando conferir tudo, clique no botão para salvar no banco de dados e nuvem Turso.
              </p>
              <button
                type="button"
                className="btn btn-light text-success fw-bold w-100 py-3 fs-15 shadow d-flex align-items-center justify-content-center gap-2 rounded-pill"
                disabled={sessionScans.length === 0 || isSubmittingBatch}
                onClick={handleFinalizarColeta}
              >
                {isSubmittingBatch ? (
                  <>
                    <span className="spinner-border spinner-border-sm text-success" role="status" aria-hidden="true"></span>
                    <span>Gravando {sessionScans.length} itens no Galpão...</span>
                  </>
                ) : (
                  <>
                    <i className="ri-inbox-archive-fill fs-18"></i>
                    <span>Finalizar Coleta e Dar Entrada ({sessionScans.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Instant Detection Card: Last Scanned Item */}
          {lastScanResult && (
            <div className="card border shadow-sm mb-3 border-success">
              <div className="card-header bg-soft-success border-bottom py-2 d-flex justify-content-between align-items-center">
                <h6 className="card-title mb-0 fs-13 fw-bold text-success d-flex align-items-center gap-1">
                  <i className="ri-checkbox-circle-fill"></i>
                  Último Adicionado à Lista
                </h6>
                <button
                  type="button"
                  className="btn btn-xs btn-outline-danger fw-bold"
                  onClick={() => handleRemoveItem(lastScanResult.id, lastScanResult.codigo)}
                  title="Remover este item da lista"
                >
                  <i className="ri-delete-bin-line me-1"></i> Desfazer Leitura
                </button>
              </div>
              <div className="card-body p-3">
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <span className="text-muted fs-11 text-uppercase fw-bold">Patrimônio / Código:</span>
                    <h3 className="font-monospace fw-bold text-dark mb-0 fs-24">
                      {lastScanResult.codigo}
                    </h3>
                  </div>
                  <div className="text-end">
                    <span className="badge bg-primary fs-11 px-2 py-1 mb-1 d-inline-block">
                      {lastScanResult.tipo}
                    </span>
                    <div className="text-muted fs-11">{lastScanResult.timestamp}</div>
                  </div>
                </div>
                {lastScanResult.descricao && (
                  <div className="mt-2 pt-2 border-top fs-12 text-dark fw-semibold d-flex align-items-center gap-1">
                    <i className="ri-computer-line text-primary fs-14"></i>
                    <span>{lastScanResult.descricao}</span>
                  </div>
                )}
                <div className="mt-2 pt-2 border-top d-flex align-items-center justify-content-between">
                  <span className={`badge ${lastScanResult.noContrato ? 'badge-soft-success text-success' : 'badge-soft-warning text-dark'} fs-11`}>
                    {lastScanResult.noContrato ? '✓ No Contrato EMC' : (lastScanResult.tipoEtiqueta || 'Patrimônio EMC')}
                  </span>
                  <span className="text-muted fs-11">
                    <i className="ri-map-pin-line me-1"></i> {lastScanResult.localidade || localidade}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Staging List with Individual Delete Buttons */}
          <div className="card border shadow-sm mb-0">
            <div className="card-header bg-light border-bottom py-2 d-flex justify-content-between align-items-center">
              <h6 className="card-title mb-0 fs-13 fw-bold text-dark d-flex align-items-center gap-1">
                <i className="ri-list-check-2 text-primary"></i>
                Itens na Fila de Entrada ({sessionScans.length})
              </h6>
              {sessionScans.length > 0 && (
                <div className="d-flex gap-1">
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-success"
                    onClick={handleExportSessionCSV}
                    title="Baixar lista em CSV para Excel"
                  >
                    <i className="ri-file-excel-2-line me-1"></i> CSV
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-danger"
                    onClick={handleClearSession}
                    title="Limpar toda a lista"
                  >
                    <i className="ri-delete-bin-line me-1"></i> Limpar Tudo
                  </button>
                </div>
              )}
            </div>

            <div className="card-body p-0" style={{ maxHeight: '340px', overflowY: 'auto' }}>
              {sessionScans.length === 0 ? (
                <div className="text-center py-5 text-muted px-3">
                  <div className="avatar-md mx-auto mb-2 bg-light rounded-circle d-flex align-items-center justify-content-center text-muted fs-24">
                    <i className="ri-barcode-box-line"></i>
                  </div>
                  <h6 className="fs-13 fw-bold text-dark mb-1">Nenhum equipamento na lista</h6>
                  <p className="fs-12 text-muted mb-0">
                    Aponte a câmera para a etiqueta branca EMC de cada máquina para adicionar a este lote.
                  </p>
                </div>
              ) : (
                <ul className="list-group list-group-flush mb-0">
                  {sessionScans.map((s, idx) => (
                    <li
                      key={s.id || idx}
                      className="list-group-item d-flex justify-content-between align-items-center py-2 px-3 border-bottom"
                      style={{ transition: 'background-color 0.2s' }}
                    >
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-light text-muted font-monospace fs-11" style={{ minWidth: '32px' }}>
                          #{sessionScans.length - idx}
                        </span>
                        <div>
                          <div className="d-flex align-items-center gap-2">
                            <span className="font-monospace fw-bold text-dark fs-14">
                              {s.codigo}
                            </span>
                            <span className="badge bg-soft-info text-info fs-10 fw-bold">
                              {s.tipo || 'CPU'}
                            </span>
                            <span className={`badge ${s.noContrato ? 'badge-soft-success text-success' : 'badge-soft-secondary'} fs-10`}>
                              {s.noContrato ? '✓ EMC' : (s.tipoEtiqueta || 'Patrimônio')}
                            </span>
                          </div>
                          {s.descricao && (
                            <div className="fs-12 text-dark fw-medium mt-1 text-truncate" style={{ maxWidth: '280px' }}>
                              {s.descricao}
                            </div>
                          )}
                          <small className="text-muted fs-11 d-block">
                            <i className="ri-time-line me-1"></i>{s.timestamp} • {s.localidade || localidade}
                            {s.secretariaPrevista ? ` • ${s.secretariaPrevista}` : ''}
                          </small>
                        </div>
                      </div>

                      {/* Botão de Excluir individual */}
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1 px-2 py-1 flex-shrink-0"
                        onClick={() => handleRemoveItem(s.id, s.codigo)}
                        title={`Remover código ${s.codigo} da lista`}
                      >
                        <i className="ri-delete-bin-line fs-14"></i>
                        <span className="fs-11 fw-bold">Excluir</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {sessionScans.length > 0 && (
              <div className="card-footer bg-light p-3 border-top">
                <button
                  type="button"
                  className="btn btn-success fw-bold w-100 py-2 fs-14 shadow-sm d-flex align-items-center justify-content-center gap-2"
                  disabled={isSubmittingBatch}
                  onClick={handleFinalizarColeta}
                >
                  <i className="ri-check-double-line fs-16"></i>
                  <span>Enviar Todos ({sessionScans.length}) para o Galpão</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// VIEW: 1ª CONFERÊNCIA (GALPÃO PREFEITURA)
// ==========================================
function GalpaoConferenciaView({ onUpdated, notify, onNavigate, stats = null, initialStatus = null }) {
  const [subTab, setSubTab] = useState(() => {
    const saved = sessionStorage.getItem('galpao_subtab');
    if (saved) {
      sessionStorage.removeItem('galpao_subtab');
      return saved;
    }
    return 'estoque'; // Abre direto no Estoque para conveniência do operador
  });
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [localidade, setLocalidade] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTxtFormatHelp, setShowTxtFormatHelp] = useState(false);

  const [scanCode, setScanCode] = useState('');
  const [scanTipo, setScanTipo] = useState('CPU');
  const [scanLocal, setScanLocal] = useState('Galpão Central');
  const [lastScanResult, setLastScanResult] = useState(null);

  // Warehouse Live Stock
  const [warehouseItems, setWarehouseItems] = useState([]);
  const [warehouseTotal, setWarehouseTotal] = useState(0);
  const [countAguardando, setCountAguardando] = useState(0);
  const [countDevolvidos, setCountDevolvidos] = useState(0);
  const [countTotal, setCountTotal] = useState(0);
  const [warehousePage, setWarehousePage] = useState(1);
  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [warehouseTipo, setWarehouseTipo] = useState('');
  const [warehouseStatus, setWarehouseStatus] = useState(initialStatus || 'aguardando_retirada_emc'); // 'aguardando_retirada_emc' | 'devolvido_emc' | 'excedente' | 'todos'
  const [warehouseLoading, setWarehouseLoading] = useState(false);

  // Selection & Baixa / Devolução state
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBaixaModal, setShowBaixaModal] = useState(false);
  const [isAllSelectedForBaixa, setIsAllSelectedForBaixa] = useState(false);
  const [baixaNumeroDoc, setBaixaNumeroDoc] = useState('');
  const [baixaObservacao, setBaixaObservacao] = useState('');
  const [baixaLoading, setBaixaLoading] = useState(false);
  const [deletingTarget, setDeletingTarget] = useState(null); // { ids: [...], label: '...' }
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchWarehouseItems = async () => {
    setWarehouseLoading(true);
    try {
      const q = new URLSearchParams({
        search: warehouseSearch,
        status: warehouseStatus,
        tipo: warehouseTipo,
        page: warehousePage,
        limit: 30
      });
      const res = await fetch(`${API_BASE}/galpao/itens?${q}`);
      const json = await res.json();
      if (json.success) {
        setWarehouseItems(json.items || []);
        setWarehouseTotal(json.total || 0);
        if (json.countAguardando !== undefined) setCountAguardando(json.countAguardando);
        if (json.countDevolvidos !== undefined) setCountDevolvidos(json.countDevolvidos);
        if (json.countTotal !== undefined) setCountTotal(json.countTotal);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setWarehouseLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === 'estoque') {
      fetchWarehouseItems();
    }
  }, [subTab, warehousePage, warehouseStatus, warehouseTipo]);

  const handleOpenBaixaModal = (singleItem = null, isAll = false) => {
    if (singleItem) {
      setSelectedIds([singleItem.id]);
      setIsAllSelectedForBaixa(false);
    } else if (isAll) {
      setIsAllSelectedForBaixa(true);
    } else {
      setIsAllSelectedForBaixa(false);
    }
    setBaixaNumeroDoc(`DEV-EMC-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '')}`);
    setBaixaObservacao('Devolvido à transportadora da EMC pelo Galpão Central');
    setShowBaixaModal(true);
  };

  const handleConfirmarBaixaEMC = async () => {
    if (!isAllSelectedForBaixa && selectedIds.length === 0) {
      notify('error', 'Nenhum equipamento selecionado.');
      return;
    }

    setBaixaLoading(true);
    try {
      const res = await fetch(`${API_BASE}/galpao/dar-baixa-emc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: isAllSelectedForBaixa ? [] : selectedIds,
          todos: isAllSelectedForBaixa,
          comprovante: baixaNumeroDoc,
          observacao: baixaObservacao
        })
      });
      const json = await res.json();
      if (json.success) {
        notify('success', json.message);
        setSelectedIds([]);
        setIsAllSelectedForBaixa(false);
        setShowBaixaModal(false);
        fetchWarehouseItems();
        if (onUpdated) onUpdated();
      } else {
        notify('error', json.message || 'Erro ao dar baixa.');
      }
    } catch (e) {
      notify('error', 'Falha ao conectar com o servidor.');
    } finally {
      setBaixaLoading(false);
    }
  };

  const handleDeleteItem = (item) => {
    setDeletingTarget({ ids: [item.id], label: `patrimônio ${item.codigo_bipado}` });
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setDeletingTarget({ ids: selectedIds, label: `${selectedIds.length} equipamentos selecionados` });
  };

  const handleConfirmDelete = async () => {
    if (!deletingTarget || deletingTarget.ids.length === 0) return;
    setDeleteLoading(true);
    try {
      const isBulk = deletingTarget.ids.length > 1;
      const res = await fetch(`${API_BASE}/galpao/excluir-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isBulk ? { ids: deletingTarget.ids } : { id: deletingTarget.ids[0] })
      });
      const json = await res.json();
      if (json.success) {
        notify('success', json.message);
        setSelectedIds((prev) => prev.filter((id) => !deletingTarget.ids.includes(id)));
        setDeletingTarget(null);
        fetchWarehouseItems();
        if (onUpdated) onUpdated();
      } else {
        notify('error', json.message || 'Erro ao excluir item.');
      }
    } catch (e) {
      notify('error', 'Falha ao conectar com o servidor.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleExportWarehouseCsv = async () => {
    try {
      const q = new URLSearchParams({
        search: warehouseSearch,
        status: warehouseStatus,
        tipo: warehouseTipo,
        page: 1,
        limit: 5000
      });
      const res = await fetch(`${API_BASE}/galpao/itens?${q}`);
      const json = await res.json();
      if (json.success && json.items) {
        const headers = [
          'Código Patrimônio',
          'Código Normalizado',
          'Tipo Equipamento',
          'Localidade Entrada',
          'Status Etapa',
          'Status Conciliação',
          'Secretaria Origem',
          'Servidor Origem',
          'Data Coleta/Bipagem',
          'Comprovante Baixa EMC'
        ];
        const rows = json.items.map((it) => [
          it.codigo_bipado,
          it.codigo_normalizado || '',
          it.tipo_equipamento || '',
          it.localidade_coletada || '',
          it.status_etapa === 'devolvido_emc' ? 'Devolvido à EMC' : 'No Galpão (Aguardando Retirada)',
          it.status_conciliacao || '',
          it.secretaria_prevista || '',
          it.servidor_previsto || '',
          it.data_hora_coleta || '',
          it.comprovante_baixa_emc || ''
        ]);
        exportToCsv(`estoque_galpao_${warehouseStatus}_${new Date().toISOString().slice(0, 10)}`, headers, rows);
      }
    } catch (err) {
      notify('error', 'Erro ao gerar exportação em CSV.');
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPage = () => {
    const pageIds = warehouseItems.map((i) => i.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const allPageSelected =
    warehouseItems.length > 0 && warehouseItems.every((i) => selectedIds.includes(i.id));

  const handleFileDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer ? e.dataTransfer.files : e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setFileName(file.name);

    const nameMatch = file.name.match(/coleta_(.+?)_\d{8}/i);
    if (nameMatch) {
      setLocalidade(nameMatch[1].replace(/_/g, ' '));
    }

    const reader = new FileReader();
    reader.onload = (event) => setFileContent(event.target.result);
    reader.readAsText(file);
  };

  const handleProcessUpload = async () => {
    if (!fileContent.trim()) {
      notify('error', 'Por favor, selecione um arquivo TXT/CSV ou cole o texto.');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/conciliacao/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: fileContent,
          nomeArquivo: fileName,
          localidadeFallback: localidade || 'Galpão Geral'
        })
      });

      const json = await res.json();
      if (json.success) {
        setUploadResult(json.data);
        notify('success', json.message);
        onUpdated();
      } else {
        notify('error', json.message || 'Erro ao processar arquivo.');
      }
    } catch (e) {
      notify('error', 'Falha na comunicação com o servidor.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScanSubmit = async (e) => {
    e.preventDefault();
    if (!scanCode.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/conciliacao/bipar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: scanCode, tipo: scanTipo, localidade: scanLocal })
      });

      const json = await res.json();
      if (json.success) {
        setLastScanResult(json.data);
        setScanCode('');
        notify('success', `Equipamento ${json.data.codigo} registrado no galpão (Aguardando EMC)!`);
        onUpdated();
      }
    } catch (err) {
      notify('error', 'Falha ao registrar código.');
    }
  };

  return (
    <div>
      <ul className="nav nav-tabs nav-tabs-custom nav-warning mb-3 mobile-scroll-tabs flex-nowrap" role="tablist">
        <li className="nav-item">
          <a
            className={`nav-link ${subTab === 'upload' ? 'active' : ''}`}
            href="#"
            onClick={(e) => { e.preventDefault(); setSubTab('upload'); }}
          >
            <i className="ri-upload-cloud-2-line me-1 align-bottom"></i> 1. Importar Arquivo (TXT / CSV)
          </a>
        </li>
        <li className="nav-item">
          <a
            className={`nav-link ${subTab === 'scanner' ? 'active' : ''}`}
            href="#"
            onClick={(e) => { e.preventDefault(); setSubTab('scanner'); }}
          >
            <i className="ri-barcode-box-line me-1 align-bottom"></i> 2. Bipagem Rápida USB
          </a>
        </li>
        <li className="nav-item">
          <a
            className={`nav-link ${subTab === 'estoque' ? 'active' : ''}`}
            href="#"
            onClick={(e) => { e.preventDefault(); setSubTab('estoque'); }}
          >
            <i className="ri-inbox-archive-line me-1 align-bottom"></i> 3. Estoque no Galpão ({warehouseTotal})
          </a>
        </li>
      </ul>

      {subTab === 'upload' && (
        <div>
          <div className="card">
            <div className="card-header align-items-center d-flex flex-wrap gap-2 justify-content-between">
              <h4 className="card-title mb-0">
                <i className="ri-file-upload-line me-2 text-warning"></i> Upload de Arquivos de Coleta de Campo
              </h4>
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-outline-warning btn-sm"
                  onClick={() => setShowTxtFormatHelp(!showTxtFormatHelp)}
                >
                  <i className="ri-question-line me-1"></i> Formatos Aceitos
                </button>
                <span className="badge badge-soft-warning">
                  Todos os itens entram com status: "Aguardando Retirada EMC"
                </span>
              </div>
            </div>

            <div className="card-body">
              {showTxtFormatHelp && (
                <div className="alert alert-warning mb-3 p-3 border border-warning">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <strong className="fs-13"><i className="ri-information-line me-1"></i> Formatos Aceitos pelo Motor Inteligente de Importação:</strong>
                    <button type="button" className="btn-close" onClick={() => setShowTxtFormatHelp(false)}></button>
                  </div>
                  <ul className="fs-12 mb-2 ps-3 text-dark">
                    <li><strong>Formato 1 (Linha simples de patrimônio):</strong> Cada linha com o código de 6 ou 9 dígitos (Ex: <code>130920</code> ou <code>900012458</code>).</li>
                    <li><strong>Formato 2 (Patrimônio + Tipo):</strong> <code>130920 CPU</code>, <code>145892 MONITOR</code>, <code>138944 NOTEBOOK</code>.</li>
                    <li><strong>Formato 3 (CSV de Coletores / QRbot):</strong> Arquivos exportados por coletores ópticos Android com colunas separadas por vírgula ou tabulação.</li>
                  </ul>
                  <small className="text-muted d-block">Dica: Você também pode colar diretamente o conteúdo copiado de uma coluna do Excel no campo de texto abaixo.</small>
                </div>
              )}

              <div
                className="border border-dashed rounded p-4 text-center mb-3 bg-light"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                style={{ cursor: 'pointer' }}
              >
                <i className="ri-upload-2-fill fs-40 text-muted mb-2 d-block"></i>
                <h5 className="fs-14 mb-1">Arraste seu arquivo TXT (APK Coletor) ou CSV (QRbot) aqui</h5>
                <p className="text-muted fs-12 mb-3">O sistema reconhece automaticamente os patrimônios de 6 e 9 dígitos</p>

                <input
                  type="file"
                  id="fileUploadInput"
                  className="d-none"
                  accept=".txt,.csv"
                  onChange={handleFileDrop}
                />
                <label htmlFor="fileUploadInput" className="btn btn-warning btn-sm">
                  <i className="ri-folder-open-line me-1"></i> Selecionar Arquivo do Computador
                </label>

                {fileName && (
                  <div className="mt-3 text-success fw-bold fs-13">
                    <i className="ri-check-line me-1"></i> Arquivo carregado: {fileName}
                  </div>
                )}
              </div>

              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label fw-semibold">Secretaria / Localidade de Coleta:</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ex: SEFAZ, SMDS, CEFORT..."
                    value={localidade}
                    onChange={(e) => setLocalidade(e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label fw-semibold">Conteúdo bruto identificado:</label>
                  <textarea
                    className="form-control font-monospace fs-12"
                    rows="3"
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    placeholder="Cole aqui a lista caso prefira copiar do coletor..."
                  ></textarea>
                </div>
              </div>

              <div className="text-end mt-3">
                <button
                  type="button"
                  className="btn btn-warning px-4"
                  disabled={isProcessing || !fileContent.trim()}
                  onClick={handleProcessUpload}
                >
                  {isProcessing ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Processando no Galpão...
                    </>
                  ) : (
                    <>
                      <i className="ri-check-line me-1"></i> Processar Entrada no Galpão
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {uploadResult && (
            <div className="card border border-warning">
              <div className="card-header bg-soft-warning">
                <h5 className="card-title text-warning mb-0">
                  <i className="ri-checkbox-circle-line me-2"></i> Resultado da Conciliação de Entrada
                </h5>
              </div>
              <div className="card-body">
                <div className="row text-center mb-3">
                  <div className="col-4">
                    <h3 className="text-primary mb-0">{uploadResult.totalLidos}</h3>
                    <span className="text-muted fs-12">Total de Itens</span>
                  </div>
                  <div className="col-4">
                    <h3 className="text-success mb-0">{uploadResult.conformes}</h3>
                    <span className="text-muted fs-12">Previstos / No Contrato</span>
                  </div>
                  <div className="col-4">
                    <h3 className="text-purple mb-0">{uploadResult.excedentes}</h3>
                    <span className="text-muted fs-12">Excedentes Encontrados</span>
                  </div>
                </div>

                <div className="table-responsive table-card" style={{ maxHeight: '250px' }}>
                  <table className="table table-sm table-striped align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Código</th>
                        <th>Tipo</th>
                        <th>Origem Prevista</th>
                        <th>Status</th>
                        <th>Observação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadResult.detalhes.map((d, i) => (
                        <tr key={i}>
                          <td className="font-monospace fw-bold">{d.codigo}</td>
                          <td>{d.tipo}</td>
                          <td>{d.secretariaPrevista || '-'}</td>
                          <td>
                            <span className="badge badge-soft-warning">No Galpão</span>
                          </td>
                          <td className="fs-12">{d.observacao}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'scanner' && (
        <div className="row">
          <div className="col-lg-6">
            <div className="card">
              <div className="card-header">
                <h5 className="card-title mb-0">
                  <i className="ri-barcode-line me-2 text-warning"></i> Pistola USB / Leitor de Código de Barras
                </h5>
              </div>
              <div className="card-body">
                <form onSubmit={handleScanSubmit}>
                  <div className="mb-3">
                    <label className="form-label fw-bold">Código do Equipamento (Bipar Aqui):</label>
                    <div className="input-group">
                      <span className="input-group-text bg-light">
                        <i className="ri-qr-scan-line"></i>
                      </span>
                      <input
                        type="text"
                        className="form-control form-control-lg font-monospace fw-bold"
                        placeholder="Bipe com o leitor óptico..."
                        value={scanCode}
                        onChange={(e) => setScanCode(e.target.value)}
                        autoFocus
                      />
                      <button className="btn btn-warning px-4" type="submit">
                        Registrar
                      </button>
                    </div>
                    <small className="text-muted">Compatível com códigos de 6 dígitos e prefixo 1000.</small>
                  </div>

                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Tipo de Equipamento:</label>
                      <select className="form-select" value={scanTipo} onChange={(e) => setScanTipo(e.target.value)}>
                        <option value="CPU">CPU</option>
                        <option value="MONITOR">Monitor</option>
                        <option value="NOTEBOOK">Notebook</option>
                        <option value="OUTRO">Outro Ativo</option>
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Local de Entrada:</label>
                      <input
                        type="text"
                        className="form-control"
                        value={scanLocal}
                        onChange={(e) => setScanLocal(e.target.value)}
                      />
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>

          <div className="col-lg-6">
            <div className="card border border-warning">
              <div className="card-header bg-soft-warning">
                <h5 className="card-title text-warning mb-0">
                  <i className="ri-feedback-line me-2"></i> Último Equipamento Bipado
                </h5>
              </div>
              <div className="card-body">
                {lastScanResult ? (
                  <div>
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <div>
                        <span className="fs-12 text-muted">Patrimônio / Serial:</span>
                        <h3 className="font-monospace fw-bold text-primary mb-0">{lastScanResult.codigo}</h3>
                      </div>
                      <span className="badge badge-warning fs-13 px-3 py-2">
                        No Galpão (Aguardando EMC)
                      </span>
                    </div>

                    <div className="p-3 bg-light rounded fs-13">
                      <div className="mb-1"><strong>Status:</strong> {lastScanResult.observacao}</div>
                      {lastScanResult.servidorPrevisto && (
                        <div><strong>Servidor Responsável:</strong> {lastScanResult.servidorPrevisto} ({lastScanResult.secretariaPrevista})</div>
                      )}
                      {lastScanResult.descricaoContrato && (
                        <div><strong>Ativo EMC:</strong> {lastScanResult.descricaoContrato}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted">
                    <i className="ri-barcode-line fs-32 d-block mb-2"></i>
                    Aguardando leitura do leitor USB...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'estoque' && (
        <div className="card shadow-sm border">
          <div className="card-header align-items-center d-flex flex-wrap justify-content-between gap-2 p-3">
            <div>
              <h4 className="card-title mb-0 fs-16 fw-bold text-dark d-flex align-items-center gap-2">
                <i className="ri-inbox-archive-line text-warning fs-18"></i>
                Equipamentos Estocados no Galpão
              </h4>
              <p className="text-muted fs-12 mb-0 mt-1">
                Conferência física dos equipamentos recolhidos e baixa definitiva para a transportadora EMC.
              </p>
            </div>

            {/* Status Filter Pills & Export */}
            <div className="d-flex flex-wrap gap-1 align-items-center">
              <button
                type="button"
                className={`btn btn-sm ${warehouseStatus === 'aguardando_retirada_emc' ? 'btn-warning fw-bold text-dark' : 'btn-soft-secondary'} rounded-pill`}
                onClick={() => { setWarehouseStatus('aguardando_retirada_emc'); setWarehousePage(1); }}
              >
                <i className="ri-time-line me-1"></i> Aguardando EMC ({countAguardando})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${warehouseStatus === 'devolvido_emc' ? 'btn-success fw-bold' : 'btn-soft-secondary'} rounded-pill`}
                onClick={() => { setWarehouseStatus('devolvido_emc'); setWarehousePage(1); }}
              >
                <i className="ri-checkbox-circle-line me-1"></i> Já Devolvidos ({countDevolvidos})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${warehouseStatus === 'excedente' ? 'btn-purple text-white fw-bold' : 'btn-soft-purple'} rounded-pill`}
                onClick={() => { setWarehouseStatus('excedente'); setWarehousePage(1); }}
              >
                <i className="ri-add-circle-line me-1"></i> Excedentes ({stats?.totalExcedentes || 0})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${warehouseStatus === 'todos' ? 'btn-primary fw-bold' : 'btn-soft-secondary'} rounded-pill`}
                onClick={() => { setWarehouseStatus('todos'); setWarehousePage(1); }}
              >
                Todos ({countTotal})
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-success rounded-pill ms-lg-1"
                onClick={handleExportWarehouseCsv}
                title="Exportar equipamentos listados para planilha CSV"
              >
                <i className="ri-file-excel-2-line me-1"></i> Exportar CSV
              </button>
            </div>
          </div>

          <div className="card-body p-3">
            {/* Search and Quick Batch Actions Bar */}
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 bg-light p-2 rounded border">
              <div className="d-flex align-items-center flex-wrap gap-2">
                <div className="form-check m-0 ms-1">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="selectAllHeader"
                    checked={allPageSelected}
                    onChange={toggleSelectAllPage}
                  />
                  <label className="form-check-label fs-12 fw-semibold text-dark cursor-pointer" htmlFor="selectAllHeader">
                    {selectedIds.length > 0 ? `${selectedIds.length} selecionado(s)` : 'Selecionar Página'}
                  </label>
                </div>

                {selectedIds.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-secondary"
                    onClick={() => setSelectedIds([])}
                  >
                    Desmarcar Todos
                  </button>
                )}

                {selectedIds.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm btn-success fw-bold d-flex align-items-center gap-1 shadow-sm"
                      onClick={() => handleOpenBaixaModal(null, false)}
                    >
                      <i className="ri-check-double-line"></i> Dar Baixa nos Selecionados ({selectedIds.length})
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1"
                      onClick={handleBulkDelete}
                    >
                      <i className="ri-delete-bin-line"></i> Excluir ({selectedIds.length})
                    </button>
                  </>
                )}

                {warehouseStatus === 'aguardando_retirada_emc' && countAguardando > 0 && selectedIds.length === 0 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-success fw-bold d-flex align-items-center gap-1"
                    onClick={() => handleOpenBaixaModal(null, true)}
                    title="Dar baixa como devolvido à EMC em todos os itens que estão no galpão"
                  >
                    <i className="ri-truck-line"></i> Marcar TODOS ({countAguardando}) como Devolvidos à EMC
                  </button>
                )}
              </div>

              {/* Filters & Search Form */}
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <select
                  className="form-select form-select-sm"
                  style={{ width: '135px' }}
                  value={warehouseTipo}
                  onChange={(e) => { setWarehouseTipo(e.target.value); setWarehousePage(1); }}
                >
                  <option value="">Todos os Tipos</option>
                  <option value="CPU">CPU</option>
                  <option value="MONITOR">Monitor</option>
                  <option value="NOTEBOOK">Notebook</option>
                  <option value="WORKSTATION">Workstation</option>
                </select>

                <form
                  onSubmit={(e) => { e.preventDefault(); setWarehousePage(1); fetchWarehouseItems(); }}
                  className="d-flex gap-1"
                  style={{ minWidth: '220px' }}
                >
                  <div className="input-group input-group-sm">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Buscar patrimônio, servidor..."
                      value={warehouseSearch}
                      onChange={(e) => setWarehouseSearch(e.target.value)}
                    />
                    <button type="submit" className="btn btn-warning">
                      <i className="ri-search-line"></i>
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* List / Table Area */}
            {warehouseLoading ? (
              <div className="text-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2 text-warning"></span>
                Carregando estoque do galpão...
              </div>
            ) : warehouseItems.length === 0 ? (
              <div className="text-center py-5 text-muted">
                <i className="ri-inbox-line fs-40 text-muted d-block mb-2"></i>
                <h5 className="fs-14 text-dark mb-1">Nenhum equipamento encontrado</h5>
                <p className="fs-12 mb-0">
                  {warehouseStatus === 'aguardando_retirada_emc'
                    ? 'Não há itens aguardando retirada no momento. Bipe novos patrimônios no Coletor!'
                    : 'Nenhum registro com o filtro atual.'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="table-responsive table-card d-none d-md-block">
                  <table className="table table-hover table-centered align-middle table-nowrap mb-0">
                    <thead className="table-light text-muted fs-12">
                      <tr>
                        <th style={{ width: '40px' }} className="text-center">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={allPageSelected}
                            onChange={toggleSelectAllPage}
                          />
                        </th>
                        <th>Código (Patrimônio)</th>
                        <th>Tipo</th>
                        <th>Secretaria Origem</th>
                        <th>Servidor</th>
                        <th>Data Entrada / Devolução</th>
                        <th>Status Atual</th>
                        <th className="text-end">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {warehouseItems.map((item) => {
                        const isSelected = selectedIds.includes(item.id);
                        const isDevolvido = item.status_etapa === 'devolvido_emc';
                        return (
                          <tr key={item.id} className={isSelected ? 'table-active' : ''}>
                            <td className="text-center">
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={isSelected}
                                onChange={() => toggleSelectOne(item.id)}
                              />
                            </td>
                            <td>
                              <span className="font-monospace fw-bold text-primary fs-13">
                                {item.codigo_bipado}
                              </span>
                            </td>
                            <td>
                              <span className="badge badge-soft-dark">{item.tipo_equipamento}</span>
                            </td>
                            <td>
                              <span className="badge badge-soft-primary">
                                {item.secretaria_prevista || item.localidade_coletada || 'Galpão'}
                              </span>
                            </td>
                            <td className="fs-12">{item.servidor_previsto || '-'}</td>
                            <td className="fs-11 text-muted">
                              {isDevolvido && item.data_hora_baixa_emc ? (
                                <span>
                                  <i className="ri-truck-line text-success me-1"></i>
                                  {item.data_hora_baixa_emc}
                                </span>
                              ) : (
                                <span>
                                  <i className="ri-time-line me-1"></i>
                                  {item.data_hora_coleta || 'Hoje'}
                                </span>
                              )}
                            </td>
                            <td>
                              {isDevolvido ? (
                                <span className="badge badge-soft-success fs-11">
                                  <i className="ri-checkbox-circle-fill me-1"></i> Devolvido EMC
                                </span>
                              ) : (
                                <span className="badge badge-soft-warning fs-11">
                                  <i className="ri-time-line me-1"></i> Aguardando EMC
                                </span>
                              )}
                            </td>
                            <td className="text-end">
                              <div className="d-flex gap-1 justify-content-end">
                                {!isDevolvido && (
                                  <button
                                    type="button"
                                    className="btn btn-xs btn-soft-success fw-bold d-flex align-items-center gap-1"
                                    onClick={() => handleOpenBaixaModal(item, false)}
                                    title="Dar baixa como devolvido à EMC"
                                  >
                                    <i className="ri-truck-line"></i> Baixar EMC
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-xs btn-soft-danger"
                                  onClick={() => handleDeleteItem(item)}
                                  title="Excluir este registro"
                                >
                                  <i className="ri-delete-bin-line"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View */}
                <div className="d-md-none d-flex flex-column gap-2">
                  {warehouseItems.map((item) => {
                    const isSelected = selectedIds.includes(item.id);
                    const isDevolvido = item.status_etapa === 'devolvido_emc';
                    return (
                      <div
                        key={item.id}
                        className={`card border p-3 mb-0 shadow-sm ${isSelected ? 'border-primary bg-soft-primary' : ''}`}
                        style={{ borderRadius: '10px' }}
                      >
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <div className="d-flex align-items-center gap-2">
                            <input
                              type="checkbox"
                              className="form-check-input mt-0"
                              checked={isSelected}
                              onChange={() => toggleSelectOne(item.id)}
                            />
                            <span className="font-monospace fw-bold text-primary fs-14">
                              {item.codigo_bipado}
                            </span>
                            <span className="badge badge-soft-dark fs-10">{item.tipo_equipamento}</span>
                          </div>
                          {isDevolvido ? (
                            <span className="badge bg-success fs-10">✓ Devolvido</span>
                          ) : (
                            <span className="badge bg-warning text-dark fs-10">⏳ No Galpão</span>
                          )}
                        </div>

                        <div className="fs-12 text-muted mb-2">
                          <div>
                            <strong>Origem:</strong> {item.secretaria_prevista || item.localidade_coletada || 'Galpão'}
                          </div>
                          {item.servidor_previsto && item.servidor_previsto !== '-' && (
                            <div>
                              <strong>Servidor:</strong> {item.servidor_previsto}
                            </div>
                          )}
                          <div className="fs-11 text-muted mt-1">
                            {isDevolvido ? `Devolvido em: ${item.data_hora_baixa_emc}` : `Entrada: ${item.data_hora_coleta}`}
                          </div>
                        </div>

                        <div className="d-flex justify-content-end gap-1 border-top pt-2">
                          {!isDevolvido && (
                            <button
                              type="button"
                              className="btn btn-xs btn-success fw-bold d-flex align-items-center gap-1"
                              onClick={() => handleOpenBaixaModal(item, false)}
                            >
                              <i className="ri-truck-line"></i> Dar Baixa EMC
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-xs btn-outline-danger"
                            onClick={() => handleDeleteItem(item)}
                          >
                            <i className="ri-delete-bin-line"></i> Excluir
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Pagination Controls */}
            <div className="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
              <span className="text-muted fs-12">
                Página <strong>{warehousePage}</strong> de <strong>{Math.ceil(warehouseTotal / 30) || 1}</strong> ({warehouseTotal} itens)
              </span>
              <div className="d-flex gap-1">
                <button
                  className="btn btn-soft-secondary btn-sm"
                  disabled={warehousePage <= 1}
                  onClick={() => setWarehousePage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <button
                  className="btn btn-soft-secondary btn-sm"
                  disabled={warehousePage >= Math.ceil(warehouseTotal / 30)}
                  onClick={() => setWarehousePage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>

          {/* Modal de Baixa de Devolução à EMC */}
          {showBaixaModal && (
            <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1060 }}>
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content border-0 shadow-lg">
                  <div className="modal-header bg-success text-white py-3">
                    <h5 className="modal-title fs-15 fw-bold d-flex align-items-center gap-2 mb-0">
                      <i className="ri-truck-line fs-18"></i>
                      Confirmar Devolução à EMC
                    </h5>
                    <button
                      type="button"
                      className="btn-close btn-close-white"
                      onClick={() => setShowBaixaModal(false)}
                      disabled={baixaLoading}
                    ></button>
                  </div>
                  <div className="modal-body p-4">
                    <div className="alert alert-soft-success d-flex align-items-center gap-2 fs-13 mb-3">
                      <i className="ri-information-line fs-20 text-success flex-shrink-0"></i>
                      <div>
                        Você está prestes a dar baixa definitiva de{' '}
                        <strong>
                          {isAllSelectedForBaixa ? `TODOS os ${countAguardando}` : `${selectedIds.length}`}
                        </strong>{' '}
                        equipamento(s) estocados no galpão como <strong>DEVOLVIDOS À EMC</strong>.
                      </div>
                    </div>

                    <div className="mb-3">
                      <label className="form-label fs-12 fw-bold text-dark">
                        Nº do Romaneio / Comprovante de Coleta EMC:
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Ex: ROM-2026-001, DOC-COLETA-1910"
                        value={baixaNumeroDoc}
                        onChange={(e) => setBaixaNumeroDoc(e.target.value)}
                      />
                      <small className="text-muted fs-11">
                        Número do romaneio da transportadora ou código do lote.
                      </small>
                    </div>

                    <div className="mb-2">
                      <label className="form-label fs-12 fw-bold text-dark">
                        Observação / Transportadora:
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Ex: Coletado pela transportadora oficial da EMC"
                        value={baixaObservacao}
                        onChange={(e) => setBaixaObservacao(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="modal-footer bg-light py-2">
                    <button
                      type="button"
                      className="btn btn-light btn-sm"
                      onClick={() => setShowBaixaModal(false)}
                      disabled={baixaLoading}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn-success btn-sm fw-bold px-4 d-flex align-items-center gap-1 shadow-sm"
                      onClick={handleConfirmarBaixaEMC}
                      disabled={baixaLoading}
                    >
                      {baixaLoading ? (
                        <>
                          <span className="spinner-border spinner-border-sm"></span>
                          Gravando Baixa...
                        </>
                      ) : (
                        <>
                          <i className="ri-check-line fs-16"></i> Confirmar Baixa Definitiva
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Modal de Confirmação de Exclusão do Galpão */}
          {deletingTarget && (
            <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1065 }}>
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content border-0 shadow-lg">
                  <div className="modal-header bg-soft-danger border-bottom">
                    <h5 className="modal-title text-danger fs-15 fw-bold">
                      <i className="ri-delete-bin-line me-2"></i> Confirmar Exclusão do Galpão
                    </h5>
                    <button type="button" className="btn-close" onClick={() => setDeletingTarget(null)} disabled={deleteLoading}></button>
                  </div>
                  <div className="modal-body p-4">
                    <p className="fs-14 mb-2">
                      Tem certeza que deseja remover <strong>{deletingTarget.label}</strong> do estoque do galpão?
                    </p>
                    <div className="alert alert-warning py-2 px-3 fs-12 mb-0">
                      <i className="ri-alert-line me-1"></i> O registro será desvinculado do galpão da Prefeitura. Se for bipado novamente no coletor, entrará como nova conferência.
                    </div>
                  </div>
                  <div className="modal-footer bg-light border-top">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDeletingTarget(null)} disabled={deleteLoading}>
                      Cancelar
                    </button>
                    <button type="button" className="btn btn-danger btn-sm px-3 fw-bold" onClick={handleConfirmDelete} disabled={deleteLoading}>
                      {deleteLoading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-1"></span> Excluindo...
                        </>
                      ) : (
                        'Sim, Excluir do Galpão'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// VIEW: 2ª CONFERÊNCIA (BAIXA EMC VIA PDF / RELATÓRIO)
// ==========================================
function BaixaEMCView({ onUpdated, notify, onNavigate }) {
  const [fileBase64, setFileBase64] = useState('');
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');
  const [comprovante, setComprovante] = useState('');
  const [dataBaixa, setDataBaixa] = useState(new Date().toLocaleDateString('pt-BR'));
  const [responsavel, setResponsavel] = useState('Gestor de Contratos EMC');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [filterAuditTab, setFilterAuditTab] = useState('todos');

  const handleExportBaixaCsv = () => {
    if (!auditResult || !auditResult.itensDocumento) return;
    const headers = ['Nº', 'Patrimônio EMC', 'Tag (Nº de Série)', 'Descrição do Modelo', 'Secretaria Origem', 'Servidor Origem', 'Status Dupla Conferência'];
    const rows = auditResult.itensDocumento.map((item, idx) => [
      item.seq || idx + 1,
      item.itemCodigo,
      item.nSerie || '',
      item.descricao || '',
      item.secretariaOrigem || '',
      item.servidorOrigem || '',
      item.estavaNoGalpao ? 'Conferência OK (Galpão + EMC)' : 'Baixa Direta EMC'
    ]);
    exportToCsv(`auditoria_baixa_emc_${comprovante || 'coleta'}`, headers, rows);
  };

  const handlePdfUpload = (e) => {
    e.preventDefault();
    const files = e.dataTransfer ? e.dataTransfer.files : e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setFileName(file.name);

    if (!comprovante) {
      setComprovante(file.name.replace(/\.[^/.]+$/, ''));
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target.result;
      const base64Data = result.split(',')[1] || result;
      setFileBase64(base64Data);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeDocument = async () => {
    if (!fileBase64 && !rawText.trim()) {
      notify('error', 'Por favor, envie o PDF da EMC ou cole o texto do relatório.');
      return;
    }

    setIsAnalyzing(true);
    setAuditResult(null);

    try {
      const res = await fetch(`${API_BASE}/emc/parse-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64: fileBase64,
          rawText: rawText,
          fileName: fileName
        })
      });

      const json = await res.json();
      if (json.success) {
        setAuditResult(json);
        if (json.detectedDocNumero) {
          setComprovante(json.detectedDocNumero);
        }
        if (json.detectedData) {
          setDataBaixa(json.detectedData);
        }
        notify('success', `Documento analisado: ${json.totalItensDocumento} equipamentos identificados!`);
      } else {
        notify('error', json.message || 'Falha ao analisar documento da EMC.');
      }
    } catch (e) {
      notify('error', 'Falha na comunicação com o servidor.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirmarBaixa = async () => {
    if (!auditResult || !auditResult.itensDocumento || auditResult.itensDocumento.length === 0) {
      notify('error', 'Nenhum item válido para baixa.');
      return;
    }

    setIsConfirming(true);
    try {
      const res = await fetch(`${API_BASE}/emc/confirmar-baixa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: auditResult.itensDocumento,
          comprovante: comprovante || fileName || 'Termo Coleta EMC',
          dataBaixa: dataBaixa,
          responsavel: responsavel
        })
      });

      const json = await res.json();
      if (json.success) {
        notify('success', json.message);
        setAuditResult(null);
        setFileBase64('');
        setFileName('');
        setRawText('');
        onUpdated();
        onNavigate('romaneios');
      } else {
        notify('error', json.message || 'Erro ao efetivar baixa.');
      }
    } catch (e) {
      notify('error', 'Erro ao confirmar baixa com o servidor.');
    } finally {
      setIsConfirming(false);
    }
  };

  const filteredItems = auditResult ? auditResult.itensDocumento.filter(i => {
    if (filterAuditTab === 'confirmados') return i.estavaNoGalpao;
    if (filterAuditTab === 'direto') return !i.estavaNoGalpao;
    return true;
  }) : [];

  return (
    <div>
      <div className="card">
        <div className="card-header align-items-center d-flex flex-wrap gap-2">
          <div className="flex-grow-1">
            <h4 className="card-title mb-0">
              <i className="ri-file-pdf-line me-2 text-success"></i>
              2ª Conferência — Importação do Comprovante de Coleta da EMC
            </h4>
            <p className="text-muted fs-12 mb-0 mt-1">
              Envie o relatório / PDF emitido pela EMC com os equipamentos que foram recolhidos no galpão para auditoria e baixa definitiva.
            </p>
          </div>
          <span className="badge badge-soft-success fs-12">
            Etapa de Baixa Definitiva
          </span>
        </div>

        <div className="card-body">
          <div className="row g-4">
            <div className="col-lg-6">
              <div
                className="border border-dashed border-success rounded p-4 text-center bg-light"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handlePdfUpload}
                style={{ cursor: 'pointer' }}
              >
                <i className="ri-file-pdf-fill fs-40 text-danger mb-2 d-block"></i>
                <h5 className="fs-14 mb-1">Arraste o PDF de Coleta / Devolução da EMC aqui</h5>
                <p className="text-muted fs-12 mb-3">O leitor inteligente extrai seriais, patrimônios e cruza com o galpão</p>

                <input
                  type="file"
                  id="pdfFileInput"
                  className="d-none"
                  accept=".pdf,.txt,.csv"
                  onChange={handlePdfUpload}
                />
                <label htmlFor="pdfFileInput" className="btn btn-success btn-sm">
                  <i className="ri-folder-open-line me-1"></i> Selecionar PDF / Arquivo da EMC
                </label>

                {fileName && (
                  <div className="mt-3 text-success fw-bold fs-13">
                    <i className="ri-file-check-line me-1"></i> Arquivo carregado: {fileName}
                  </div>
                )}
                <div className="alert alert-info py-2 px-3 mt-3 fs-11 text-start mb-0">
                  <i className="ri-information-line me-1"></i>
                  <strong>Dica para PDFs Digitalizados:</strong> Se o arquivo for uma xerox/imagem escaneada (sem camada de texto OCR), cole o texto ou a lista de códigos na caixa ao lado para leitura imediata.
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <label className="form-label fw-bold">Ou Cole o Texto do Relatório / PDF da EMC:</label>
              <textarea
                className="form-control font-monospace fs-12"
                rows="5"
                placeholder="Exemplo: Item 130920 - Serial: J8J28J3 - Dell 3410..."
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              ></textarea>
              <small className="text-muted">Útil caso queira copiar do Adobe Reader ou de uma planilha.</small>
            </div>
          </div>

          <div className="row g-3 mt-2">
            <div className="col-md-4">
              <label className="form-label fw-semibold">Número do Comprovante / Termo / NF-e:</label>
              <input
                type="text"
                className="form-control"
                placeholder="Ex: Termo Coleta EMC 2026/01 ou NF 45892"
                value={comprovante}
                onChange={(e) => setComprovante(e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold">Data da Coleta / Baixa:</label>
              <input
                type="text"
                className="form-control"
                value={dataBaixa}
                onChange={(e) => setDataBaixa(e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold">Responsável pela Liberação:</label>
              <input
                type="text"
                className="form-control"
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
              />
            </div>
          </div>

          <div className="text-end mt-4">
            <button
              type="button"
              className="btn btn-success px-4"
              disabled={isAnalyzing || (!fileBase64 && !rawText.trim())}
              onClick={handleAnalyzeDocument}
            >
              {isAnalyzing ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                  Analisando Documento da EMC...
                </>
              ) : (
                <>
                  <i className="ri-search-eye-line me-1"></i> Analisar Documento da EMC
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* PAINEL DE AUDITORIA & CONFIRMAÇÃO DA BAIXA */}
      {auditResult && (
        <div className="card border border-success mt-4">
          <div className="card-header bg-soft-success d-flex align-items-center justify-content-between flex-wrap gap-2">
            <h5 className="card-title text-success mb-0">
              <i className="ri-checkbox-multiple-line me-2"></i> Auditoria Cruzada da Dupla Conferência
            </h5>
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-success"
                onClick={handleExportBaixaCsv}
              >
                <i className="ri-file-excel-2-line me-1"></i> Exportar Auditoria (CSV)
              </button>
              <span className="badge badge-success px-3 py-2 fs-13">
                {auditResult.totalItensDocumento} Itens Identificados
              </span>
            </div>
          </div>

          <div className="card-body">
            {/* 3 INDICADORES DA AUDITORIA */}
            <div className="row g-3 text-center mb-4">
              <div className="col-md-4">
                <div className="p-3 bg-soft-success rounded border border-success">
                  <h3 className="text-success mb-1">{auditResult.confirmadosGalpao}</h3>
                  <strong className="d-block text-dark">Confirmados do Galpão</strong>
                  <span className="fs-12 text-muted">Estavam no galpão e constam no PDF da EMC (100% OK!)</span>
                </div>
              </div>

              <div className="col-md-4">
                <div className="p-3 bg-soft-info rounded border border-info">
                  <h3 className="text-info mb-1">{auditResult.diretoEMC}</h3>
                  <strong className="d-block text-dark">Recolhidos Direto</strong>
                  <span className="fs-12 text-muted">Constam no contrato, mas não tinham sido bipados no galpão</span>
                </div>
              </div>

              <div className="col-md-4">
                <div className="p-3 bg-soft-danger rounded border border-danger">
                  <h3 className="text-danger mb-1">{auditResult.totalPermanecemNoGalpao}</h3>
                  <strong className="d-block text-dark">Permanecem no Galpão</strong>
                  <span className="fs-12 text-muted">A prefeitura bipou no galpão, mas a EMC <u>NÃO levou</u></span>
                </div>
              </div>
            </div>

            {/* ABAS DE VISUALIZAÇÃO DOS ITENS */}
            <ul className="nav nav-pills nav-custom nav-custom-light mb-3">
              <li className="nav-item">
                <button
                  className={`nav-link ${filterAuditTab === 'todos' ? 'active' : ''}`}
                  onClick={() => setFilterAuditTab('todos')}
                >
                  Todos do Documento ({auditResult.totalItensDocumento})
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${filterAuditTab === 'confirmados' ? 'active' : ''}`}
                  onClick={() => setFilterAuditTab('confirmados')}
                >
                  ✓ Confirmados do Galpão ({auditResult.confirmadosGalpao})
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${filterAuditTab === 'direto' ? 'active' : ''}`}
                  onClick={() => setFilterAuditTab('direto')}
                >
                  ⚠ Coleta Direta ({auditResult.diretoEMC})
                </button>
              </li>
              {auditResult.totalPermanecemNoGalpao > 0 && (
                <li className="nav-item">
                  <button
                    className={`nav-link ${filterAuditTab === 'permanecem' ? 'active' : ''}`}
                    onClick={() => setFilterAuditTab('permanecem')}
                  >
                    🚨 Sobras no Galpão ({auditResult.totalPermanecemNoGalpao})
                  </button>
                </li>
              )}
            </ul>

            {filterAuditTab === 'permanecem' ? (
              <div className="table-responsive table-card">
                <table className="table table-sm table-striped align-middle mb-0">
                  <thead className="table-danger">
                    <tr>
                      <th>Código no Galpão</th>
                      <th>Tipo</th>
                      <th>Secretaria Origem</th>
                      <th>Servidor</th>
                      <th>Alerta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditResult.itensPermanecemNoGalpao.map((p) => (
                      <tr key={p.id}>
                        <td className="font-monospace fw-bold text-danger">{p.codigo}</td>
                        <td>{p.tipo}</td>
                        <td>{p.secretaria}</td>
                        <td className="fs-12">{p.servidor || '-'}</td>
                        <td>
                          <span className="badge badge-danger">Ficou no Galpão</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="table-responsive table-card" style={{ maxHeight: '380px' }}>
                <table className="table table-sm table-striped align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: '60px' }}>Nº</th>
                      <th>Patrimônio EMC</th>
                      <th>Tag (Nº Série)</th>
                      <th>Descrição do Modelo</th>
                      <th>Secretaria / Servidor (Formulário)</th>
                      <th>Status Dupla Conferência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, idx) => (
                      <tr key={idx}>
                        <td className="text-muted fw-bold font-monospace">{item.seq || (idx + 1)}</td>
                        <td className="font-monospace fw-bold text-primary">{item.itemCodigo}</td>
                        <td className="font-monospace fw-semibold text-dark">{item.nSerie}</td>
                        <td className="fs-12" style={{ maxWidth: '240px' }}>{item.descricao}</td>
                        <td>
                          <div className="fw-semibold text-dark">{item.secretariaOrigem}</div>
                          {item.servidorOrigem && item.servidorOrigem !== 'Não Declarado' && (
                            <div className="text-muted fs-11">👤 {item.servidorOrigem}</div>
                          )}
                        </td>
                        <td>
                          {item.estavaNoGalpao ? (
                            <span className="badge badge-soft-success">
                              <i className="ri-check-double-line me-1"></i> Conferência OK (Galpão + EMC)
                            </span>
                          ) : (
                            <span className="badge badge-soft-info">
                              <i className="ri-arrow-right-line me-1"></i> Baixa Direta EMC
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
              <span className="text-muted fs-13">
                Ao confirmar, todos os <strong>{auditResult.totalItensDocumento} equipamentos</strong> receberão a baixa definitiva com o comprovante <strong>{comprovante || 'EMC Oficial'}</strong>.
              </span>

              <button
                type="button"
                className="btn btn-success btn-lg px-4"
                disabled={isConfirming}
                onClick={handleConfirmarBaixa}
              >
                {isConfirming ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    Gravando Baixa Definitiva...
                  </>
                ) : (
                  <>
                    <i className="ri-check-double-line me-2"></i> Confirmar Baixa Definitiva dos Equipamentos
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VIEW: BASE CONTRATUAL EMC (4.344 ITENS + CONFERÊNCIAS)
// ==========================================
function ContratoView({ initialFilter = null, onClearInitialFilter = null }) {
  const [items, setItems] = useState([]);
  const [kpis, setKpis] = useState({
    total: 0,
    emCampo: 0,
    noGalpao: 0,
    devolvidoEMC: 0,
    mapeadosForm: 0,
    semMapeamento: 0
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [tipo, setTipo] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    if (initialFilter) {
      if (initialFilter.search !== undefined && initialFilter.search !== '') {
        setSearch(initialFilter.search);
        setSearchInput(initialFilter.search);
      }
      if (initialFilter.status !== undefined && initialFilter.status !== '') {
        setStatus(initialFilter.status);
      }
      if (initialFilter.tipo !== undefined && initialFilter.tipo !== '') {
        setTipo(initialFilter.tipo);
      }
      setPage(1);
      if (onClearInitialFilter) onClearInitialFilter();
    }
  }, [initialFilter]);

  const handleExportContratoCsv = async () => {
    try {
      const q = new URLSearchParams({ search, tipo, status, page: 1, limit: 10000 });
      const res = await fetch(`${API_BASE}/contrato/itens?${q}`);
      const json = await res.json();
      if (json.success && json.items) {
        const headers = [
          'Patrimônio/Item',
          'Nº Série (Tag)',
          'Tipo',
          'Descrição',
          'Valor Mensal',
          'NF-e Remessa',
          'Secretaria Declarada',
          'Servidor',
          'Status Logístico',
          'Comprovante Baixa',
          'Data Baixa'
        ];
        const rows = json.items.map((it) => [
          it.item,
          it.n_serie || '',
          it.tipo_estimado || '',
          it.descricao || '',
          it.valor_mensal || '',
          it.nfe_remessa || '',
          it.secretariaDeclarada || 'Não informada',
          it.servidorDeclarado || '',
          it.statusLogistico === 'devolvido_emc' ? 'Devolvido EMC' : it.statusLogistico === 'no_galpao' ? 'No Galpão' : 'Em Campo',
          it.comprovanteBaixa || '',
          it.dataBaixa || ''
        ]);
        exportToCsv(`base_contratual_emc_${new Date().toISOString().slice(0, 10)}`, headers, rows);
      }
    } catch (err) {
      console.error('Erro ao exportar base contratual CSV:', err);
    }
  };

  const fetchContrato = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ search, tipo, status, page, limit });
      const res = await fetch(`${API_BASE}/contrato/itens?${q}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.items);
        setTotal(json.total);
        setTotalPages(json.totalPages || 1);
        if (json.kpis) {
          setKpis(json.kpis);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContrato();
  }, [page, limit, tipo, status, search]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setSearchInput('');
    setTipo('');
    setStatus('');
    setPage(1);
  };

  const handleSelectStatus = (newStatus) => {
    setStatus(newStatus === status ? '' : newStatus);
    setPage(1);
  };

  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. TOP EXECUTIVE KPI SUMMARY CARDS */}
      <div className="row g-3">
        <div className="col-xl-3 col-md-6">
          <div
            className={`card card-animate border ${status === '' ? 'border-primary shadow-sm' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => handleSelectStatus('')}
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-muted text-truncate fs-12 mb-1">
                    Total sob Gestão Contratual
                  </p>
                  <h4 className="fs-22 fw-bold text-primary mb-0">
                    {kpis.total.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    Contrato EMC 22645 + Ativos Identificados
                  </small>
                </div>
                <div className="flex-shrink-0">
                  <div className="avatar-sm rounded bg-soft-primary text-primary d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-file-paper-2-fill"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-3 col-md-6">
          <div
            className={`card card-animate border ${status === 'devolvido_emc' ? 'border-success shadow-sm bg-soft-success' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => handleSelectStatus('devolvido_emc')}
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-success text-truncate fs-12 mb-1">
                    Devolvidos à EMC (Baixados)
                  </p>
                  <h4 className="fs-22 fw-bold text-success mb-0">
                    {kpis.devolvidoEMC.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    {kpis.total > 0 ? `${((kpis.devolvidoEMC / kpis.total) * 100).toFixed(1)}% do escopo devolvido` : 'Baixa definitiva comprovada'}
                  </small>
                </div>
                <div className="flex-shrink-0">
                  <div className="avatar-sm rounded bg-soft-success text-success d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-checkbox-circle-fill"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-3 col-md-6">
          <div
            className={`card card-animate border ${status === 'no_galpao' ? 'border-warning shadow-sm bg-soft-warning' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => handleSelectStatus('no_galpao')}
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-warning text-truncate fs-12 mb-1">
                    No Galpão (Aguardando EMC)
                  </p>
                  <h4 className="fs-22 fw-bold text-warning mb-0">
                    {kpis.noGalpao.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    Bipados no Galpão — 1ª Conferência
                  </small>
                </div>
                <div className="flex-shrink-0">
                  <div className="avatar-sm rounded bg-soft-warning text-warning d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-inbox-archive-fill"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-3 col-md-6">
          <div
            className={`card card-animate border ${status === 'em_campo' ? 'border-info shadow-sm bg-soft-info' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => handleSelectStatus('em_campo')}
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-info text-truncate fs-12 mb-1">
                    Em Campo (Secretarias)
                  </p>
                  <h4 className="fs-22 fw-bold text-info mb-0">
                    {kpis.emCampo.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    Instalados nas unidades municipais
                  </small>
                </div>
                <div className="flex-shrink-0">
                  <div className="avatar-sm rounded bg-soft-info text-info d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-building-line"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN DATA CARD */}
      <div className="card shadow-sm border">
        {/* Card Header & Title */}
        <div className="card-header bg-light border-bottom py-3">
          <div className="row align-items-center g-3">
            <div className="col-md-6">
              <div className="d-flex align-items-center gap-2">
                <div className="avatar-xs rounded bg-primary text-white d-flex align-items-center justify-content-center">
                  <i className="ri-database-2-line fs-14"></i>
                </div>
                <div>
                  <h5 className="card-title mb-0 fs-15 fw-bold text-dark">
                    Inventário e Base Contratual Oficial EMC
                  </h5>
                  <span className="text-muted fs-12">
                    Visualizando <strong>{total.toLocaleString('pt-BR')}</strong> registros filtrados
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Status Filter Tabs */}
            <div className="col-md-6 text-md-end">
              <div className="btn-group btn-group-sm flex-wrap" role="group">
                <button
                  type="button"
                  className={`btn ${status === '' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => handleSelectStatus('')}
                >
                  Todos ({kpis.total})
                </button>
                <button
                  type="button"
                  className={`btn ${status === 'devolvido_emc' ? 'btn-success' : 'btn-outline-success'}`}
                  onClick={() => handleSelectStatus('devolvido_emc')}
                >
                  🟢 Devolvidos ({kpis.devolvidoEMC})
                </button>
                <button
                  type="button"
                  className={`btn ${status === 'no_galpao' ? 'btn-warning' : 'btn-outline-warning'}`}
                  onClick={() => handleSelectStatus('no_galpao')}
                >
                  🔵 No Galpão ({kpis.noGalpao})
                </button>
                <button
                  type="button"
                  className={`btn ${status === 'em_campo' ? 'btn-info' : 'btn-outline-info'}`}
                  onClick={() => handleSelectStatus('em_campo')}
                >
                  🟡 Em Campo ({kpis.emCampo})
                </button>
              </div>
            </div>
          </div>

          {/* Search, Selectors, and Limit Toolbar */}
          <div className="row align-items-center g-2 mt-2 pt-2 border-top">
            <div className="col-lg-4 col-md-6">
              <form onSubmit={handleSearchSubmit} className="input-group input-group-sm">
                <span className="input-group-text bg-white border-end-0">
                  <i className="ri-search-line text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-start-0"
                  placeholder="Buscar Patrimônio, Serial, Modelo, Secretaria..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                <button type="submit" className="btn btn-primary">
                  Filtrar
                </button>
                {(search || searchInput) && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
                    title="Limpar busca"
                  >
                    ✕
                  </button>
                )}
              </form>
            </div>

            <div className="col-lg-2 col-md-3 col-6">
              <select
                className="form-select form-select-sm"
                value={tipo}
                onChange={(e) => { setTipo(e.target.value); setPage(1); }}
              >
                <option value="">Todos os Tipos</option>
                <option value="CPU">CPU</option>
                <option value="MONITOR">Monitor</option>
                <option value="NOTEBOOK">Notebook</option>
                <option value="TABLET">Tablet</option>
                <option value="WORKSTATION">Workstation</option>
              </select>
            </div>

            <div className="col-lg-3 col-md-3 col-6">
              <select
                className="form-select form-select-sm"
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              >
                <option value="">Todos os Status</option>
                <option value="devolvido_emc">🟢 Devolvido à EMC (Baixado)</option>
                <option value="no_galpao">🔵 No Galpão (Aguardando EMC)</option>
                <option value="em_campo">🟡 Em Campo (Secretarias)</option>
                <option value="mapeado">✓ Mapeados no Formulário</option>
                <option value="nao_mapeado">⚠ Sem Local Declarado</option>
              </select>
            </div>

            {/* ITENS POR PÁGINA SELECTOR */}
            <div className="col-lg-3 col-md-12 d-flex align-items-center justify-content-lg-end gap-2">
              <span className="text-muted fs-12 text-nowrap fw-semibold">
                Exibir:
              </span>
              <select
                className="form-select form-select-sm"
                style={{ width: '130px' }}
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              >
                <option value="25">25 por pág.</option>
                <option value="50">50 por pág.</option>
                <option value="100">100 por pág.</option>
                <option value="200">200 por pág.</option>
              </select>

              <button
                type="button"
                className="btn btn-outline-success btn-sm text-nowrap"
                onClick={handleExportContratoCsv}
                title="Exportar base filtrada para planilha Excel/CSV"
              >
                <i className="ri-file-excel-2-line me-1"></i> Exportar CSV
              </button>

              {(search || tipo || status) && (
                <button
                  type="button"
                  className="btn btn-soft-danger btn-sm text-nowrap"
                  onClick={handleClearFilters}
                  title="Resetar todos os filtros"
                >
                  <i className="ri-filter-off-line me-1"></i> Limpar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Card Body - Polished Striped & Hover Table */}
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Carregando...</span>
              </div>
              <p className="text-muted mt-2 fs-13">Carregando dados da base contratual...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-5">
              <div className="avatar-md mx-auto mb-3 bg-soft-warning rounded-circle d-flex align-items-center justify-content-center text-warning fs-28">
                <i className="ri-search-eye-line"></i>
              </div>
              <h5 className="fs-16 fw-semibold text-dark">Nenhum equipamento encontrado</h5>
              <p className="text-muted fs-13 mb-3">
                Nenhum item corresponde aos critérios de pesquisa selecionados.
              </p>
              <button className="btn btn-outline-primary btn-sm" onClick={handleClearFilters}>
                <i className="ri-refresh-line me-1"></i> Redefinir Filtros
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-striped table-hover align-middle table-nowrap mb-0 border-top">
                <thead className="table-light text-uppercase fs-11 fw-bold text-muted border-bottom">
                  <tr>
                    <th style={{ width: '120px' }}>Patrimônio / Item</th>
                    <th style={{ width: '130px' }}>Tag (Nº de Série)</th>
                    <th style={{ minWidth: '220px' }}>Equipamento & Descrição</th>
                    <th style={{ minWidth: '160px' }}>Documento / NF-e</th>
                    <th style={{ minWidth: '220px' }}>Local de Instalação (Servidor)</th>
                    <th style={{ minWidth: '180px' }}>Status Logístico</th>
                    <th style={{ width: '80px' }} className="text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr
                      key={it.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedItem(it)}
                    >
                      {/* Patrimônio / Item */}
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <span className="avatar-xs rounded bg-soft-primary text-primary d-inline-flex align-items-center justify-content-center fs-12 fw-bold">
                            {it.tipo_estimado === 'CPU' ? <i className="ri-computer-line"></i> :
                             it.tipo_estimado === 'MONITOR' ? <i className="ri-tv-line"></i> :
                             it.tipo_estimado === 'NOTEBOOK' ? <i className="ri-macbook-line"></i> :
                             <i className="ri-hard-drive-2-line"></i>}
                          </span>
                          <div>
                            <span className="font-monospace fw-bold text-primary fs-13">
                              {it.item}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Tag / Serial */}
                      <td>
                        {it.n_serie && it.n_serie !== '-' ? (
                          <span className="badge bg-light text-dark font-monospace border fs-12 px-2 py-1">
                            {it.n_serie}
                          </span>
                        ) : (
                          <span className="text-muted font-monospace fs-12">-</span>
                        )}
                      </td>

                      {/* Descrição & Tipo */}
                      <td>
                        <div className="d-flex flex-column">
                          <div className="d-flex align-items-center gap-1">
                            <span className="badge badge-soft-dark fs-10 text-uppercase fw-semibold">
                              {it.tipo_estimado || 'EQUIPAMENTO'}
                            </span>
                            {it.valor_mensal && it.valor_mensal !== '-' && (
                              <span className="badge bg-soft-success text-success fs-10 font-monospace">
                                {it.valor_mensal}
                              </span>
                            )}
                          </div>
                          <span
                            className="fs-12 text-dark fw-medium mt-1"
                            style={{ maxWidth: '320px', whiteSpace: 'normal', lineHeight: '1.3' }}
                          >
                            {it.descricao}
                          </span>
                        </div>
                      </td>

                      {/* NF-e Remessa / Comprovante */}
                      <td>
                        {it.comprovanteBaixa ? (
                          <div>
                            <span className="badge badge-soft-success font-monospace fs-11 d-inline-flex align-items-center">
                              <i className="ri-file-check-line me-1"></i> {it.comprovanteBaixa}
                            </span>
                            {it.dataBaixa && (
                              <div className="fs-11 text-muted mt-1">
                                <i className="ri-calendar-line me-1"></i>
                                {new Date(it.dataBaixa).toLocaleDateString('pt-BR')}
                              </div>
                            )}
                          </div>
                        ) : it.nfe_remessa && it.nfe_remessa !== '-' ? (
                          <div>
                            <span className="badge bg-light text-secondary border font-monospace fs-11">
                              NF: {it.nfe_remessa}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted fs-11 italic">-</span>
                        )}
                      </td>

                      {/* Local / Secretaria */}
                      <td>
                        {it.declaradoNoForm ? (
                          <div>
                            <span className="fw-bold text-dark fs-12 d-block">
                              <i className="ri-building-line text-muted me-1"></i>
                              {it.secretariaDeclarada}
                            </span>
                            {it.servidorDeclarado && (
                              <span className="fs-11 text-muted d-block mt-0">
                                👤 {it.servidorDeclarado}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="badge badge-soft-warning fs-11">
                            <i className="ri-alert-line me-1"></i> Sem resposta no formulário
                          </span>
                        )}
                      </td>

                      {/* Status Logístico */}
                      <td>
                        {it.statusLogistico === 'devolvido_emc' ? (
                          <div>
                            <span className="badge badge-soft-success fs-12 px-2 py-1 d-inline-flex align-items-center">
                              <i className="ri-checkbox-circle-fill me-1 fs-13"></i> Devolvido à EMC
                            </span>
                            <small className="text-success fs-10 d-block mt-1 fw-semibold">
                              ✓ Baixa Comprovada
                            </small>
                          </div>
                        ) : it.statusLogistico === 'no_galpao' ? (
                          <div>
                            <span className="badge badge-soft-warning fs-12 px-2 py-1 d-inline-flex align-items-center">
                              <i className="ri-inbox-archive-fill me-1 fs-13"></i> No Galpão
                            </span>
                            <small className="text-warning fs-10 d-block mt-1 fw-semibold">
                              ⏳ Aguardando Retirada EMC
                            </small>
                          </div>
                        ) : (
                          <div>
                            <span className="badge badge-soft-info fs-12 px-2 py-1 d-inline-flex align-items-center">
                              <i className="ri-building-line me-1 fs-13"></i> Em Campo
                            </span>
                            <small className="text-muted fs-10 d-block mt-1">
                              Nas Secretarias
                            </small>
                          </div>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="text-center" onClick={(e) => { e.stopPropagation(); setSelectedItem(it); }}>
                        <button
                          type="button"
                          className="btn btn-soft-secondary btn-icon btn-sm"
                          title="Ver detalhes do ativo"
                        >
                          <i className="ri-eye-line fs-14"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Card Footer - Dynamic Pagination Controls */}
        <div className="card-footer bg-light border-top py-2 px-3">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <span className="text-muted fs-12">
              Mostrando <strong>{startItem}</strong> a <strong>{endItem}</strong> de <strong>{total.toLocaleString('pt-BR')}</strong> itens
              {totalPages > 1 && ` (Página ${page} de ${totalPages})`}
            </span>

            <div className="d-flex align-items-center gap-1">
              <button
                type="button"
                className="btn btn-soft-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(1)}
                title="Primeira página"
              >
                <i className="ri-skip-back-line"></i>
              </button>
              <button
                type="button"
                className="btn btn-soft-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <i className="ri-arrow-left-s-line me-1"></i> Anterior
              </button>

              <div className="px-2">
                <span className="badge bg-white text-dark border font-monospace fs-12">
                  {page} / {totalPages}
                </span>
              </div>

              <button
                type="button"
                className="btn btn-soft-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima <i className="ri-arrow-right-s-line ms-1"></i>
              </button>
              <button
                type="button"
                className="btn btn-soft-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                title="Última página"
              >
                <i className="ri-skip-forward-line"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ITEM DETAIL MODAL */}
      {selectedItem && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content shadow-lg border-0">
              <div className="modal-header bg-light border-bottom">
                <h5 className="modal-title d-flex align-items-center gap-2">
                  <i className="ri-file-info-line text-primary fs-18"></i>
                  Ficha do Ativo Contratual — Patrimônio {selectedItem.item}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setSelectedItem(null)}
                ></button>
              </div>
              <div className="modal-body p-4">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Patrimônio / Item</label>
                    <div className="fs-16 fw-bold font-monospace text-primary">{selectedItem.item}</div>
                  </div>
                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Número de Série (Tag)</label>
                    <div className="fs-16 fw-bold font-monospace text-dark">{selectedItem.n_serie || '-'}</div>
                  </div>
                  <div className="col-12">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Descrição Completa</label>
                    <div className="fs-14 fw-medium text-dark">{selectedItem.descricao}</div>
                  </div>
                  <div className="col-md-4">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Tipo Estimado</label>
                    <div><span className="badge badge-soft-dark">{selectedItem.tipo_estimado}</span></div>
                  </div>
                  <div className="col-md-4">
                    <label className="text-muted fs-11 text-uppercase fw-bold">NF-e Remessa</label>
                    <div className="fs-13 font-monospace">{selectedItem.nfe_remessa || '-'}</div>
                  </div>
                  <div className="col-md-4">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Valor Mensal de Locação</label>
                    <div className="fs-13 fw-bold text-success font-monospace">{selectedItem.valor_mensal || '-'}</div>
                  </div>

                  <div className="col-12"><hr className="my-2" /></div>

                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Secretaria Declarada (Formulário)</label>
                    <div className="fs-14 fw-bold text-dark">{selectedItem.secretariaDeclarada || 'Não informada no formulário'}</div>
                  </div>
                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Servidor Responsável</label>
                    <div className="fs-14 text-dark">{selectedItem.servidorDeclarado || 'Não informado'}</div>
                  </div>

                  <div className="col-12"><hr className="my-2" /></div>

                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Status do Ciclo de Vida</label>
                    <div>
                      {selectedItem.statusLogistico === 'devolvido_emc' ? (
                        <span className="badge badge-soft-success fs-13 px-2 py-1">
                          <i className="ri-checkbox-circle-line me-1"></i> Devolvido à EMC (Baixado Definitivamente)
                        </span>
                      ) : selectedItem.statusLogistico === 'no_galpao' ? (
                        <span className="badge badge-soft-warning fs-13 px-2 py-1">
                          <i className="ri-inbox-archive-line me-1"></i> No Galpão (Aguardando Retirada EMC)
                        </span>
                      ) : (
                        <span className="badge badge-soft-info fs-13 px-2 py-1">
                          <i className="ri-building-line me-1"></i> Em Campo (Ativo em Secretaria)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Comprovante de Baixa / Coleta</label>
                    <div className="fs-13 font-monospace fw-bold text-dark">
                      {selectedItem.comprovanteBaixa || 'Ainda não devolvido / Em uso'}
                    </div>
                    {selectedItem.dataBaixa && (
                      <small className="text-muted d-block mt-1">Data: {selectedItem.dataBaixa}</small>
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-footer bg-light border-top">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedItem(null)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VIEW: FORMULÁRIO SERVIDORES (1.960 REGISTROS)
// ==========================================
function EquipamentosView() {
  const [items, setItems] = useState([]);
  const [kpis, setKpis] = useState({
    total: 0,
    devolvidos: 0,
    noGalpao: 0,
    pendentes: 0,
    secretariasCount: 0
  });
  const [secretariasDisponiveis, setSecretariasDisponiveis] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [secretaria, setSecretaria] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState(null);

  const handleExportEquipamentosCsv = async () => {
    try {
      const q = new URLSearchParams({ search, status, secretaria, page: 1, limit: 10000 });
      const res = await fetch(`${API_BASE}/equipamentos?${q}`);
      const json = await res.json();
      if (json.success && json.items) {
        const headers = [
          'Servidor',
          'Matrícula',
          'Secretaria',
          'Unidade',
          'Endereço',
          'Telefone',
          'CPU Declarada',
          'Status CPU',
          'Monitor Declarado',
          'Status Monitor',
          'Notebook / Outro',
          'Status Conferência',
          'Comprovante Baixa'
        ];
        const rows = json.items.map((r) => [
          r.servidor,
          r.matricula || '',
          r.secretaria || '',
          r.unidade || '',
          r.endereco || '',
          r.telefone || '',
          r.cpu || '',
          r.cpuStatus || '',
          r.monitor || '',
          r.monitorStatus || '',
          r.notebook || r.monitorAvulso || '',
          r.statusConferencia === 'devolvido_emc' ? 'Devolvido EMC' : r.statusConferencia === 'no_galpao' ? 'No Galpão' : 'Em Campo',
          r.comprovanteBaixa || ''
        ]);
        exportToCsv(`formulario_servidores_${new Date().toISOString().slice(0, 10)}`, headers, rows);
      }
    } catch (err) {
      console.error('Erro ao exportar CSV do formulário:', err);
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ search, status, secretaria, page, limit });
      const res = await fetch(`${API_BASE}/equipamentos?${q}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.items);
        setTotal(json.total);
        setTotalPages(json.totalPages || 1);
        if (json.kpis) setKpis(json.kpis);
        if (json.secretariasDisponiveis) setSecretariasDisponiveis(json.secretariasDisponiveis);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [page, limit, status, secretaria, search]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setSearchInput('');
    setSecretaria('');
    setStatus('');
    setPage(1);
  };

  const handleSelectStatus = (newStatus) => {
    setStatus(newStatus === status ? '' : newStatus);
    setPage(1);
  };

  const startItem = total === 0 ? 0 : (page - 1) * (limit === 'todas' ? total : Number(limit)) + 1;
  const endItem = limit === 'todas' ? total : Math.min(page * Number(limit), total);

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. TOP EXECUTIVE KPI RIBBONS */}
      <div className="row g-3">
        <div className="col-xl-3 col-md-6">
          <div
            className={`card card-animate border ${status === '' ? 'border-primary shadow-sm' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => handleSelectStatus('')}
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-muted text-truncate fs-12 mb-1">
                    Total Declarado no Formulário
                  </p>
                  <h4 className="fs-22 fw-bold text-primary mb-0 font-monospace">
                    {kpis.total.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    {kpis.secretariasCount} secretarias municipais mapeadas
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-sm rounded bg-soft-primary text-primary d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-survey-line"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-3 col-md-6">
          <div
            className={`card card-animate border ${status === 'devolvido_emc' ? 'border-success shadow-sm bg-soft-success' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => handleSelectStatus('devolvido_emc')}
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-success text-truncate fs-12 mb-1">
                    Devolvidos à EMC (Baixados)
                  </p>
                  <h4 className="fs-22 fw-bold text-success mb-0 font-monospace">
                    {kpis.devolvidos.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    Postos com equipamentos já devolvidos
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-sm rounded bg-soft-success text-success d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-checkbox-circle-fill"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-3 col-md-6">
          <div
            className={`card card-animate border ${status === 'no_galpao' ? 'border-warning shadow-sm bg-soft-warning' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => handleSelectStatus('no_galpao')}
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-warning text-truncate fs-12 mb-1">
                    No Galpão (Aguardando EMC)
                  </p>
                  <h4 className="fs-22 fw-bold text-warning mb-0 font-monospace">
                    {kpis.noGalpao.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    Conferidos no Galpão da Prefeitura
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-sm rounded bg-soft-warning text-warning d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-inbox-archive-fill"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-3 col-md-6">
          <div
            className={`card card-animate border ${status === 'pendente' ? 'border-secondary shadow-sm' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => handleSelectStatus('pendente')}
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-muted text-truncate fs-12 mb-1">
                    Em Campo (A Recolher)
                  </p>
                  <h4 className="fs-22 fw-bold text-dark mb-0 font-monospace">
                    {kpis.pendentes.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    Equipamentos ativos com os servidores
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-sm rounded bg-soft-secondary text-dark d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-time-line"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN TABLE CARD */}
      <div className="card shadow-sm border">
        {/* Card Header & Toolbar */}
        <div className="card-header bg-light border-bottom py-3">
          <div className="row align-items-center g-3">
            <div className="col-md-6">
              <div className="d-flex align-items-center gap-2">
                <div className="avatar-xs rounded bg-info text-white d-flex align-items-center justify-content-center">
                  <i className="ri-user-settings-line fs-14"></i>
                </div>
                <div>
                  <h5 className="card-title mb-0 fs-15 fw-bold text-dark">
                    Formulário de Localização Física dos Servidores
                  </h5>
                  <span className="text-muted fs-12">
                    Visualizando <strong>{total.toLocaleString('pt-BR')}</strong> registros de postos de trabalho
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Status Filter Tabs */}
            <div className="col-md-6 text-md-end">
              <div className="btn-group btn-group-sm flex-wrap" role="group">
                <button
                  type="button"
                  className={`btn ${status === '' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => handleSelectStatus('')}
                >
                  Todos ({kpis.total})
                </button>
                <button
                  type="button"
                  className={`btn ${status === 'devolvido_emc' ? 'btn-success' : 'btn-outline-success'}`}
                  onClick={() => handleSelectStatus('devolvido_emc')}
                >
                  🟢 Devolvidos ({kpis.devolvidos})
                </button>
                <button
                  type="button"
                  className={`btn ${status === 'no_galpao' ? 'btn-warning' : 'btn-outline-warning'}`}
                  onClick={() => handleSelectStatus('no_galpao')}
                >
                  🔵 No Galpão ({kpis.noGalpao})
                </button>
                <button
                  type="button"
                  className={`btn ${status === 'pendente' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  onClick={() => handleSelectStatus('pendente')}
                >
                  🟡 Em Campo ({kpis.pendentes})
                </button>
              </div>
            </div>
          </div>

          {/* Search, Secretarias Select, and Limit Controls */}
          <div className="row align-items-center g-2 mt-2 pt-2 border-top">
            <div className="col-lg-4 col-md-6">
              <form onSubmit={handleSearchSubmit} className="input-group input-group-sm">
                <span className="input-group-text bg-white border-end-0">
                  <i className="ri-search-line text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-start-0"
                  placeholder="Buscar Servidor, Matrícula, Unidade ou Patrimônio..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                <button type="submit" className="btn btn-primary">
                  Filtrar
                </button>
                {(search || searchInput) && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
                    title="Limpar busca"
                  >
                    ✕
                  </button>
                )}
              </form>
            </div>

            <div className="col-lg-3 col-md-3 col-6">
              <select
                className="form-select form-select-sm"
                value={secretaria}
                onChange={(e) => { setSecretaria(e.target.value); setPage(1); }}
              >
                <option value="">Todas as Secretarias ({secretariasDisponiveis.length})</option>
                {secretariasDisponiveis.map((sec) => (
                  <option key={sec} value={sec}>{sec}</option>
                ))}
              </select>
            </div>

            <div className="col-lg-2 col-md-3 col-6">
              <select
                className="form-select form-select-sm"
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              >
                <option value="">Todos os Status</option>
                <option value="devolvido_emc">🟢 Devolvido à EMC</option>
                <option value="no_galpao">🔵 No Galpão (Aguardando)</option>
                <option value="pendente">🟡 Em Campo (Pendente)</option>
              </select>
            </div>

            <div className="col-lg-3 col-md-12 d-flex align-items-center justify-content-lg-end gap-2">
              <span className="text-muted fs-12 text-nowrap fw-semibold">
                Exibir:
              </span>
              <select
                className="form-select form-select-sm"
                style={{ width: '130px' }}
                value={limit}
                onChange={(e) => { setLimit(e.target.value); setPage(1); }}
              >
                <option value="25">25 por pág.</option>
                <option value="50">50 por pág.</option>
                <option value="100">100 por pág.</option>
                <option value="200">200 por pág.</option>
                <option value="todas">Todas</option>
              </select>

              <button
                type="button"
                className="btn btn-outline-success btn-sm text-nowrap"
                onClick={handleExportEquipamentosCsv}
                title="Exportar planilha de postos de trabalho para Excel/CSV"
              >
                <i className="ri-file-excel-2-line me-1"></i> Exportar CSV
              </button>

              {(search || secretaria || status) && (
                <button
                  type="button"
                  className="btn btn-soft-danger btn-sm text-nowrap"
                  onClick={handleClearFilters}
                  title="Resetar filtros"
                >
                  <i className="ri-filter-off-line me-1"></i> Limpar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Card Body - Polished Striped & Hover Table */}
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Carregando...</span>
              </div>
              <p className="text-muted mt-2 fs-13">Carregando respostas do formulário...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-5">
              <div className="avatar-md mx-auto mb-3 bg-soft-warning rounded-circle d-flex align-items-center justify-content-center text-warning fs-28">
                <i className="ri-survey-line"></i>
              </div>
              <h5 className="fs-16 fw-semibold text-dark">Nenhum registro encontrado</h5>
              <p className="text-muted fs-13 mb-3">Nenhum servidor corresponde aos critérios de pesquisa selecionados.</p>
              <button className="btn btn-outline-primary btn-sm" onClick={handleClearFilters}>
                <i className="ri-refresh-line me-1"></i> Redefinir Filtros
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-striped table-hover align-middle table-nowrap mb-0 border-top">
                <thead className="table-light text-uppercase fs-11 fw-bold text-muted border-bottom">
                  <tr>
                    <th style={{ minWidth: '220px' }}>Servidor / Matrícula</th>
                    <th style={{ minWidth: '200px' }}>Secretaria / Unidade</th>
                    <th style={{ width: '130px' }}>Patrimônio CPU</th>
                    <th style={{ width: '130px' }}>Patrimônio Monitor</th>
                    <th style={{ width: '130px' }}>Notebook / Outro</th>
                    <th style={{ minWidth: '180px' }}>Status Logístico</th>
                    <th style={{ width: '80px' }} className="text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedRow(row)}
                    >
                      {/* Servidor / Matrícula */}
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <span className="avatar-xs rounded bg-soft-primary text-primary d-inline-flex align-items-center justify-content-center fs-12 fw-bold">
                            👤
                          </span>
                          <div>
                            <strong className="text-dark fs-13 d-block">
                              {row.servidor}
                            </strong>
                            <small className="text-muted font-monospace fs-11">
                              Matrícula: {row.matricula}
                            </small>
                          </div>
                        </div>
                      </td>

                      {/* Secretaria / Unidade */}
                      <td>
                        <div>
                          <span className="badge badge-soft-primary fs-11 fw-semibold">
                            {row.secretaria}
                          </span>
                          <div className="text-muted fs-11 mt-1 text-truncate" style={{ maxWidth: '240px' }}>
                            <i className="ri-map-pin-line me-1"></i>
                            {row.unidade}
                          </div>
                        </div>
                      </td>

                      {/* Patrimônio CPU */}
                      <td>
                        {row.cpu && row.cpu !== '-' ? (
                          <div className="d-flex align-items-center gap-1 flex-wrap">
                            <span className="font-monospace fw-bold text-primary fs-12">
                              {row.cpu}
                            </span>
                            {/[a-zA-Z]/.test(row.cpu) && (
                              <span className="badge bg-soft-warning text-warning fs-10" title="Possui letras / Formato de Service Tag">
                                Tag
                              </span>
                            )}
                            {row.cpuStatus === 'devolvido_emc' && (
                              <span className="badge bg-soft-success text-success fs-10" title="CPU Baixada na EMC">
                                ✓
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted fs-11">-</span>
                        )}
                      </td>

                      {/* Patrimônio Monitor */}
                      <td>
                        {row.monitor && row.monitor !== '-' ? (
                          <div className="d-flex align-items-center gap-1 flex-wrap">
                            <span className="font-monospace fw-bold text-dark fs-12">
                              {row.monitor}
                            </span>
                            {/[a-zA-Z]/.test(row.monitor) && (
                              <span className="badge bg-soft-warning text-warning fs-10" title="Possui letras / Formato de Service Tag">
                                Tag
                              </span>
                            )}
                            {row.monitorStatus === 'devolvido_emc' && (
                              <span className="badge bg-soft-success text-success fs-10" title="Monitor Baixado na EMC">
                                ✓
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted fs-11">-</span>
                        )}
                      </td>

                      {/* Notebook / Outro */}
                      <td>
                        {row.notebook && row.notebook !== '-' ? (
                          <span className="font-monospace fw-bold text-secondary fs-12">
                            {row.notebook}
                          </span>
                        ) : row.monitorAvulso && row.monitorAvulso !== '-' ? (
                          <span className="font-monospace text-muted fs-11" title="Monitor Avulso">
                            Mon: {row.monitorAvulso}
                          </span>
                        ) : (
                          <span className="text-muted fs-11">-</span>
                        )}
                      </td>

                      {/* Status Logístico */}
                      <td>
                        {row.statusConferencia === 'devolvido_emc' ? (
                          <div>
                            <span className="badge badge-soft-success fs-12 px-2 py-1 d-inline-flex align-items-center">
                              <i className="ri-checkbox-circle-fill me-1 fs-13"></i> Devolvido à EMC
                            </span>
                            {row.comprovanteBaixa && (
                              <small className="text-success fs-10 d-block mt-1 font-monospace">
                                {row.comprovanteBaixa}
                              </small>
                            )}
                          </div>
                        ) : row.statusConferencia === 'no_galpao' ? (
                          <div>
                            <span className="badge badge-soft-warning fs-12 px-2 py-1 d-inline-flex align-items-center">
                              <i className="ri-inbox-archive-fill me-1 fs-13"></i> No Galpão
                            </span>
                            <small className="text-warning fs-10 d-block mt-1 fw-semibold">
                              Aguardando Retirada EMC
                            </small>
                          </div>
                        ) : (
                          <div>
                            <span className="badge badge-soft-secondary fs-12 px-2 py-1 d-inline-flex align-items-center">
                              <i className="ri-building-line me-1 fs-13"></i> Em Campo
                            </span>
                            <small className="text-muted fs-10 d-block mt-1">
                              Com o Servidor
                            </small>
                          </div>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="text-center" onClick={(e) => { e.stopPropagation(); setSelectedRow(row); }}>
                        <button
                          type="button"
                          className="btn btn-soft-secondary btn-icon btn-sm"
                          title="Ver ficha do servidor"
                        >
                          <i className="ri-eye-line fs-14"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Card Footer - Dynamic Pagination Controls */}
        {limit !== 'todas' && totalPages > 1 && (
          <div className="card-footer bg-light border-top py-2 px-3">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span className="text-muted fs-12">
                Mostrando <strong>{startItem}</strong> a <strong>{endItem}</strong> de <strong>{total.toLocaleString('pt-BR')}</strong> registros
                {totalPages > 1 && ` (Página ${page} de ${totalPages})`}
              </span>

              <div className="d-flex align-items-center gap-1">
                <button
                  type="button"
                  className="btn btn-soft-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  title="Primeira página"
                >
                  <i className="ri-skip-back-line"></i>
                </button>
                <button
                  type="button"
                  className="btn btn-soft-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <i className="ri-arrow-left-s-line me-1"></i> Anterior
                </button>

                <div className="px-2">
                  <span className="badge bg-white text-dark border font-monospace fs-12">
                    {page} / {totalPages}
                  </span>
                </div>

                <button
                  type="button"
                  className="btn btn-soft-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Próxima <i className="ri-arrow-right-s-line ms-1"></i>
                </button>
                <button
                  type="button"
                  className="btn btn-soft-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  title="Última página"
                >
                  <i className="ri-skip-forward-line"></i>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. ITEM DETAIL MODAL */}
      {selectedRow && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content shadow-lg border-0">
              <div className="modal-header bg-light border-bottom">
                <h5 className="modal-title d-flex align-items-center gap-2">
                  <i className="ri-user-follow-line text-primary fs-18"></i>
                  Ficha do Servidor — {selectedRow.servidor}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setSelectedRow(null)}
                ></button>
              </div>

              <div className="modal-body p-4">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Nome do Servidor</label>
                    <div className="fs-15 fw-bold text-dark">{selectedRow.servidor}</div>
                  </div>
                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Matrícula</label>
                    <div className="fs-15 fw-bold font-monospace text-dark">{selectedRow.matricula}</div>
                  </div>

                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Secretaria Municipal</label>
                    <div><span className="badge badge-soft-primary fs-12">{selectedRow.secretaria}</span></div>
                  </div>
                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Telefone do Responsável</label>
                    <div className="fs-13 text-dark font-monospace">{selectedRow.telefone || '-'}</div>
                  </div>

                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Unidade de Instalação</label>
                    <div className="fs-13 text-dark">{selectedRow.unidade}</div>
                  </div>
                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Endereço Completo</label>
                    <div className="fs-12 text-dark">{selectedRow.endereco || '-'}</div>
                  </div>

                  <div className="col-12"><hr className="my-2" /></div>

                  <div className="col-md-4">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Patrimônio CPU</label>
                    <div className="fs-15 fw-bold font-monospace text-primary">
                      {selectedRow.cpu || '-'}
                    </div>
                    {selectedRow.cpuStatus === 'devolvido_emc' && (
                      <span className="badge badge-soft-success fs-10 mt-1">✓ Baixado na EMC</span>
                    )}
                  </div>

                  <div className="col-md-4">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Patrimônio Monitor</label>
                    <div className="fs-15 fw-bold font-monospace text-dark">
                      {selectedRow.monitor || '-'}
                    </div>
                    {selectedRow.monitorStatus === 'devolvido_emc' && (
                      <span className="badge badge-soft-success fs-10 mt-1">✓ Baixado na EMC</span>
                    )}
                  </div>

                  <div className="col-md-4">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Notebook / Outro</label>
                    <div className="fs-15 fw-bold font-monospace text-secondary">
                      {selectedRow.notebook || selectedRow.monitorAvulso || '-'}
                    </div>
                  </div>

                  <div className="col-12"><hr className="my-2" /></div>

                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Status da Conferência</label>
                    <div>
                      {selectedRow.statusConferencia === 'devolvido_emc' ? (
                        <span className="badge badge-soft-success fs-13 px-2 py-1">
                          <i className="ri-checkbox-circle-line me-1"></i> Devolvido à EMC (Baixado Definitivamente)
                        </span>
                      ) : selectedRow.statusConferencia === 'no_galpao' ? (
                        <span className="badge badge-soft-warning fs-13 px-2 py-1">
                          <i className="ri-inbox-archive-line me-1"></i> No Galpão (Aguardando Retirada EMC)
                        </span>
                      ) : (
                        <span className="badge badge-soft-secondary fs-13 px-2 py-1">
                          <i className="ri-time-line me-1"></i> Em Campo (Com o Servidor)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="col-md-6">
                    <label className="text-muted fs-11 text-uppercase fw-bold">Comprovante de Devolução</label>
                    <div className="fs-13 font-monospace fw-bold text-dark">
                      {selectedRow.comprovanteBaixa || 'Equipamento ainda em uso'}
                    </div>
                    {selectedRow.dataConferencia && (
                      <small className="text-muted d-block mt-1">
                        Data: {new Date(selectedRow.dataConferencia).toLocaleDateString('pt-BR')}
                      </small>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer bg-light border-top">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedRow(null)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VIEW: AUDITORIA & RELATÓRIO DE DISCREPÂNCIAS
// ==========================================
function AuditoriaView({ onNavigate, notify }) {
  const [tab, setTab] = useState('fantasmas');
  const [items, setItems] = useState([]);
  const [kpis, setKpis] = useState({
    totalContrato: 4344,
    totalAtivosForm: 4206,
    contratadosMapeados: 3257,
    contratadosDevolvidos: 1,
    fantasmasCount: 1087,
    foraDoContratoCount: 769,
    duplicidadesCount: 209,
    quarentenaCount: 401
  });
  const [secretariasDisponiveis, setSecretariasDisponiveis] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [secretaria, setSecretaria] = useState('');
  const [tipo, setTipo] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editingInconsistencia, setEditingInconsistencia] = useState(null);
  const [novoCodigoInput, setNovoCodigoInput] = useState('');
  const [isSubmittingFix, setIsSubmittingFix] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(null);

  const fetchDiscrepancias = async () => {
    if (tab === 'diagnostico') {
      setLoading(false);
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const q = new URLSearchParams({ tab, search, secretaria, tipo, page, limit });
      const res = await fetch(`${API_BASE}/auditoria/discrepancias?${q}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.items || []);
        setTotal(json.total || 0);
        setTotalPages(json.totalPages || 1);
        if (json.kpis) setKpis(json.kpis);
        if (json.secretariasDisponiveis) setSecretariasDisponiveis(json.secretariasDisponiveis || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscrepancias();
  }, [tab, page, limit, search, secretaria, tipo]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setSearchInput('');
    setSecretaria('');
    setTipo('');
    setPage(1);
  };

  const handleExportCSV = () => {
    if (tab === 'diagnostico') return;
    const exportUrl = `${API_BASE}/auditoria/export?tab=${tab}`;
    window.open(exportUrl, '_blank');
  };

  const handleSelectTab = (newTab) => {
    setTab(newTab);
    setItems([]);
    setLoading(newTab !== 'diagnostico');
    setPage(1);
    setSearch('');
    setSearchInput('');
    setSecretaria('');
    setTipo('');
  };

  const handleCorrigirInconsistencia = async (e) => {
    e.preventDefault();
    if (!editingInconsistencia || !novoCodigoInput.trim()) return;
    setIsSubmittingFix(true);
    try {
      const res = await fetch(`${API_BASE}/auditoria/corrigir-inconsistencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: editingInconsistencia.formId,
          fieldKey: editingInconsistencia.fieldKey,
          novoCodigo: novoCodigoInput.trim()
        })
      });
      const json = await res.json();
      if (json.success) {
        setEditingInconsistencia(null);
        setNovoCodigoInput('');
        fetchDiscrepancias();
        if (notify) notify('success', 'Inconsistência corrigida com sucesso!');
      } else {
        if (notify) notify('error', json.message || 'Erro ao corrigir inconsistência.');
        else alert(json.message || 'Erro ao corrigir inconsistência.');
      }
    } catch (err) {
      if (notify) notify('error', 'Erro de conexão ao corrigir.');
      else alert('Erro de conexão ao corrigir.');
    } finally {
      setIsSubmittingFix(false);
    }
  };

  const handleDescartarInconsistencia = (item) => {
    setConfirmingDiscard(item);
  };

  const handleExecuteDescarte = async () => {
    if (!confirmingDiscard) return;
    const item = confirmingDiscard;
    setConfirmingDiscard(null);
    try {
      const res = await fetch(`${API_BASE}/auditoria/descartar-inconsistencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: item.formId,
          fieldKey: item.fieldKey
        })
      });
      const json = await res.json();
      if (json.success) {
        fetchDiscrepancias();
        if (notify) notify('success', 'Pendência descartada com sucesso.');
      } else {
        if (notify) notify('error', json.message || 'Erro ao descartar.');
        else alert(json.message || 'Erro ao descartar.');
      }
    } catch (err) {
      if (notify) notify('error', 'Erro de conexão ao descartar.');
      else alert('Erro de conexão ao descartar.');
    }
  };

  const startItem = total === 0 ? 0 : (page - 1) * (limit === 'todas' ? total : Number(limit)) + 1;
  const endItem = limit === 'todas' ? total : Math.min(page * Number(limit), total);

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. TOP EXECUTIVE KPI CARDS */}
      <div className="row g-3">
        {/* Card 1: Fantasmas / Risco */}
        <div className="col-6 col-md-4 col-xl">
          <div
            className={`card card-animate border h-100 mb-0 ${tab === 'fantasmas' ? 'border-danger shadow-sm bg-soft-danger' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => handleSelectTab('fantasmas')}
          >
            <div className="card-body p-3">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-danger text-truncate fs-11 mb-1">
                    Não Localizados
                  </p>
                  <h4 className="fs-20 fw-bold text-danger mb-0 font-monospace">
                    {kpis.fantasmasCount.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-10 mt-1 d-block text-truncate">
                    Contratados sem servidor (Risco)
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-xs rounded bg-soft-danger text-danger d-flex align-items-center justify-content-center fs-16">
                    <i className="ri-error-warning-line"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Declarados Fora da Base */}
        <div className="col-6 col-md-4 col-xl">
          <div
            className={`card card-animate border h-100 mb-0 ${tab === 'excedentes' ? 'border-warning shadow-sm bg-soft-warning' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => handleSelectTab('excedentes')}
          >
            <div className="card-body p-3">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-warning text-truncate fs-11 mb-1">
                    Fora do Contrato
                  </p>
                  <h4 className="fs-20 fw-bold text-warning mb-0 font-monospace">
                    {kpis.foraDoContratoCount.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-10 mt-1 d-block text-truncate">
                    Patrimônios reais fora da EMC
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-xs rounded bg-soft-warning text-warning d-flex align-items-center justify-content-center fs-16">
                    <i className="ri-question-mark"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Duplicidades de Patrimônio */}
        <div className="col-6 col-md-4 col-xl">
          <div
            className={`card card-animate border h-100 mb-0 ${tab === 'duplicidades' ? 'border-purple shadow-sm bg-soft-purple' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => handleSelectTab('duplicidades')}
          >
            <div className="card-body p-3">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-purple text-truncate fs-11 mb-1">
                    Duplicidades
                  </p>
                  <h4 className="fs-20 fw-bold text-purple mb-0 font-monospace">
                    {kpis.duplicidadesCount.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-10 mt-1 d-block text-truncate">
                    Informados por 2+ servidores
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-xs rounded bg-soft-purple text-purple d-flex align-items-center justify-content-center fs-16">
                    <i className="ri-user-shared-line"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Inconsistências / Quarentena */}
        <div className="col-6 col-md-6 col-xl">
          <div
            className={`card card-animate border h-100 mb-0 ${tab === 'quarentena' ? 'border-info shadow-sm bg-soft-info' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => handleSelectTab('quarentena')}
          >
            <div className="card-body p-3">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <div className="d-flex align-items-center gap-1">
                    <p className="text-uppercase fw-semibold text-info text-truncate fs-11 mb-1">
                      Quarentena / Textos
                    </p>
                    <span className="badge bg-info text-white fs-9 rounded-pill">Editar</span>
                  </div>
                  <h4 className="fs-20 fw-bold text-info mb-0 font-monospace">
                    {(kpis.quarentenaCount || 401).toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-10 mt-1 d-block text-truncate">
                    "não tenho", "NT", "ausencia", etc.
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-xs rounded bg-soft-info text-info d-flex align-items-center justify-content-center fs-16">
                    <i className="ri-shield-user-line"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 5: Conciliados / Parecer */}
        <div className="col-12 col-md-6 col-xl">
          <div
            className={`card card-animate border h-100 mb-0 ${tab === 'diagnostico' ? 'border-primary shadow-sm bg-soft-primary' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => handleSelectTab('diagnostico')}
          >
            <div className="card-body p-3">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-primary text-truncate fs-11 mb-1">
                    Conciliados & Parecer
                  </p>
                  <h4 className="fs-20 fw-bold text-primary mb-0 font-monospace">
                    {kpis.contratadosMapeados.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-10 mt-1 d-block text-truncate">
                    71,8% da base com servidor
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-xs rounded bg-soft-primary text-primary d-flex align-items-center justify-content-center fs-16">
                    <i className="ri-file-chart-line"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN AUDIT WORKBENCH */}
      <div className="card shadow-sm border">
        {/* Card Header & Tabs Toolbar */}
        <div className="card-header bg-light border-bottom py-3">
          <div className="row align-items-center g-3">
            <div className="col-lg-5 col-md-12">
              <div className="d-flex align-items-center gap-2">
                <div className="avatar-xs rounded bg-danger text-white d-flex align-items-center justify-content-center">
                  <i className="ri-scales-3-line fs-14"></i>
                </div>
                <div>
                  <h5 className="card-title mb-0 fs-15 fw-bold text-dark">
                    Auditoria Contratual & Triangulação de Dados
                  </h5>
                  <span className="text-muted fs-12">
                    Cruzamento entre <strong>Base EMC (4.344)</strong> vs <strong>Formulário (1.960)</strong> vs <strong>Galpão</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Audit Tabs */}
            <div className="col-lg-7 col-md-12 text-lg-end">
              <div className="btn-group btn-group-sm flex-wrap mobile-scroll-tabs" role="group">
                <button
                  type="button"
                  className={`btn ${tab === 'fantasmas' ? 'btn-danger' : 'btn-outline-danger'}`}
                  onClick={() => handleSelectTab('fantasmas')}
                >
                  🚨 Não Localizados ({kpis.fantasmasCount})
                </button>
                <button
                  type="button"
                  className={`btn ${tab === 'excedentes' ? 'btn-warning' : 'btn-outline-warning'}`}
                  onClick={() => handleSelectTab('excedentes')}
                >
                  ⚠️ Fora da Base ({kpis.foraDoContratoCount})
                </button>
                <button
                  type="button"
                  className={`btn ${tab === 'duplicidades' ? 'btn-purple' : 'btn-outline-purple'}`}
                  onClick={() => handleSelectTab('duplicidades')}
                >
                  👥 Duplicidades ({kpis.duplicidadesCount})
                </button>
                <button
                  type="button"
                  className={`btn ${tab === 'quarentena' ? 'btn-info text-white' : 'btn-outline-info'}`}
                  onClick={() => handleSelectTab('quarentena')}
                  title="Textos como 'não tenho', 'não sei', etc. isolados para correção"
                >
                  🛡️ Quarentena / Textos ({kpis.quarentenaCount || 401})
                </button>
                <button
                  type="button"
                  className={`btn ${tab === 'diagnostico' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => handleSelectTab('diagnostico')}
                >
                  📊 Diagnóstico & Ações
                </button>
              </div>
            </div>
          </div>

          {/* Search, Filter & Export Toolbar (Visible in Table Tabs) */}
          {tab !== 'diagnostico' && (
            <div className="row align-items-center g-2 mt-2 pt-2 border-top">
              <div className="col-lg-4 col-md-6">
                <form onSubmit={handleSearchSubmit} className="input-group input-group-sm">
                  <span className="input-group-text bg-white border-end-0">
                    <i className="ri-search-line text-muted"></i>
                  </span>
                  <input
                    type="text"
                    className="form-control border-start-0"
                    placeholder={
                      tab === 'fantasmas'
                        ? 'Buscar Patrimônio, Série, Modelo ou NFe...'
                        : tab === 'excedentes'
                        ? 'Buscar Código, Servidor, Matrícula ou Secretaria...'
                        : tab === 'duplicidades'
                        ? 'Buscar Patrimônio ou Servidor duplicado...'
                        : tab === 'quarentena'
                        ? 'Buscar Servidor, Matrícula ou Texto declarado...'
                        : 'Buscar...'
                    }
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  <button type="submit" className="btn btn-primary">
                    Filtrar
                  </button>
                  {(search || searchInput) && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
                      title="Limpar busca"
                    >
                      ✕
                    </button>
                  )}
                </form>
              </div>

              {(tab === 'excedentes' || tab === 'quarentena') && (
                <div className="col-lg-3 col-md-3 col-6">
                  <select
                    className="form-select form-select-sm"
                    value={secretaria}
                    onChange={(e) => { setSecretaria(e.target.value); setPage(1); }}
                  >
                    <option value="">Todas as Secretarias ({secretariasDisponiveis.length})</option>
                    {secretariasDisponiveis.map((sec) => (
                      <option key={sec} value={sec}>{sec}</option>
                    ))}
                  </select>
                </div>
              )}

              {(tab === 'fantasmas' || tab === 'excedentes' || tab === 'quarentena') && (
                <div className="col-lg-2 col-md-3 col-6">
                  <select
                    className="form-select form-select-sm"
                    value={tipo}
                    onChange={(e) => { setTipo(e.target.value); setPage(1); }}
                  >
                    <option value="">Todos os Tipos</option>
                    <option value="CPU">CPU</option>
                    <option value="MONITOR">Monitor</option>
                    <option value="NOTEBOOK">Notebook</option>
                  </select>
                </div>
              )}

              <div className="col-lg-3 col-md-12 d-flex align-items-center justify-content-lg-end gap-2 ms-auto">
                <select
                  className="form-select form-select-sm"
                  style={{ width: '130px' }}
                  value={limit}
                  onChange={(e) => { setLimit(e.target.value); setPage(1); }}
                >
                  <option value="25">25 por pág.</option>
                  <option value="50">50 por pág.</option>
                  <option value="100">100 por pág.</option>
                  <option value="200">200 por pág.</option>
                  <option value="todas">Todas ({total})</option>
                </select>

                <button
                  type="button"
                  className="btn btn-success btn-sm text-nowrap d-flex align-items-center gap-1"
                  onClick={handleExportCSV}
                  title="Exportar dados para Excel (.CSV)"
                >
                  <i className="ri-file-excel-2-line"></i> Exportar CSV
                </button>

                {(search || secretaria || tipo) && (
                  <button
                    type="button"
                    className="btn btn-soft-danger btn-sm text-nowrap"
                    onClick={handleClearFilters}
                    title="Resetar filtros"
                  >
                    <i className="ri-filter-off-line me-1"></i> Limpar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Card Body Content */}
        <div className="card-body p-0">
          {tab === 'diagnostico' ? (
            /* DIAGNOSTIC EXECUTIVE VIEW */
            <div className="p-4">
              <div className="alert alert-danger d-flex align-items-center p-3 mb-4" role="alert">
                <i className="ri-alert-line fs-24 me-3 text-danger"></i>
                <div>
                  <h6 className="alert-heading fw-bold mb-1">
                    Alerta de Auditoria: 1.222 Equipamentos Contratados Não Foram Declarados no Formulário
                  </h6>
                  <p className="mb-0 fs-13">
                    A Prefeitura possui 4.344 itens sob contrato com a empresa EMC. No formulário preenchido pelos servidores, foram localizados 3.121 itens legítimos. Os outros <strong>1.222 itens (28,1%)</strong> não foram apontados por nenhum servidor e ainda não constam como devolvidos no galpão, gerando risco de questionamento contratual no encerramento do contrato.
                  </p>
                </div>
              </div>

              <div className="row g-4 mb-4">
                <div className="col-md-4">
                  <div className="card border border-danger mb-0 h-100">
                    <div className="card-header bg-soft-danger py-2">
                      <h6 className="card-title text-danger mb-0 fs-13 fw-bold">
                        <i className="ri-alarm-warning-line me-1"></i> Discrepância 1: Itens Não Localizados
                      </h6>
                    </div>
                    <div className="card-body">
                      <h3 className="text-danger fw-bold mb-1">1.222 <small className="fs-13 text-muted">ativos</small></h3>
                      <p className="fs-12 text-muted mb-3">
                        Equipamentos da EMC faturados regularmente no contrato, mas sem servidor associado.
                      </p>
                      <h6 className="fs-12 fw-bold text-dark mb-1">🎯 Ação Recomendada:</h6>
                      <ul className="fs-12 text-muted ps-3 mb-0">
                        <li>Exportar a lista pelo botão <strong>Exportar CSV</strong> na aba 1.</li>
                        <li>Notificar diretores administrativos das 26 secretarias para varredura em salas de arquivo e depósitos internos.</li>
                        <li>Separar comprovantes de remessa da EMC (NF-e) para verificar se esses itens foram de fato entregues.</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="card border border-warning mb-0 h-100">
                    <div className="card-header bg-soft-warning py-2">
                      <h6 className="card-title text-warning mb-0 fs-13 fw-bold">
                        <i className="ri-shield-alert-line me-1"></i> Discrepância 2: Itens Fora do Contrato
                      </h6>
                    </div>
                    <div className="card-body">
                      <h3 className="text-warning fw-bold mb-1">1.222 <small className="fs-13 text-muted">ativos</small></h3>
                      <p className="fs-12 text-muted mb-3">
                        Equipamentos declarados por servidores que <strong>NÃO constam na base contratual da EMC</strong>.
                      </p>
                      <h6 className="fs-12 fw-bold text-dark mb-1">🎯 Ação Recomendada:</h6>
                      <ul className="fs-12 text-muted ps-3 mb-0">
                        <li><strong>NÃO devolver à transportadora da EMC</strong> sem conferência prévia.</li>
                        <li>Podem ser máquinas próprias da Prefeitura ou de outro contrato (ex: Positivo/Lenovo/Dell).</li>
                        <li>Verificar possíveis erros de digitação de etiqueta por parte dos servidores.</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="card border border-purple mb-0 h-100">
                    <div className="card-header bg-soft-purple py-2">
                      <h6 className="card-title text-purple mb-0 fs-13 fw-bold">
                        <i className="ri-user-shared-line me-1"></i> Discrepância 3: Duplicidades de Formulário
                      </h6>
                    </div>
                    <div className="card-body">
                      <h3 className="text-purple fw-bold mb-1">214 <small className="fs-13 text-muted">conflitos</small></h3>
                      <p className="fs-12 text-muted mb-3">
                        O mesmo código de patrimônio ou CPU foi informado por 2 ou mais pessoas.
                      </p>
                      <h6 className="fs-12 fw-bold text-dark mb-1">🎯 Ação Recomendada:</h6>
                      <ul className="fs-12 text-muted ps-3 mb-0">
                        <li>Consultar a aba <strong>Duplicidades</strong> para ver os nomes e telefones dos servidores em conflito.</li>
                        <li>Entrar em contato para confirmar qual posto físico realmente está de posse do ativo.</li>
                        <li>Elimina distorções de contagem no balanço das secretarias.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Conciliation Progress Bar */}
              <div className="card border bg-light">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h6 className="mb-0 fw-bold fs-14">Taxa Global de Conciliação Contratual (EMC)</h6>
                    <span className="badge bg-primary fs-12 font-monospace">71,8% Conciliado</span>
                  </div>
                  <div className="progress progress-xl mb-2" style={{ height: '20px' }}>
                    <div
                      className="progress-bar bg-success"
                      role="progressbar"
                      style={{ width: '71.8%' }}
                      title="3.121 Conciliados"
                    >
                      3.121 Conciliados (71,8%)
                    </div>
                    <div
                      className="progress-bar bg-danger"
                      role="progressbar"
                      style={{ width: '28.2%' }}
                      title="1.222 Não Localizados"
                    >
                      1.222 Não Localizados (28,2%)
                    </div>
                  </div>
                  <div className="d-flex justify-content-between fs-12 text-muted">
                    <span>Base Total Contratada EMC: <strong>4.344 Equipamentos</strong></span>
                    <span>Meta de Devolução: <strong>100% dos ativos</strong></span>
                  </div>
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-danger" role="status">
                <span className="visually-hidden">Processando auditoria...</span>
              </div>
              <p className="text-muted mt-2 fs-13">Cruzando bases contratuais e conferindo divergências...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-5">
              <div className="avatar-md mx-auto mb-3 bg-soft-success rounded-circle d-flex align-items-center justify-content-center text-success fs-28">
                <i className="ri-checkbox-circle-line"></i>
              </div>
              <h5 className="fs-16 fw-semibold text-dark">Nenhuma discrepância encontrada com os filtros atuais</h5>
              <p className="text-muted fs-13 mb-3">Tente limpar a pesquisa ou selecionar outro filtro.</p>
              <button className="btn btn-outline-primary btn-sm" onClick={handleClearFilters}>
                <i className="ri-refresh-line me-1"></i> Redefinir Filtros
              </button>
            </div>
          ) : tab === 'fantasmas' ? (
            /* TAB 1: CONTRATADOS NÃO LOCALIZADOS */
            <div>
              {/* DESKTOP TABLE */}
              <div className="table-responsive d-none d-md-block">
                <table className="table table-striped table-hover align-middle table-nowrap mb-0 border-top">
                  <thead className="table-light text-uppercase fs-11 fw-bold text-muted border-bottom">
                    <tr>
                      <th style={{ width: '130px' }}>Patrimônio / Item</th>
                      <th style={{ width: '130px' }}>Nº de Série</th>
                      <th style={{ width: '100px' }}>Tipo</th>
                      <th>Descrição do Equipamento no Contrato</th>
                      <th style={{ width: '120px' }}>NF-e Remessa</th>
                      <th style={{ width: '120px' }}>Valor Mensal</th>
                      <th style={{ minWidth: '180px' }}>Status de Risco</th>
                      <th style={{ width: '70px' }} className="text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr
                        key={row.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedItem({ type: 'fantasma', data: row })}
                      >
                        <td>
                          <span className="font-monospace fw-bold text-danger fs-13">
                            {row.item}
                          </span>
                        </td>
                        <td>
                          <span className="font-monospace text-dark fs-12">
                            {row.n_serie || '-'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${row.tipo_estimado === 'CPU' ? 'badge-soft-primary' : row.tipo_estimado === 'MONITOR' ? 'badge-soft-info' : 'badge-soft-warning'}`}>
                            {row.tipo_estimado || 'EQUIP'}
                          </span>
                        </td>
                        <td>
                          <span className="text-dark fs-12 d-block text-truncate" style={{ maxWidth: '350px' }} title={row.descricao}>
                            {row.descricao}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-soft-secondary font-monospace fs-11">
                            NF {row.nfe_remessa || '-'}
                          </span>
                        </td>
                        <td>
                          <span className="text-muted font-monospace fs-12">
                            {row.valor_mensal || '-'}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-soft-danger fs-11 px-2 py-1 d-inline-flex align-items-center">
                            <i className="ri-alarm-warning-line me-1 fs-12"></i> Faturado sem Localização
                          </span>
                        </td>
                        <td className="text-center" onClick={(e) => { e.stopPropagation(); setSelectedItem({ type: 'fantasma', data: row }); }}>
                          <button type="button" className="btn btn-soft-danger btn-icon btn-sm" title="Inspecionar">
                            <i className="ri-eye-line fs-14"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARDS */}
              <div className="d-md-none p-2">
                {items.map((row) => (
                  <div
                    key={row.id}
                    className="mobile-asset-card"
                    onClick={() => setSelectedItem({ type: 'fantasma', data: row })}
                  >
                    <div className="card-top-row">
                      <span className="asset-code-badge text-danger">{row.item}</span>
                      <span className={`badge ${row.tipo_estimado === 'CPU' ? 'badge-soft-primary' : row.tipo_estimado === 'MONITOR' ? 'badge-soft-info' : 'badge-soft-warning'}`}>
                        {row.tipo_estimado || 'EQUIP'}
                      </span>
                    </div>
                    <div className="card-info-row text-truncate" title={row.descricao}>
                      <strong className="text-dark">{row.descricao}</strong>
                    </div>
                    <div className="card-info-row d-flex justify-content-between">
                      <small className="text-muted">Série: <span className="font-monospace text-dark">{row.n_serie || '-'}</span></small>
                      <span className="badge badge-soft-secondary font-monospace fs-10">NF {row.nfe_remessa || '-'}</span>
                    </div>
                    <div className="card-actions-row justify-content-between">
                      <span className="badge badge-soft-danger fs-11">
                        <i className="ri-alarm-warning-line me-1"></i> Sem Localização
                      </span>
                      <button
                        type="button"
                        className="btn btn-soft-danger btn-sm"
                        onClick={(e) => { e.stopPropagation(); setSelectedItem({ type: 'fantasma', data: row }); }}
                      >
                        <i className="ri-eye-line me-1"></i> Detalhes
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : tab === 'excedentes' ? (
            /* TAB 2: DECLARADOS FORA DA BASE CONTRATUAL */
            <div>
              {/* DESKTOP TABLE */}
              <div className="table-responsive d-none d-md-block">
                <table className="table table-striped table-hover align-middle table-nowrap mb-0 border-top">
                  <thead className="table-light text-uppercase fs-11 fw-bold text-muted border-bottom">
                    <tr>
                      <th style={{ width: '130px' }}>Código Declarado</th>
                      <th style={{ width: '90px' }}>Tipo</th>
                      <th style={{ minWidth: '220px' }}>Servidor Responsável</th>
                      <th style={{ minWidth: '200px' }}>Secretaria / Unidade</th>
                      <th style={{ minWidth: '150px' }}>Telefone / Endereço</th>
                      <th style={{ width: '130px' }}>Status Físico</th>
                      <th style={{ minWidth: '160px' }}>Diagnóstico</th>
                      <th style={{ width: '70px' }} className="text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr
                        key={row.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedItem({ type: 'fora_contrato', data: row })}
                      >
                        <td>
                          <span className="font-monospace fw-bold text-warning fs-13">
                            {row.codigo}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-soft-warning fs-11">
                            {row.tipo}
                          </span>
                        </td>
                        <td>
                          <div>
                            <strong className="text-dark fs-13 d-block">{row.servidor}</strong>
                            <small className="text-muted font-monospace fs-11">Matrícula: {row.matricula}</small>
                          </div>
                        </td>
                        <td>
                          <div>
                            <span className="badge badge-soft-primary fs-11 fw-semibold">{row.secretaria}</span>
                            <div className="text-muted fs-11 mt-1 text-truncate" style={{ maxWidth: '220px' }}>
                              {row.unidade}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div>
                            <small className="text-dark font-monospace fs-11 d-block">
                              <i className="ri-phone-line me-1"></i>{row.telefone || '-'}
                            </small>
                            <small className="text-muted fs-10 text-truncate d-block" style={{ maxWidth: '180px' }}>
                              {row.endereco || '-'}
                            </small>
                          </div>
                        </td>
                        <td>
                          {row.statusLogistico === 'devolvido_emc' ? (
                            <span className="badge badge-soft-success fs-11">Devolvido EMC</span>
                          ) : row.statusLogistico === 'no_galpao' ? (
                            <span className="badge badge-soft-warning fs-11">No Galpão</span>
                          ) : (
                            <span className="badge badge-soft-secondary fs-11">Em Campo</span>
                          )}
                        </td>
                        <td>
                          <span className="badge badge-soft-warning fs-11 px-2 py-1 d-inline-flex align-items-center">
                            <i className="ri-question-line me-1"></i> Não Pertence à EMC
                          </span>
                        </td>
                        <td className="text-center" onClick={(e) => { e.stopPropagation(); setSelectedItem({ type: 'fora_contrato', data: row }); }}>
                          <button type="button" className="btn btn-soft-warning btn-icon btn-sm" title="Inspecionar">
                            <i className="ri-eye-line fs-14"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARDS */}
              <div className="d-md-none p-2">
                {items.map((row) => (
                  <div
                    key={row.id}
                    className="mobile-asset-card"
                    onClick={() => setSelectedItem({ type: 'fora_contrato', data: row })}
                  >
                    <div className="card-top-row">
                      <span className="asset-code-badge text-warning">{row.codigo}</span>
                      <span className="badge badge-soft-secondary">{row.tipo}</span>
                    </div>
                    <div className="card-info-row">
                      <strong className="text-dark d-block">{row.servidor}</strong>
                      <small className="text-muted font-monospace">Mat: {row.matricula}</small>
                    </div>
                    <div className="card-info-row">
                      <span className="badge badge-soft-primary me-1">{row.secretaria}</span>
                      <small className="text-muted">{row.unidade}</small>
                    </div>
                    <div className="card-actions-row justify-content-between">
                      <span className="badge badge-soft-warning fs-10">Fora do Contrato</span>
                      <button
                        type="button"
                        className="btn btn-soft-warning btn-sm"
                        onClick={(e) => { e.stopPropagation(); setSelectedItem({ type: 'fora_contrato', data: row }); }}
                      >
                        <i className="ri-eye-line me-1"></i> Detalhes
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : tab === 'duplicidades' ? (
            /* TAB 3: CONFLITOS DE DUPLICIDADE */
            <div>
              <div className="table-responsive d-none d-md-block">
                <table className="table table-striped table-hover align-middle table-nowrap mb-0 border-top">
                  <thead className="table-light text-uppercase fs-11 fw-bold text-muted border-bottom">
                    <tr>
                      <th style={{ width: '140px' }}>Patrimônio em Conflito</th>
                      <th style={{ width: '130px' }}>Ocorrências</th>
                      <th style={{ width: '130px' }}>Base EMC?</th>
                      <th style={{ width: '90px' }}>Tipo</th>
                      <th>Servidores e Secretarias que Informaram o Mesmo Código</th>
                      <th style={{ width: '70px' }} className="text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr
                        key={row.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedItem({ type: 'duplicidade', data: row })}
                      >
                        <td>
                          <span className="font-monospace fw-bold text-purple fs-14">
                            {row.codigo}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-soft-danger fs-12 px-2 py-1 fw-bold">
                            {row.qtdOcorrencias}x Declarado
                          </span>
                        </td>
                        <td>
                          {row.pertenceContratoEMC ? (
                            <span className="badge badge-soft-success fs-11">
                              ✓ No Contrato EMC
                            </span>
                          ) : (
                            <span className="badge badge-soft-warning fs-11">
                              Fora da EMC
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="badge badge-soft-secondary fs-11">
                            {row.tipo}
                          </span>
                        </td>
                        <td>
                          <div className="d-flex flex-column gap-1 py-1">
                            {(row.servidores || []).map((srv, idx) => (
                              <div key={idx} className="d-flex align-items-center gap-2">
                                <span className="badge badge-soft-primary fs-10 font-monospace">
                                  {srv.secretaria || '-'}
                                </span>
                                <span className="fs-12 fw-semibold text-dark">
                                  {srv.servidor || 'Servidor'}
                                </span>
                                <small className="text-muted font-monospace fs-11">
                                  (Mat: {srv.matricula || '-'} - {srv.unidade || '-'})
                                </small>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="text-center" onClick={(e) => { e.stopPropagation(); setSelectedItem({ type: 'duplicidade', data: row }); }}>
                          <button type="button" className="btn btn-soft-purple btn-icon btn-sm" title="Inspecionar">
                            <i className="ri-eye-line fs-14"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARDS FOR DUPLICIDADES */}
              <div className="d-md-none p-2">
                {items.map((row) => (
                  <div
                    key={row.id}
                    className="mobile-asset-card"
                    onClick={() => setSelectedItem({ type: 'duplicidade', data: row })}
                  >
                    <div className="card-top-row">
                      <span className="asset-code-badge text-purple">{row.codigo}</span>
                      <div className="d-flex align-items-center gap-1">
                        <span className="badge badge-soft-danger fw-bold">{row.qtdOcorrencias}x Declarado</span>
                        <span className="badge badge-soft-secondary">{row.tipo}</span>
                      </div>
                    </div>
                    <div className="mb-2">
                      {row.pertenceContratoEMC ? (
                        <span className="badge badge-soft-success fs-10">✓ No Contrato EMC</span>
                      ) : (
                        <span className="badge badge-soft-warning fs-10">Fora da EMC</span>
                      )}
                    </div>
                    <div className="card-info-row">
                      <small className="text-muted fw-bold d-block mb-1">Servidores que informaram:</small>
                      <div className="d-flex flex-column gap-1">
                        {(row.servidores || []).map((srv, idx) => (
                          <div key={idx} className="bg-light p-1 rounded fs-11">
                            <span className="badge badge-soft-primary me-1">{srv.secretaria || '-'}</span>
                            <span className="fw-semibold text-dark">{srv.servidor || 'Servidor'}</span>
                            <span className="text-muted ms-1">(Mat: {srv.matricula || '-'})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="card-actions-row justify-content-end mt-2">
                      <button
                        type="button"
                        className="btn btn-soft-purple btn-sm"
                        onClick={(e) => { e.stopPropagation(); setSelectedItem({ type: 'duplicidade', data: row }); }}
                      >
                        <i className="ri-eye-line me-1"></i> Inspecionar Conflito
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* TAB 4: QUARENTENA / INCONSISTÊNCIAS */
            <div>
              <div className="p-3 bg-soft-info border-bottom d-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center gap-2">
                  <i className="ri-information-line fs-20 text-info"></i>
                  <div>
                    <strong className="text-dark fs-13 d-block">Quarentena de Textos Inconclusivos</strong>
                    <span className="text-muted fs-12">
                      Estes registros continham textos informativos (ex: "Utilizo notebook de compensação", "somente notebook", "não tenho", "NT", "ausencia", "x", etc.) e foram isolados para não distorcer a base de ativos. Você pode digitar o código de patrimônio correto para reintegrá-lo à base ativa ou descartar a pendência.
                    </span>
                  </div>
                </div>
              </div>
              <div className="table-responsive d-none d-md-block">
                <table className="table table-striped table-hover align-middle table-nowrap mb-0 border-top">
                  <thead className="table-light text-uppercase fs-11 fw-bold text-muted border-bottom">
                    <tr>
                      <th style={{ width: '160px' }}>Texto Declarado</th>
                      <th style={{ width: '90px' }}>Tipo</th>
                      <th style={{ minWidth: '220px' }}>Servidor Responsável</th>
                      <th style={{ minWidth: '200px' }}>Secretaria / Unidade</th>
                      <th style={{ minWidth: '150px' }}>Telefone</th>
                      <th style={{ width: '190px' }} className="text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span className="badge badge-soft-danger font-monospace fs-12 px-2 py-1 text-uppercase">
                            "{row.codigoDeclarado}"
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-soft-secondary fs-11">
                            {row.tipo}
                          </span>
                        </td>
                        <td>
                          <div>
                            <strong className="text-dark fs-13 d-block">{row.servidor}</strong>
                            <small className="text-muted font-monospace fs-11">Matrícula: {row.matricula}</small>
                          </div>
                        </td>
                        <td>
                          <div>
                            <span className="badge badge-soft-primary fs-11 fw-semibold">{row.secretaria}</span>
                            <div className="text-muted fs-11 mt-1 text-truncate" style={{ maxWidth: '220px' }}>
                              {row.unidade}
                            </div>
                          </div>
                        </td>
                        <td>
                          <small className="text-dark font-monospace fs-11 d-block">
                            <i className="ri-phone-line me-1 text-muted"></i>{row.telefone || '-'}
                          </small>
                          <small className="text-muted fs-10 text-truncate d-block" style={{ maxWidth: '160px' }}>
                            {row.endereco || '-'}
                          </small>
                        </td>
                        <td className="text-center">
                          <div className="d-flex align-items-center justify-content-center gap-1">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm d-flex align-items-center gap-1"
                              onClick={() => {
                                setEditingInconsistencia(row);
                                setNovoCodigoInput('');
                              }}
                              title="Editar e reintegrar patrimônio à base ativa"
                            >
                              <i className="ri-edit-line"></i> Corrigir
                            </button>
                            <button
                              type="button"
                              className="btn btn-soft-danger btn-sm"
                              onClick={() => handleDescartarInconsistencia(row)}
                              title="Descartar (servidor realmente sem este equipamento)"
                            >
                              <i className="ri-close-line"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARDS FOR QUARENTENA */}
              <div className="d-md-none p-2">
                {items.map((row) => (
                  <div key={row.id} className="mobile-asset-card">
                    <div className="card-top-row">
                      <span className="badge badge-soft-danger font-monospace fs-12 px-2 py-1 text-uppercase text-truncate" style={{ maxWidth: '70%' }}>
                        "{row.codigoDeclarado}"
                      </span>
                      <span className="badge badge-soft-secondary">{row.tipo}</span>
                    </div>
                    <div className="card-info-row">
                      <strong className="text-dark d-block">{row.servidor}</strong>
                      <small className="text-muted font-monospace">Matrícula: {row.matricula}</small>
                    </div>
                    <div className="card-info-row">
                      <span className="badge badge-soft-primary me-1">{row.secretaria}</span>
                      <small className="text-muted">{row.unidade}</small>
                    </div>
                    {row.telefone && (
                      <div className="card-info-row">
                        <small className="text-dark font-monospace">
                          <i className="ri-phone-line me-1 text-muted"></i>{row.telefone}
                        </small>
                      </div>
                    )}
                    <div className="card-actions-row gap-2 mt-2">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm flex-grow-1 d-flex align-items-center justify-content-center gap-1"
                        style={{ minHeight: '38px' }}
                        onClick={() => {
                          setEditingInconsistencia(row);
                          setNovoCodigoInput('');
                        }}
                      >
                        <i className="ri-edit-line"></i> Corrigir
                      </button>
                      <button
                        type="button"
                        className="btn btn-soft-danger btn-sm px-3"
                        style={{ minHeight: '38px' }}
                        onClick={() => handleDescartarInconsistencia(row)}
                        title="Descartar pendência"
                      >
                        <i className="ri-close-line fs-14"></i> Descartar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Card Footer - Dynamic Pagination Controls */}
        {tab !== 'diagnostico' && limit !== 'todas' && totalPages > 1 && (
          <div className="card-footer bg-light border-top py-2 px-3">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span className="text-muted fs-12">
                Mostrando <strong>{startItem}</strong> a <strong>{endItem}</strong> de <strong>{total.toLocaleString('pt-BR')}</strong> registros
                {totalPages > 1 && ` (Página ${page} de ${totalPages})`}
              </span>

              <div className="d-flex align-items-center gap-1">
                <button
                  type="button"
                  className="btn btn-soft-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  title="Primeira página"
                >
                  <i className="ri-skip-back-line"></i>
                </button>
                <button
                  type="button"
                  className="btn btn-soft-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <i className="ri-arrow-left-s-line me-1"></i> Anterior
                </button>

                <div className="px-2">
                  <span className="badge bg-white text-dark border font-monospace fs-12">
                    {page} / {totalPages}
                  </span>
                </div>

                <button
                  type="button"
                  className="btn btn-soft-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Próxima <i className="ri-arrow-right-s-line ms-1"></i>
                </button>
                <button
                  type="button"
                  className="btn btn-soft-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  title="Última página"
                >
                  <i className="ri-skip-forward-line"></i>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. MODAL DE INSPEÇÃO FORENSE DE DISCREPÂNCIA */}
      {selectedItem && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content shadow-lg border-0">
              <div className="modal-header bg-light border-bottom">
                <h5 className="modal-title d-flex align-items-center gap-2">
                  <i className="ri-microscope-line text-danger fs-18"></i>
                  Ficha de Auditoria — {selectedItem.type === 'fantasma' ? `Ativo Não Localizado (${selectedItem.data.item})` : selectedItem.type === 'fora_contrato' ? `Ativo Fora do Contrato (${selectedItem.data.codigo})` : `Conflito de Duplicidade (${selectedItem.data.codigo})`}
                </h5>
                <button type="button" className="btn-close" onClick={() => setSelectedItem(null)}></button>
              </div>

              <div className="modal-body p-4">
                {selectedItem.type === 'fantasma' && (
                  <div className="row g-3">
                    <div className="col-12">
                      <div className="alert alert-danger mb-0 fs-13">
                        <strong>Atenção:</strong> Este equipamento consta na base contratual oficial da EMC e é faturado mensalmente, porém nenhum dos 1.960 formulários respondidos pelos servidores indicou estar com ele.
                      </div>
                    </div>
                    <div className="col-md-4">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Patrimônio / Item</label>
                      <div className="fs-16 fw-bold font-monospace text-danger">{selectedItem.data.item}</div>
                    </div>
                    <div className="col-md-4">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Nº de Série</label>
                      <div className="fs-16 fw-bold font-monospace text-dark">{selectedItem.data.n_serie || '-'}</div>
                    </div>
                    <div className="col-md-4">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Tipo Estimado</label>
                      <div><span className="badge badge-soft-primary fs-12">{selectedItem.data.tipo_estimado}</span></div>
                    </div>
                    <div className="col-md-8">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Descrição no Contrato EMC</label>
                      <div className="fs-13 text-dark fw-semibold">{selectedItem.data.descricao}</div>
                    </div>
                    <div className="col-md-4">
                      <label className="text-muted fs-11 text-uppercase fw-bold">NF-e de Remessa</label>
                      <div className="fs-13 font-monospace text-dark">NF {selectedItem.data.nfe_remessa || '-'}</div>
                    </div>
                    <div className="col-md-6">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Valor Mensal Faturado</label>
                      <div className="fs-14 font-monospace text-dark">{selectedItem.data.valor_mensal || '-'}</div>
                    </div>
                    <div className="col-md-6">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Software Instalado</label>
                      <div className="fs-13 text-dark">{selectedItem.data.software || '-'}</div>
                    </div>
                    <div className="col-12"><hr className="my-1" /></div>
                    <div className="col-12">
                      <h6 className="fs-13 fw-bold text-danger">Ação sugerida para a equipe:</h6>
                      <p className="fs-12 text-muted mb-0">
                        1. Pesquisar nas NF-es de remessa para identificar em qual prédio da prefeitura a máquina foi entregue originalmente.
                        <br />
                        2. Acionar a gerência de patrimônio para verificar se o equipamento sofreu perda, descarte ou furto durante o contrato.
                      </p>
                    </div>
                  </div>
                )}

                {selectedItem.type === 'fora_contrato' && (
                  <div className="row g-3">
                    <div className="col-12">
                      <div className="alert alert-warning mb-0 fs-13">
                        <strong>Cuidado:</strong> O servidor informou este código, mas ele <strong>NÃO PERTENCE</strong> à base de 4.344 itens da EMC. Não recolha para devolver à EMC sem confirmar a origem!
                      </div>
                    </div>
                    <div className="col-md-4">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Código Informado</label>
                      <div className="fs-16 fw-bold font-monospace text-warning">{selectedItem.data.codigo}</div>
                    </div>
                    <div className="col-md-4">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Tipo Declarado</label>
                      <div><span className="badge badge-soft-warning fs-12">{selectedItem.data.tipo}</span></div>
                    </div>
                    <div className="col-md-4">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Status Logístico</label>
                      <div><span className="badge badge-soft-secondary fs-12">{selectedItem.data.statusLogistico}</span></div>
                    </div>
                    <div className="col-md-6">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Servidor Responsável</label>
                      <div className="fs-14 fw-bold text-dark">{selectedItem.data.servidor}</div>
                      <small className="text-muted font-monospace">Matrícula: {selectedItem.data.matricula}</small>
                    </div>
                    <div className="col-md-6">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Telefone de Contato</label>
                      <div className="fs-14 font-monospace text-dark">{selectedItem.data.telefone || '-'}</div>
                    </div>
                    <div className="col-md-6">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Secretaria Municipal</label>
                      <div><span className="badge badge-soft-primary fs-12">{selectedItem.data.secretaria}</span></div>
                    </div>
                    <div className="col-md-6">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Unidade de Instalação</label>
                      <div className="fs-13 text-dark">{selectedItem.data.unidade}</div>
                    </div>
                    <div className="col-12">
                      <label className="text-muted fs-11 text-uppercase fw-bold">Endereço Completo</label>
                      <div className="fs-12 text-dark">{selectedItem.data.endereco}</div>
                    </div>
                  </div>
                )}

                {selectedItem.type === 'duplicidade' && (
                  <div className="row g-3">
                    <div className="col-12">
                      <div className="alert alert-purple mb-0 fs-13">
                        <strong>Conflito Detectado:</strong> O código <strong>{selectedItem.data.codigo}</strong> foi preenchido por <strong>{selectedItem.data.qtdOcorrencias} servidores</strong> distintos. Confira a lista abaixo para sanar a duplicidade.
                      </div>
                    </div>
                    <div className="col-12">
                      <h6 className="fs-13 fw-bold text-dark mb-2">Servidores que apontaram o mesmo patrimônio:</h6>
                      <div className="list-group">
                        {(selectedItem?.data?.servidores || []).map((srv, i) => (
                          <div key={i} className="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                            <div>
                              <strong className="text-dark fs-13 d-block">{srv.servidor || 'Servidor'}</strong>
                              <span className="text-muted fs-11">Matrícula: {srv.matricula || '-'} • Unidade: {srv.unidade || '-'}</span>
                            </div>
                            <span className="badge badge-soft-primary fs-11">{srv.secretaria || '-'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer bg-light border-top">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedItem(null)}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL DE CORREÇÃO DE INCONSISTÊNCIA / QUARENTENA */}
      {editingInconsistencia && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg border-0">
              <form onSubmit={handleCorrigirInconsistencia}>
                <div className="modal-header bg-light border-bottom">
                  <h5 className="modal-title d-flex align-items-center gap-2">
                    <i className="ri-edit-circle-line text-primary fs-18"></i>
                    Corrigir Patrimônio & Reintegrar à Base
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setEditingInconsistencia(null)}></button>
                </div>

                <div className="modal-body p-4">
                  <div className="alert alert-info fs-12 mb-3">
                    O servidor preencheu <strong>"{editingInconsistencia.codigoDeclarado}"</strong> no campo <strong>{editingInconsistencia.fieldKey}</strong>. Digite o número de patrimônio real para reintegrar o equipamento à base ativa.
                  </div>

                  <div className="mb-3">
                    <label className="form-label fs-11 text-muted text-uppercase fw-bold mb-1">Servidor Responsável:</label>
                    <div className="fw-bold text-dark fs-14">{editingInconsistencia.servidor}</div>
                    <small className="text-muted d-block">{editingInconsistencia.secretaria} • {editingInconsistencia.unidade}</small>
                    <small className="text-dark font-monospace"><i className="ri-phone-line me-1"></i>{editingInconsistencia.telefone || 'Sem telefone'}</small>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fs-12 fw-bold text-dark">
                      Novo Número de Patrimônio / Etiqueta do {editingInconsistencia.tipo}:
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-lg font-monospace fw-bold text-primary"
                      placeholder="Ex: 124585, 137187..."
                      autoFocus
                      required
                      value={novoCodigoInput}
                      onChange={(e) => setNovoCodigoInput(e.target.value)}
                    />
                    <small className="text-muted fs-11 mt-1 d-block">
                      Ao salvar, o sistema atualizará a base e cruzará o código com o contrato da EMC em tempo real.
                    </small>
                  </div>
                </div>

                <div className="modal-footer bg-light border-top">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingInconsistencia(null)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm fw-bold" disabled={isSubmittingFix || !novoCodigoInput.trim()}>
                    {isSubmittingFix ? 'Salvando...' : 'Salvar e Reintegrar à Base'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VIEW: ITENS EXCEDENTES
// ==========================================
function ExcedentesView({ onUpdated, notify }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchExcedentes = async () => {
    try {
      const res = await fetch(`${API_BASE}/excedentes?page=${page}&limit=30`);
      const json = await res.json();
      if (json.success) {
        setItems(json.items);
        setTotal(json.total);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchExcedentes();
  }, [page]);

  return (
    <div className="card">
      <div className="card-header align-items-center d-flex">
        <h4 className="card-title mb-0 flex-grow-1">
          <i className="ri-add-circle-line me-2 text-purple"></i>
          Auditoria de Equipamentos Excedentes ({total} Itens Identificados a Mais)
        </h4>
        <span className="badge badge-soft-purple fs-12">
          Itens não catalogados no formulário incorporados ao lote EMC
        </span>
      </div>

      <div className="card-body">
        {items.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="ri-checkbox-circle-line fs-36 text-success d-block mb-2"></i>
            Nenhum equipamento excedente registrado no momento.
          </div>
        ) : (
          <div className="table-responsive table-card">
            <table className="table table-borderless table-centered align-middle table-nowrap mb-0">
              <thead className="text-muted table-light">
                <tr>
                  <th>Código Bipado</th>
                  <th>Tipo</th>
                  <th>Localidade Coletada</th>
                  <th>Origem Coleta</th>
                  <th>Data/Hora Entrada</th>
                  <th>Status Etapa</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td className="font-monospace fw-bold text-purple">{row.codigo_bipado}</td>
                    <td>
                      <span className="badge badge-soft-dark">{row.tipo_equipamento}</span>
                    </td>
                    <td>{row.localidade_coletada}</td>
                    <td>
                      <span className="badge badge-soft-secondary">{row.origem_registro}</span>
                    </td>
                    <td className="fs-12 text-muted">{row.data_hora_coleta}</td>
                    <td>
                      {row.status_etapa === 'devolvido_emc' ? (
                        <span className="badge badge-soft-success">Devolvido EMC</span>
                      ) : (
                        <span className="badge badge-soft-warning">No Galpão</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Confirmação de Descarte de Pendência */}
      {confirmingDiscard && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1055 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-danger text-white py-2">
                <h6 className="modal-title fs-14 fw-semibold">
                  <i className="ri-delete-bin-line me-1"></i> Confirmar Descarte de Pendência
                </h6>
                <button type="button" className="btn-close btn-close-white" onClick={() => setConfirmingDiscard(null)}></button>
              </div>
              <div className="modal-body p-4 text-center">
                <div className="avatar-md mx-auto mb-3 text-danger">
                  <i className="ri-alert-line display-5"></i>
                </div>
                <h5 className="fs-16">Descartar pendência de conferência?</h5>
                <p className="text-muted fs-13 mb-3">
                  Confirmar que o servidor <strong>{confirmingDiscard.servidor}</strong> não possui este equipamento? A pendência com código declarado <code className="fw-bold">{confirmingDiscard.codigoDeclarado}</code> será descartada permanentemente da auditoria.
                </p>
                <div className="d-flex justify-content-center gap-2">
                  <button type="button" className="btn btn-light" onClick={() => setConfirmingDiscard(null)}>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-danger" onClick={handleExecuteDescarte}>
                    <i className="ri-delete-bin-line me-1"></i> Confirmar Descarte
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VIEW: BALANÇO POR SECRETARIA (EXPANDIDO & DRILLDOWN)
// ==========================================
function SecretariasView({ stats, onNavigate }) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('todas');
  const [sortBy, setSortBy] = useState('previsto');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);

  // Drilldown Modal State
  const [selectedSec, setSelectedSec] = useState(null);
  const [secEquipamentos, setSecEquipamentos] = useState([]);
  const [secLoading, setSecLoading] = useState(false);
  const [secSearch, setSecSearch] = useState('');
  const [secStatusFilter, setSecStatusFilter] = useState('');

  if (!stats || !stats.secretariasList) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Carregando dados...</span>
        </div>
        <p className="text-muted mt-2 fs-13">Carregando balanço das secretarias...</p>
      </div>
    );
  }

  // Fetch equipments for a specific secretariat when drilldown opens
  const handleOpenSecretaria = async (sec) => {
    setSelectedSec(sec);
    setSecLoading(true);
    setSecSearch('');
    setSecStatusFilter('');
    try {
      const q = new URLSearchParams({ secretaria: sec.secretaria, limit: 300 });
      const res = await fetch(`${API_BASE}/equipamentos?${q}`);
      const json = await res.json();
      if (json.success) {
        setSecEquipamentos(json.items);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSecLoading(false);
    }
  };

  const allSecretarias = stats.secretariasList || [];

  // Summary KPIs across all secretarias
  const totalSecretarias = allSecretarias.length;
  const totalPrevisto = allSecretarias.reduce((acc, s) => acc + (s.previsto || 0), 0);
  const totalNoGalpao = allSecretarias.reduce((acc, s) => acc + (s.noGalpao || 0), 0);
  const totalDevolvidos = allSecretarias.reduce((acc, s) => acc + (s.devolvidoEMC || 0), 0);
  const totalFaltante = allSecretarias.reduce((acc, s) => acc + (s.faltante || 0), 0);

  const comDevolucaoCount = allSecretarias.filter((s) => s.devolvidoEMC > 0).length;
  const concluidasCount = allSecretarias.filter((s) => s.taxaConclusao === 100 && s.previsto > 0).length;
  const andamentoCount = allSecretarias.filter((s) => s.devolvidoEMC > 0 && s.taxaConclusao < 100).length;
  const semDevolucaoCount = allSecretarias.filter((s) => s.devolvidoEMC === 0).length;

  // Filtering
  let filtered = allSecretarias.filter((s) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!s.secretaria.toLowerCase().includes(q)) return false;
    }
    if (filterType === 'com_devolucao') return s.devolvidoEMC > 0;
    if (filterType === 'concluidas') return s.taxaConclusao === 100 && s.previsto > 0;
    if (filterType === 'andamento') return s.devolvidoEMC > 0 && s.taxaConclusao < 100;
    if (filterType === 'sem_devolucao') return s.devolvidoEMC === 0;
    return true;
  });

  // Sorting
  filtered.sort((a, b) => {
    if (sortBy === 'nome') {
      const valA = a.secretaria.toLowerCase();
      const valB = b.secretaria.toLowerCase();
      return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    let valA = a[sortBy] ?? 0;
    let valB = b[sortBy] ?? 0;
    if (sortBy === 'taxa') {
      valA = a.taxaConclusao ?? 0;
      valB = b.taxaConclusao ?? 0;
    }
    return sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  // Pagination
  const pageSize = limit === 'todas' ? filtered.length : Number(limit);
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const startItem = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, filtered.length);
  const paginated = limit === 'todas' ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);

  // Filtered equipments inside the drilldown modal
  const filteredModalEquipamentos = secEquipamentos.filter((eq) => {
    if (secStatusFilter && eq.statusConferencia !== secStatusFilter) return false;
    if (secSearch.trim()) {
      const s = secSearch.toLowerCase();
      return (
        (eq.servidor && eq.servidor.toLowerCase().includes(s)) ||
        (eq.matricula && eq.matricula.toLowerCase().includes(s)) ||
        (eq.unidade && eq.unidade.toLowerCase().includes(s)) ||
        (eq.cpu && eq.cpu.toLowerCase().includes(s)) ||
        (eq.monitor && eq.monitor.toLowerCase().includes(s)) ||
        (eq.notebook && eq.notebook.toLowerCase().includes(s))
      );
    }
    return true;
  });

  const handleExportSecretariasGeralCsv = () => {
    if (!filtered || filtered.length === 0) return;
    const headers = ['Secretaria', 'Previstos', 'Devolvidos a EMC', 'No Galpao', 'Faltantes', 'Taxa Conclusao'];
    const rows = filtered.map(s => [
      s.secretaria || '',
      s.previsto || 0,
      s.devolvidoEMC || 0,
      s.noGalpao || 0,
      s.faltante || 0,
      `${s.taxaConclusao || 0}%`
    ]);
    exportToCsv('balanco_secretarias_contagem.csv', headers, rows);
  };

  const handleExportSecretariaCsv = () => {
    if (!selectedSec || !filteredModalEquipamentos || filteredModalEquipamentos.length === 0) return;
    const headers = ['Servidor', 'Matricula', 'Secretaria', 'Unidade', 'Patrimonio CPU', 'Patrimonio Monitor', 'Notebook', 'Status Conferencia'];
    const rows = filteredModalEquipamentos.map(eq => [
      eq.servidor || '',
      eq.matricula || '',
      selectedSec.secretaria || '',
      eq.unidade || '',
      eq.cpu || '',
      eq.monitor || '',
      eq.notebook || '',
      eq.statusConferencia === 'devolvido_emc' ? 'Devolvido a EMC' : eq.statusConferencia === 'no_galpao' ? 'No Galpao' : 'Em Campo (Pendente)'
    ]);
    exportToCsv(`secretaria_${(selectedSec.secretaria || 'dados').toLowerCase().replace(/[^a-z0-9]/g, '_')}.csv`, headers, rows);
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. TOP EXECUTIVE KPI RIBBONS */}
      <div className="row g-3">
        <div className="col-xl-3 col-md-6">
          <div
            className={`card card-animate border ${filterType === 'todas' ? 'border-primary shadow-sm' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => { setFilterType('todas'); setPage(1); }}
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-muted text-truncate fs-12 mb-1">
                    Secretarias Municipais
                  </p>
                  <h4 className="fs-22 fw-bold text-primary mb-0 font-monospace">
                    {totalSecretarias}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    Órgãos municipais mapeados
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-sm rounded bg-soft-primary text-primary d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-building-4-fill"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-3 col-md-6">
          <div className="card card-animate border border-light shadow-sm">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-muted text-truncate fs-12 mb-1">
                    Previsto no Formulário
                  </p>
                  <h4 className="fs-22 fw-bold text-dark mb-0 font-monospace">
                    {totalPrevisto.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    Postos de trabalho declarados
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-sm rounded bg-soft-secondary text-dark d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-file-user-line"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-3 col-md-6">
          <div
            className={`card card-animate border ${filterType === 'com_devolucao' ? 'border-success shadow-sm bg-soft-success' : 'border-light'}`}
            style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => { setFilterType(filterType === 'com_devolucao' ? 'todas' : 'com_devolucao'); setPage(1); }}
          >
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-success text-truncate fs-12 mb-1">
                    Devolvidos à EMC
                  </p>
                  <h4 className="fs-22 fw-bold text-success mb-0 font-monospace">
                    {totalDevolvidos.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    {comDevolucaoCount} secretarias com baixa efetivada
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-sm rounded bg-soft-success text-success d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-checkbox-circle-fill"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-3 col-md-6">
          <div className="card card-animate border border-light shadow-sm">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1 overflow-hidden">
                  <p className="text-uppercase fw-semibold text-warning text-truncate fs-12 mb-1">
                    Faltante a Recolher
                  </p>
                  <h4 className="fs-22 fw-bold text-warning mb-0 font-monospace">
                    {totalFaltante.toLocaleString('pt-BR')}
                  </h4>
                  <small className="text-muted fs-11 mt-1 d-block">
                    Equipamentos ainda nas secretarias
                  </small>
                </div>
                <div className="flex-shrink-0 ms-2">
                  <div className="avatar-sm rounded bg-soft-warning text-warning d-flex align-items-center justify-content-center fs-20">
                    <i className="ri-time-line"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN TABLE CARD */}
      <div className="card shadow-sm border">
        {/* Header & Controls */}
        <div className="card-header bg-light border-bottom py-3">
          <div className="row align-items-center g-3">
            <div className="col-md-6">
              <div className="d-flex align-items-center gap-2">
                <div className="avatar-xs rounded bg-primary text-white d-flex align-items-center justify-content-center">
                  <i className="ri-government-line fs-14"></i>
                </div>
                <div>
                  <h5 className="card-title mb-0 fs-15 fw-bold text-dark">
                    Balanço Físico de Recolhimento por Secretaria
                  </h5>
                  <span className="text-muted fs-12">
                    Visualizando <strong>{filtered.length}</strong> de <strong>{totalSecretarias}</strong> secretarias
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Filter Buttons */}
            <div className="col-md-6 text-md-end">
              <div className="btn-group btn-group-sm flex-wrap" role="group">
                <button
                  type="button"
                  className={`btn ${filterType === 'todas' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => { setFilterType('todas'); setPage(1); }}
                >
                  Todas ({totalSecretarias})
                </button>
                <button
                  type="button"
                  className={`btn ${filterType === 'com_devolucao' ? 'btn-success' : 'btn-outline-success'}`}
                  onClick={() => { setFilterType('com_devolucao'); setPage(1); }}
                >
                  🟢 Com Devoluções ({comDevolucaoCount})
                </button>
                <button
                  type="button"
                  className={`btn ${filterType === 'concluidas' ? 'btn-info' : 'btn-outline-info'}`}
                  onClick={() => { setFilterType('concluidas'); setPage(1); }}
                >
                  ✓ Concluídas ({concluidasCount})
                </button>
                <button
                  type="button"
                  className={`btn ${filterType === 'sem_devolucao' ? 'btn-warning' : 'btn-outline-warning'}`}
                  onClick={() => { setFilterType('sem_devolucao'); setPage(1); }}
                >
                  ⚠ Pendentes ({semDevolucaoCount})
                </button>
              </div>
            </div>
          </div>

          {/* Search, Sort, and Page Limit Bar */}
          <div className="row align-items-center g-2 mt-2 pt-2 border-top">
            <div className="col-lg-5 col-md-6">
              <div className="input-group input-group-sm">
                <span className="input-group-text bg-white border-end-0">
                  <i className="ri-search-line text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-start-0"
                  placeholder="Buscar secretaria por sigla ou nome (ex: SMDS, SEMEL)..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
                {search && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => { setSearch(''); setPage(1); }}
                    title="Limpar busca"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="col-lg-4 col-md-6">
              <div className="d-flex align-items-center gap-2">
                <span className="text-muted fs-12 text-nowrap fw-semibold">
                  Ordenar por:
                </span>
                <select
                  className="form-select form-select-sm"
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                >
                  <option value="previsto">Maior Volume Previsto</option>
                  <option value="devolvidoEMC">Maior Quantidade Devolvida</option>
                  <option value="faltante">Maior Saldo Faltante</option>
                  <option value="taxa">Maior % de Conclusão</option>
                  <option value="nome">Nome da Secretaria (A-Z)</option>
                </select>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  title={sortOrder === 'asc' ? 'Ordem Crescente' : 'Ordem Decrescente'}
                >
                  {sortOrder === 'asc' ? <i className="ri-sort-asc"></i> : <i className="ri-sort-desc"></i>}
                </button>
              </div>
            </div>

            <div className="col-lg-3 col-md-12 d-flex align-items-center justify-content-lg-end gap-2">
              <span className="text-muted fs-12 text-nowrap fw-semibold">
                Exibir:
              </span>
              <select
                className="form-select form-select-sm"
                style={{ width: '120px' }}
                value={limit}
                onChange={(e) => { setLimit(e.target.value); setPage(1); }}
              >
                <option value="10">10 por pág.</option>
                <option value="15">15 por pág.</option>
                <option value="25">25 por pág.</option>
                <option value="50">50 por pág.</option>
                <option value="todas">Todas</option>
              </select>

              <button
                type="button"
                className="btn btn-outline-success btn-sm text-nowrap"
                onClick={handleExportSecretariasGeralCsv}
                title="Exportar balanço das secretarias para Excel"
              >
                <i className="ri-file-excel-2-line me-1"></i> Exportar CSV
              </button>

              {(search || filterType !== 'todas') && (
                <button
                  type="button"
                  className="btn btn-soft-danger btn-sm text-nowrap"
                  onClick={() => { setSearch(''); setFilterType('todas'); setPage(1); }}
                >
                  <i className="ri-filter-off-line me-1"></i> Limpar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Card Body - Polished Table */}
        <div className="card-body p-0">
          {paginated.length === 0 ? (
            <div className="text-center py-5">
              <div className="avatar-md mx-auto mb-3 bg-soft-warning rounded-circle d-flex align-items-center justify-content-center text-warning fs-28">
                <i className="ri-building-line"></i>
              </div>
              <h5 className="fs-16 fw-semibold text-dark">Nenhuma secretaria encontrada</h5>
              <p className="text-muted fs-13 mb-3">Nenhum registro corresponde aos filtros selecionados.</p>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={() => { setSearch(''); setFilterType('todas'); setPage(1); }}
              >
                <i className="ri-refresh-line me-1"></i> Redefinir Filtros
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-striped table-hover align-middle table-nowrap mb-0 border-top">
                <thead className="table-light text-uppercase fs-11 fw-bold text-muted border-bottom">
                  <tr>
                    <th style={{ width: '60px' }} className="text-center">#</th>
                    <th
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleSort('nome')}
                    >
                      Secretaria Municipal {sortBy === 'nome' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-center"
                      style={{ width: '120px', cursor: 'pointer' }}
                      onClick={() => toggleSort('previsto')}
                    >
                      Previsto (Form) {sortBy === 'previsto' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-center"
                      style={{ width: '120px', cursor: 'pointer' }}
                      onClick={() => toggleSort('noGalpao')}
                    >
                      No Galpão {sortBy === 'noGalpao' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-center"
                      style={{ width: '130px', cursor: 'pointer' }}
                      onClick={() => toggleSort('devolvidoEMC')}
                    >
                      Devolvido EMC {sortBy === 'devolvidoEMC' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-center"
                      style={{ width: '120px', cursor: 'pointer' }}
                      onClick={() => toggleSort('conferido')}
                    >
                      Total Baixado
                    </th>
                    <th
                      className="text-center"
                      style={{ width: '120px', cursor: 'pointer' }}
                      onClick={() => toggleSort('faltante')}
                    >
                      Faltante em Campo {sortBy === 'faltante' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      style={{ minWidth: '160px', cursor: 'pointer' }}
                      onClick={() => toggleSort('taxa')}
                    >
                      Progresso {sortBy === 'taxa' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th style={{ width: '110px' }} className="text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((s, idx) => (
                    <tr
                      key={s.secretaria}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleOpenSecretaria(s)}
                    >
                      {/* Ranking */}
                      <td className="text-center">
                        <span className="badge bg-light text-dark font-monospace border fs-11">
                          {(page - 1) * pageSize + idx + 1}º
                        </span>
                      </td>

                      {/* Nome Secretaria */}
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <span className="avatar-xs rounded bg-soft-primary text-primary d-inline-flex align-items-center justify-content-center fs-12 fw-bold">
                            <i className="ri-building-line"></i>
                          </span>
                          <div>
                            <span className="fw-bold text-dark fs-13 d-block">
                              {s.secretaria}
                            </span>
                            {s.devolvidoEMC > 0 && (
                              <small className="text-success fs-10 fw-semibold">
                                ✓ {s.devolvidoEMC} baixados com documento EMC
                              </small>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Previsto */}
                      <td className="text-center font-monospace fw-bold fs-13 text-dark">
                        {s.previsto}
                      </td>

                      {/* No Galpão */}
                      <td className="text-center">
                        {s.noGalpao > 0 ? (
                          <span className="badge badge-soft-warning font-monospace fs-12 px-2 py-1">
                            {s.noGalpao}
                          </span>
                        ) : (
                          <span className="text-muted font-monospace fs-12">0</span>
                        )}
                      </td>

                      {/* Devolvido EMC */}
                      <td className="text-center">
                        {s.devolvidoEMC > 0 ? (
                          <span className="badge badge-soft-success font-monospace fs-12 px-2 py-1 fw-bold">
                            ✓ {s.devolvidoEMC}
                          </span>
                        ) : (
                          <span className="text-muted font-monospace fs-12">0</span>
                        )}
                      </td>

                      {/* Total Conferido */}
                      <td className="text-center font-monospace fw-bold text-primary fs-13">
                        {s.conferido}
                      </td>

                      {/* Faltante */}
                      <td className="text-center">
                        {s.faltante > 0 ? (
                          <span className="badge bg-soft-danger text-danger font-monospace fs-12 px-2 py-1">
                            {s.faltante}
                          </span>
                        ) : (
                          <span className="badge bg-soft-success text-success fs-11">
                            ✓ Concluído
                          </span>
                        )}
                      </td>

                      {/* Progresso */}
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <div className="progress progress-sm flex-grow-1" style={{ height: '7px' }}>
                            <div
                              className={`progress-bar ${s.taxaConclusao >= 80 ? 'bg-success' : s.taxaConclusao > 0 ? 'bg-primary' : 'bg-secondary'}`}
                              role="progressbar"
                              style={{ width: `${s.taxaConclusao}%` }}
                            ></div>
                          </div>
                          <span className="fs-12 text-muted fw-bold font-monospace" style={{ minWidth: '40px' }}>
                            {s.taxaConclusao}%
                          </span>
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="text-center" onClick={(e) => { e.stopPropagation(); handleOpenSecretaria(s); }}>
                        <button
                          type="button"
                          className="btn btn-soft-primary btn-sm py-1 px-2 fs-11 fw-semibold"
                          title="Ver equipamentos da secretaria"
                        >
                          <i className="ri-eye-line me-1"></i> Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Card Footer - Dynamic Pagination */}
        {limit !== 'todas' && totalPages > 1 && (
          <div className="card-footer bg-light border-top py-2 px-3">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span className="text-muted fs-12">
                Mostrando <strong>{startItem}</strong> a <strong>{endItem}</strong> de <strong>{filtered.length}</strong> secretarias
                {totalPages > 1 && ` (Página ${page} de ${totalPages})`}
              </span>

              <div className="d-flex align-items-center gap-1">
                <button
                  type="button"
                  className="btn btn-soft-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  title="Primeira página"
                >
                  <i className="ri-skip-back-line"></i>
                </button>
                <button
                  type="button"
                  className="btn btn-soft-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <i className="ri-arrow-left-s-line me-1"></i> Anterior
                </button>

                <div className="px-2">
                  <span className="badge bg-white text-dark border font-monospace fs-12">
                    {page} / {totalPages}
                  </span>
                </div>

                <button
                  type="button"
                  className="btn btn-soft-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Próxima <i className="ri-arrow-right-s-line ms-1"></i>
                </button>
                <button
                  type="button"
                  className="btn btn-soft-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  title="Última página"
                >
                  <i className="ri-skip-forward-line"></i>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. DRILLDOWN MODAL: FICHA DETALHADA DA SECRETARIA */}
      {selectedSec && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="modal-dialog modal-dialog-centered modal-xl">
            <div className="modal-content shadow-lg border-0">
              {/* Modal Header */}
              <div className="modal-header bg-light border-bottom py-3">
                <div className="d-flex align-items-center gap-2">
                  <div className="avatar-xs rounded bg-primary text-white d-flex align-items-center justify-content-center">
                    <i className="ri-building-line fs-14"></i>
                  </div>
                  <div>
                    <h5 className="modal-title fs-16 fw-bold text-dark mb-0">
                      Ficha da Secretaria — {selectedSec.secretaria}
                    </h5>
                    <span className="text-muted fs-12">
                      Relação nominal de servidores e equipamentos cadastrados no formulário oficial
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setSelectedSec(null)}
                ></button>
              </div>

              {/* Modal KPI Mini Ribbons */}
              <div className="bg-light-subtle px-4 py-3 border-bottom">
                <div className="row g-2">
                  <div className="col-md-3 col-6">
                    <div className="p-2 rounded bg-white border text-center">
                      <span className="text-muted fs-11 text-uppercase fw-semibold d-block">Previstos</span>
                      <strong className="fs-16 font-monospace text-dark">{selectedSec.previsto}</strong>
                    </div>
                  </div>
                  <div className="col-md-3 col-6">
                    <div className="p-2 rounded bg-white border text-center">
                      <span className="text-success fs-11 text-uppercase fw-semibold d-block">Devolvidos EMC</span>
                      <strong className="fs-16 font-monospace text-success">✓ {selectedSec.devolvidoEMC}</strong>
                    </div>
                  </div>
                  <div className="col-md-3 col-6">
                    <div className="p-2 rounded bg-white border text-center">
                      <span className="text-warning fs-11 text-uppercase fw-semibold d-block">No Galpão</span>
                      <strong className="fs-16 font-monospace text-warning">{selectedSec.noGalpao}</strong>
                    </div>
                  </div>
                  <div className="col-md-3 col-6">
                    <div className="p-2 rounded bg-white border text-center">
                      <span className="text-danger fs-11 text-uppercase fw-semibold d-block">Faltantes</span>
                      <strong className="fs-16 font-monospace text-danger">{selectedSec.faltante}</strong>
                    </div>
                  </div>
                </div>

                {/* Search & Filter Toolbar inside Modal */}
                <div className="row g-2 mt-2 align-items-center">
                  <div className="col-md-6">
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-white border-end-0">
                        <i className="ri-search-line text-muted"></i>
                      </span>
                      <input
                        type="text"
                        className="form-control border-start-0"
                        placeholder="Buscar servidor, matrícula, unidade ou patrimônio..."
                        value={secSearch}
                        onChange={(e) => setSecSearch(e.target.value)}
                      />
                      {secSearch && (
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => setSecSearch('')}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="col-md-6 text-md-end">
                    <div className="btn-group btn-group-sm" role="group">
                      <button
                        type="button"
                        className={`btn ${secStatusFilter === '' ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setSecStatusFilter('')}
                      >
                        Todos ({secEquipamentos.length})
                      </button>
                      <button
                        type="button"
                        className={`btn ${secStatusFilter === 'devolvido_emc' ? 'btn-success' : 'btn-outline-success'}`}
                        onClick={() => setSecStatusFilter('devolvido_emc')}
                      >
                        🟢 Devolvidos ({secEquipamentos.filter(e => e.statusConferencia === 'devolvido_emc').length})
                      </button>
                      <button
                        type="button"
                        className={`btn ${secStatusFilter === 'no_galpao' ? 'btn-warning' : 'btn-outline-warning'}`}
                        onClick={() => setSecStatusFilter('no_galpao')}
                      >
                        🔵 No Galpão ({secEquipamentos.filter(e => e.statusConferencia === 'no_galpao').length})
                      </button>
                      <button
                        type="button"
                        className={`btn ${secStatusFilter === 'pendente' ? 'btn-danger' : 'btn-outline-danger'}`}
                        onClick={() => setSecStatusFilter('pendente')}
                      >
                        🟡 Pendentes ({secEquipamentos.filter(e => e.statusConferencia === 'pendente').length})
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Body: Equipments Table */}
              <div className="modal-body p-0" style={{ maxHeight: '460px', overflowY: 'auto' }}>
                {secLoading ? (
                  <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status"></div>
                    <p className="text-muted mt-2 fs-13">Carregando equipamentos da secretaria...</p>
                  </div>
                ) : filteredModalEquipamentos.length === 0 ? (
                  <div className="text-center py-5 text-muted">
                    <i className="ri-inbox-line fs-32 text-secondary mb-2 d-block"></i>
                    Nenhum equipamento encontrado com os filtros aplicados.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-striped table-hover align-middle table-nowrap mb-0">
                      <thead className="table-light text-uppercase fs-11 fw-bold text-muted border-bottom sticky-top">
                        <tr>
                          <th>Servidor / Responsável</th>
                          <th>Unidade / Prédio</th>
                          <th>Patrimônio CPU</th>
                          <th>Patrimônio Monitor</th>
                          <th>Notebook</th>
                          <th>Status da Conferência</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredModalEquipamentos.map((eq) => (
                          <tr key={eq.id}>
                            <td>
                              <div>
                                <strong className="text-dark fs-12 d-block">
                                  👤 {eq.servidor}
                                </strong>
                                <small className="text-muted font-monospace fs-11">
                                  Matrícula: {eq.matricula}
                                </small>
                              </div>
                            </td>
                            <td>
                              <span className="fs-12 text-muted text-truncate d-block" style={{ maxWidth: '180px' }}>
                                {eq.unidade || '-'}
                              </span>
                            </td>
                            <td>
                              {eq.cpu && eq.cpu !== '-' ? (
                                <span className="font-monospace fw-bold text-primary fs-12">
                                  <i className="ri-computer-line me-1"></i>
                                  {eq.cpu}
                                </span>
                              ) : (
                                <span className="text-muted fs-11">-</span>
                              )}
                            </td>
                            <td>
                              {eq.monitor && eq.monitor !== '-' ? (
                                <span className="font-monospace fw-bold text-dark fs-12">
                                  <i className="ri-tv-line me-1"></i>
                                  {eq.monitor}
                                </span>
                              ) : (
                                <span className="text-muted fs-11">-</span>
                              )}
                            </td>
                            <td>
                              {eq.notebook && eq.notebook !== '-' ? (
                                <span className="font-monospace fw-bold text-secondary fs-12">
                                  <i className="ri-macbook-line me-1"></i>
                                  {eq.notebook}
                                </span>
                              ) : (
                                <span className="text-muted fs-11">-</span>
                              )}
                            </td>
                            <td>
                              {eq.statusConferencia === 'devolvido_emc' ? (
                                <span className="badge badge-soft-success fs-11 px-2 py-1 d-inline-flex align-items-center">
                                  <i className="ri-checkbox-circle-fill me-1"></i> Devolvido à EMC
                                </span>
                              ) : eq.statusConferencia === 'no_galpao' ? (
                                <span className="badge badge-soft-warning fs-11 px-2 py-1 d-inline-flex align-items-center">
                                  <i className="ri-inbox-archive-fill me-1"></i> No Galpão
                                </span>
                              ) : (
                                <span className="badge badge-soft-secondary fs-11 px-2 py-1 d-inline-flex align-items-center">
                                  <i className="ri-time-line me-1"></i> Em Campo (Pendente)
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="modal-footer bg-light border-top py-2 px-3 d-flex justify-content-between align-items-center">
                <span className="text-muted fs-12">
                  Exibindo <strong>{filteredModalEquipamentos.length}</strong> de <strong>{secEquipamentos.length}</strong> postos de trabalho desta secretaria
                </span>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-success btn-sm"
                    onClick={handleExportSecretariaCsv}
                    disabled={filteredModalEquipamentos.length === 0}
                  >
                    <i className="ri-file-excel-2-line me-1"></i> Exportar CSV
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedSec(null)}
                  >
                    Fechar Ficha
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VIEW: ROTAS & LOGÍSTICA DE COLETA EM CAMPO (V2)
// ==========================================
function RotasColetaView({ onNavigate, notify }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filtros
  const [regional, setRegional] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hideCompleted, setHideCompleted] = useState(true); // Ocultar 100% concluídas por padrão
  const [hideNotebooks, setHideNotebooks] = useState(() => {
    try {
      const saved = localStorage.getItem('rotas_hide_notebooks');
      if (saved !== null) return saved === 'true';
    } catch (e) {}
    return true;
  });
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'regionais'

  // Filtro Avançado de Secretarias (Ticar/Desticar)
  const [selectedSecretarias, setSelectedSecretarias] = useState(() => {
    try {
      const saved = localStorage.getItem('rotas_selected_secretarias');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });
  const [initializedSecs, setInitializedSecs] = useState(false);
  const [secPanelOpen, setSecPanelOpen] = useState(true);
  const [secSearch, setSecSearch] = useState('');

  // Paradas com sanfona de equipamentos aberta
  const [expandedStopIds, setExpandedStopIds] = useState(new Set());
  // Filtro de texto interno da sanfona por parada
  const [stopEquipmentSearch, setStopEquipmentSearch] = useState({});

  const fetchLocalidades = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (regional) params.set('regional', regional);
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      params.set('hideNotebooks', hideNotebooks ? 'true' : 'false');

      // Envia lista de secretarias selecionadas
      if (initializedSecs) {
        if (selectedSecretarias.length > 0) {
          params.set('secretarias', selectedSecretarias.join(','));
        } else {
          params.set('secretarias', '__NONE__');
        }
      }

      const res = await fetch(`${API_BASE}/rotas/localidades?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json);

        // Se for a primeira carga e não havia secretarias salvas no localStorage, marcar todas
        if (!initializedSecs) {
          const allSecs = (json.secretariasDisponiveis || []).map((s) => s.nome);
          try {
            const saved = localStorage.getItem('rotas_selected_secretarias');
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setSelectedSecretarias(parsed);
                setInitializedSecs(true);
                return;
              }
            }
          } catch (e) {}
          setSelectedSecretarias(allSecs);
          setInitializedSecs(true);
        }
      } else {
        setError(json.message || 'Erro ao carregar rotas de coleta.');
      }
    } catch (e) {
      setError('Falha de conexão com o servidor de rotas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLocalidades();
  }, [regional, statusFilter, search, initializedSecs, selectedSecretarias, hideNotebooks]);

  const updateSelectedSecretarias = (newList) => {
    setSelectedSecretarias(newList);
    try {
      localStorage.setItem('rotas_selected_secretarias', JSON.stringify(newList));
    } catch (e) {}
  };

  const handleToggleSecretaria = (secName) => {
    const upper = secName.toUpperCase();
    let next;
    if (selectedSecretarias.includes(upper)) {
      next = selectedSecretarias.filter((s) => s !== upper);
    } else {
      next = [...selectedSecretarias, upper];
    }
    updateSelectedSecretarias(next);
  };

  const handleSelectAllSecretarias = () => {
    const all = (data?.secretariasDisponiveis || []).map((s) => s.nome);
    updateSelectedSecretarias(all);
    if (notify) notify('success', 'Todas as secretarias foram ativadas no roteiro.');
  };

  const handleClearAllSecretarias = () => {
    updateSelectedSecretarias([]);
    if (notify) notify('info', 'Todas as secretarias foram desmarcadas.');
  };

  const handleInvertSecretarias = () => {
    const all = (data?.secretariasDisponiveis || []).map((s) => s.nome);
    const next = all.filter((s) => !selectedSecretarias.includes(s));
    updateSelectedSecretarias(next);
  };

  const toggleExpand = (stopId) => {
    setExpandedStopIds((prev) => {
      const next = new Set(prev);
      if (next.has(stopId)) next.delete(stopId);
      else next.add(stopId);
      return next;
    });
  };

  const handleBiparLocal = (stop) => {
    const mainUnit = (stop.unidades && stop.unidades[0]) || 'Unidade';
    const locName = `${mainUnit} (${stop.endereco})`;
    try {
      localStorage.setItem('coletor_preset_localidade', locName);
    } catch (e) {}
    if (notify) notify('info', `Local definido para "${mainUnit}". Coletor aberto pronto para leitura!`);
    onNavigate('coletor');
  };

  const handleCopyAddress = (endereco) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(endereco);
      if (notify) notify('success', 'Endereço copiado para a área de transferência!');
    }
  };

  const kpis = data?.kpis || {
    totalLocalidades: 0,
    localidadesConcluidas: 0,
    localidadesParciais: 0,
    localidadesPendentes: 0,
    totalAtivos: 0,
    totalRecolhidos: 0,
    totalPendentes: 0,
    taxaGeral: 0
  };

  // Filtragem local adicional: respeita hideCompleted
  const allStops = data?.localidades || [];
  const displayedStops = allStops.filter((s) => {
    if (hideCompleted && s.statusLocalidade === 'concluida') return false;
    return true;
  });

  // Agrupamento por Regional
  const stopsByRegional = useMemo(() => {
    const map = new Map();
    displayedStops.forEach((s) => {
      const reg = s.regional || 'Sede';
      if (!map.has(reg)) map.set(reg, []);
      map.get(reg).push(s);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [displayedStops]);

  // Rota Google Maps Multi-Pontos da Regional
  const getRegionalGoogleMapsRouteUrl = (stops) => {
    const origin = 'Praca Presidente Tancredo Neves, 200, Contagem, MG';
    const pendingStops = stops.filter((s) => s.statusLocalidade !== 'concluida');
    const targetStops = pendingStops.length > 0 ? pendingStops : stops;
    const waypoints = targetStops.slice(0, 9).map((s) => encodeURIComponent(s.endereco));
    return `https://www.google.com/maps/dir/${encodeURIComponent(origin)}/${waypoints.join('/')}`;
  };

  // Cores personalizadas por Regional de Contagem
  const getRegionalStyle = (reg) => {
    switch ((reg || '').toLowerCase()) {
      case 'sede':
        return { bg: '#e8f0fe', color: '#1967d2', border: '#c2e7ff' };
      case 'eldorado':
        return { bg: '#f3e8fd', color: '#7e22ce', border: '#e9d5ff' };
      case 'industrial':
        return { bg: '#e6fffa', color: '#0f766e', border: '#99f6e4' };
      case 'ressaca':
        return { bg: '#fff7ed', color: '#c2410c', border: '#ffedd5' };
      case 'nacional':
        return { bg: '#eef2ff', color: '#4338ca', border: '#e0e7ff' };
      case 'riacho':
        return { bg: '#fdf2f8', color: '#be185d', border: '#fce7f3' };
      case 'petrolândia':
      case 'petrolandia':
        return { bg: '#f0fdf4', color: '#15803d', border: '#dcfce7' };
      case 'vargem das flores':
        return { bg: '#fefce8', color: '#a16207', border: '#fef9c3' };
      default:
        return { bg: '#f1f5f9', color: '#334155', border: '#e2e8f0' };
    }
  };

  // Exportar CSV da Rota
  const handleExportCsv = () => {
    if (displayedStops.length === 0) return;
    let csv = '\ufeff#;Regional;Unidades;Endereço;Secretarias;Contato;Telefone;Total_Equipamentos;Recolhidos;Pendentes;Taxa_Conclusao;Status\r\n';
    displayedStops.forEach((s, idx) => {
      const unidadesStr = (s.unidades || []).join(' / ');
      const secStr = (s.secretarias || []).join(' / ');
      const contatoStr = s.contatos && s.contatos[0] ? s.contatos[0].nome : '-';
      const telStr = s.contatos && s.contatos[0] ? s.contatos[0].telefone : '-';
      csv += `"${idx + 1}";"${s.regional}";"${unidadesStr}";"${s.endereco}";"${secStr}";"${contatoStr}";"${telStr}";"${s.totalEquipamentos}";"${s.totalRecolhidos}";"${s.totalPendentes}";"${s.taxaConclusao}%";"${s.statusLocalidade}"\r\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rotas_coleta_campo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (notify) notify('success', 'Planilha de roteiro exportada com sucesso!');
  };

  // Lista filtrada de secretarias para o painel de checkboxes
  const secretariasList = data?.secretariasDisponiveis || [];
  const filteredSecretariasList = useMemo(() => {
    if (!secSearch.trim()) return secretariasList;
    const term = secSearch.toLowerCase();
    return secretariasList.filter((s) => s.nome.toLowerCase().includes(term));
  }, [secretariasList, secSearch]);

  const totalSecsCount = secretariasList.length;
  const activeSecsCount = selectedSecretarias.length;
  const isAllSecsSelected = totalSecsCount > 0 && activeSecsCount === totalSecsCount;

  // Render do Card de Parada (Edifício)
  const renderStopCard = (stop, index) => {
    const isExpanded = expandedStopIds.has(stop.id);
    const isDone = stop.statusLocalidade === 'concluida';
    const isPartial = stop.statusLocalidade === 'parcial';
    const regStyle = getRegionalStyle(stop.regional);
    const itemFilter = (stopEquipmentSearch[stop.id] || '').toLowerCase().trim();

    const filteredEquipamentos = (stop.equipamentos || []).filter((eq) => {
      if (!itemFilter) return true;
      return (
        String(eq.patrimonio || '').toLowerCase().includes(itemFilter) ||
        String(eq.servidor || '').toLowerCase().includes(itemFilter) ||
        String(eq.matricula || '').toLowerCase().includes(itemFilter) ||
        String(eq.tipo || '').toLowerCase().includes(itemFilter) ||
        String(eq.secretaria || '').toLowerCase().includes(itemFilter) ||
        String(eq.unidade || '').toLowerCase().includes(itemFilter)
      );
    });

    return (
      <div
        key={stop.id}
        className="card shadow-sm border mb-3 overflow-hidden"
        style={{
          borderLeft: `6px solid ${isDone ? '#0ab39c' : isPartial ? '#f7b84b' : '#3577f1'}`,
          borderRadius: '10px',
          transition: 'all 0.2s ease-in-out'
        }}
      >
        <div className="card-body p-3 p-md-4">
          {/* Linha Superior: Sequência (#1), Regional, Título do Prédio e Status */}
          <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
            <div className="d-flex align-items-center gap-2 flex-grow-1 min-w-0">
              <div
                className="rounded px-2 py-1 text-center font-monospace fw-bold fs-13"
                style={{
                  backgroundColor: isDone ? '#d1fae5' : isPartial ? '#fef3c7' : '#dbeafe',
                  color: isDone ? '#065f46' : isPartial ? '#92400e' : '#1e40af',
                  minWidth: '40px'
                }}
              >
                #{index + 1}
              </div>

              <div className="min-w-0 flex-grow-1">
                <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                  <span
                    className="badge fs-11 px-2 py-1 fw-bold text-uppercase"
                    style={{
                      backgroundColor: regStyle.bg,
                      color: regStyle.color,
                      border: `1px solid ${regStyle.border}`
                    }}
                  >
                    <i className="ri-map-pin-2-line me-1"></i>
                    {stop.regional}
                  </span>

                  {stop.unidades && stop.unidades.length > 1 && (
                    <span className="badge bg-light text-muted border fs-10 font-monospace">
                      +{stop.unidades.length - 1} setores no local
                    </span>
                  )}
                </div>

                <h5 className="mb-0 fs-16 fw-bold text-dark text-truncate" title={stop.unidades[0] || 'Edifício Municipal'}>
                  {stop.unidades[0] || 'Edifício Municipal'}
                </h5>
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex-shrink-0">
              {isDone ? (
                <span className="badge bg-soft-success text-success fs-12 px-3 py-2 rounded-pill fw-semibold border border-success-subtle">
                  <i className="ri-checkbox-circle-fill me-1 fs-14"></i> 100% Concluída
                </span>
              ) : isPartial ? (
                <span className="badge bg-soft-warning text-dark fs-12 px-3 py-2 rounded-pill fw-semibold border border-warning-subtle">
                  <i className="ri-time-fill me-1 text-warning fs-14"></i> Em Coleta ({stop.totalRecolhidos}/{stop.totalEquipamentos} • {stop.taxaConclusao}%)
                </span>
              ) : (
                <span className="badge bg-soft-primary text-primary fs-12 px-3 py-2 rounded-pill fw-semibold border border-primary-subtle">
                  <i className="ri-error-warning-fill me-1 fs-14"></i> {stop.totalPendentes} a Recolher
                </span>
              )}
            </div>
          </div>

          {/* Faixa de Endereço e GPS Integrado */}
          <div className="p-2 p-md-3 rounded bg-light border d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <div className="d-flex align-items-center gap-2 flex-grow-1 min-w-0">
              <i className="ri-map-pin-fill text-danger fs-18 flex-shrink-0"></i>
              <span className="fs-13 text-dark fw-medium text-truncate" title={stop.endereco}>
                {stop.endereco}
              </span>
            </div>

            <div className="d-flex align-items-center gap-1 flex-shrink-0">
              <a
                href={stop.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm d-flex align-items-center gap-1 px-2 py-1 shadow-xs"
                title="Navegar com Google Maps"
              >
                <i className="ri-navigation-fill"></i> Maps
              </a>

              <a
                href={stop.wazeUrl || `https://waze.com/ul?q=${encodeURIComponent(stop.endereco)}&navigate=yes`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-info btn-sm text-white d-flex align-items-center gap-1 px-2 py-1 shadow-xs"
                title="Navegar com Waze"
              >
                <i className="ri-car-line"></i> Waze
              </a>

              <button
                type="button"
                className="btn btn-outline-secondary btn-sm p-1 px-2"
                onClick={() => handleCopyAddress(stop.endereco)}
                title="Copiar endereço para a área de transferência"
              >
                <i className="ri-file-copy-line"></i>
              </button>
            </div>
          </div>

          {/* Faixa de Secretarias e Contato Responsável */}
          <div className="row g-2 align-items-center fs-12 mb-3">
            <div className="col-lg-7 col-12">
              <div className="d-flex flex-wrap align-items-center gap-1">
                <span className="text-muted fs-11 text-uppercase fw-semibold me-1">
                  <i className="ri-government-line me-1"></i>Secretarias:
                </span>
                {(stop.secretarias || []).map((sec) => (
                  <span key={sec} className="badge bg-white text-dark border shadow-xs fs-11 font-monospace px-2 py-1">
                    {sec}
                  </span>
                ))}
              </div>
            </div>

            <div className="col-lg-5 col-12 text-lg-end">
              {stop.contatos && stop.contatos.length > 0 && stop.contatos[0].nome && (
                <div className="d-inline-flex flex-wrap align-items-center gap-2 justify-content-lg-end">
                  <span className="text-muted fs-12">
                    <i className="ri-user-3-line text-primary me-1"></i>
                    <strong>{stop.contatos[0].nome}</strong>
                  </span>
                  {stop.contatos[0].telefone && (
                    <a
                      href={`tel:${stop.contatos[0].telefone.replace(/\D/g, '')}`}
                      className="badge bg-soft-success text-success fs-11 text-decoration-none py-1 px-2 border border-success-subtle d-inline-flex align-items-center gap-1"
                      title="Ligar para o servidor responsável"
                    >
                      <i className="ri-phone-fill"></i>
                      {stop.contatos[0].telefone}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Barra de Progresso e Métricas de Equipamentos da Parada */}
          <div className="p-3 rounded border bg-white mb-3 shadow-2xs">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 fs-12 mb-2">
              <div className="d-flex flex-wrap align-items-center gap-3">
                <span className="badge bg-light text-dark border fs-11 px-2 py-1">
                  💻 <strong>{stop.cpus}</strong> CPUs
                </span>
                <span className="badge bg-light text-dark border fs-11 px-2 py-1">
                  🖥️ <strong>{stop.monitores}</strong> Monitores
                </span>
                {stop.notebooks > 0 && (
                  <span className="badge bg-light text-dark border fs-11 px-2 py-1">
                    💼 <strong>{stop.notebooks}</strong> Notebooks
                  </span>
                )}
              </div>

              <div className="fs-12">
                <span className="text-muted">Recolhidos:</span>{' '}
                <strong className="text-success fs-13">{stop.totalRecolhidos}</strong>
                <span className="text-muted"> de </span>
                <strong className="text-dark fs-13">{stop.totalEquipamentos}</strong>
                <span className="badge bg-soft-dark text-dark ms-2 font-monospace fs-11">
                  {stop.taxaConclusao}%
                </span>
              </div>
            </div>

            <div className="progress" style={{ height: '8px', borderRadius: '4px' }}>
              <div
                className={`progress-bar progress-bar-striped progress-bar-animated ${
                  isDone ? 'bg-success' : isPartial ? 'bg-warning' : 'bg-primary'
                }`}
                style={{ width: `${stop.taxaConclusao}%` }}
              ></div>
            </div>
          </div>

          {/* Botões de Ação da Parada */}
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 pt-2 border-top">
            <button
              type="button"
              className="btn btn-success btn-sm d-flex align-items-center gap-2 px-3 py-2 fw-semibold shadow-xs"
              onClick={() => handleBiparLocal(stop)}
              title="Abrir leitor de código de barras já configurado para este local"
            >
              <i className="ri-qr-scan-2-line fs-16"></i> Bipar Neste Local
            </button>

            <button
              type="button"
              className={`btn btn-sm d-flex align-items-center gap-1 px-3 py-2 ${
                isExpanded ? 'btn-soft-secondary' : 'btn-outline-secondary'
              }`}
              onClick={() => toggleExpand(stop.id)}
            >
              <i className={`ri-arrow-${isExpanded ? 'up' : 'down'}-s-line fs-16`}></i>
              {isExpanded ? 'Ocultar Itens' : `Ver ${stop.totalEquipamentos} Equipamentos`}
            </button>
          </div>

          {/* Sanfona: Relação Detalhada de Ativos no Edifício */}
          {isExpanded && (
            <div className="mt-3 pt-3 border-top">
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                <div>
                  <span className="fs-13 fw-bold text-dark">
                    Equipamentos neste Edifício ({filteredEquipamentos.length})
                  </span>
                  <span className="text-muted fs-11 ms-2">
                    (🔴 {stop.totalPendentes} pendentes • 🟢 {stop.totalRecolhidos} no galpão)
                  </span>
                </div>

                <div style={{ maxWidth: '240px' }} className="w-100">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Filtrar patrimônio ou servidor..."
                    value={stopEquipmentSearch[stop.id] || ''}
                    onChange={(e) =>
                      setStopEquipmentSearch((prev) => ({ ...prev, [stop.id]: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="table-responsive border rounded" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                <table className="table table-sm table-hover table-striped align-middle fs-11 mb-0">
                  <thead className="table-light text-muted fw-bold sticky-top">
                    <tr>
                      <th style={{ width: '80px' }}>Tipo</th>
                      <th>Patrimônio</th>
                      <th>Servidor / Matrícula</th>
                      <th>Secretaria & Setor</th>
                      <th className="text-center" style={{ width: '130px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEquipamentos.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center py-3 text-muted">
                          Nenhum equipamento localizado com o filtro informado.
                        </td>
                      </tr>
                    ) : (
                      filteredEquipamentos.map((eq) => {
                        const isRec = eq.status === 'no_galpao' || eq.status === 'devolvido_emc';
                        return (
                          <tr key={eq.id} className={isRec ? 'table-light' : ''}>
                            <td>
                              <span className="badge bg-light text-dark font-monospace border">
                                {eq.tipo}
                              </span>
                            </td>
                            <td>
                              <span className="font-monospace fw-bold fs-12 text-dark">
                                {eq.patrimonio}
                              </span>
                            </td>
                            <td>
                              <div className="text-truncate" style={{ maxWidth: '200px' }}>
                                <strong className="d-block text-dark">{eq.servidor || 'Servidor não informado'}</strong>
                                {eq.matricula && (
                                  <small className="text-muted">Mat: {eq.matricula}</small>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="text-truncate" style={{ maxWidth: '180px' }}>
                                <span className="badge bg-soft-primary text-primary me-1 fs-10 font-monospace">
                                  {eq.secretaria}
                                </span>
                                <small className="text-muted d-block text-truncate">{eq.unidade}</small>
                              </div>
                            </td>
                            <td className="text-center">
                              {eq.status === 'devolvido_emc' ? (
                                <span className="badge bg-soft-success text-success px-2 py-1 border border-success-subtle">
                                  <i className="ri-checkbox-circle-fill me-1"></i> Devolvido EMC
                                </span>
                              ) : eq.status === 'no_galpao' ? (
                                <span className="badge bg-soft-warning text-dark px-2 py-1 border border-warning-subtle">
                                  <i className="ri-home-wifi-fill me-1 text-warning"></i> No Galpão
                                </span>
                              ) : (
                                <span className="badge bg-soft-danger text-danger px-2 py-1 border border-danger-subtle">
                                  <i className="ri-time-line me-1"></i> Pendente
                                </span>
                              )}
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
      </div>
    );
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. HERO LOGISTICS BANNER */}
      <div className="card shadow-sm border mb-0 overflow-hidden" style={{ borderRadius: '12px' }}>
        <div className="card-body p-3 p-md-4">
          <div className="row align-items-center g-3">
            <div className="col-xl-5 col-lg-4 col-12">
              <div className="d-flex align-items-center gap-3">
                <div
                  className="rounded-3 d-flex align-items-center justify-content-center text-white flex-shrink-0 shadow-sm"
                  style={{ width: '48px', height: '48px', background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)' }}
                >
                  <i className="ri-route-line fs-24"></i>
                </div>
                <div>
                  <h4 className="card-title mb-1 fs-17 fw-bold text-dark">
                    Rotas & Logística de Coleta em Campo
                  </h4>
                  <p className="text-muted fs-12 mb-0">
                    Roteiro dinâmico pelos edifícios municipais com filtragem por secretarias ativas
                  </p>
                </div>
              </div>
            </div>

            {/* 4 KPI Cards */}
            <div className="col-xl-7 col-lg-8 col-12">
              <div className="row g-2 text-center">
                <div className="col-3">
                  <div className="p-2 rounded bg-light border">
                    <span className="text-muted fs-11 text-uppercase fw-semibold d-block">Paradas Ativas</span>
                    <h5 className="mb-0 fs-17 fw-bold font-monospace text-dark">
                      {displayedStops.length} <small className="fs-11 text-muted fw-normal">/ {allStops.length}</small>
                    </h5>
                  </div>
                </div>

                <div className="col-3">
                  <div className="p-2 rounded bg-soft-danger border border-danger-subtle">
                    <span className="text-danger fs-11 text-uppercase fw-semibold d-block">A Recolher</span>
                    <h5 className="mb-0 fs-17 fw-bold font-monospace text-danger">
                      {kpis.totalPendentes.toLocaleString('pt-BR')}
                    </h5>
                  </div>
                </div>

                <div className="col-3">
                  <div className="p-2 rounded bg-soft-success border border-success-subtle">
                    <span className="text-success fs-11 text-uppercase fw-semibold d-block">No Galpão</span>
                    <h5 className="mb-0 fs-17 fw-bold font-monospace text-success">
                      {kpis.totalRecolhidos.toLocaleString('pt-BR')}
                    </h5>
                  </div>
                </div>

                <div className="col-3">
                  <div className="p-2 rounded bg-soft-primary border border-primary-subtle">
                    <span className="text-primary fs-11 text-uppercase fw-semibold d-block">Progresso</span>
                    <h5 className="mb-0 fs-17 fw-bold font-monospace text-primary">
                      {kpis.taxaGeral}%
                    </h5>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Global Progress Bar */}
          <div className="mt-3 pt-2 border-top">
            <div className="d-flex justify-content-between align-items-center fs-11 text-muted mb-1">
              <span>
                Ativos em campo restantes: <strong className="text-dark">{kpis.totalPendentes.toLocaleString('pt-BR')}</strong>
              </span>
              <span>
                Entrada no galpão ou devolvidos: <strong className="text-success">{kpis.totalRecolhidos.toLocaleString('pt-BR')}</strong> ({kpis.taxaGeral}%)
              </span>
            </div>
            <div className="progress" style={{ height: '8px', borderRadius: '4px' }}>
              <div
                className="progress-bar bg-success progress-bar-striped progress-bar-animated"
                style={{ width: `${kpis.taxaGeral}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CARD DEDICADO: FILTRO DE SECRETARIAS (TICAR QUAIS QUER VER) */}
      <div className="card shadow-sm border mb-0" style={{ borderRadius: '12px' }}>
        <div className="card-header bg-light border-bottom p-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2">
            <i className="ri-checkbox-multiple-line text-primary fs-18"></i>
            <h6 className="card-title mb-0 fs-14 fw-bold text-dark">
              Secretarias no Roteiro de Coleta
            </h6>
            <span
              className={`badge fs-11 ${
                isAllSecsSelected ? 'badge-soft-success' : 'badge-soft-warning text-dark'
              }`}
            >
              {activeSecsCount} de {totalSecsCount} secretarias selecionadas
            </span>
          </div>

          <div className="d-flex flex-wrap align-items-center gap-2">
            <button
              type="button"
              className="btn btn-soft-primary btn-sm px-2 py-1 fs-11 fw-semibold"
              onClick={handleSelectAllSecretarias}
              title="Marcar todas as secretarias"
            >
              <i className="ri-check-double-line me-1"></i> Marcar Todas
            </button>

            <button
              type="button"
              className="btn btn-soft-secondary btn-sm px-2 py-1 fs-11 fw-semibold"
              onClick={handleClearAllSecretarias}
              title="Desmarcar todas"
            >
              <i className="ri-close-circle-line me-1"></i> Limpar
            </button>

            <button
              type="button"
              className="btn btn-soft-dark btn-sm px-2 py-1 fs-11"
              onClick={handleInvertSecretarias}
              title="Inverter seleção"
            >
              <i className="ri-arrow-left-right-line me-1"></i> Inverter
            </button>

            <button
              type="button"
              className="btn btn-ghost-secondary btn-sm p-1"
              onClick={() => setSecPanelOpen(!secPanelOpen)}
              title={secPanelOpen ? 'Recolher painel de secretarias' : 'Expandir painel de secretarias'}
            >
              <i className={`ri-arrow-${secPanelOpen ? 'up' : 'down'}-s-line fs-18`}></i>
            </button>
          </div>
        </div>

        {secPanelOpen && (
          <div className="card-body p-3">
            {/* Campo de Busca Rápida dentro das Secretarias */}
            <div className="mb-3" style={{ maxWidth: '320px' }}>
              <div className="position-relative">
                <input
                  type="text"
                  className="form-control form-control-sm pe-4"
                  placeholder="Filtrar secretaria por sigla ou nome..."
                  value={secSearch}
                  onChange={(e) => setSecSearch(e.target.value)}
                />
                {secSearch && (
                  <button
                    type="button"
                    className="btn btn-link position-absolute end-0 top-50 translate-middle-y text-muted p-0 me-2"
                    onClick={() => setSecSearch('')}
                  >
                    <i className="ri-close-line"></i>
                  </button>
                )}
              </div>
            </div>

            {/* Grid / Flex de Chips de Secretarias com Checkbox */}
            <div className="d-flex flex-wrap gap-2" style={{ maxHeight: '180px', overflowY: 'auto' }}>
              {filteredSecretariasList.map((sec) => {
                const isSelected = selectedSecretarias.includes(sec.nome);
                return (
                  <button
                    key={sec.nome}
                    type="button"
                    className={`btn btn-sm d-inline-flex align-items-center gap-2 px-2 py-1 transition-all ${
                      isSelected
                        ? 'btn-primary shadow-xs'
                        : 'btn-outline-light text-muted border bg-light'
                    }`}
                    style={{ borderRadius: '20px' }}
                    onClick={() => handleToggleSecretaria(sec.nome)}
                  >
                    <i
                      className={`fs-14 ${
                        isSelected ? 'ri-checkbox-circle-fill text-white' : 'ri-checkbox-blank-circle-line text-muted'
                      }`}
                    ></i>
                    <span className="fw-semibold font-monospace fs-11">{sec.nome}</span>
                    <span
                      className={`badge rounded-pill fs-10 px-2 ${
                        isSelected ? 'bg-white text-primary' : 'bg-secondary text-white'
                      }`}
                    >
                      {sec.totalPendentes}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Aviso quando houver secretarias desmarcadas */}
            {!isAllSecsSelected && (
              <div className="alert alert-warning py-2 px-3 mt-3 mb-0 fs-12 d-flex align-items-center justify-content-between gap-2 border-warning-subtle">
                <div>
                  <i className="ri-information-fill me-1 fs-14"></i>
                  Roteiro filtrado: exibindo apenas prédios e equipamentos das <strong>{activeSecsCount}</strong> secretarias selecionadas.
                </div>
                <button
                  type="button"
                  className="btn btn-outline-dark btn-sm py-0 px-2 fs-11"
                  onClick={handleSelectAllSecretarias}
                >
                  Restaurar Todas
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. TOOLBAR DE FILTROS & AÇÕES */}
      <div className="card shadow-sm border mb-0" style={{ borderRadius: '12px' }}>
        <div className="card-body p-3">
          <div className="row g-2 align-items-center">
            {/* Campo de Busca Geral */}
            <div className="col-lg-4 col-md-6 col-12">
              <div className="position-relative">
                <input
                  type="text"
                  className="form-control form-control-sm pe-4"
                  placeholder="Buscar prédio, endereço, servidor ou patrimônio..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    className="btn btn-link position-absolute end-0 top-50 translate-middle-y text-muted p-0 me-2"
                    onClick={() => setSearch('')}
                  >
                    <i className="ri-close-line"></i>
                  </button>
                )}
              </div>
            </div>

            {/* Filtro Regional */}
            <div className="col-lg-3 col-md-3 col-6">
              <select
                className="form-select form-select-sm"
                value={regional}
                onChange={(e) => setRegional(e.target.value)}
              >
                <option value="">Todas as Regionais (8)</option>
                {data?.regionaisDisponiveis?.map((r) => (
                  <option key={r} value={r}>Regional {r}</option>
                ))}
              </select>
            </div>

            {/* Filtro Status */}
            <div className="col-lg-3 col-md-3 col-6">
              <select
                className="form-select form-select-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Todos os Status</option>
                <option value="pendente">🔴 Apenas Pendentes (0%)</option>
                <option value="parcial">🟡 Em Coleta (1% a 99%)</option>
                <option value="concluida">🟢 100% Concluídas</option>
              </select>
            </div>

            {/* Alternador de Modo de Visualização */}
            <div className="col-lg-2 col-md-12 col-12">
              <div className="btn-group w-100" role="group">
                <button
                  type="button"
                  className={`btn btn-sm ${viewMode === 'cards' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setViewMode('cards')}
                  title="Visualizar por Paradas Individuais"
                >
                  <i className="ri-list-check-2 me-1"></i> Paradas
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${viewMode === 'regionais' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setViewMode('regionais')}
                  title="Visualizar Agrupado por Regional"
                >
                  <i className="ri-map-pin-range-line me-1"></i> Regionais
                </button>
              </div>
            </div>
          </div>

          {/* Faixa Secundária: Switch Ocultar Concluídas & Exportações */}
          <div className="row g-2 align-items-center mt-2 pt-2 border-top">
            <div className="col-md-7 col-12 d-flex align-items-center gap-3">
              <div className="form-check form-switch mb-0">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="hideCompletedToggle"
                  checked={hideCompleted}
                  onChange={(e) => setHideCompleted(e.target.checked)}
                />
                <label className="form-check-label fs-12 fw-semibold text-dark" htmlFor="hideCompletedToggle">
                  Ocultar Localidades 100% Concluídas
                  {hideCompleted && (
                    <span className="badge bg-soft-success text-success ms-2 fs-10 border border-success-subtle">Ativo</span>
                  )}
                </label>
              </div>

              <span className="text-muted fs-12 d-none d-sm-inline">
                Exibindo <strong>{displayedStops.length}</strong> de <strong>{allStops.length}</strong> paradas
              </span>
            </div>

            <div className="col-md-5 col-12 text-md-end d-flex justify-content-md-end gap-2">
              <button
                type="button"
                className="btn btn-soft-success btn-sm d-flex align-items-center gap-1 shadow-xs"
                onClick={handleExportCsv}
                disabled={displayedStops.length === 0}
                title="Exportar roteiro de coleta para CSV/Excel"
              >
                <i className="ri-file-excel-2-line"></i> Exportar Planilha CSV
              </button>

              <button
                type="button"
                className="btn btn-soft-secondary btn-sm"
                onClick={() => fetchLocalidades(true)}
                disabled={refreshing}
                title="Recarregar paradas e status"
              >
                <i className={`ri-refresh-line ${refreshing ? 'ri-spin' : ''}`}></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. LISTAGEM DE PARADAS OU AGRUPAMENTO POR REGIONAL */}
      {loading ? (
        <div className="card shadow-sm border p-5 text-center" style={{ borderRadius: '12px' }}>
          <div className="spinner-border text-primary mx-auto mb-3" role="status"></div>
          <h6 className="text-dark fw-bold mb-1">Otimizando Roteiro de Coleta...</h6>
          <span className="text-muted fs-13">Cruzando edifícios municipais, equipamentos e secretarias ativas.</span>
        </div>
      ) : error ? (
        <div className="alert alert-danger shadow-sm border-danger-subtle" style={{ borderRadius: '12px' }}>
          <i className="ri-error-warning-fill me-2 fs-16"></i> {error}
        </div>
      ) : displayedStops.length === 0 ? (
        <div className="card shadow-sm border p-5 text-center text-muted" style={{ borderRadius: '12px' }}>
          <i className="ri-map-pin-user-line fs-48 text-secondary mb-3 d-block"></i>
          <h5 className="text-dark fw-bold mb-1">Nenhuma localidade encontrada com os filtros selecionados</h5>
          <p className="fs-13 mb-3 text-muted" style={{ maxWidth: '520px', margin: '0 auto' }}>
            {activeSecsCount === 0
              ? 'Você desmarcou todas as secretarias. Selecione pelo menos uma secretaria no painel acima para traçar o roteiro.'
              : hideCompleted
              ? 'Todas as localidades correspondentes às secretarias selecionadas já foram 100% coletadas! Desmarque a opção "Ocultar Localidades 100% Concluídas" para visualizá-las.'
              : 'Nenhum edifício municipal corresponde aos filtros informados.'}
          </p>
          <div className="d-flex justify-content-center gap-2">
            {activeSecsCount === 0 ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSelectAllSecretarias}
              >
                Marcar Todas as Secretarias
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={() => {
                  setRegional('');
                  setStatusFilter('');
                  setSearch('');
                  setHideCompleted(false);
                  handleSelectAllSecretarias();
                }}
              >
                Redefinir Todos os Filtros
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'regionais' ? (
        /* MODO AGRUPADO POR REGIONAL */
        <div className="d-flex flex-column gap-3">
          {stopsByRegional.map(([regName, regStops]) => {
            const totalEqReg = regStops.reduce((a, s) => a + s.totalEquipamentos, 0);
            const totalRecReg = regStops.reduce((a, s) => a + s.totalRecolhidos, 0);
            const totalPendReg = regStops.reduce((a, s) => a + s.totalPendentes, 0);
            const taxaReg = totalEqReg > 0 ? Math.round((totalRecReg / totalEqReg) * 100) : 0;
            const multiStopMapsUrl = getRegionalGoogleMapsRouteUrl(regStops);
            const regStyle = getRegionalStyle(regName);

            return (
              <div key={regName} className="card shadow-sm border mb-0 overflow-hidden" style={{ borderRadius: '12px' }}>
                <div
                  className="card-header border-bottom d-flex flex-wrap align-items-center justify-content-between gap-2 py-3"
                  style={{ backgroundColor: regStyle.bg }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold shadow-xs"
                      style={{ width: '36px', height: '36px', backgroundColor: regStyle.color }}
                    >
                      <i className="ri-community-line fs-18"></i>
                    </div>
                    <div>
                      <h5 className="card-title mb-0 fs-16 fw-bold" style={{ color: regStyle.color }}>
                        Regional {regName}
                      </h5>
                      <span className="text-muted fs-12">
                        {regStops.length} edifícios • {totalPendReg} ativos a recolher ({taxaReg}% concluído)
                      </span>
                    </div>
                  </div>

                  <a
                    href={multiStopMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-warning btn-sm text-dark fw-bold d-flex align-items-center gap-1 shadow-sm px-3 py-2"
                    title="Abrir rota sequencial de paradas no Google Maps"
                  >
                    <i className="ri-route-line fs-16"></i> Rota Regional no Maps ({regStops.length} paradas)
                  </a>
                </div>

                <div className="card-body p-3">
                  <div className="row g-3">
                    {regStops.map((stop, sIdx) => (
                      <div key={stop.id} className="col-12">
                        {renderStopCard(stop, sIdx)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MODO CARDS INDIVIDUAIS */
        <div className="row g-3">
          {displayedStops.map((stop, idx) => (
            <div key={stop.id} className="col-12">
              {renderStopCard(stop, idx)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// MÓDULO: EXPEDIÇÃO DE EQUIPAMENTOS NOVOS MUNICIPAIS (BNDES / PMAT)
// ==========================================
function parseMunicipalBarcode(rawCode) {
  if (!rawCode) return { valid: false, reason: 'empty', message: 'Código vazio.' };

  let clean = String(rawCode).trim().toUpperCase();

  // 1. Remover prefixos de leitura comuns
  clean = clean.replace(/^(PMC|PREFEITURA|PATRIMONIO|PAT|PATR)[s-_.:]*/i, '').trim();

  // 2. Telefone da etiqueta EMC ou de suporte descartado
  const onlyDigits = clean.replace(/\D/g, '');
  if (onlyDigits === '21212121' || onlyDigits === '3121212121') {
    return {
      valid: false,
      reason: 'phone',
      message: 'Telefone descartado. Foque nas barras do patrimônio!'
    };
  }

  // 3. Etiqueta Lenovo ThinkCentre M75q (ex: "M75q (1S)MT-M13E0-S00400 S/N PE0FPFRT" ou "1SMT...PE0FPFRT")
  if (clean.includes('S/N') || (clean.startsWith('1S') && clean.length >= 10)) {
    let serial = '';
    let modelo = 'Lenovo ThinkCentre M75q';
    if (clean.includes('S/N')) {
      const parts = clean.split('S/N');
      serial = parts[parts.length - 1].trim().replace(/[^A-Z0-9]/g, '');
    } else if (clean.startsWith('1S')) {
      serial = clean.slice(-8).replace(/[^A-Z0-9]/g, '');
    }
    return {
      valid: true,
      code: serial || clean,
      serial: serial || clean,
      modelo,
      type: 'serial_lenovo',
      label: 'S/N Lenovo ThinkCentre M75q',
      isMunicipal: true
    };
  }

  // 4. Patrimônio Municipal de Contagem (ex: 100039491 da foto BNDES / PMAT do usuário)
  // Normalmente 7 a 10 dígitos numéricos
  if (/^\d{7,10}$/.test(clean)) {
    return {
      valid: true,
      code: clean,
      type: 'patrimonio_municipal',
      label: 'Patrimônio Municipal (PMAT / BNDES)',
      isMunicipal: true
    };
  }

  // 5. Patrimônio curto (5 a 6 dígitos)
  if (/^\d{5,6}$/.test(clean)) {
    return {
      valid: true,
      code: clean,
      type: 'patrimonio_num',
      label: 'Patrimônio',
      isMunicipal: true
    };
  }

  // 6. Dell Service Tag (7 caracteres alfanuméricos, muito comum em monitores Dell)
  if (/^[A-Z0-9]{7}$/.test(clean) && /[A-Z]/.test(clean)) {
    return {
      valid: true,
      code: clean,
      type: 'service_tag',
      label: 'Dell Service Tag (Monitor)',
      isMunicipal: true
    };
  }

  // 7. Qualquer outro código de barras válido na etiqueta
  if (clean.length >= 3 && clean.length <= 32) {
    return {
      valid: true,
      code: clean,
      type: 'geral',
      label: 'Código de Ativo',
      isMunicipal: true
    };
  }

  return {
    valid: false,
    reason: 'invalid_format',
    message: `Código lido (${clean}) não reconhecido.`
  };
}

function ExpedicaoNovosView({ notify, onNavigate }) {
  const [activeSubTab, setActiveSubTab] = useState('bipagem'); // 'bipagem' | 'historico' | 'conciliacao' | 'importar'
  
  // Dados de Expedição
  const [localidade, setLocalidade] = useState('');
  const [secretaria, setSecretaria] = useState('');
  const [tipoAtivo, setTipoAtivo] = useState('CPU'); // 'CPU' | 'MONITOR' | 'NOTEBOOK'
  const [marcaModelo, setMarcaModelo] = useState('Lenovo ThinkCentre M75q');
  const [origemRecurso, setOrigemRecurso] = useState('PMAT / BNDES');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [loteItens, setLoteItens] = useState([]); // itens no lote atual em montagem
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [ultimoBipado, setUltimoBipado] = useState(null);

  // Câmera Scanner ao Vivo (PWA / Mobile)
  const [isScanning, setIsScanning] = useState(false);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasZoom, setHasZoom] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomMinMax, setZoomMinMax] = useState({ min: 1, max: 3, step: 0.1 });
  const [flashFeedback, setFlashFeedback] = useState(null); // 'success' | 'warning' | 'duplicate'
  const [duplicateAlert, setDuplicateAlert] = useState(null);
  const [cameraError, setCameraError] = useState(null);

  // Refs de controle de câmera e debounce de leitura
  const html5QrCodeRef = useRef(null);
  const lastScannedCodeRef = useRef('');
  const lastScannedTimeRef = useRef(0);
  const candidateRef = useRef({ code: '', count: 0, time: 0 }); // Consenso duplo (anti-falso positivo)
  const isProcessingRef = useRef(false);
  const loteItensRef = useRef(loteItens);
  loteItensRef.current = loteItens;
  const inputRef = useRef(null);
  const audioContextRef = useRef(null);

  // Histórico e Resumo
  const [resumo, setResumo] = useState(null);
  const [expedidosList, setExpedidosList] = useState([]);
  const [loadingExpedidos, setLoadingExpedidos] = useState(false);
  const [historicoSearch, setHistoricoSearch] = useState('');
  const [historicoTipo, setHistoricoTipo] = useState('');
  const [historicoLocalidade, setHistoricoLocalidade] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Conciliação Localidade
  const [concilLocalidade, setConcilLocalidade] = useState('');
  const [concilData, setConcilData] = useState(null);
  const [loadingConcil, setLoadingConcil] = useState(false);

  // Termo / Impressão Modal
  const [termoModalLote, setTermoModalLote] = useState(null);

  // Importador
  const [importJsonText, setImportJsonText] = useState('');
  const [importando, setImportando] = useState(false);
  const [importResultado, setImportResultado] = useState(null);

  // Som de bip sonoro com Web Audio API
  const playBeep = (type = 'success') => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) audioContextRef.current = new AudioCtx();
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.12);
      } else {
        // Alerta de duplicidade / erro
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime); // A3 grave
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch (e) {}
  };

  // Carregar dados de resumo e lista inicial
  const fetchResumo = async () => {
    try {
      const res = await fetch('/api/novos/resumo');
      const data = await res.json();
      if (data.success) {
        setResumo(data);
      }
    } catch (e) {}
  };

  const fetchExpedidos = async (pg = 1) => {
    setLoadingExpedidos(true);
    try {
      const params = new URLSearchParams();
      params.set('page', pg);
      params.set('limit', '50');
      if (historicoSearch) params.set('search', historicoSearch);
      if (historicoTipo) params.set('tipo', historicoTipo);
      if (historicoLocalidade) params.set('localidade', historicoLocalidade);

      const res = await fetch(`/api/novos/expedidos?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setExpedidosList(data.items || []);
        setTotalPages(data.totalPages || 1);
        setPage(data.page || 1);
      }
    } catch (e) {
      if (notify) notify('danger', 'Erro ao carregar lista de expedidos.');
    } finally {
      setLoadingExpedidos(false);
    }
  };

  useEffect(() => {
    fetchResumo();
    fetchExpedidos(1);
  }, []);

  // Foco permanente no input de bipagem quando em modo manual
  useEffect(() => {
    if (activeSubTab === 'bipagem' && !isScanning) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [activeSubTab, tipoAtivo, isScanning]);

  // Registro de código no lote atual com validação de duplicidade
  const handleRegisterCodeNovos = (parseResult, forceAllow = false) => {
    if (!parseResult) return;
    const clean = parseResult.code || String(parseResult).trim().toUpperCase();
    if (!clean) return;

    if (!localidade.trim()) {
      playBeep('error');
      if (notify) notify('warning', 'Informe o Nome da Localidade de Destino antes de começar a bipar!');
      return;
    }

    // Trava de Duplicidade no Lote Atual
    const jaNoLote = loteItensRef.current.some(
      (it) => it.patrimonio.toUpperCase() === clean || (it.numero_serie && it.numero_serie.toUpperCase() === clean)
    );

    if (jaNoLote && !forceAllow) {
      playBeep('error');
      if (navigator.vibrate) {
        try { navigator.vibrate([100, 50, 100]); } catch (e) {}
      }
      setFlashFeedback('duplicate');
      setTimeout(() => setFlashFeedback(null), 1000);

      setDuplicateAlert({
        codigo: clean,
        message: `Equipamento ${clean} já foi adicionado a este lote!`
      });
      setTimeout(() => {
        setDuplicateAlert((curr) => (curr && curr.codigo === clean ? null : curr));
      }, 5000);
      return;
    }

    // Sucesso! Bip sonoro agradável e vibração
    playBeep('success');
    if (navigator.vibrate) {
      try { navigator.vibrate([60, 40, 60]); } catch (e) {}
    }
    setFlashFeedback('success');
    setTimeout(() => setFlashFeedback(null), 600);

    const nowTime = new Date().toLocaleTimeString('pt-BR');
    const serial = parseResult.serial || '';
    const modelo = parseResult.modelo || marcaModelo;

    const novoItem = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      patrimonio: clean,
      numero_serie: serial,
      tipo: tipoAtivo,
      marca_modelo: modelo,
      origem_recurso: origemRecurso || 'PMAT / BNDES',
      hora: nowTime,
      tipoEtiqueta: parseResult.label || 'Patrimônio Municipal'
    };

    setUltimoBipado(novoItem);
    setDuplicateAlert(null);
    setLoteItens((prev) => [novoItem, ...prev]);
  };

  // Callback de detecção pela Câmera com Consenso Duplo
  const onBarcodeDetected = (decodedText) => {
    if (!decodedText || isProcessingRef.current) return;
    const now = Date.now();

    // 1. Analisar código usando o parser municipal
    const parseResult = parseMunicipalBarcode(decodedText);
    if (!parseResult.valid) {
      return;
    }

    const clean = parseResult.code;

    // Cooldown de 3 segundos para o mesmo código consecutivo
    if (clean === lastScannedCodeRef.current && (now - lastScannedTimeRef.current < 3000)) {
      return;
    }

    // 2. Filtro de Consenso Duplo (exige 2 frames idênticos em 500ms para evitar leitura borrada)
    const cand = candidateRef.current;
    if (cand.code === clean && (now - cand.time < 500)) {
      cand.count += 1;
    } else {
      candidateRef.current = { code: clean, count: 1, time: now };
      return;
    }

    if (cand.count < 2) {
      return;
    }

    candidateRef.current = { code: '', count: 0, time: 0 };
    lastScannedCodeRef.current = clean;
    lastScannedTimeRef.current = now;

    handleRegisterCodeNovos(parseResult);
  };

  // Ligar Câmera com alta precisão
  const startCamera = async (camId) => {
    setCameraError(null);
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
      }

      const scanner = new Html5Qrcode("camera-reader-novos", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.UPC_A
        ],
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      });
      html5QrCodeRef.current = scanner;

      const cameraConfig = camId ? camId : { facingMode: "environment" };

      await scanner.start(
        cameraConfig,
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const boxSize = Math.max(220, Math.min(Math.floor(minEdge * 0.85), 340));
            return { width: boxSize, height: boxSize };
          },
          aspectRatio: 1.0,
          videoConstraints: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
            focusMode: { ideal: "continuous" }
          }
        },
        onBarcodeDetected,
        () => {}
      );

      setIsScanning(true);

      // Detectar lanterna e zoom
      try {
        const track = scanner.getRunningTrackCameraCapabilities();
        if (track) {
          if (typeof track.torchFeature === 'function' && track.torchFeature().isSupported()) {
            setHasTorch(true);
          }
          if (typeof track.zoomFeature === 'function' && track.zoomFeature().isSupported()) {
            const zf = track.zoomFeature();
            setHasZoom(true);
            setZoomMinMax({ min: zf.min() || 1, max: Math.min(zf.max() || 4, 3), step: zf.step() || 0.1 });
            setZoomLevel(zf.value() || 1);
          }
        }
      } catch (e) {
        try {
          const video = document.querySelector("#camera-reader-novos video");
          const track = video?.srcObject?.getVideoTracks?.()[0];
          const caps = track?.getCapabilities?.() || {};
          if (caps.torch) setHasTorch(true);
          if (caps.zoom) {
            setHasZoom(true);
            setZoomMinMax({ min: caps.zoom.min || 1, max: Math.min(caps.zoom.max || 4, 3), step: caps.zoom.step || 0.1 });
          }
        } catch (err2) {}
      }
    } catch (err) {
      console.error('Erro ao ligar câmera no módulo novos:', err);
      setCameraError('Permissão de câmera negada ou dispositivo indisponível. Você pode usar a entrada manual abaixo.');
      setIsScanning(false);
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) {}
    }
    setIsScanning(false);
    setTorchOn(false);
    setDuplicateAlert(null);
  };

  const toggleTorch = async () => {
    if (!html5QrCodeRef.current) return;
    try {
      const nextTorch = !torchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch }]
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch não suportado:', e);
    }
  };

  const handleZoomChange = async (newZoom) => {
    setZoomLevel(newZoom);
    if (!html5QrCodeRef.current) return;
    try {
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ zoom: Number(newZoom) }]
      });
    } catch (e) {
      try {
        const video = document.querySelector("#camera-reader-novos video");
        const track = video?.srcObject?.getVideoTracks?.()[0];
        if (track && track.applyConstraints) {
          await track.applyConstraints({ advanced: [{ zoom: Number(newZoom) }] });
        }
      } catch (err2) {}
    }
  };

  // Inicializar lista de câmeras disponíveis
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setAvailableCameras(devices);
          const backCam = devices.find(
            (d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('traseira') || d.label.toLowerCase().includes('rear')
          );
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        }
      })
      .catch(() => {});

    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        try { html5QrCodeRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  // Ao trocar de subaba, desligar câmera
  useEffect(() => {
    if (activeSubTab !== 'bipagem') {
      stopCamera();
    }
  }, [activeSubTab]);

  // Submissão manual pelo input de texto
  const handleBiparManual = (e) => {
    if (e) e.preventDefault();
    const raw = (barcodeInput || '').trim();
    if (!raw) return;

    const parsed = parseMunicipalBarcode(raw);
    handleRegisterCodeNovos(parsed);
    setBarcodeInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Contadores do lote em tempo real
  const loteStats = useMemo(() => {
    let cpus = 0;
    let monitores = 0;
    let notebooks = 0;
    loteItens.forEach((it) => {
      if (it.tipo === 'CPU') cpus++;
      else if (it.tipo === 'MONITOR') monitores++;
      else if (it.tipo === 'NOTEBOOK') notebooks++;
    });
    return { cpus, monitores, notebooks, total: loteItens.length };
  }, [loteItens]);

  // Remover item individual do lote
  const handleRemoveItem = (id) => {
    setLoteItens((prev) => prev.filter((it) => it.id !== id));
  };

  // Gravar lote completo no backend
  const handleGravarLote = async () => {
    if (!localidade.trim()) {
      if (notify) notify('warning', 'Informe o nome da localidade de destino!');
      return;
    }
    if (loteItens.length === 0) {
      if (notify) notify('warning', 'Nenhum equipamento bipado para salvar.');
      return;
    }

    setSalvandoLote(true);
    try {
      const loteId = `LOTE_NOVOS_${Date.now()}`;
      const payload = {
        lote_id: loteId,
        localidade: localidade.trim(),
        secretaria: secretaria.trim() || null,
        usuario: 'Almoxarifado / Galpão',
        itens: loteItens.map((it) => ({
          patrimonio: it.patrimonio,
          numero_serie: it.numero_serie || null,
          tipo: it.tipo,
          marca_modelo: it.marca_modelo,
          origem_recurso: it.origem_recurso
        }))
      };

      const res = await fetch('/api/novos/expedir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        if (notify) notify('success', data.message || 'Saída expedida com sucesso!');
        // Abre o modal de termo com os itens gravados
        setTermoModalLote({
          lote_id: loteId,
          localidade: localidade.trim(),
          secretaria: secretaria.trim() || '',
          data_expedicao: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR'),
          usuario: 'Almoxarifado / Galpão',
          itens: [...loteItens]
        });
        setLoteItens([]);
        setUltimoBipado(null);
        fetchResumo();
        fetchExpedidos(1);
      } else {
        if (notify) notify('danger', data.message || 'Erro ao gravar lote.');
      }
    } catch (e) {
      if (notify) notify('danger', 'Falha de comunicação ao gravar lote.');
    } finally {
      setSalvandoLote(false);
    }
  };

  // Excluir registro do histórico
  const handleExcluirExpedido = async (id, pat) => {
    if (!window.confirm(`Tem certeza que deseja excluir o registro do patrimônio ${pat}?`)) return;
    try {
      const res = await fetch(`/api/novos/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        if (notify) notify('success', 'Registro excluído.');
        fetchExpedidos(page);
        fetchResumo();
      } else {
        if (notify) notify('danger', data.message || 'Erro ao excluir.');
      }
    } catch (e) {
      if (notify) notify('danger', 'Erro ao conectar ao servidor.');
    }
  };

  // Consultar conciliação da localidade
  const handleConsultarConciliacao = async (loc) => {
    const targetLoc = loc || concilLocalidade;
    if (!targetLoc) return;
    setLoadingConcil(true);
    try {
      const res = await fetch(`/api/novos/conciliacao-localidade?localidade=${encodeURIComponent(targetLoc)}`);
      const data = await res.json();
      if (data.success) {
        setConcilData(data);
      } else {
        if (notify) notify('warning', data.message || 'Localidade não encontrada.');
      }
    } catch (e) {
      if (notify) notify('danger', 'Erro ao carregar conciliação.');
    } finally {
      setLoadingConcil(false);
    }
  };

  // Exportar histórico para CSV
  const handleExportarHistorico = () => {
    if (expedidosList.length === 0) return;
    let csv = '\ufeffID;Lote;Localidade;Secretaria;Tipo;Patrimônio;Número de Série;Modelo;Origem Recurso;Data Expedição;Usuário;Origem Registro\r\n';
    expedidosList.forEach((it) => {
      csv += `"${it.id}";"${it.lote_id}";"${it.localidade}";"${it.secretaria || ''}";"${it.tipo}";"${it.patrimonio}";"${it.numero_serie || ''}";"${it.marca_modelo || ''}";"${it.origem_recurso || ''}";"${it.data_expedicao}";"${it.usuario || ''}";"${it.origem_registro || ''}"\r\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expedicao_equipamentos_novos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (notify) notify('success', 'Planilha exportada com sucesso!');
  };

  // Importar dados via texto JSON / CSV rápido
  const handleExecutarImportacao = async () => {
    let rows = [];
    try {
      if (importJsonText.trim().startsWith('[')) {
        rows = JSON.parse(importJsonText);
      } else {
        const lines = importJsonText.trim().split('\n');
        if (lines.length > 1) {
          const headers = lines[0].split(/[;,\t]/).map((h) => h.trim().toLowerCase());
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
            if (cols.length >= 2) {
              const obj = {};
              headers.forEach((h, idx) => {
                if (h.includes('patrimon') || h === 'tag' || h === 'pat') obj.patrimonio = cols[idx];
                else if (h.includes('local') || h.includes('destin') || h.includes('unid')) obj.localidade = cols[idx];
                else if (h.includes('tipo')) obj.tipo = cols[idx];
                else if (h.includes('serie') || h.includes('serial') || h === 'sn') obj.numero_serie = cols[idx];
                else if (h.includes('model')) obj.marca_modelo = cols[idx];
                else if (h.includes('sec')) obj.secretaria = cols[idx];
                else if (h.includes('data')) obj.data_expedicao = cols[idx];
              });
              if (obj.patrimonio) rows.push(obj);
            }
          }
        }
      }
    } catch (e) {
      if (notify) notify('danger', 'Erro no formato dos dados de importação. Verifique o formato JSON ou CSV.');
      return;
    }

    if (rows.length === 0) {
      if (notify) notify('warning', 'Nenhum registro válido detectado para importar.');
      return;
    }

    setImportando(true);
    try {
      const res = await fetch('/api/novos/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: rows, usuario: 'Importação Histórica' })
      });
      const data = await res.json();
      if (data.success) {
        setImportResultado(data);
        if (notify) notify('success', data.message);
        fetchResumo();
        fetchExpedidos(1);
      } else {
        if (notify) notify('danger', data.message || 'Erro na importação.');
      }
    } catch (e) {
      if (notify) notify('danger', 'Falha ao processar importação no servidor.');
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. HERO HEADER BANNER */}
      <div className="card shadow-sm border mb-0 overflow-hidden" style={{ borderRadius: '12px' }}>
        <div className="card-body p-3 p-md-4">
          <div className="row align-items-center g-3">
            <div className="col-xl-5 col-lg-4 col-12">
              <div className="d-flex align-items-center gap-3">
                <div
                  className="rounded-3 d-flex align-items-center justify-content-center text-white flex-shrink-0 shadow-sm"
                  style={{ width: '48px', height: '48px', background: 'linear-gradient(135deg, #0f766e, #0d9488)' }}
                >
                  <i className="ri-inbox-unarchive-line fs-24"></i>
                </div>
                <div>
                  <h4 className="card-title mb-1 fs-17 fw-bold text-dark">
                    Expedição de Equipamentos Novos
                  </h4>
                  <p className="text-muted fs-12 mb-0">
                    Controle de saída no galpão para substituição dos ativos municipais (BNDES / PMAT)
                  </p>
                </div>
              </div>
            </div>

            {/* 4 KPIs de Novos */}
            <div className="col-xl-7 col-lg-8 col-12">
              <div className="row g-2 text-center">
                <div className="col-3">
                  <div className="p-2 rounded bg-light border">
                    <span className="text-muted fs-11 text-uppercase fw-semibold d-block">Total Expedidos</span>
                    <h5 className="mb-0 fs-17 fw-bold font-monospace text-dark">
                      {(resumo?.kpis?.totalExpedidos || 0).toLocaleString('pt-BR')}
                    </h5>
                  </div>
                </div>
                <div className="col-3">
                  <div className="p-2 rounded bg-soft-primary border border-primary-subtle">
                    <span className="text-primary fs-11 text-uppercase fw-semibold d-block">💻 CPUs</span>
                    <h5 className="mb-0 fs-17 fw-bold font-monospace text-primary">
                      {(resumo?.kpis?.totalCpus || 0).toLocaleString('pt-BR')}
                    </h5>
                  </div>
                </div>
                <div className="col-3">
                  <div className="p-2 rounded bg-soft-info border border-info-subtle">
                    <span className="text-info fs-11 text-uppercase fw-semibold d-block">🖥️ Monitores</span>
                    <h5 className="mb-0 fs-17 fw-bold font-monospace text-info">
                      {(resumo?.kpis?.totalMonitores || 0).toLocaleString('pt-BR')}
                    </h5>
                  </div>
                </div>
                <div className="col-3">
                  <div className="p-2 rounded bg-soft-success border border-success-subtle">
                    <span className="text-success fs-11 text-uppercase fw-semibold d-block">Locais Atendidos</span>
                    <h5 className="mb-0 fs-17 fw-bold font-monospace text-success">
                      {(resumo?.kpis?.totalLocalidades || 0).toLocaleString('pt-BR')}
                    </h5>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SUB-ABAS DE NAVEGAÇÃO INTERNA */}
      <div className="card shadow-sm border mb-0" style={{ borderRadius: '12px' }}>
        <div className="card-header bg-light border-bottom p-2 p-md-3">
          <ul className="nav nav-pills nav-customs card-header-pills gap-2">
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link fs-13 fw-semibold ${activeSubTab === 'bipagem' ? 'active' : ''}`}
                onClick={() => setActiveSubTab('bipagem')}
              >
                <i className="ri-qr-scan-2-line me-1"></i> Bipar Saída no Galpão
                {loteItens.length > 0 && (
                  <span className="badge bg-danger text-white ms-2 rounded-pill font-monospace">
                    {loteItens.length}
                  </span>
                )}
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link fs-13 fw-semibold ${activeSubTab === 'historico' ? 'active' : ''}`}
                onClick={() => { setActiveSubTab('historico'); fetchExpedidos(1); }}
              >
                <i className="ri-file-list-3-line me-1"></i> Histórico de Saídas
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link fs-13 fw-semibold ${activeSubTab === 'conciliacao' ? 'active' : ''}`}
                onClick={() => setActiveSubTab('conciliacao')}
              >
                <i className="ri-arrow-left-right-line me-1"></i> Balanço Novo x EMC
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link fs-13 fw-semibold ${activeSubTab === 'importar' ? 'active' : ''}`}
                onClick={() => setActiveSubTab('importar')}
              >
                <i className="ri-upload-cloud-2-line me-1"></i> Importar App Anterior
              </button>
            </li>
          </ul>
        </div>

        {/* 3. CONTEÚDO DA SUB-ABA ATIVA */}
        <div className="card-body p-3 p-md-4">
          {/* ========================================================= */}
          {/* ABA 1: BIPAGEM CONTÍNUA COM CÂMERA AO VIVO */}
          {/* ========================================================= */}
          {activeSubTab === 'bipagem' && (
            <div className="d-flex flex-column gap-3">
              {/* Seção 1: Destino e Configuração do Lote */}
              <div className="p-3 rounded bg-light border">
                <div className="row g-3 align-items-center">
                  <div className="col-lg-6 col-12">
                    <label className="form-label fs-12 fw-bold text-dark mb-1">
                      <i className="ri-map-pin-2-fill text-danger me-1"></i>
                      Localidade de Destino (Prédio / Setor / Escola / CRAS):
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-lg fs-14 fw-semibold"
                      placeholder="Ex: CRAS Industrial, SEDE, E.M. Heitor Villa Lobos..."
                      value={localidade}
                      onChange={(e) => setLocalidade(e.target.value)}
                      list="localidades-datalist-novos"
                      autoComplete="off"
                    />
                    <datalist id="localidades-datalist-novos">
                      {(resumo?.localidadesDisponiveis || []).map((loc) => (
                        <option key={loc} value={loc} />
                      ))}
                    </datalist>
                    <small className="text-muted fs-11">
                      Escolha uma localidade ou digite o nome do destino das máquinas.
                    </small>
                  </div>

                  <div className="col-lg-3 col-6">
                    <label className="form-label fs-12 fw-bold text-dark mb-1">
                      Secretaria (Opcional):
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ex: SMDS, SEAD, SEDUC..."
                      value={secretaria}
                      onChange={(e) => setSecretaria(e.target.value)}
                    />
                  </div>

                  <div className="col-lg-3 col-6">
                    <label className="form-label fs-12 fw-bold text-dark mb-1">
                      Modelo / Equipamento:
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={marcaModelo}
                      onChange={(e) => setMarcaModelo(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Seção 2: Seletor Rápido de Tipo em 1 Clique */}
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 p-2 bg-white rounded border shadow-xs">
                <div className="d-flex align-items-center gap-2">
                  <span className="fs-12 text-muted fw-bold text-uppercase">Tipo a Bipar:</span>
                  <span className="badge bg-primary text-white fs-12 font-monospace px-2 py-1">
                    {tipoAtivo}
                  </span>
                </div>

                <div className="btn-group" role="group">
                  <button
                    type="button"
                    className={`btn btn-md px-3 py-2 fw-bold d-flex align-items-center gap-2 ${
                      tipoAtivo === 'CPU' ? 'btn-primary shadow-xs' : 'btn-outline-primary'
                    }`}
                    onClick={() => {
                      setTipoAtivo('CPU');
                      setMarcaModelo('Lenovo ThinkCentre M75q');
                    }}
                  >
                    <i className="ri-computer-line fs-18"></i>
                    <span>💻 CPU / Desktop</span>
                    <span className="badge bg-white text-primary rounded-pill font-monospace fs-11 ms-1">
                      {loteStats.cpus}
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`btn btn-md px-3 py-2 fw-bold d-flex align-items-center gap-2 ${
                      tipoAtivo === 'MONITOR' ? 'btn-info text-white shadow-xs' : 'btn-outline-info'
                    }`}
                    onClick={() => {
                      setTipoAtivo('MONITOR');
                      setMarcaModelo('Monitor Dell / Lenovo');
                    }}
                  >
                    <i className="ri-tv-line fs-18"></i>
                    <span>🖥️ Monitor</span>
                    <span className="badge bg-white text-info rounded-pill font-monospace fs-11 ms-1">
                      {loteStats.monitores}
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`btn btn-md px-3 py-2 fw-bold d-flex align-items-center gap-2 ${
                      tipoAtivo === 'NOTEBOOK' ? 'btn-warning text-dark shadow-xs' : 'btn-outline-warning'
                    }`}
                    onClick={() => {
                      setTipoAtivo('NOTEBOOK');
                      setMarcaModelo('Notebook');
                    }}
                  >
                    <i className="ri-macbook-line fs-18"></i>
                    <span>💼 Notebook</span>
                    <span className="badge bg-white text-dark rounded-pill font-monospace fs-11 ms-1">
                      {loteStats.notebooks}
                    </span>
                  </button>
                </div>
              </div>

              {/* Seção 3: Leitor Óptico com CÂMERA AO VIVO (IGUAL AO COLETOR EMC) */}
              <div className="card border shadow-sm mb-0">
                <div className="card-header bg-dark text-white d-flex align-items-center justify-content-between py-2 flex-wrap gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <span className={`badge ${isScanning ? 'bg-success' : 'bg-secondary'} rounded-pill`}>
                      {isScanning ? '● CÂMERA AO VIVO (HD 720p)' : '○ CÂMERA DESLIGADA'}
                    </span>
                    <span className="fs-12 text-light d-none d-sm-inline">Foco Contínuo Municipal</span>
                  </div>

                  <div className="d-flex align-items-center gap-1 flex-wrap">
                    {/* Seletor de Câmeras */}
                    {availableCameras.length > 1 && (
                      <select
                        className="form-select form-select-sm bg-dark text-white border-secondary me-1 py-0 fs-11"
                        style={{ width: 'auto', height: '28px' }}
                        value={selectedCameraId}
                        onChange={(e) => {
                          setSelectedCameraId(e.target.value);
                          if (isScanning) {
                            stopCamera().then(() => startCamera(e.target.value));
                          }
                        }}
                      >
                        {availableCameras.map((cam) => (
                          <option key={cam.id} value={cam.id}>
                            {cam.label || `Câmera ${cam.id.substring(0, 5)}`}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Hardware Zoom */}
                    {hasZoom && isScanning && (
                      <div className="btn-group btn-group-sm me-1" role="group">
                        {[1, 1.5, 2, 2.5].filter(z => z <= (zoomMinMax.max || 3)).map((z) => (
                          <button
                            key={z}
                            type="button"
                            className={`btn btn-xs ${zoomLevel === z ? 'btn-primary fw-bold' : 'btn-outline-light'}`}
                            onClick={() => handleZoomChange(z)}
                            title={`Zoom ${z}x`}
                          >
                            {z}x
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Lanterna / Flash */}
                    {hasTorch && isScanning && (
                      <button
                        type="button"
                        className={`btn btn-sm btn-icon ${torchOn ? 'btn-warning' : 'btn-outline-light'}`}
                        onClick={toggleTorch}
                        title="Alternar Lanterna / Flash"
                      >
                        <i className="ri-flashlight-line fs-14"></i>
                      </button>
                    )}

                    {/* Botão Ligar/Desligar Câmera */}
                    {isScanning ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger px-3 py-1 d-flex align-items-center gap-1 fw-bold"
                        onClick={stopCamera}
                      >
                        <i className="ri-stop-circle-line"></i> Pausar Câmera
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-success px-3 py-1 d-flex align-items-center gap-1 fw-bold"
                        onClick={() => startCamera(selectedCameraId)}
                      >
                        <i className="ri-camera-lens-line"></i> Iniciar Câmera
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className="card-body p-0 bg-dark text-center position-relative overflow-hidden"
                  style={{
                    minHeight: '340px',
                    transition: 'box-shadow 0.15s ease',
                    boxShadow: flashFeedback === 'success'
                      ? 'inset 0 0 0 10px #0ab39c, 0 0 40px #0ab39c'
                      : flashFeedback === 'duplicate'
                      ? 'inset 0 0 0 12px #ff9800, 0 0 45px #ff9800'
                      : 'none'
                  }}
                >
                  {/* Container do Scanner da Câmera */}
                  <div
                    id="camera-reader-novos"
                    style={{ width: '100%', minHeight: '340px', background: '#000' }}
                  ></div>

                  {/* Contador Flutuante no Topo do Viewfinder */}
                  <div
                    className="position-absolute top-0 start-50 translate-middle-x mt-2 px-3 py-1 rounded-pill bg-dark bg-opacity-75 text-white fs-12 fw-bold shadow-sm d-flex align-items-center gap-2"
                    style={{ zIndex: 6, backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.2)' }}
                  >
                    <span className="badge bg-success font-monospace">{loteItens.length}</span>
                    <span>no Lote Atual</span>
                    <span className="badge bg-primary font-monospace ms-1">{tipoAtivo}</span>
                  </div>

                  {/* Mira Óptica com Retículo de 4 Cantos e Guias Horizontal + Vertical */}
                  {isScanning && (
                    <div
                      className="position-absolute top-50 start-50 translate-middle pointer-events-none"
                      style={{
                        width: '250px',
                        height: '250px',
                        border: '1.5px dashed rgba(255, 255, 255, 0.45)',
                        borderRadius: '16px',
                        zIndex: 4,
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.42)'
                      }}
                    >
                      {/* Cantos Verdes de Enquadramento */}
                      <div style={{ position: 'absolute', top: '-2px', left: '-2px', width: '22px', height: '22px', borderTop: '4px solid #10b981', borderLeft: '4px solid #10b981', borderTopLeftRadius: '14px' }}></div>
                      <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '22px', height: '22px', borderTop: '4px solid #10b981', borderRight: '4px solid #10b981', borderTopRightRadius: '14px' }}></div>
                      <div style={{ position: 'absolute', bottom: '-2px', left: '-2px', width: '22px', height: '22px', borderBottom: '4px solid #10b981', borderLeft: '4px solid #10b981', borderBottomLeftRadius: '14px' }}></div>
                      <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '22px', height: '22px', borderBottom: '4px solid #10b981', borderRight: '4px solid #10b981', borderBottomRightRadius: '14px' }}></div>

                      {/* Guia Laser Vermelho Central */}
                      <div style={{ position: 'absolute', top: '50%', left: '8px', right: '8px', height: '2px', background: 'rgba(239, 68, 68, 0.9)', boxShadow: '0 0 8px #ef4444' }}></div>
                      <div style={{ position: 'absolute', left: '50%', top: '8px', bottom: '8px', width: '1px', background: 'rgba(239, 68, 68, 0.45)' }}></div>

                      {/* Legenda de Orientação */}
                      <span
                        style={{
                          position: 'absolute',
                          top: '-24px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          fontSize: '11px',
                          color: '#34d399',
                          fontWeight: 700,
                          letterSpacing: '0.5px',
                          whiteSpace: 'nowrap',
                          textShadow: '0 1px 3px rgba(0,0,0,0.95)'
                        }}
                      >
                        FOQUE O PATRIMÔNIO (PMAT / BNDES / SÉRIE)
                      </span>

                      <span
                        style={{
                          position: 'absolute',
                          bottom: '6px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          fontSize: '10px',
                          color: 'rgba(255,255,255,0.85)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          textShadow: '0 1px 3px rgba(0,0,0,0.95)'
                        }}
                      >
                        Lê na Horizontal e Vertical
                      </span>
                    </div>
                  )}

                  {/* Banner Flutuante de Feedback Imediato */}
                  {flashFeedback && (
                    <div
                      className={`position-absolute top-0 start-0 end-0 p-3 text-white fw-bold text-center fs-16 shadow ${
                        flashFeedback === 'success'
                          ? 'bg-success'
                          : flashFeedback === 'duplicate'
                          ? 'bg-warning text-dark border-bottom border-dark'
                          : 'bg-danger'
                      }`}
                      style={{ zIndex: 10 }}
                    >
                      <i className={`ri-${flashFeedback === 'success' ? 'checkbox-circle-fill' : 'lock-2-fill'} me-2 fs-18`}></i>
                      {flashFeedback === 'duplicate'
                        ? `⚠️ ATENÇÃO: Equipamento ${lastScannedCodeRef.current} já foi adicionado a este lote!`
                        : ultimoBipado
                        ? `✓ ${ultimoBipado.patrimonio} (${ultimoBipado.tipo}) Adicionado à Lista!`
                        : '✓ EQUIPAMENTO ADICIONADO COM SUCESSO!'}
                    </div>
                  )}

                  {/* Estado Ocioso: Botão de Ativar Leitor */}
                  {!isScanning && (
                    <div
                      className="position-absolute top-50 start-50 translate-middle text-center w-100 p-4"
                      style={{ zIndex: 5 }}
                    >
                      <div className="avatar-lg rounded-circle bg-soft-success mx-auto d-flex align-items-center justify-content-center text-success fs-36 mb-3">
                        <i className="ri-qr-scan-2-line"></i>
                      </div>
                      <h5 className="text-white fs-16 mb-2">Câmera Pronta para Escaneamento</h5>
                      <p className="text-muted fs-12 mb-3" style={{ maxWidth: '420px', margin: '0 auto' }}>
                        Toque no botão abaixo para ativar a câmera do celular. Aponte para a etiqueta branca de patrimônio da Prefeitura (PMAT / BNDES): o leitor adiciona à lista com bip sonoro e trava de duplicidade!
                      </p>
                      <button
                        type="button"
                        className="btn btn-success btn-lg rounded-pill px-4 shadow"
                        onClick={() => startCamera(selectedCameraId)}
                      >
                        <i className="ri-camera-fill me-2"></i> Ativar Leitor Óptico (Câmera)
                      </button>
                    </div>
                  )}

                  {cameraError && (
                    <div className="alert alert-warning m-3 text-start fs-12" role="alert">
                      <i className="ri-error-warning-line me-1"></i> {cameraError}
                    </div>
                  )}
                </div>

                {/* Alerta de Duplicidade */}
                {duplicateAlert && (
                  <div className="alert alert-warning border border-warning shadow-sm mx-3 mt-3 mb-0 p-2 d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center gap-2">
                      <i className="ri-lock-2-line fs-18 text-warning"></i>
                      <span className="fs-12 fw-bold text-dark">{duplicateAlert.message}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-link text-dark p-0 text-decoration-none"
                      onClick={() => setDuplicateAlert(null)}
                    >
                      <i className="ri-close-line fs-16"></i>
                    </button>
                  </div>
                )}

                {/* Entrada Manual de Apoio (Para Digitação ou Leitor USB) */}
                <div className="p-3 bg-light border-top">
                  <form onSubmit={handleBiparManual}>
                    <div className="input-group input-group-md">
                      <span className="input-group-text bg-white text-muted">
                        <i className="ri-keyboard-line fs-16"></i>
                      </span>
                      <input
                        ref={inputRef}
                        type="text"
                        className="form-control font-monospace fw-bold fs-14"
                        placeholder={`Ou digite o patrimônio do ${tipoAtivo} (ex: 100039491) e pressione Enter...`}
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                      />
                      <button type="submit" className="btn btn-primary fw-semibold px-3">
                        <i className="ri-add-line me-1"></i> Adicionar
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Seção 4: Tabela de Itens do Lote em Montagem */}
              <div className="card shadow-xs border mb-0" style={{ borderRadius: '10px' }}>
                <div className="card-header bg-light border-bottom p-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <i className="ri-stack-line text-success fs-18"></i>
                    <h6 className="card-title mb-0 fs-14 fw-bold text-dark">
                      Equipamentos no Lote Atual ({loteStats.total})
                    </h6>
                    <span className="badge bg-soft-primary text-primary fs-11">
                      {loteStats.cpus} CPUs
                    </span>
                    <span className="badge bg-soft-info text-info fs-11">
                      {loteStats.monitores} Monitores
                    </span>
                    <span className="badge bg-soft-warning text-dark fs-11">
                      {loteStats.notebooks} Notes
                    </span>
                  </div>

                  <div className="d-flex align-items-center gap-2">
                    {loteItens.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-soft-danger btn-sm px-2 py-1 fs-11"
                        onClick={() => {
                          if (window.confirm('Deseja limpar todos os itens deste lote não salvo?')) setLoteItens([]);
                        }}
                      >
                        <i className="ri-delete-bin-line me-1"></i> Limpar Lote
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-success btn-sm px-3 py-1 fs-12 fw-bold shadow-xs d-flex align-items-center gap-1"
                      onClick={handleGravarLote}
                      disabled={salvandoLote || loteItens.length === 0}
                    >
                      <i className="ri-save-3-line"></i>
                      {salvandoLote ? 'Gravando...' : `Gravar e Finalizar Saída (${loteItens.length} itens)`}
                    </button>
                  </div>
                </div>

                <div className="card-body p-0">
                  {loteItens.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                      <i className="ri-inbox-line fs-36 d-block mb-2 text-secondary opacity-50"></i>
                      <p className="fs-13 mb-1 fw-semibold text-dark">Nenhum equipamento adicionado a esta remessa ainda.</p>
                      <span className="fs-12">Preencha o destino acima, inicie a câmera ou digite os patrimônios para conferência.</span>
                    </div>
                  ) : (
                    <div className="table-responsive" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                      <table className="table table-sm table-hover table-striped align-middle mb-0 fs-12">
                        <thead className="table-light text-muted fw-bold sticky-top">
                          <tr>
                            <th style={{ width: '45px' }}>#</th>
                            <th style={{ width: '90px' }}>Tipo</th>
                            <th>Patrimônio Municipal</th>
                            <th>Nº de Série</th>
                            <th>Modelo</th>
                            <th>Horário</th>
                            <th className="text-center" style={{ width: '60px' }}>Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loteItens.map((it, idx) => (
                            <tr key={it.id}>
                              <td className="text-muted font-monospace">{loteItens.length - idx}</td>
                              <td>
                                <span className={`badge font-monospace ${
                                  it.tipo === 'CPU' ? 'bg-soft-primary text-primary' : it.tipo === 'MONITOR' ? 'bg-soft-info text-info' : 'bg-soft-warning text-dark'
                                } border`}>
                                  {it.tipo}
                                </span>
                              </td>
                              <td>
                                <span className="font-monospace fw-bold text-dark fs-13">{it.patrimonio}</span>
                                {it.tipoEtiqueta && (
                                  <span className="d-block text-muted fs-10">{it.tipoEtiqueta}</span>
                                )}
                              </td>
                              <td className="font-monospace text-muted">{it.numero_serie || '-'}</td>
                              <td className="text-truncate" style={{ maxWidth: '200px' }}>{it.marca_modelo}</td>
                              <td className="text-muted font-monospace fs-11">{it.hora}</td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  className="btn btn-ghost-danger btn-sm p-1"
                                  onClick={() => handleRemoveItem(it.id)}
                                  title="Remover deste lote"
                                >
                                  <i className="ri-delete-bin-line fs-14"></i>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* ABA 2: HISTÓRICO DE SAÍDAS / EXPEDIÇÕES */}
          {/* ========================================================= */}
          {activeSubTab === 'historico' && (
            <div className="d-flex flex-column gap-3">
              {/* Barra de Filtros */}
              <div className="row g-2 align-items-center">
                <div className="col-lg-5 col-md-6 col-12">
                  <div className="position-relative">
                    <input
                      type="text"
                      className="form-control form-control-sm pe-4"
                      placeholder="Buscar patrimônio, serial, localidade ou modelo..."
                      value={historicoSearch}
                      onChange={(e) => setHistoricoSearch(e.target.value)}
                    />
                    {historicoSearch && (
                      <button
                        type="button"
                        className="btn btn-link position-absolute end-0 top-50 translate-middle-y text-muted p-0 me-2"
                        onClick={() => setHistoricoSearch('')}
                      >
                        <i className="ri-close-line"></i>
                      </button>
                    )}
                  </div>
                </div>

                <div className="col-lg-3 col-md-3 col-6">
                  <select
                    className="form-select form-select-sm"
                    value={historicoTipo}
                    onChange={(e) => setHistoricoTipo(e.target.value)}
                  >
                    <option value="">Todos os Tipos</option>
                    <option value="CPU">💻 Apenas CPUs</option>
                    <option value="MONITOR">🖥️ Apenas Monitores</option>
                    <option value="NOTEBOOK">💼 Apenas Notebooks</option>
                  </select>
                </div>

                <div className="col-lg-4 col-md-3 col-6 text-end d-flex gap-2 justify-content-end">
                  <button
                    type="button"
                    className="btn btn-soft-primary btn-sm"
                    onClick={() => fetchExpedidos(1)}
                  >
                    <i className="ri-search-line me-1"></i> Filtrar
                  </button>

                  <button
                    type="button"
                    className="btn btn-soft-success btn-sm d-flex align-items-center gap-1 shadow-xs"
                    onClick={handleExportarHistorico}
                    disabled={expedidosList.length === 0}
                  >
                    <i className="ri-file-excel-2-line"></i> Exportar CSV
                  </button>
                </div>
              </div>

              {/* Tabela do Histórico */}
              <div className="table-responsive border rounded" style={{ minHeight: '300px' }}>
                <table className="table table-sm table-hover table-striped align-middle mb-0 fs-12">
                  <thead className="table-light text-muted fw-bold">
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Data / Hora</th>
                      <th>Localidade de Destino</th>
                      <th>Secretaria</th>
                      <th>Tipo</th>
                      <th>Patrimônio</th>
                      <th>Nº de Série</th>
                      <th>Modelo</th>
                      <th>Origem Registro</th>
                      <th className="text-center" style={{ width: '60px' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingExpedidos ? (
                      <tr>
                        <td colSpan="10" className="text-center py-4 text-muted">
                          <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                          Carregando histórico de expedições...
                        </td>
                      </tr>
                    ) : expedidosList.length === 0 ? (
                      <tr>
                        <td colSpan="10" className="text-center py-5 text-muted">
                          Nenhum equipamento novo expedido encontrado com os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      expedidosList.map((item, index) => (
                        <tr key={item.id}>
                          <td className="text-muted font-monospace">{(page - 1) * 50 + index + 1}</td>
                          <td className="font-monospace fs-11 text-muted">{item.data_expedicao}</td>
                          <td className="fw-bold text-dark">{item.localidade}</td>
                          <td>{item.secretaria || '-'}</td>
                          <td>
                            <span className={`badge font-monospace ${
                              item.tipo === 'CPU' ? 'bg-soft-primary text-primary' : item.tipo === 'MONITOR' ? 'bg-soft-info text-info' : 'bg-soft-warning text-dark'
                            } border`}>
                              {item.tipo}
                            </span>
                          </td>
                          <td className="font-monospace fw-bold text-dark fs-13">{item.patrimonio}</td>
                          <td className="font-monospace text-muted">{item.numero_serie || '-'}</td>
                          <td className="text-muted">{item.marca_modelo || '-'}</td>
                          <td>
                            <span className="badge bg-light text-muted border font-monospace fs-10">
                              {item.origem_registro || 'Bipagem'}
                            </span>
                          </td>
                          <td className="text-center">
                            <button
                              type="button"
                              className="btn btn-ghost-danger btn-sm p-1"
                              onClick={() => handleExcluirExpedido(item.id, item.patrimonio)}
                              title="Excluir este registro"
                            >
                              <i className="ri-delete-bin-line fs-14"></i>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="d-flex align-items-center justify-content-between p-2">
                  <span className="fs-12 text-muted">
                    Página {page} de {totalPages}
                  </span>
                  <div className="btn-group btn-group-sm">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      disabled={page <= 1}
                      onClick={() => fetchExpedidos(page - 1)}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      disabled={page >= totalPages}
                      onClick={() => fetchExpedidos(page + 1)}
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* ABA 3: BALANÇO NOVO X RETORNO EMC */}
          {/* ========================================================= */}
          {activeSubTab === 'conciliacao' && (
            <div className="d-flex flex-column gap-3">
              <div className="p-3 bg-light rounded border">
                <label className="form-label fs-13 fw-bold text-dark mb-1">
                  Selecione a Localidade para Ver o Balanço (Novos Entregues vs. EMC Retornados ao Galpão):
                </label>
                <div className="row g-2 align-items-center">
                  <div className="col-md-8 col-12">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Digite ou escolha a unidade para analisar..."
                      value={concilLocalidade}
                      onChange={(e) => setConcilLocalidade(e.target.value)}
                      list="concil-datalist"
                    />
                    <datalist id="concil-datalist">
                      {(resumo?.localidadesDisponiveis || []).map((l) => (
                        <option key={l} value={l} />
                      ))}
                    </datalist>
                  </div>
                  <div className="col-md-4 col-12">
                    <button
                      type="button"
                      className="btn btn-primary w-100 fw-bold"
                      onClick={() => handleConsultarConciliacao()}
                      disabled={loadingConcil || !concilLocalidade.trim()}
                    >
                      <i className="ri-search-eye-line me-1"></i>
                      {loadingConcil ? 'Calculando...' : 'Consultar Balanço'}
                    </button>
                  </div>
                </div>
              </div>

              {concilData && (
                <div className="card border shadow-xs mb-0">
                  <div className="card-header bg-soft-primary border-bottom py-2 px-3">
                    <h6 className="card-title mb-0 fs-14 fw-bold text-primary">
                      <i className="ri-building-line me-1"></i> {concilData.localidade}
                    </h6>
                  </div>
                  <div className="card-body p-3">
                    <div className="row g-3 text-center mb-3">
                      <div className="col-md-4 col-12">
                        <div className="p-3 rounded bg-soft-success border border-success-subtle">
                          <span className="text-success fs-11 text-uppercase fw-bold d-block">Novos Entregues</span>
                          <h4 className="mb-0 fs-22 font-monospace text-success fw-bold">
                            {concilData.resumo?.novosExpedidosTotal || 0}
                          </h4>
                          <small className="text-muted fs-11">
                            {concilData.resumo?.novosCpus || 0} CPUs • {concilData.resumo?.novosMonitores || 0} Monitores
                          </small>
                        </div>
                      </div>

                      <div className="col-md-4 col-12">
                        <div className="p-3 rounded bg-soft-warning border border-warning-subtle">
                          <span className="text-warning fs-11 text-uppercase fw-bold d-block">EMC Retornados ao Galpão</span>
                          <h4 className="mb-0 fs-22 font-monospace text-warning fw-bold">
                            {concilData.resumo?.emcRecolhidosGalpaoTotal || 0}
                          </h4>
                          <small className="text-muted fs-11">
                            {concilData.resumo?.emcCpus || 0} CPUs • {concilData.resumo?.emcMonitores || 0} Monitores
                          </small>
                        </div>
                      </div>

                      <div className="col-md-4 col-12">
                        <div className={`p-3 rounded border ${
                          (concilData.resumo?.saldoRetornoTotal || 0) > 0 ? 'bg-soft-danger border-danger-subtle' : 'bg-soft-info border-info-subtle'
                        }`}>
                          <span className="fs-11 text-uppercase fw-bold d-block text-dark">Saldo Pendente a Retornar</span>
                          <h4 className={`mb-0 fs-22 font-monospace fw-bold ${
                            (concilData.resumo?.saldoRetornoTotal || 0) > 0 ? 'text-danger' : 'text-info'
                          }`}>
                            {concilData.resumo?.saldoRetornoTotal || 0}
                          </h4>
                          <small className="text-muted fs-11">
                            Saldo: {concilData.resumo?.saldoCpus || 0} CPUs • {concilData.resumo?.saldoMonitores || 0} Monitores
                          </small>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* ABA 4: IMPORTAR DADOS DO APP ANTERIOR */}
          {/* ========================================================= */}
          {activeSubTab === 'importar' && (
            <div className="d-flex flex-column gap-3">
              <div className="alert alert-info border-info-subtle fs-12 mb-0">
                <i className="ri-information-line fs-16 align-middle me-1"></i>
                <strong>Importação Rápida de Histórico:</strong> Cole aqui os dados do seu aplicativo anterior (planilha Excel / CSV copiado e colado ou array JSON). O sistema identifica automaticamente colunas de Patrimônio, Localidade, Tipo e Série.
              </div>

              <div className="mb-2">
                <label className="form-label fs-12 fw-bold text-dark">
                  Cole os dados abaixo (CSV com cabeçalho ou JSON):
                </label>
                <textarea
                  className="form-control font-monospace fs-11"
                  rows="8"
                  placeholder={"patrimonio;localidade;tipo;numero_serie;marca_modelo\n100039491;CRAS Industrial;CPU;PE0FPFRT;Lenovo M75q\n100039492;CRAS Industrial;MONITOR;GB6WTN3;Dell P2422H"}
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                ></textarea>
              </div>

              <div className="d-flex align-items-center justify-content-between">
                <span className="text-muted fs-11">
                  Formatos aceitos: delimitados por ponto-e-vírgula (;), vírgula (,), tabulação (tab) ou JSON.
                </span>
                <button
                  type="button"
                  className="btn btn-success px-4 fw-bold"
                  onClick={handleExecutarImportacao}
                  disabled={importando || !importJsonText.trim()}
                >
                  <i className="ri-upload-2-line me-1"></i>
                  {importando ? 'Processando Importação...' : 'Importar Dados Agora'}
                </button>
              </div>

              {importResultado && (
                <div className="alert alert-success border-success-subtle mt-2 fs-12">
                  <i className="ri-checkbox-circle-line fs-16 align-middle me-1"></i>
                  <strong>Resultado da Importação:</strong> {importResultado.message}
                  <span className="d-block mt-1 text-muted">
                    Total Inseridos: {importResultado.inseridos} • Ignorados/Duplicados: {importResultado.ignorados}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL / TERMO DE ENTREGA FORMAL (PARA IMPRESSÃO E ASSINATURA) */}
      {termoModalLote && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 1055 }} tabIndex="-1">
          <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content shadow-lg border-0">
              <div className="modal-header bg-dark text-white py-2 px-3">
                <h5 className="modal-title fs-15 fw-bold d-flex align-items-center gap-2">
                  <i className="ri-file-paper-2-line text-warning"></i> Termo de Entrega de Equipamentos Novos
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setTermoModalLote(null)}
                  aria-label="Fechar"
                ></button>
              </div>

              <div className="modal-body p-4 bg-white text-dark" id="termo-entrega-print-area">
                <div className="text-center border-bottom pb-3 mb-3">
                  <h4 className="fw-bold mb-1 fs-18 text-uppercase">Prefeitura Municipal de Contagem</h4>
                  <h6 className="text-muted fs-13 mb-1">Superintendência de Tecnologia da Informação • STI</h6>
                  <span className="badge bg-dark text-white font-monospace px-3 py-1 fs-12">
                    TERMO DE ENTREGA E INSTALAÇÃO • PMAT / BNDES
                  </span>
                </div>

                <div className="row g-2 mb-3 fs-12 p-3 bg-light rounded border">
                  <div className="col-sm-6">
                    <strong>Localidade / Destino:</strong> {termoModalLote.localidade}
                  </div>
                  <div className="col-sm-6">
                    <strong>Secretaria / Órgão:</strong> {termoModalLote.secretaria || 'Administração Municipal'}
                  </div>
                  <div className="col-sm-6">
                    <strong>Data da Expedição:</strong> {termoModalLote.data_expedicao}
                  </div>
                  <div className="col-sm-6">
                    <strong>Responsável Galpão:</strong> {termoModalLote.usuario}
                  </div>
                </div>

                <div className="table-responsive mb-4">
                  <table className="table table-sm table-bordered align-middle mb-0 fs-11">
                    <thead className="table-dark text-white text-uppercase">
                      <tr>
                        <th style={{ width: '35px' }}>#</th>
                        <th style={{ width: '80px' }}>Tipo</th>
                        <th>Patrimônio Municipal</th>
                        <th>Nº de Série</th>
                        <th>Modelo / Descrição</th>
                        <th>Origem Recurso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {termoModalLote.itens.map((it, idx) => (
                        <tr key={idx}>
                          <td className="text-center font-monospace">{idx + 1}</td>
                          <td className="fw-bold">{it.tipo}</td>
                          <td className="font-monospace fw-bold text-dark fs-12">{it.patrimonio}</td>
                          <td className="font-monospace text-muted">{it.numero_serie || '-'}</td>
                          <td>{it.marca_modelo}</td>
                          <td>{it.origem_recurso || 'PMAT / BNDES'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-top pt-4 mt-5">
                  <div className="row text-center fs-12">
                    <div className="col-6">
                      <div className="border-top border-dark mx-4 pt-1">
                        <strong>Entregue por (Galpão / STI)</strong>
                        <div className="text-muted fs-11">Assinatura / Matrícula</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="border-top border-dark mx-4 pt-1">
                        <strong>Recebido por (Unidade de Destino)</strong>
                        <div className="text-muted fs-11">Nome Legível / Assinatura / Cargo</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer bg-light py-2 px-3 d-flex justify-content-between">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setTermoModalLote(null)}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm px-4 fw-bold"
                  onClick={() => window.print()}
                >
                  <i className="ri-printer-line me-1"></i> Imprimir Termo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RomaneiosView({ stats, notify }) {
  const [lotes, setLotes] = useState([]);
  const [selectedLote, setSelectedLote] = useState(null);
  const [loteItens, setLoteItens] = useState([]);

  const fetchLotes = async () => {
    try {
      const res = await fetch(`${API_BASE}/romaneios`);
      const json = await res.json();
      if (json.success) setLotes(json.lotes);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchLotes();
  }, []);

  const handleOpenLote = async (lote) => {
    setSelectedLote(lote);
    try {
      const res = await fetch(`${API_BASE}/romaneios/${lote.id}/itens`);
      const json = await res.json();
      if (json.success) setLoteItens(json.itens);
    } catch (e) {
      console.error(e);
    }
  };

  const handleExportLoteCsv = () => {
    if (!selectedLote || !loteItens || loteItens.length === 0) return;
    const headers = ['Romaneio', 'Codigo Patrimonio', 'Tipo', 'Secretaria Origem', 'Status'];
    const rows = loteItens.map(it => [
      selectedLote.numero_romaneio || '',
      it.codigo_bipado || '',
      it.tipo_equipamento || '',
      it.secretaria_prevista || it.localidade_coletada || '',
      'Baixa Oficial EMC'
    ]);
    exportToCsv(`romaneio_${(selectedLote.numero_romaneio || 'lote').toLowerCase().replace(/[^a-z0-9]/g, '_')}.csv`, headers, rows);
  };

  return (
    <div>
      <div className="card">
        <div className="card-header align-items-center d-flex">
          <h4 className="card-title mb-0 flex-grow-1">
            <i className="ri-truck-line me-2 text-primary"></i>
            Histórico Oficial de Romaneios & Baixas EMC
          </h4>
        </div>
        <div className="card-body">
          {lotes.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="ri-file-list-3-line fs-36 d-block mb-2"></i>
              Nenhum romaneio ou lote de devolução fechado até o momento.
            </div>
          ) : (
            <div className="table-responsive table-card">
              <table className="table table-borderless table-centered align-middle table-nowrap mb-0">
                <thead className="text-muted table-light">
                  <tr>
                    <th>Número do Documento</th>
                    <th>Data Fechamento</th>
                    <th>Status</th>
                    <th>Transportadora / Destino</th>
                    <th className="text-center">Total de Itens</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lotes.map((l) => (
                    <tr key={l.id}>
                      <td className="fw-bold font-monospace text-primary">{l.numero_romaneio}</td>
                      <td>{l.data_fechamento || l.data_criacao}</td>
                      <td>
                        {l.status === 'devolvido_emc' ? (
                          <span className="badge badge-soft-success">Devolvido à EMC</span>
                        ) : (
                          <span className="badge badge-soft-warning">Aguardando Coleta</span>
                        )}
                      </td>
                      <td>{l.transportadora}</td>
                      <td className="text-center fw-bold">{l.total_geral}</td>
                      <td>
                        <button className="btn btn-soft-primary btn-sm" onClick={() => handleOpenLote(l)}>
                          <i className="ri-eye-line me-1"></i> Ver Termo / Imprimir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedLote && (
        <div className="card border border-primary mt-4">
          <div className="card-header bg-soft-primary d-flex align-items-center justify-content-between">
            <h5 className="card-title text-primary mb-0">
              <i className="ri-printer-line me-2"></i>
              Termo Oficial de Devolução — {selectedLote.numero_romaneio}
            </h5>
            <div className="d-flex gap-2">
              <button className="btn btn-outline-success btn-sm" onClick={handleExportLoteCsv}>
                <i className="ri-file-excel-2-line me-1"></i> Exportar CSV
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
                <i className="ri-printer-line me-1"></i> Imprimir Termo de Devolução
              </button>
            </div>
          </div>
          <div className="card-body p-4">
            <div className="border p-4 bg-white text-dark">
              <div className="text-center border-bottom pb-3 mb-4">
                <h4 className="fw-bold mb-1">PREFEITURA MUNICIPAL DE CONTAGEM</h4>
                <h6 className="text-muted mb-0">TERMO OFICIAL DE DEVOLUÇÃO DE EQUIPAMENTOS LOCADOS (CONTRATO EMC)</h6>
                <div className="fs-12 text-muted mt-1">Documento: {selectedLote.numero_romaneio} | Emissão: {selectedLote.data_fechamento}</div>
              </div>

              <div className="row g-3 mb-4 fs-13">
                <div className="col-6"><strong>Empresa Locadora:</strong> EMC SERVIÇOS DE TECNOLOGIA</div>
                <div className="col-6"><strong>Órgão Devolvente:</strong> Prefeitura Municipal de Contagem</div>
                <div className="col-6"><strong>Responsável TI:</strong> {selectedLote.responsavel_ti}</div>
                <div className="col-6"><strong>Total de Equipamentos Devolvidos:</strong> {selectedLote.total_geral}</div>
              </div>

              <h6 className="fw-bold mb-2">Relação de Ativos Coletados:</h6>
              <div className="table-responsive mb-4">
                <table className="table table-sm table-bordered fs-12 mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Código Patrimônio</th>
                      <th>Tipo</th>
                      <th>Secretaria Origem</th>
                      <th>Status Conferência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loteItens.map((it) => (
                      <tr key={it.id}>
                        <td className="font-monospace fw-bold">{it.codigo_bipado}</td>
                        <td>{it.tipo_equipamento}</td>
                        <td>{it.secretaria_prevista || it.localidade_coletada}</td>
                        <td>Baixa Oficial EMC</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="row mt-5 pt-4 text-center fs-12">
                <div className="col-6">
                  <div className="border-top pt-2 mx-4">
                    <strong>Prefeitura Municipal de Contagem</strong><br />
                    Responsável pelo Galpão / TI
                  </div>
                </div>
                <div className="col-6">
                  <div className="border-top pt-2 mx-4">
                    <strong>Empresa EMC / Transportadora</strong><br />
                    Recebido por (Nome / Assinatura / Data)
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-top text-center text-muted fs-11 font-monospace">
                Chave de Autenticidade Digital: PMC-EMC-{selectedLote.id}-{(selectedLote.numero_romaneio || '').replace(/\D/g, '') || '001'} | Registro gerado via Sistema Coletor Inventário PMC
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// VIEW: MANUTENÇÃO & RESET SEGURO
// ==========================================
function ManutencaoView({ stats, onResetDatabase, notify }) {
  const [clearingCache, setClearingCache] = useState(false);
  const [syncingTurso, setSyncingTurso] = useState(false);

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      const res = await fetch(`${API_BASE}/sistema/limpar-cache`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        if (notify) notify('success', 'Cache do sistema e estatísticas recarregados com sucesso!');
        else alert('Cache recarregado com sucesso!');
      } else {
        if (notify) notify('error', 'Falha ao recarregar cache.');
      }
    } catch (e) {
      if (notify) notify('error', 'Erro ao conectar ao servidor.');
    } finally {
      setClearingCache(false);
    }
  };

  const handleSyncTurso = async () => {
    setSyncingTurso(true);
    try {
      const res = await fetch(`${API_BASE}/sistema/turso-sync`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        if (notify) notify('success', 'Nuvem Turso sincronizada com sucesso!');
        else alert('Nuvem Turso sincronizada com sucesso!');
      } else {
        if (notify) notify('error', json.message || 'Falha ao sincronizar Turso.');
      }
    } catch (e) {
      if (notify) notify('error', 'Erro ao conectar ao servidor.');
    } finally {
      setSyncingTurso(false);
    }
  };

  return (
    <div className="row">
      <div className="col-lg-8">
        <div className="card">
          <div className="card-header bg-soft-danger">
            <h5 className="card-title text-danger mb-0">
              <i className="ri-settings-4-line me-2"></i>
              Zerar e Reiniciar Conferências (Manter Bases de Dados)
            </h5>
          </div>
          <div className="card-body">
            <p className="fs-14">
              Esta ferramenta foi criada especialmente para quando você precisar reiniciar o processo de bipagem e conferência sem perder os dados cadastrais.
            </p>

            <div className="row g-3 mb-4">
              <div className="col-md-6">
                <div className="p-3 bg-soft-success rounded border border-success">
                  <strong className="text-success d-block mb-1">
                    <i className="ri-shield-check-line me-1"></i> Bases 100% Protegidas:
                  </strong>
                  <ul className="mb-0 fs-13 ps-3 text-dark">
                    <li>Base Contratual Oficial EMC (4.344 itens)</li>
                    <li>Base do Formulário de Servidores (1.960 respostas)</li>
                  </ul>
                </div>
              </div>

              <div className="col-md-6">
                <div className="p-3 bg-soft-danger rounded border border-danger">
                  <strong className="text-danger d-block mb-1">
                    <i className="ri-delete-bin-line me-1"></i> O Que Será Zerado:
                  </strong>
                  <ul className="mb-0 fs-13 ps-3 text-dark">
                    <li>Conferências de galpão atuais</li>
                    <li>Lotes e romaneios emitidos</li>
                    <li>Status de retorno ao estado "Pendente"</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="border-top pt-3 text-end">
              <button
                type="button"
                className="btn btn-danger btn-lg px-4"
                onClick={onResetDatabase}
              >
                <i className="ri-refresh-line me-2"></i> Zerar Conferências e Reiniciar Agora
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="col-lg-4">
        <div className="card">
          <div className="card-header">
            <h5 className="card-title mb-0">
              <i className="ri-database-2-line me-2 text-primary"></i> Estado Atual do Banco
            </h5>
          </div>
          <div className="card-body">
            {stats && (
              <ul className="list-group list-group-flush fs-13">
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  <span>Base Contratual EMC:</span>
                  <span className="badge badge-primary">{stats.totalContratadoEMC}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  <span>Formulário de Servidores:</span>
                  <span className="badge badge-info">{stats.totalFormularioServidores}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  <span>Itens no Galpão (Aguardando):</span>
                  <span className="badge badge-warning">{stats.totalAguardandoEMC}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  <span>Devolvidos à EMC (Baixados):</span>
                  <span className="badge badge-success">{stats.totalDevolvidosEMC}</span>
                </li>
                <li className="list-group-item d-flex justify-content-between align-items-center">
                  <span>Excedentes de Galpão:</span>
                  <span className="badge badge-purple">{stats.totalExcedentes}</span>
                </li>
              </ul>
            )}
          </div>
        </div>

        <div className="card mt-3">
          <div className="card-header bg-soft-info">
            <h5 className="card-title text-info mb-0">
              <i className="ri-shield-keyhole-line me-2"></i> Operações e Cópia de Segurança
            </h5>
          </div>
          <div className="card-body">
            <div className="p-2 mb-3 bg-soft-success rounded border border-success fs-12 text-success d-flex align-items-center gap-2">
              <i className="ri-cloud-fill fs-20 flex-shrink-0"></i>
              <div>
                <strong>Nuvem Turso Conectada (São Paulo):</strong> Banco de dados permanente ativo! Bipagens e conferências ficam 100% blindadas contra reinicializações.
              </div>
            </div>
            <p className="fs-12 text-muted mb-3">
              Mantenha o banco de dados seguro baixando snapshots SQLite e forçando sincronização com a nuvem permanente quando necessário.
            </p>
            <div className="d-grid gap-2">
              <button
                type="button"
                className="btn btn-outline-success btn-sm"
                onClick={handleSyncTurso}
                disabled={syncingTurso}
              >
                <i className={`ri-cloud-line me-1 ${syncingTurso ? 'ri-spin' : ''}`}></i>
                {syncingTurso ? 'Sincronizando Nuvem...' : 'Forçar Sincronização Nuvem Turso'}
              </button>
              <a
                href={`${API_BASE}/sistema/backup-db`}
                download
                className="btn btn-outline-primary btn-sm"
              >
                <i className="ri-download-cloud-2-line me-1"></i> Baixar Backup Completo (.sqlite)
              </a>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={handleClearCache}
                disabled={clearingCache}
              >
                <i className={`ri-refresh-line me-1 ${clearingCache ? 'ri-spin' : ''}`}></i>
                {clearingCache ? 'Recarregando Cache...' : 'Recarregar Cache em Memória'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
