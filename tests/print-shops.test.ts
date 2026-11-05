import assert from "node:assert/strict";
import test from "node:test";
import { createSessionToken, hashPassword, verifyPassword, verifySessionToken } from "../src/print-shops/crypto";
import { DEFAULT_SUPPORT_SETTINGS, malaysiaDate, normalizePhone, orderedShops, publicSupportSettings, shopInputSchema, shopStatus, styleStoreSchema, supportSettingsSchema, toPublicShop, whatsappUrl, type PrintShop } from "../src/print-shops/domain";

function shop(overrides: Partial<PrintShop> = {}): PrintShop {
  return {
    id: overrides.id ?? "shop-1",
    displayOrder: overrides.displayOrder ?? 0,
    name: overrides.name ?? "Kedai Album",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("shop validation keeps optional fields optional and enforces paired contact", () => {
  assert.equal(shopInputSchema.safeParse({ name: "  Kedai Satu  " }).success, true);
  const incomplete = shopInputSchema.safeParse({ name: "Kedai", contactName: "Amir" });
  assert.equal(incomplete.success, false);
  const complete = shopInputSchema.safeParse({ name: "Kedai", contactName: "Amir", contactPhone: "012-345 6789" });
  assert.equal(complete.success, true);
});

test("shop validation rejects invalid links, phones and reversed dates", () => {
  assert.equal(shopInputSchema.safeParse({ name: "Kedai", link: "javascript:alert(1)" }).success, false);
  assert.equal(shopInputSchema.safeParse({ name: "Kedai", phone: "123" }).success, false);
  assert.equal(shopInputSchema.safeParse({ name: "Kedai", displayFrom: "2026-12-01", displayTo: "2026-11-30" }).success, false);
});

test("Malaysia calendar date uses Asia Kuala Lumpur", () => {
  assert.equal(malaysiaDate(new Date("2026-10-26T15:59:59.000Z")), "2026-10-26");
  assert.equal(malaysiaDate(new Date("2026-10-26T16:00:00.000Z")), "2026-10-27");
});

test("display dates are inclusive and blank bounds stay active", () => {
  assert.equal(shopStatus(shop(), "2026-10-27"), "active");
  assert.equal(shopStatus(shop({ displayFrom: "2026-10-27", displayTo: "2026-10-27" }), "2026-10-27"), "active");
  assert.equal(shopStatus(shop({ displayFrom: "2026-10-28" }), "2026-10-27"), "upcoming");
  assert.equal(shopStatus(shop({ displayTo: "2026-10-26" }), "2026-10-27"), "expired");
});

test("hierarchy sorts by display order with a stable creation fallback", () => {
  const result = orderedShops([
    shop({ id: "c", displayOrder: 2 }),
    shop({ id: "b", displayOrder: 0, createdAt: "2026-01-02T00:00:00.000Z" }),
    shop({ id: "a", displayOrder: 0, createdAt: "2026-01-01T00:00:00.000Z" }),
  ]);
  assert.deepEqual(result.map(item => item.id), ["a", "b", "c"]);
});

test("Malaysia phone numbers create the requested WhatsApp message", () => {
  assert.equal(normalizePhone("012-345 6789"), "60123456789");
  assert.equal(normalizePhone("+65 8123 4567"), "6581234567");
  assert.equal(whatsappUrl("0123456789"), "https://wa.me/60123456789?text=CustomAlboom%20Iklan%20Kedai");
  assert.equal(whatsappUrl("0123456789", "Letak kedai di sini"), "https://wa.me/60123456789?text=Letak%20kedai%20di%20sini");
});

test("store accepts an optional global admin contact without breaking old data", () => {
  const base = {
    version: 1,
    revision: 0,
    auth: { username: "admin", password: { algorithm: "PBKDF2-SHA-256", iterations: 1, salt: "salt", hash: "hash" } },
    shops: [],
  } as const;
  assert.equal(styleStoreSchema.safeParse(base).success, true);
  assert.equal(styleStoreSchema.safeParse({ ...base, adminContactPhone: "0123456789" }).success, true);
  assert.equal(styleStoreSchema.parse(base).supportSettings.titleMs, DEFAULT_SUPPORT_SETTINGS.titleMs);
});

test("support settings allow only one copy value per bank and hide disabled accounts publicly", () => {
  const settings = structuredClone(DEFAULT_SUPPORT_SETTINGS);
  settings.accounts[0].fields[0].copy = true;
  assert.equal(supportSettingsSchema.safeParse(settings).success, false);
  settings.accounts[0].fields[0].copy = false;
  settings.accounts[1].visible = false;
  const parsed = supportSettingsSchema.parse(settings), publicSettings = publicSupportSettings(parsed);
  assert.deepEqual(publicSettings.accounts.map(account => account.id), ["maybank"]);
  assert.equal(parsed.accounts.length, 2);
});

test("public shop data omits schedule and private logo key", () => {
  const publicShop = toPublicShop(shop({
    displayFrom: "2026-01-01",
    displayTo: "2026-12-31",
    contactName: "Amir",
    contactPhone: "0123456789",
    logo: { key: "private/logo.png", contentType: "image/png", updatedAt: "2026-01-01T00:00:00.000Z" },
  }));
  assert.equal("displayFrom" in publicShop, false);
  assert.equal("displayTo" in publicShop, false);
  assert.equal("logo" in publicShop, false);
  assert.match(publicShop.logoUrl ?? "", /^\/api\/print-shops\/shop-1\/logo/);
  assert.match(publicShop.whatsappUrl ?? "", /CustomAlboom%20Iklan%20Kedai/);
});

test("password hashing and signed sessions reject wrong or expired values", async () => {
  const digest = await hashPassword("temporary-secret", 1_000);
  assert.equal(await verifyPassword("temporary-secret", digest), true);
  assert.equal(await verifyPassword("wrong-secret", digest), false);
  const token = await createSessionToken("admin", digest.hash, 2_000);
  assert.equal(await verifySessionToken(token, "admin", digest.hash, 1_999), true);
  assert.equal(await verifySessionToken(token, "admin", digest.hash, 2_000), false);
  assert.equal(await verifySessionToken(`${token}x`, "admin", digest.hash, 1_999), false);
});
