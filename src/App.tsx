import { useEffect, useMemo, useState } from "react";
import { AudioLines, CircleAlert, PanelLeftOpen, Plus, Sparkles } from "lucide-react";
import { AutonomousDjPanel } from "./components/AutonomousDjPanel";
import { ConnectivityGate } from "./components/ConnectivityGate";
import { CreateDjDialog } from "./components/CreateDjDialog";
import { LanguageSelector } from "./components/LanguageSelector";
import { Sidebar } from "./components/Sidebar";
import { useConnectivity } from "./hooks/use-connectivity";
import { readableError } from "./i18n/errors";
import { useI18n } from "./i18n/i18n";
import type { DjProfile } from "./shared/contracts";

type LoadState = "LOADING" | "READY" | "ERROR";

export function App() {
  const { appState, setLastSelectedDjId, t } = useI18n();
  const connectivity = useConnectivity();
  const [djs, setDjs] = useState<DjProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("LOADING");
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<DjProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    void loadDjs();
  }, []);

  const selectedDj = useMemo(
    () => djs.find(({ id }) => id === selectedId) ?? djs[0] ?? null,
    [djs, selectedId],
  );

  async function loadDjs() {
    try {
      const stored = window.desktop ? await window.desktop.djs.list() : [];
      const restoredId = stored.some(({ id }) => id === appState.lastSelectedDjId)
        ? appState.lastSelectedDjId
        : stored[0]?.id ?? null;
      setDjs(stored);
      setSelectedId(restoredId);
      setLoadState("READY");
      if (restoredId !== appState.lastSelectedDjId) void setLastSelectedDjId(restoredId);
    } catch (cause) {
      setError(readableError(cause, t, "error.loadDjs"));
      setLoadState("ERROR");
    }
  }

  async function saveDj(profile: DjProfile) {
    setSaving(true);
    setError(null);
    try {
      const saved = window.desktop ? await window.desktop.djs.save(profile) : profile;
      setDjs((current) => [...current.filter(({ id }) => id !== saved.id), saved]);
      setSelectedId(saved.id);
      await setLastSelectedDjId(saved.id);
      setDialogOpen(false);
    } catch (cause) {
      setError(readableError(cause, t, "error.saveDj"));
    } finally {
      setSaving(false);
    }
  }

  function createDj(): void {
    setEditingProfile(null);
    setDialogOpen(true);
  }

  function editDj(profile: DjProfile): void {
    setEditingProfile(profile);
    setDialogOpen(true);
  }

  async function deleteDj(profile: DjProfile): Promise<void> {
    const confirmed = window.confirm(t("app.deleteConfirm", { name: profile.name }));
    if (!confirmed) return;
    setError(null);
    try {
      if (window.desktop) await window.desktop.djs.delete(profile.id);
      const remaining = djs.filter(({ id }) => id !== profile.id);
      setDjs(remaining);
      if (selectedId === profile.id) {
        const nextId = remaining[0]?.id ?? null;
        setSelectedId(nextId);
        await setLastSelectedDjId(nextId);
      }
    } catch (cause) {
      setError(readableError(cause, t, "error.deleteDj"));
    }
  }

  if (connectivity.state !== "ONLINE") {
    return <ConnectivityGate checking={connectivity.checking} onRetry={connectivity.retry} />;
  }

  return (
    <div className={`app-shell${sidebarOpen ? " sidebar-open" : " sidebar-closed"}`}>
      {sidebarOpen ? <button aria-label={t("app.closeSidebar")} className="sidebar-scrim" onClick={() => setSidebarOpen(false)} type="button" /> : null}
      <Sidebar
        djs={djs}
        loadState={loadState}
        onClose={() => setSidebarOpen(false)}
        onCreate={createDj}
        onDelete={(profile) => void deleteDj(profile)}
        onEdit={editDj}
        onRetry={() => void loadDjs()}
        onSelect={(profile) => {
          setSelectedId(profile.id);
          setSidebarOpen(false);
          void setLastSelectedDjId(profile.id).catch((cause) => {
            setError(readableError(cause, t, "error.rememberDj"));
          });
        }}
        selectedId={selectedDj?.id ?? null}
      />

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-leading">
            {!sidebarOpen ? <button aria-label={t("app.showDjs")} className="icon-button sidebar-open-button" onClick={() => setSidebarOpen(true)} title={t("app.showDjs")} type="button"><PanelLeftOpen size={18} /></button> : null}
            <div className="topbar-context"><span className="eyebrow">NeoAres</span><strong>{selectedDj ? t("app.activeDj", { name: selectedDj.name }) : t("app.createFirstDj")}</strong></div>
          </div>
          <div className="topbar-actions"><LanguageSelector /></div>
        </header>

        <div className="page-content">
          {error ? <div className="alert error" role="alert"><CircleAlert size={18} /><div><strong>{t("app.needsAttention")}</strong><span>{error}</span></div></div> : null}

          <section className="hero compact-hero">
            <div><span className="eyebrow">{t("app.privateBooth")}</span><h1>{t("app.heroTitle")}</h1><p>{t("app.heroDescription")}</p></div>
            <div className="hero-status"><span><Sparkles size={15} /> {t("app.dynamicCuration")}</span></div>
          </section>

          {selectedDj ? <AutonomousDjPanel dj={selectedDj} key={selectedDj.id} /> : (
            <section className="panel empty-dj-state">
              <AudioLines size={28} />
              <div><span className="eyebrow">{t("app.yourBooth")}</span><h2>{t("app.createFirstDj")}</h2><p>{t("app.emptyDescription")}</p></div>
              <button className="primary-button" onClick={createDj} type="button"><Plus size={16} /> {t("sidebar.createDj")}</button>
            </section>
          )}
        </div>
      </main>

      <CreateDjDialog initialProfile={editingProfile} onClose={() => setDialogOpen(false)} onSave={saveDj} open={dialogOpen} saving={saving} />
    </div>
  );
}
