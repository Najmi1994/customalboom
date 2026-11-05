import { jsonError } from "../../../src/print-shops/http";
import { readStyleStore } from "../../../src/print-shops/store";
import { orderedCategories, orderedTemplates, toPublicTemplate } from "../../../src/templates/domain";

export async function GET() {
  try {
    const snapshot = await readStyleStore();
    if (!snapshot) return Response.json({ categories: [], templates: [] });
    const published = orderedTemplates(snapshot.data.templates.filter(item => item.status === "published"));
    const categoryIds = new Set(published.map(item => item.categoryId));
    const categories = orderedCategories(snapshot.data.templateCategories).filter(item => categoryIds.has(item.id)).map(({ id, name }) => ({ id, name }));
    const response = Response.json({ categories, templates: published.map(toPublicTemplate) });
    response.headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return response;
  } catch (error) { return jsonError(error); }
}
