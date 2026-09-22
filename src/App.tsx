import { useEffect, useMemo, useState } from "react";
import { AudioLines, CircleAlert, PanelLeftOpen, Plus, Sparkles } from "lucide-react";
import { AutonomousDjPanel } from "./components/AutonomousDjPanel";
import { ConnectivityGate } from "./components/ConnectivityGate";
import { CreateDjDialog } from "./components/CreateDjDialog";
import { Sidebar } from "./components/Sidebar";
import { useConnectivity } from "./hooks/use-connectivity";
import type { DjProfile } from "./shared/contracts";

type LoadState = "LOADING" | "READY" | "ERROR";

export function App() {
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
      setDjs(stored);
      setSelectedId(stored[0]?.id ?? null);
      setLoadState("READY");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los DJs");
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
      setDialogOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el DJ");
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
    const confirmed = window.confirm(`¿Eliminar el DJ “${profile.name}”?\n\nEsta acción no se puede deshacer.`);
    if (!confirmed) return;
    setError(null);
    try {
      if (window.desktop) await window.desktop.djs.delete(profile.id);
      const remaining = djs.filter(({ id }) => id !== profile.id);
      setDjs(remaining);
      if (selectedId === profile.id) setSelectedId(remaining[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el DJ");
    }
  }

  if (connectivity.state !== "ONLINE") {
    return <ConnectivityGate checking={connectivity.checking} onRetry={connectivity.retry} />;
  }

  return (
    <div className={`app-shell${sidebarOpen ? " sidebar-open" : " sidebar-closed"}`}>
      {sidebarOpen ? <button aria-label="Cerrar sidebar" className="sidebar-scrim" onClick={() => setSidebarOpen(false)} type="button" /> : null}
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
        }}
        selectedId={selectedDj?.id ?? null}
      />

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-leading">
            {!sidebarOpen ? <button aria-label="Mostrar DJs" className="icon-button sidebar-open-button" onClick={() => setSidebarOpen(true)} title="Mostrar DJs" type="button"><PanelLeftOpen size={18} /></button> : null}
            <div className="topbar-context"><span className="eyebrow">NeoAres</span><strong>{selectedDj ? `DJ activo: ${selectedDj.name}` : "Crea tu primer DJ"}</strong></div>
          </div>
        </header>

        <div className="page-content">
          {error ? <div className="alert error" role="alert"><CircleAlert size={18} /><div><strong>Necesita atención</strong><span>{error}</span></div></div> : null}

          <section className="hero compact-hero">
            <div><span className="eyebrow">Cabina privada</span><h1>Elige el ambiente. El DJ hace el resto.</h1><p>Inicia una sesión y NeoAres buscará, seleccionará, preparará y mezclará la música automáticamente.</p></div>
            <div className="hero-status"><span><Sparkles size={15} /> Curaduría dinámica</span></div>
          </section>

          {selectedDj ? <AutonomousDjPanel dj={selectedDj} key={selectedDj.id} /> : (
            <section className="panel empty-dj-state">
              <AudioLines size={28} />
              <div><span className="eyebrow">Tu cabina</span><h2>Crea tu primer DJ</h2><p>Define los géneros, artistas y la era. NeoAres se encargará de construir la sesión.</p></div>
              <button className="primary-button" onClick={createDj} type="button"><Plus size={16} /> Crear DJ</button>
            </section>
          )}
        </div>
      </main>

      <CreateDjDialog initialProfile={editingProfile} onClose={() => setDialogOpen(false)} onSave={saveDj} open={dialogOpen} saving={saving} />
    </div>
  );
}
