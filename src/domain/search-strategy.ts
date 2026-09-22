import type { DjProfile, YouTubeSource } from "../shared/contracts";

export type DjSearchPlan = {
  queries: string[];
  artistNames: string[];
  excludedTerms: string[];
};

export type MusicAssessment = {
  allowed: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  contentType: "MUSIC" | "LIVE_MUSIC" | "SPOKEN_CONTENT" | "UNKNOWN";
  positiveReasons: string[];
  negativeReasons: string[];
  assessmentVersion: "music-title-v1";
};

const SPOKEN_CONTENT_TERMS = [
  "interview", "entrevista", "documentary", "documental", "biography", "biografia",
  "podcast", "press conference", "conferencia de prensa", "behind the scenes",
  "making of", "reaction", "reaccion", "review", "resena", "historia de",
  "the story of", "explained", "explicado", "analysis", "analisis", "tutorial",
  "news", "noticias", "record update", "album update", "preguntas y respuestas", "q and a",
];

const MUSIC_EVIDENCE_TERMS = [
  "official audio", "audio oficial", "official video", "video oficial", "official music video",
  "music video", "lyric video", "lyrics", "letra", "studio recording", "full song",
];

const GENRE_ARTISTS: Record<string, string[]> = {
  "pop": ["Britney Spears", "Christina Aguilera", "Backstreet Boys", "NSYNC", "TLC", "Destiny's Child", "Robbie Williams", "Pink", "Avril Lavigne", "Shakira", "Jennifer Lopez", "Nelly Furtado", "Justin Timberlake", "Kelly Clarkson", "Alicia Keys", "Usher"],
  "punk": ["Ramones", "The Clash", "Sex Pistols", "Dead Kennedys", "Misfits", "Buzzcocks", "The Damned", "The Stooges", "Patti Smith", "Television", "X-Ray Spex", "The Saints"],
  "punk rock": ["Bad Religion", "Rancid", "NOFX", "The Offspring", "Pennywise", "Millencolin", "Lagwagon", "Descendents", "Social Distortion", "Anti-Flag", "The Bouncing Souls", "Strung Out"],
  "pop punk": ["Green Day", "Blink-182", "Sum 41", "New Found Glory", "Simple Plan", "Good Charlotte", "Yellowcard", "The Ataris", "MxPx", "Motion City Soundtrack", "All Time Low", "Paramore"],
  "ska": ["The Specials", "Ska-P", "Madness", "Desorden Público", "Los Fabulosos Cadillacs", "Inspector", "Panteón Rococó", "Reel Big Fish", "Less Than Jake", "The Mighty Mighty Bosstones", "Toots and the Maytals", "The Skatalites"],
  "hardcore": ["Minor Threat", "Agnostic Front", "Black Flag", "Sick of It All", "Cro-Mags", "Gorilla Biscuits", "Youth of Today", "Madball", "Terror", "Hatebreed", "Comeback Kid", "Strife"],
  "hardcore punk": ["Minor Threat", "Black Flag", "Bad Brains", "Agnostic Front", "Circle Jerks", "D.O.A.", "GBH", "Discharge", "Suicidal Tendencies", "Fugazi", "Refused", "Poison Idea"],
  "post hardcore": ["At the Drive-In", "Thursday", "Thrice", "Glassjaw", "Alexisonfire", "Underoath", "Silverstein", "Finch", "Saosin", "The Used", "Senses Fail", "Funeral for a Friend"],
  "emo": ["Jimmy Eat World", "Taking Back Sunday", "Dashboard Confessional", "My Chemical Romance", "Brand New", "The Get Up Kids", "Saves the Day", "Sunny Day Real Estate", "Fall Out Boy", "Thursday", "Paramore", "The Used"],
  "nu metal": ["Linkin Park", "Korn", "Limp Bizkit", "Deftones", "System of a Down", "Slipknot", "Papa Roach", "P.O.D.", "Mudvayne", "Disturbed", "Static-X", "Incubus"],
  "alternative rock": ["Foo Fighters", "The Smashing Pumpkins", "Radiohead", "Muse", "Placebo", "Garbage", "Weezer", "The White Stripes", "Queens of the Stone Age", "The Strokes", "Franz Ferdinand", "The Killers"],
  "rock": ["Foo Fighters", "Red Hot Chili Peppers", "Evanescence", "Nickelback", "Creed", "3 Doors Down", "The Calling", "Matchbox Twenty", "Bon Jovi", "Audioslave", "The White Stripes", "The Killers", "Muse", "Incubus", "Green Day", "Linkin Park"],
  "rock alternativo": ["Café Tacvba", "Aterciopelados", "Los Tres", "Babasónicos", "Zoé", "La Ley", "Molotov", "Divididos", "Catupecu Machu", "Los Bunkers", "El Otro Yo", "Kinky"],
  "rock en espanol": ["Soda Stereo", "Aterciopelados", "Héroes del Silencio", "Caifanes", "Enanitos Verdes", "Los Prisioneros", "Fito Páez", "Andrés Calamaro", "Maná", "Miguel Mateos", "Los Rodríguez", "La Unión"],
  "reggaeton": ["Daddy Yankee", "Don Omar", "Wisin y Yandel", "Tego Calderón", "Ivy Queen", "Héctor el Father", "Zion y Lennox", "Plan B", "Calle 13", "J Balvin", "Bad Bunny", "Karol G"],
  "salsa": ["Joe Arroyo", "Grupo Niche", "Héctor Lavoe", "Willie Colón", "Celia Cruz", "Rubén Blades", "El Gran Combo", "Fruko y sus Tesos", "Oscar D'León", "Ismael Rivera", "La Sonora Ponceña", "Richie Ray y Bobby Cruz"],
  "vallenato": ["Diomedes Díaz", "Jorge Oñate", "Binomio de Oro", "Los Betos", "Rafael Orozco", "Los Diablitos", "Silvestre Dangond", "Peter Manjarrés", "Iván Villazón", "Poncho Zuleta", "Carlos Vives", "Jean Carlos Centeno"],
};

