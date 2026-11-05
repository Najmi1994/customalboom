import { malaysiaDate, orderedShops, shopStatus, toPublicShop, whatsappUrl } from "../../../src/print-shops/domain";
import { jsonError } from "../../../src/print-shops/http";
import { readStyleStore } from "../../../src/print-shops/store";

export async function GET() {
  try {
    const snapshot = await readStyleStore();
    const today = malaysiaDate();
    const shops = snapshot ? orderedShops(snapshot.data.shops).filter(shop => shopStatus(shop, today) === "active").map(toPublicShop) : [];
    const adminWhatsappUrl = snapshot?.data.adminContactPhone
      ? whatsappUrl(snapshot.data.adminContactPhone, "Saya berminat untuk letak kedai cetak di CustomAlboom.com.")
      : undefined;
    const response = Response.json({ shops, ...(adminWhatsappUrl ? { adminWhatsappUrl } : {}) });
    response.headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
