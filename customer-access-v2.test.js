"use strict";

const assert = require("assert");
const {
  CustomerAccessError,
  InMemoryCustomerAccessStore,
  SupabaseCustomerAccessStore,
  createCustomerAccessService,
  createMemoryEmailSender,
  createResendEmailSender,
  hashInvitationToken
} = require("./customer-access-v2");

async function expectError(promise, code, status) {
  try {
    await promise;
    assert.fail("expected " + code);
  } catch (error) {
    assert(error instanceof CustomerAccessError);
    assert.strictEqual(error.code, code);
    assert.strictEqual(error.status, status);
  }
}

(async function () {
  let clock = new Date("2026-07-21T12:00:00.000Z");
  const store = new InMemoryCustomerAccessStore();
  const email = createMemoryEmailSender();
  const service = createCustomerAccessService({
    store: store,
    emailSender: email,
    baseUrl: "https://customer-panel.staging.example",
    fallbackBaseUrls: ["https://customer-panel-staging.onrender.com", "https://customer-panel.staging.example"],
    inviteTtlHours: 24,
    now: function () { return new Date(clock); }
  });

  const created = await service.createInvitation({
    company_name: "Empresa A",
    admin_email: " Admin@Empresa.Example ",
    plan_id: "growth",
    assigned_bot_id: "atencion-cliente"
  }, { user_id: "platform-user-1", role: "super_admin" });

  assert.strictEqual(created.membership.email, "admin@empresa.example");
  assert.strictEqual(created.membership.status, "pending");
  assert.strictEqual(created.invitation.status, "sent");
  assert.strictEqual(email.outbox.length, 1);
  assert.strictEqual(email.outbox[0].to, "admin@empresa.example");
  assert(email.outbox[0].setup_url.startsWith("https://customer-panel.staging.example/admin/setup/" + created.tenant.id + "?invite="));
  assert.strictEqual(email.outbox[0].fallback_setup_urls.length, 1);
  assert(email.outbox[0].fallback_setup_urls[0].startsWith("https://customer-panel-staging.onrender.com/admin/setup/" + created.tenant.id + "?invite="));
  assert.strictEqual(new URL(email.outbox[0].fallback_setup_urls[0]).searchParams.get("invite"), new URL(email.outbox[0].setup_url).searchParams.get("invite"));
  assert.strictEqual("setup_url" in created, false, "API response must not expose the invitation URL");
  assert.strictEqual("token" in created.invitation, false, "API response must not expose the invitation token");
  const token = new URL(email.outbox[0].setup_url).searchParams.get("invite");
  assert.strictEqual(token.length, 43);
  assert.notStrictEqual(store.invitations[0].token_hash, token);
  assert.strictEqual(store.invitations[0].token_hash, hashInvitationToken(token));

  await expectError(service.createInvitation({ company_name: "Empresa B", admin_email: "admin@empresa.example", plan_id: "growth", assigned_bot_id: "atencion-cliente" }, { user_id: "platform-user-1" }), "customer_already_exists", 409);
  await expectError(service.createInvitation({ company_name: "Empresa B", admin_email: "b@empresa.example", plan_id: "missing", assigned_bot_id: "atencion-cliente" }, { user_id: "platform-user-1" }), "invalid_plan", 400);
  await expectError(service.createInvitation({ company_name: "Empresa B", admin_email: "b@empresa.example", plan_id: "growth", assigned_bot_id: "missing" }, { user_id: "platform-user-1" }), "invalid_assigned_bot", 400);
  await expectError(service.createInvitation({ company_name: "Empresa B", admin_email: "b@empresa.example", plan_id: "growth", assigned_bot_id: "atencion-cliente", extra: true }, { user_id: "platform-user-1" }), "invalid_request", 400);

  await expectError(service.inspectInvitation("otro-tenant", token), "invalid_invitation", 403);
  await expectError(service.inspectInvitation(created.tenant.id, token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")), "invalid_invitation", 403);
  const inspected = await service.inspectInvitation(created.tenant.id, token);
  assert.strictEqual(inspected.email, "admin@empresa.example");

  const activation = {
    tenant_id: created.tenant.id,
    token: token,
    password: "SecurePassword2026",
    password_confirmation: "SecurePassword2026"
  };
  const concurrent = await Promise.allSettled([
    service.consumeInvitation(activation),
    service.consumeInvitation(activation)
  ]);
  assert.strictEqual(concurrent.filter(function (result) { return result.status === "fulfilled"; }).length, 1, "token must be consumed atomically once");
  assert.strictEqual(concurrent.filter(function (result) { return result.status === "rejected" && result.reason.code === "invitation_already_used"; }).length, 1);
  const user = concurrent.find(function (result) { return result.status === "fulfilled"; }).value;
  assert.strictEqual(user.email, "admin@empresa.example");
  assert.strictEqual(user.tenant_id, created.tenant.id);
  const authenticated = await service.authenticate("ADMIN@EMPRESA.EXAMPLE", "SecurePassword2026");
  assert(authenticated);
  assert.strictEqual(authenticated.user_id, user.user_id);
  assert.strictEqual(authenticated.company_name, "Empresa A");
  assert.strictEqual(authenticated.plan_id, "growth");
  assert.strictEqual(authenticated.assigned_bot_id, "atencion-cliente");
  assert.strictEqual(await service.authenticate("admin@empresa.example", "wrong-password"), null);
  const validSession = await service.validateSession({
    user_id: user.user_id,
    email: "ADMIN@EMPRESA.EXAMPLE",
    role: "admin",
    tenant_id: created.tenant.id
  });
  assert(validSession);
  assert.strictEqual(validSession.company_name, "Empresa A");
  assert.strictEqual(validSession.plan_id, "growth");
  assert.strictEqual(validSession.assigned_bot_id, "atencion-cliente");
  assert.strictEqual(await service.validateSession({ user_id: user.user_id, email: user.email, role: "admin", tenant_id: "otro-tenant" }), null);
  store.users.find(function (row) { return row.user_id === user.user_id; }).active = false;
  assert.strictEqual(await service.validateSession({ user_id: user.user_id, email: user.email, role: "admin", tenant_id: created.tenant.id }), null);
  store.users.find(function (row) { return row.user_id === user.user_id; }).active = true;

  const revoked = await service.createInvitation({ company_name: "Empresa C", admin_email: "c@empresa.example", plan_id: "starter", assigned_bot_id: "agendamiento" }, { user_id: "platform-user-1" });
  const revokedToken = new URL(email.outbox[1].setup_url).searchParams.get("invite");
  await service.revokeInvitation(revoked.invitation.id, { user_id: "platform-user-1" });
  await expectError(service.inspectInvitation(revoked.tenant.id, revokedToken), "invitation_revoked", 409);

  const expiring = await service.createInvitation({ company_name: "Empresa D", admin_email: "d@empresa.example", plan_id: "scale", assigned_bot_id: "commerce" }, { user_id: "platform-user-1" });
  const expiringToken = new URL(email.outbox[2].setup_url).searchParams.get("invite");
  clock = new Date("2026-07-22T12:00:01.000Z");
  await expectError(service.inspectInvitation(expiring.tenant.id, expiringToken), "invitation_expired", 410);

  const listed = await service.listInvitations();
  assert.strictEqual(listed.find(function (row) { return row.id === revoked.invitation.id; }).status, "revoked");
  assert.strictEqual(listed.find(function (row) { return row.id === expiring.invitation.id; }).status, "expired");
  assert(!JSON.stringify(listed).includes(token));
  assert(!JSON.stringify(store.audit).includes(token));
  assert(!JSON.stringify(store.audit).includes("SecurePassword2026"));
  assert(!JSON.stringify(store.audit).includes(store.invitations[0].token_hash));

  const supabaseStore = new SupabaseCustomerAccessStore({
    url: "https://staging-project.supabase.co",
    headers: { Authorization: "Bearer staging-service-role" },
    axiosClient: {
      post: async function (url, payload) {
        assert(url.endsWith("/rpc/platform_active_tenant_user_by_email_v2"));
        assert.strictEqual(payload.p_email, "admin@tenant-a.example");
        return { data: [{ user_id: "user-a", tenant_id: "tenant-a", email_normalized: "admin@tenant-a.example", role: "admin", active: true, password_hash: "hash", password_salt: "salt" }] };
      },
      get: async function (url, config) {
        assert(url.endsWith("/rest/v1/tenants"));
        assert.strictEqual(config.params.id, "eq.tenant-a");
        return { data: [{ id: "tenant-a", company_name: "Tenant A", plan_id: "scale", assigned_bot_id: "agendamiento", status: "live" }] };
      }
    }
  });
  const persistedContext = await supabaseStore.activeUserByEmail("ADMIN@TENANT-A.EXAMPLE");
  assert.strictEqual(persistedContext.company_name, "Tenant A");
  assert.strictEqual(persistedContext.plan_id, "scale");
  assert.strictEqual(persistedContext.assigned_bot_id, "agendamiento");

  const failedStore = new InMemoryCustomerAccessStore();
  const failedService = createCustomerAccessService({
    store: failedStore,
    emailSender: { sendInvitation: async function () { throw new Error("provider unavailable"); } },
    baseUrl: "https://customer-panel.staging.example",
    now: function () { return new Date("2026-07-21T12:00:00.000Z"); }
  });
  await expectError(failedService.createInvitation({ company_name: "Empresa E", admin_email: "e@empresa.example", plan_id: "growth", assigned_bot_id: "atencion-cliente" }, { user_id: "platform-user-1" }), "email_delivery_failed", 502);
  assert.strictEqual(failedStore.invitations[0].delivery_status, "failed");

  let resendPayload;
  const resendSender = createResendEmailSender({
    apiKey: "resend-key",
    from: "Nextfor IA <access@example.com>",
    axiosClient: {
      post: async function (url, payload) {
        assert.strictEqual(url, "https://api.resend.com/emails");
        resendPayload = payload;
        return { data: { id: "resend-message-1" } };
      }
    }
  });
  await resendSender.sendInvitation({
    to: "admin@empresa.example",
    company_name: "Empresa F",
    setup_url: "https://staging.nextforia.com/admin/setup/tenant-f?invite=token",
    fallback_setup_urls: ["https://nextforia-staging.onrender.com/admin/setup/tenant-f?invite=token"],
    expires_at: "2026-07-22T12:00:00.000Z"
  });
  assert(resendPayload.text.includes("https://nextforia-staging.onrender.com/admin/setup/tenant-f?invite=token"));
  assert(resendPayload.html.includes("https://nextforia-staging.onrender.com/admin/setup/tenant-f?invite=token"));

  console.log("customer-access-v2.test.js: ok");
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
