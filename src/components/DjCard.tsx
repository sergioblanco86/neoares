import { ArrowUpRight, AudioLines, Clock3, UsersRound } from "lucide-react";
import type { DjProfile } from "../shared/contracts";

type DjCardProps = {
  dj: DjProfile;
  selected: boolean;
  onSelect(dj: DjProfile): void;
};

export function DjCard({ dj, selected, onSelect }: DjCardProps) {
  return (
    <button className={`dj-card${selected ? " selected" : ""}`} onClick={() => onSelect(dj)} type="button">
      <div className="dj-card-heading">
        <span className="dj-avatar" aria-hidden="true">
          <AudioLines size={19} />
        </span>
        <ArrowUpRight className="card-arrow" size={18} aria-hidden="true" />
      </div>
      <div>
        <span className="eyebrow">DJ personal</span>
        <h3>{dj.name}</h3>
        <p>{dj.description}</p>
      </div>
      <div className="genre-row" aria-label="Géneros">
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
          <Clock3 size={14} /> {formatEra(dj)}
        </span>
        <span>
          <UsersRound size={14} /> {dj.seeds.artists.length ? `${dj.seeds.artists.length} artistas guía` : "Catálogo relacionado"}
        </span>
      </div>
    </button>
  );
}

function formatEra(dj: DjProfile): string {
  const era = dj.intent.era;
  if (!era) return "Todas las épocas";
  const years = era.startYear === era.endYear && era.startYear !== null
    ? String(era.startYear)
    : [era.startYear, era.endYear].filter((year) => year !== null).join("–");
  return [era.label, years].filter(Boolean).join(" · ") || "Todas las épocas";
}
