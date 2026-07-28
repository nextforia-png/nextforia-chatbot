const PAIRING_COOKIE = "nexforia_pairing";
const PAIRING_TTL_SECONDS = 15 * 60;

export function pairingTokenFromUrl(urlValue) {
  const url = urlValue instanceof URL ? urlValue : new URL(urlValue);
  return String(url.searchParams.get("pairing_token") || "").trim();
}

export function pairingCookieHeader(token) {
  const clean = String(token || "").trim();
  if (!clean) return "";
  return [
    `${PAIRING_COOKIE}=`,
    encodeURIComponent(clean),
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=",
    String(PAIRING_TTL_SECONDS),
  ].join("");
}

export function pairingTokenFromCookie(cookieHeader) {
  const match = String(cookieHeader || "").match(
    new RegExp(`(?:^|;\\s*)${PAIRING_COOKIE}=([^;]+)`),
  );
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}