const GENRE_EXCLUSIONS: Record<string, string[]> = {
  "punk": ["daft punk", "cyberpunk", "steampunk", "punk'd", "edm", "techno", "house music", "phonk"],
  "punk rock": ["daft punk", "cyberpunk", "steampunk", "punk'd", "edm", "techno", "house music", "phonk"],
  "hardcore": ["hardcore techno", "hardstyle", "gabber", "edm"],
  "hardcore punk": ["hardcore techno", "hardstyle", "gabber", "edm"],
};

const MODIFIERS = ["official audio song", "official video", "studio recording", "full song"];

export function buildDjSearchPlan(dj: DjProfile, round: number): DjSearchPlan {
  const normalizedGenres = dj.intent.genres.map(normalizeSearchText);
  const explicitArtists = dj.seeds.artists.map(({ name }) => name).filter(Boolean);
  const mappedGroups = normalizedGenres.flatMap((genre) => GENRE_ARTISTS[genre] ? [GENRE_ARTISTS[genre]] : []);
  const mappedArtists = interleave(mappedGroups);
  const artistNames = unique([...explicitArtists, ...mappedArtists]);
  const modifier = MODIFIERS[round % MODIFIERS.length];
  const normalizedExplicitArtists = explicitArtists.map(normalizeSearchText);
  const relatedArtists = mappedArtists.filter((artist) => {
    const normalizedArtist = normalizeSearchText(artist);
    return !normalizedExplicitArtists.some((explicitArtist) => isLikelySameArtist(explicitArtist, normalizedArtist));
  });
  const explicitBatchSize = Math.min(4, explicitArtists.length);
  const explicitBatch = rotate(explicitArtists, round * Math.max(1, explicitBatchSize)).slice(0, explicitBatchSize);
  const relatedBatch = rotate(relatedArtists, round * 5).slice(0, Math.max(0, 5 - explicitBatch.length));
  const queryArtists = unique([...explicitBatch, ...relatedBatch, ...rotate(explicitArtists, round * 5)]).slice(0, 5);
  const eraQuery = buildEraQuery(dj, round);

  const queries = queryArtists.length
    ? queryArtists.map((artist) => `"${artist}" ${eraQuery} ${modifier}`.replace(/\s+/g, " ").trim())
    : dj.intent.genres.slice(0, 5).map((genre) => `"${genre}" ${eraQuery} ${modifier} -mix -playlist`.replace(/\s+/g, " ").trim());

  const genreExclusions = normalizedGenres.flatMap((genre) => GENRE_EXCLUSIONS[genre] ?? []);
  return {
    queries,
    artistNames,
    excludedTerms: unique([...dj.exclusions.artists, ...dj.exclusions.terms, ...genreExclusions, "mix", "playlist", "full album", "álbum completo", "album completo", "reaction", "reacción", "tutorial"]),
  };
}

export function isSearchCandidateAllowed(dj: DjProfile, source: YouTubeSource, plan: DjSearchPlan): boolean {
  const normalizedTitle = normalizeSearchText(source.title);
  const normalizedCreator = normalizeSearchText(source.creator);
  const searchable = `${normalizedTitle} ${normalizedCreator}`;
  const validDuration = source.durationSeconds >= dj.curation.minDurationSeconds
    && source.durationSeconds <= dj.curation.maxDurationSeconds;
  if (!validDuration) return false;
  if (plan.excludedTerms.some((term) => searchable.includes(normalizeSearchText(term)))) return false;
  if (!assessMusicCandidate(source).allowed) return false;

  if (plan.artistNames.length > 0) {
    return findCandidateArtist(source, plan) !== null;
  }
  return true;
}

