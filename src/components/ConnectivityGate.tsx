import { LoaderCircle, RefreshCw, WifiOff } from "lucide-react";
import neoAresIcon from "../../logos/newIconLogo.png";
import { useI18n } from "../i18n/i18n";
import { LanguageSelector } from "./LanguageSelector";

type ConnectivityGateProps = {
  checking: boolean;
  onRetry(): Promise<boolean>;
};

export function ConnectivityGate({ checking, onRetry }: ConnectivityGateProps) {
  const { t } = useI18n();
  return (
    <main className="connectivity-screen" aria-busy={checking} aria-live="assertive">
      <LanguageSelector placement="connectivity" />
      <section className="connectivity-card" role="alert">
        <div className="connectivity-brand"><img alt="" src={neoAresIcon} /><strong>NeoAres</strong></div>
        <div className="connectivity-icon offline" aria-hidden="true"><WifiOff size={26} /></div>
        <div className="connectivity-copy">
          <span className="eyebrow">{t("connectivity.status")}</span>
          <h1>{t("connectivity.title")}</h1>
          <p>{t("connectivity.description")}</p>
        </div>
        <button className="primary-button" disabled={checking} onClick={() => void onRetry()} type="button">
          {checking ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
          {checking ? t("connectivity.checking") : t("common.retry")}
        </button>
        <span className="connectivity-note">{t("connectivity.safeData")}</span>
      </section>
    </main>
  );
}
