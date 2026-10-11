import { useMemo, useState } from "react";
import { Music2 } from "lucide-react";
import type { YouTubeSource } from "../shared/contracts";
import { getArtworkCandidates, type ArtworkCandidate, type ArtworkQuality } from "../domain/track-artwork";

type TrackArtworkProps = {
  className?: string;
  track: YouTubeSource;
  quality?: ArtworkQuality;
};

export function TrackArtwork({ className = "", track, quality = "thumbnail" }: TrackArtworkProps) {
  const candidates = useMemo(() => getArtworkCandidates(track.thumbnailUrl, quality), [track.thumbnailUrl, quality]);
  const classes = ["track-artwork", className].filter(Boolean).join(" ");
  return (
    <div aria-hidden="true" className={classes}>
      <ArtworkImage key={`${track.id}:${quality}:${track.thumbnailUrl}`} candidates={candidates} eager={quality === "cover"} />
    </div>
  );
}

function ArtworkImage({ candidates, eager }: { candidates: ArtworkCandidate[]; eager: boolean }) {
  const [index, setIndex] = useState(0);
  const candidate = candidates[index];
  return candidate ? (
    <img
      key={candidate.url}
      alt=""
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      onError={() => setIndex(index + 1)}
      onLoad={event => {
        // YouTube sometimes answers 200 with a 120px missing-image tile.
        if (candidate.minimumWidth && event.currentTarget.naturalWidth < candidate.minimumWidth) setIndex(index + 1);
      }}
      referrerPolicy="no-referrer"
      src={candidate.url}
    />
  ) : <Music2 size={18} />;
}
