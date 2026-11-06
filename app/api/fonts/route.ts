import { jsonError, noStoreJson } from "../../../src/print-shops/http";
import { ensureStyleStore } from "../../../src/print-shops/store";

export async function GET() {
  try {
    const snapshot = await ensureStyleStore();
    const response = noStoreJson({ fonts: snapshot.data.googleFonts });
    response.headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
