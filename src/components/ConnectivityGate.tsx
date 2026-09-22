import { LoaderCircle, RefreshCw, WifiOff } from "lucide-react";
import neoAresIcon from "../../logos/icon.png";

type ConnectivityGateProps = {
  checking: boolean;
  onRetry(): Promise<boolean>;
};

export function ConnectivityGate({ checking, onRetry }: ConnectivityGateProps) {
  return (
    <main className="connectivity-screen" aria-busy={checking} aria-live="assertive">
      <section className="connectivity-card" role="alert">
        <div className="connectivity-brand"><img alt="" src={neoAresIcon} /><strong>NeoAres</strong></div>
        <div className="connectivity-icon offline" aria-hidden="true"><WifiOff size={26} /></div>
        <div className="connectivity-copy">
          <span className="eyebrow">Estado de conexión</span>
          <h1>Sin conexión a internet</h1>
          <p>NeoAres necesita internet para buscar, preparar y reproducir música. Se habilitará automáticamente cuando vuelva la conexión.</p>
        </div>
        <button className="primary-button" disabled={checking} onClick={() => void onRetry()} type="button">
          {checking ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
          {checking ? "Comprobando…" : "Reintentar"}
        </button>
        <span className="connectivity-note">Tus DJs guardados permanecen seguros.</span>
      </section>
    </main>
  );
}
