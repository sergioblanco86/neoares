import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { createDefaultDj } from "../domain/default-djs";
import { useI18n } from "../i18n/i18n";
import type { DjProfile } from "../shared/contracts";

type CreateDjDialogProps = {
  initialProfile: DjProfile | null;
  open: boolean;
  saving: boolean;
  onClose(): void;
  onSave(profile: DjProfile): Promise<void>;
};

export function CreateDjDialog({ initialProfile, open, saving, onClose, onSave }: CreateDjDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genres, setGenres] = useState("");
  const [artists, setArtists] = useState("");
  const [eraLabel, setEraLabel] = useState("");
  const [startYear, setStartYear] = useState("");
  const [endYear, setEndYear] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialProfile?.name ?? "");
    setDescription(initialProfile?.description ?? "");
    setGenres(initialProfile?.intent.genres.join(", ") ?? "");
    setArtists(initialProfile?.seeds.artists.map(({ name: artistName }) => artistName).join(", ") ?? "");
    setEraLabel(initialProfile?.intent.era?.label ?? "");
    setStartYear(initialProfile?.intent.era?.startYear?.toString() ?? "");
    setEndYear(initialProfile?.intent.era?.endYear?.toString() ?? "");
    setFormError(null);
  }, [initialProfile, open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const genreList = splitList(genres);
    const artistList = splitList(artists);
    const parsedStartYear = parseYear(startYear);
    const parsedEndYear = parseYear(endYear);

    if (parsedStartYear !== null && parsedEndYear !== null && parsedStartYear > parsedEndYear) {
      setFormError(t("djEditor.yearError"));
      return;
    }

    const era = eraLabel.trim() || parsedStartYear !== null || parsedEndYear !== null
      ? { label: eraLabel.trim(), startYear: parsedStartYear, endYear: parsedEndYear }
      : undefined;
    const timestamp = new Date().toISOString();
    const editedIntent = initialProfile ? {
      ...initialProfile.intent,
      prompt: description.trim(),
      genres: genreList,
    } : null;
    if (editedIntent) {
      if (era) editedIntent.era = era;
      else delete editedIntent.era;
    }

    const profile = initialProfile
      ? {
          ...initialProfile,
          revision: initialProfile.revision + 1,
          name: name.trim(),
          description: description.trim(),
          updatedAt: timestamp,
          intent: editedIntent!,
          seeds: {
            ...initialProfile.seeds,
            artists: artistList.map((artistName) => ({ name: artistName, youtubeChannelId: null })),
            searchTerms: genreList,
          },
        } satisfies DjProfile
      : createDefaultDj({
          name: name.trim(),
          description: description.trim(),
          prompt: description.trim(),
          genres: genreList,
          artists: artistList,
          era,
        });

    await onSave({ ...profile, createdAt: initialProfile?.createdAt ?? timestamp, updatedAt: timestamp });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-labelledby="create-dj-title" aria-modal="true" className="dialog dj-editor-dialog" role="dialog">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{initialProfile ? t("djEditor.editEyebrow") : t("djEditor.newEyebrow")}</span>
            <h2 id="create-dj-title">{initialProfile ? t("djEditor.editTitle") : t("djEditor.createTitle")}</h2>
          </div>
          <button aria-label={t("common.close")} className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <div className="dj-form-grid">
            <label>
              {t("djEditor.name")}
              <input autoFocus maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="DJ MTV 2000" required value={name} />
            </label>
            <label>
              {t("djEditor.genres")}
              <input onChange={(event) => setGenres(event.target.value)} placeholder={t("djEditor.genresPlaceholder")} required value={genres} />
              <small>{t("djEditor.commaSeparated")}</small>
            </label>
          </div>

          <label>
            {t("djEditor.intent")}
            <textarea maxLength={1200} onChange={(event) => setDescription(event.target.value)} placeholder={t("djEditor.intentPlaceholder")} required rows={3} value={description} />
          </label>

          <label>
            {t("djEditor.artists")}
            <input onChange={(event) => setArtists(event.target.value)} placeholder="Blink-182, Linkin Park, Sum 41, The Offspring" value={artists} />
            <small>{t("djEditor.artistsHint")}</small>
          </label>

          <fieldset className="era-fieldset">
            <legend>{t("djEditor.era")}</legend>
            <div className="era-fields">
              <label>
                {t("djEditor.context")}
                <input maxLength={100} onChange={(event) => setEraLabel(event.target.value)} placeholder={t("djEditor.contextPlaceholder")} value={eraLabel} />
              </label>
              <label>
                {t("djEditor.from")}
                <input inputMode="numeric" max={2100} min={1900} onChange={(event) => setStartYear(event.target.value)} placeholder="1999" type="number" value={startYear} />
              </label>
              <label>
                {t("djEditor.to")}
                <input inputMode="numeric" max={2100} min={1900} onChange={(event) => setEndYear(event.target.value)} placeholder="2006" type="number" value={endYear} />
              </label>
            </div>
            <small>{t("djEditor.eraHint")}</small>
          </fieldset>

          {formError ? <div className="form-error" role="alert">{formError}</div> : null}

          <div className="dialog-actions">
            <button className="ghost-button" onClick={onClose} type="button">{t("common.cancel")}</button>
            <button className="primary-button" disabled={saving} type="submit">{saving ? t("djEditor.saving") : initialProfile ? t("djEditor.saveChanges") : t("djEditor.create")}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function splitList(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function parseYear(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}
