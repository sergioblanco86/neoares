import { ArrowUpRight, AudioLines, Clock3, UsersRound } from "lucide-react";
import type { DjProfile } from "../shared/contracts";
import { useI18n, type Translate } from "../i18n/i18n";

type DjCardProps = {
  dj: DjProfile;
  selected: boolean;
  onSelect(dj: DjProfile): void;
};

export function DjCard({ dj, selected, onSelect }: DjCardProps) {
  const { t } = useI18n();
  return (
    <button className={`dj-card${selected ? " selected" : ""}`} onClick={() => onSelect(dj)} type="button">
      <div className="dj-card-heading">
        <span className="dj-avatar" aria-hidden="true">
          <AudioLines size={19} />
        </span>
        <ArrowUpRight className="card-arrow" size={18} aria-hidden="true" />
      </div>
      <div>
        <span className="eyebrow">{t("sidebar.personalDj")}</span>
        <h3>{dj.name}</h3>
        <p>{dj.description}</p>
      </div>
      <div className="genre-row" aria-label={t("djCard.genres")}>
        {dj.intent.genres.slice(0, 3).map((genre) => (
          <span key={genre}>{genre}</span>
        ))}
      </div>
      {dj.seeds.artists.length ? (
        <div className="dj-card-guides" title={dj.seeds.artists.map(({ name }) => name).join(", ")}>
          {dj.seeds.artists.slice(0, 3).map(({ name }) => name).join(" · ")}
        </div>
      ) : null}
      <div className="dj-card-footer">
        <span>
          <Clock3 size={14} /> {formatEra(dj, t)}
        </span>
        <span>
          <UsersRound size={14} /> {dj.seeds.artists.length ? t("djCard.guideArtists", { count: dj.seeds.artists.length }) : t("djCard.relatedCatalog")}
        </span>
      </div>
    </button>
  );
}

function formatEra(dj: DjProfile, t: Translate): string {
  const era = dj.intent.era;
  if (!era) return t("djCard.allEras");
  const years = era.startYear === era.endYear && era.startYear !== null
    ? String(era.startYear)
    : [era.startYear, era.endYear].filter((year) => year !== null).join("–");
  return [era.label, years].filter(Boolean).join(" · ") || t("djCard.allEras");
}
