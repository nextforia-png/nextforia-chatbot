import assert from "node:assert/strict";
import test from "node:test";
import {
  createPairingToken,
  verifyPairingToken,
} from "./pairing.server.js";

const secret = "test-secret-with-enough-length";

test("pairing token verifies tenant and bot identity", () => {
  const token = createPairingToken(
    {
      tenant_id: "rav-toys",
      bot_id: "sales-bot",
      nonce: "nonce-123",
      shop: "rav-toys.myshopify.com",
    },
    { secret },
  );

  const verified = verifyPairingToken(token, { secret });
  assert.equal(verified.tenantId, "rav-toys");
  assert.equal(verified.botId, "sales-bot");
  assert.equal(verified.nonce, "nonce-123");
  assert.equal(verified.shop, "rav-toys.myshopify.com");
});

test("pairing token rejects tampering and long lived codes", () => {
  const token = createPairingToken(
    {
      tenant_id: "rav-toys",
      bot_id: "sales-bot",
      nonce: "nonce-123",
    },
    { secret },
  );

  assert.throws(
    () => verifyPairingToken(`${token}x`, { secret }),
    /invalid_pairing_signature/,
  );

  const now = Math.floor(Date.now() / 1000);
  const longLivedToken = createPairingToken(
    {
      tenant_id: "rav-toys",
      bot_id: "sales-bot",
      nonce: "nonce-123",
      iat: now,
      exp: now + 60 * 60,
    },
    { secret },
  );
  assert.throws(
    () => verifyPairingToken(longLivedToken, { secret }),
    /pairing_token_too_long_lived/,
  );
});
