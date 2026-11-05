import { DEFAULT_SUPPORT_SETTINGS, publicSupportSettings } from "../../../src/print-shops/domain";
import { jsonError } from "../../../src/print-shops/http";
import { readStyleStore } from "../../../src/print-shops/store";

export async function GET() {
  try {
    const snapshot = await readStyleStore();
    const response = Response.json(publicSupportSettings(snapshot?.data.supportSettings ?? DEFAULT_SUPPORT_SETTINGS));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
