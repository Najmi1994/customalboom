import { clipPageToSafeArea, validPage } from "../domain/geometry";
import { templateSchema, type LayoutTemplate, type Page } from "../domain/model";
import { TEMPLATE_MAX_BYTES, orderedCategories, orderedTemplates, toAdminTemplate } from "./domain";
import type { StoreSnapshot } from "../print-shops/store";

export function parseTemplateBytes(bytes: Uint8Array): LayoutTemplate {
  if (!bytes.length || bytes.length > TEMPLATE_MAX_BYTES) throw new Error("Fail template mesti tidak melebihi 10 MB.");
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error("Fail template mengandungi JSON yang tidak sah."); }
  const parsed = templateSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Format template tidak sah.");
  const pages = (parsed.data.kind === "album-template" ? [parsed.data.page] : parsed.data.pages).map(page => page.clipContentToPadding ? clipPageToSafeArea(page) : page);
  if (pages.some(hasPhoto)) throw new Error("Template tidak boleh mengandungi rujukan foto.");
  if (!pages.every(validPage)) throw new Error("Objek template mesti berada di dalam ruang halaman yang selamat.");
  return parsed.data.kind === "album-template" ? { ...parsed.data, page: pages[0] } : { ...parsed.data, pages };
}

function hasPhoto(page: Page) {
  return Boolean(page.backgroundPhoto || page.elements.some(element => element.type === "frame" && element.photo));
}

export function templateStats(template: LayoutTemplate) {
  const pages = template.kind === "album-template" ? [template.page] : template.pages;
  return { kind: template.kind, pageCount: pages.length, frameCount: pages.reduce((sum, page) => sum + page.elements.filter(element => element.type === "frame").length, 0) };
}

export function isPng(bytes: Uint8Array) {
  return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
}

export function adminCatalogPayload(snapshot: StoreSnapshot) {
  return {
    revision: snapshot.data.revision,
    categories: orderedCategories(snapshot.data.templateCategories),
    templates: orderedTemplates(snapshot.data.templates).map(toAdminTemplate),
  };
}

export function normalizedOrders<T extends { displayOrder: number; updatedAt: string }>(items: T[], now = new Date().toISOString()): T[] {
  return items.map((item, index) => ({ ...item, displayOrder: index, updatedAt: item.displayOrder === index ? item.updatedAt : now }));
}
