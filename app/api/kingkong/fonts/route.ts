import { z } from "zod";
import { fontFamilySchema, googleFontsStylesheet, MAX_GOOGLE_FONTS, uniqueFontFamilies } from "../../../../src/fonts/domain";
import { jsonError, noStoreJson, validationError } from "../../../../src/print-shops/http";
import { adminSnapshot, isSameOrigin } from "../../../../src/print-shops/server-auth";
import { nextStorePatch, writeStyleStore } from "../../../../src/print-shops/store";

const fontRequestSchema = z.object({ family: fontFamilySchema }).strict();

export async function GET(request: Request) {
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Sesi admin telah tamat." }, { status: 401 });
    return noStoreJson({ revision: snapshot.data.revision, fonts: snapshot.data.googleFonts });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Sesi admin telah tamat." }, { status: 401 });
    const parsed = fontRequestSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const family = parsed.data.family;
    if (snapshot.data.googleFonts.some(item => item.toLocaleLowerCase() === family.toLocaleLowerCase())) {
      return noStoreJson({ error: "Font ini sudah ditambah." }, { status: 409 });
    }
    if (snapshot.data.googleFonts.length >= MAX_GOOGLE_FONTS) {
      return noStoreJson({ error: `Maksimum ${MAX_GOOGLE_FONTS} Google Fonts dibenarkan.` }, { status: 400 });
    }
    const fontResponse = await fetch(googleFontsStylesheet([family]), {
      headers: { "User-Agent": "Mozilla/5.0 CustomAlboom Font Validator" },
      signal: AbortSignal.timeout(8_000),
    });
    const css = await fontResponse.text();
    if (!fontResponse.ok || !css.includes("@font-face")) {
      return noStoreJson({ error: "Font tidak dijumpai di Google Fonts. Semak nama font dan cuba lagi." }, { status: 400 });
    }
    const fonts = uniqueFontFamilies([...snapshot.data.googleFonts, family]);
    const saved = await writeStyleStore(snapshot, nextStorePatch(snapshot, { googleFonts: fonts }));
    return noStoreJson({ revision: saved.data.revision, fonts: saved.data.googleFonts });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") return noStoreJson({ error: "Google Fonts mengambil masa terlalu lama. Cuba lagi." }, { status: 504 });
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: "Invalid request origin." }, { status: 403 });
  try {
    const snapshot = await adminSnapshot(request);
    if (!snapshot) return noStoreJson({ error: "Sesi admin telah tamat." }, { status: 401 });
    const parsed = fontRequestSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const fonts = snapshot.data.googleFonts.filter(item => item.toLocaleLowerCase() !== parsed.data.family.toLocaleLowerCase());
    if (fonts.length === snapshot.data.googleFonts.length) return noStoreJson({ error: "Font tidak dijumpai." }, { status: 404 });
    const saved = await writeStyleStore(snapshot, nextStorePatch(snapshot, { googleFonts: fonts }));
    return noStoreJson({ revision: saved.data.revision, fonts: saved.data.googleFonts });
  } catch (error) {
    return jsonError(error);
  }
}
