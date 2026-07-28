import assert from "node:assert/strict";
import test from "node:test";
import {
  pairingCookieHeader,
  pairingTokenFromCookie,
  pairingTokenFromUrl,
} from "./pairing-cookie.server.js";

test("preserves the signed pairing token before the merchant enters a shop", () => {
  const token = "nexforia-pairing-v1.payload.signature";
  const requestUrl = new URL("https://nexforia-commerce.onrender.com/");
  requestUrl.searchParams.set("pairing_token", token);

  const header = pairingCookieHeader(pairingTokenFromUrl(requestUrl));

  assert.match(header, /^nexforia_pairing=/);
  assert.match(header, /HttpOnly/);
  assert.equal(pairingTokenFromCookie(header), token);
});

test("does not create an empty pairing cookie", () => {
  assert.equal(pairingCookieHeader(""), "");
  assert.equal(pairingTokenFromUrl("https://nexforia-commerce.onrender.com/"), "");
  assert.equal(pairingTokenFromCookie("another=value"), "");
});
