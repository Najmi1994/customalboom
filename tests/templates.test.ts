import assert from "node:assert/strict";
import test from "node:test";
import { asAlbumTemplate, asTemplate, makeFrame, makePage } from "../src/domain/model";
import { styleStoreSchema } from "../src/print-shops/domain";
import { orderedCategories, orderedTemplates, toPublicTemplate, type ManagedTemplate, type TemplateCategory } from "../src/templates/domain";
import { parseTemplateBytes, templateStats } from "../src/templates/server";

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

test("managed template storage remains compatible with legacy style.asp", () => {
  const parsed = styleStoreSchema.parse({ version: 1, revision: 0, auth: { username: "admin", password: { algorithm: "PBKDF2-SHA-256", iterations: 1, salt: "salt", hash: "hash" } }, shops: [] });
  assert.deepEqual(parsed.templateCategories, []);
  assert.deepEqual(parsed.templates, []);
});

test("uploaded single and album templates are validated and measured", () => {
  const first = makePage(); first.elements = [makeFrame("rect", 10, 10, 100, 100)];
  const second = makePage(); second.elements = [makeFrame("rect", 20, 20, 80, 80), makeFrame("ellipse", 120, 20, 80, 80)];
  assert.deepEqual(templateStats(parseTemplateBytes(encode(asTemplate(first, "Single")))), { kind: "album-template", pageCount: 1, frameCount: 1 });
  assert.deepEqual(templateStats(parseTemplateBytes(encode(asAlbumTemplate([first, second], "Album")))), { kind: "album-template-set", pageCount: 2, frameCount: 3 });
});

test("uploaded templates containing photo references are rejected", () => {
  const page = makePage(), frame = makeFrame("rect", 0, 0, 100, 100);
  frame.photo = { assetId: "private-photo", x: 0, y: 0, width: 100, height: 100 };
  page.elements = [frame];
  const unsafe = { schemaVersion: 1, kind: "album-template", id: "unsafe", name: "Unsafe", page };
  assert.throws(() => parseTemplateBytes(encode(unsafe)), /tidak boleh mengandungi rujukan foto/i);
});

test("categories and templates keep manual order and public records hide storage keys", () => {
  const categories: TemplateCategory[] = [
    { id: "b", name: "B", displayOrder: 1, createdAt: "2", updatedAt: "2" },
    { id: "a", name: "A", displayOrder: 0, createdAt: "1", updatedAt: "1" },
  ];
  const base: ManagedTemplate = { id: "one", title: "One", categoryId: "a", status: "published", displayOrder: 1, kind: "album-template", pageCount: 1, frameCount: 2, objectKey: "secret/layout", previewKey: "secret/preview", createdAt: "1", updatedAt: "1" };
  assert.deepEqual(orderedCategories(categories).map(item => item.id), ["a", "b"]);
  assert.deepEqual(orderedTemplates([{ ...base, id: "two", displayOrder: 0 }, base]).map(item => item.id), ["two", "one"]);
  const publicValue = toPublicTemplate(base) as unknown as Record<string, unknown>;
  assert.equal(publicValue.objectKey, undefined); assert.equal(publicValue.previewKey, undefined);
  assert.equal(publicValue.previewUrl, "/api/templates/one/preview?v=1");
});
