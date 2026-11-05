import { z } from "zod";

export const TEMPLATE_MAX_BYTES = 10_000_000;
export const TEMPLATE_PREFIX = "published-templates/";

export const templateCategorySchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1, "Nama kategori diperlukan.").max(100),
  displayOrder: z.number().int().min(0),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const managedTemplateSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1, "Tajuk template diperlukan.").max(120),
  categoryId: z.string().min(1).max(100),
  status: z.enum(["draft", "published"]),
  displayOrder: z.number().int().min(0),
  kind: z.enum(["album-template", "album-template-set"]),
  pageCount: z.number().int().min(1).max(200),
  frameCount: z.number().int().min(0).max(100000),
  objectKey: z.string().min(1),
  previewKey: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Nama kategori diperlukan.").max(100),
}).strict();

export const templateMetadataInputSchema = z.object({
  title: z.string().trim().min(1, "Tajuk template diperlukan.").max(120),
  categoryId: z.string().min(1, "Kategori diperlukan.").max(100),
  status: z.enum(["draft", "published"]),
}).strict();

export type TemplateCategory = z.infer<typeof templateCategorySchema>;
export type ManagedTemplate = z.infer<typeof managedTemplateSchema>;
export type TemplateMetadataInput = z.infer<typeof templateMetadataInputSchema>;

export type AdminTemplate = Omit<ManagedTemplate, "objectKey" | "previewKey"> & { previewUrl: string };
export type PublicTemplate = Pick<ManagedTemplate, "id" | "title" | "categoryId" | "kind" | "pageCount" | "frameCount"> & { previewUrl: string };

export function orderedCategories(categories: TemplateCategory[]) {
  return [...categories].sort((a, b) => a.displayOrder - b.displayOrder || a.createdAt.localeCompare(b.createdAt));
}

export function orderedTemplates(templates: ManagedTemplate[]) {
  return [...templates].sort((a, b) => a.displayOrder - b.displayOrder || a.createdAt.localeCompare(b.createdAt));
}

export function toAdminTemplate(template: ManagedTemplate): AdminTemplate {
  return { id: template.id, title: template.title, categoryId: template.categoryId, status: template.status, displayOrder: template.displayOrder, kind: template.kind, pageCount: template.pageCount, frameCount: template.frameCount, createdAt: template.createdAt, updatedAt: template.updatedAt, previewUrl: `/api/kingkong/templates/${encodeURIComponent(template.id)}/preview?v=${encodeURIComponent(template.updatedAt)}` };
}

export function toPublicTemplate(template: ManagedTemplate): PublicTemplate {
  return {
    id: template.id,
    title: template.title,
    categoryId: template.categoryId,
    kind: template.kind,
    pageCount: template.pageCount,
    frameCount: template.frameCount,
    previewUrl: `/api/templates/${encodeURIComponent(template.id)}/preview?v=${encodeURIComponent(template.updatedAt)}`,
  };
}
