import { useEffect, useState } from "react";
import { Music2 } from "lucide-react";
import type { YouTubeSource } from "../shared/contracts";

type TrackArtworkProps = {
  className?: string;
  track: YouTubeSource;
};

export function TrackArtwork({ className = "", track }: TrackArtworkProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [track.id, track.thumbnailUrl]);

  const classes = ["track-artwork", className].filter(Boolean).join(" ");
  return (
    <div aria-hidden="true" className={classes}>
      {track.thumbnailUrl && !failed ? (
        <img
          alt=""
          decoding="async"
          loading="lazy"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
          src={track.thumbnailUrl}
        />
      ) : <Music2 size={18} />}
    </div>
  );
}