export function assessMusicCandidate(source: YouTubeSource): MusicAssessment {
  const title = normalizeSearchText(source.title);
  const creator = normalizeSearchText(source.creator);
  const searchable = `${title} ${creator}`;
  const negativeReasons = SPOKEN_CONTENT_TERMS
    .filter((term) => containsPhrase(searchable, normalizeSearchText(term)))
    .map((term) => `spoken-term:${normalizeSearchText(term)}`);
  if (negativeReasons.length > 0) {
    return {
      allowed: false,
      confidence: "LOW",
      contentType: "SPOKEN_CONTENT",
      positiveReasons: [],
      negativeReasons,
      assessmentVersion: "music-title-v1",
    };
  }

  const positiveReasons: string[] = [];
  for (const term of MUSIC_EVIDENCE_TERMS) {
    if (containsPhrase(searchable, normalizeSearchText(term))) positiveReasons.push(`music-term:${normalizeSearchText(term)}`);
  }
  if (/\s[-–—:]\s/.test(source.title)) positiveReasons.push("artist-title-pattern");
  if (/\btopic\b/.test(creator)) positiveReasons.push("topic-channel");
  if (containsPhrase(title, "live") || containsPhrase(title, "en vivo")) {
    return {
      allowed: true,
      confidence: positiveReasons.length > 0 ? "HIGH" : "MEDIUM",
      contentType: "LIVE_MUSIC",
      positiveReasons,
      negativeReasons: [],
      assessmentVersion: "music-title-v1",
    };
  }
  return {
    allowed: true,
    confidence: positiveReasons.length > 0 ? "HIGH" : "MEDIUM",
    contentType: positiveReasons.length > 0 ? "MUSIC" : "UNKNOWN",
    positiveReasons,
    negativeReasons: [],
    assessmentVersion: "music-title-v1",
  };
}

export function findCandidateArtist(source: YouTubeSource, plan: DjSearchPlan): string | null {
  const normalizedTitle = normalizeSearchText(source.title);
  const normalizedCreator = normalizeSearchText(source.creator);
  const titleLead = extractTitleArtist(source.title);
  return plan.artistNames.find((artist) => {
    const normalizedArtist = normalizeSearchText(artist);
    return normalizedCreator.includes(normalizedArtist)
      || normalizedArtist.includes(normalizedCreator)
      || isLikelySameArtist(normalizedArtist, normalizedCreator)
      || (titleLead !== null && isLikelySameArtist(normalizedArtist, titleLead))
      || normalizedTitle.startsWith(`${normalizedArtist} `);
  }) ?? null;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function interleave(groups: string[][]): string[] {
  const output: string[] = [];
  const maxLength = Math.max(0, ...groups.map(({ length }) => length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      if (group[index]) output.push(group[index]);
    }
  }
  return output;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function rotate<T>(values: T[], offset: number): T[] {
  if (values.length === 0) return [];
  const normalizedOffset = offset % values.length;
  return [...values.slice(normalizedOffset), ...values.slice(0, normalizedOffset)];
}

function buildEraQuery(dj: DjProfile, round: number): string {
  const era = dj.intent.era;
  if (!era) return "";
  const years = [era.startYear, era.endYear].filter((year): year is number => year !== null);
  let selectedYear = "";
  if (years.length === 1) selectedYear = String(years[0]);
  if (era.startYear !== null && era.endYear !== null) {
    const span = Math.max(1, era.endYear - era.startYear + 1);
    selectedYear = String(era.startYear + (round % span));
  }
  return [era.label, selectedYear].filter(Boolean).join(" ");
}

function extractTitleArtist(title: string): string | null {
  const match = title.match(/^(.+?)(?:\s+[-–—]\s+|:\s+)/);
  return match ? normalizeSearchText(match[1]) : null;
}

function isLikelySameArtist(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5) return false;
  if (left[0] !== right[0]) return false;
  return jaroWinkler(left, right) >= 0.84;
}

function containsPhrase(searchable: string, phrase: string): boolean {
  return ` ${searchable} `.includes(` ${phrase} `);
}

function jaroWinkler(left: string, right: string): number {
  if (left === right) return 1;
  const matchDistance = Math.max(0, Math.floor(Math.max(left.length, right.length) / 2) - 1);
  const leftMatches = new Array<boolean>(left.length).fill(false);
  const rightMatches = new Array<boolean>(right.length).fill(false);
  let matches = 0;

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const start = Math.max(0, leftIndex - matchDistance);
    const end = Math.min(right.length, leftIndex + matchDistance + 1);
    for (let rightIndex = start; rightIndex < end; rightIndex += 1) {
      if (rightMatches[rightIndex] || left[leftIndex] !== right[rightIndex]) continue;
      leftMatches[leftIndex] = true;
      rightMatches[rightIndex] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0;
  const leftMatched = left.split("").filter((_, index) => leftMatches[index]);
  const rightMatched = right.split("").filter((_, index) => rightMatches[index]);
  const transpositions = leftMatched.filter((character, index) => character !== rightMatched[index]).length / 2;
  const jaro = (matches / left.length + matches / right.length + (matches - transpositions) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && left[prefix] === right[prefix]) prefix += 1;
  return jaro + prefix * 0.1 * (1 - jaro);
}
