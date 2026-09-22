const CONNECTIVITY_ENDPOINT = "https://www.youtube.com/generate_204";
const CONNECTIVITY_TIMEOUT_MS = 5_000;

export async function hasInternetConnection(request: typeof fetch = fetch): Promise<boolean> {
  try {
    await request(CONNECTIVITY_ENDPOINT, {
      cache: "no-store",
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(CONNECTIVITY_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}
