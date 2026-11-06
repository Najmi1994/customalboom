import { z } from "zod";
import { infoBannersSchema, type InfoBanner } from '../info/domain';
import { managedTemplateSchema, templateCategorySchema, type ManagedTemplate, type TemplateCategory } from "../templates/domain";
import { fontFamilySchema, MAX_GOOGLE_FONTS } from "../fonts/domain";

export const MALAYSIA_STATES = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Perak",
  "Perlis",
  "Pulau Pinang",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
  "W.P. Kuala Lumpur",
  "W.P. Labuan",
  "W.P. Putrajaya",
] as const;

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("").transform(value => value || undefined);
const optionalDate = z.string().trim().optional().default("").refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use a valid date.").transform(value => value || undefined);
const optionalState = z.union([z.enum(MALAYSIA_STATES), z.literal("")]).optional().default("").transform(value => value || undefined);

export const shopInputSchema = z.object({
  name: z.string().trim().min(1, "Nama kedai diperlukan.").max(120),
  address: optionalText(500),
  state: optionalState,
  phone: optionalText(40),
  link: optionalText(2048),
  displayFrom: optionalDate,
  displayTo: optionalDate,
  contactName: optionalText(120),
  contactPhone: optionalText(40),
}).superRefine((value, context) => {
  if (Boolean(value.contactName) !== Boolean(value.contactPhone)) {
    context.addIssue({ code: "custom", path: [value.contactName ? "contactPhone" : "contactName"], message: "Nama dan telefon contact perlu diisi bersama." });
  }
  if (value.displayFrom && value.displayTo && value.displayFrom > value.displayTo) {
    context.addIssue({ code: "custom", path: ["displayTo"], message: "Tarikh To tidak boleh sebelum tarikh From." });
  }
  if (value.link) {
    try {
      const url = new URL(value.link);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch {
      context.addIssue({ code: "custom", path: ["link"], message: "Gunakan pautan http atau https yang sah." });
    }
  }
  for (const [field, phone] of [["phone", value.phone], ["contactPhone", value.contactPhone]] as const) {
    if (phone && !normalizePhone(phone)) context.addIssue({ code: "custom", path: [field], message: "Masukkan nombor telefon yang sah." });
  }
});

export type ShopInput = z.infer<typeof shopInputSchema>;

export type PasswordDigest = {
  algorithm: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  hash: string;
};

export type ShopLogo = {
  key: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  updatedAt: string;
};

export type PrintShop = ShopInput & {
  id: string;
  displayOrder: number;
  logo?: ShopLogo;
  createdAt: string;
  updatedAt: string;
};

export const supportFieldSchema = z.object({
  id: z.string().min(1).max(100),
  labelMs: z.string().trim().min(1, "Label Melayu diperlukan.").max(80),
  labelEn: z.string().trim().min(1, "English label is required.").max(80),
  value: z.string().trim().min(1, "Nilai diperlukan.").max(240),
  copy: z.boolean(),
}).strict();

export const supportAccountSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1, "Nama bank diperlukan.").max(100),
  visible: z.boolean(),
  fields: z.array(supportFieldSchema).min(1, "Tambah sekurang-kurangnya satu label.").max(12),
}).strict().superRefine((account, context) => {
  if (account.fields.filter(field => field.copy).length > 1) context.addIssue({ code: "custom", path: ["fields"], message: "Hanya satu nilai boleh dipilih untuk butang salin." });
  if (new Set(account.fields.map(field => field.id)).size !== account.fields.length) context.addIssue({ code: "custom", path: ["fields"], message: "ID label mesti unik." });
});

export const supportSettingsSchema = z.object({
  portrait: z.object({ id: z.string().uuid(), extension: z.enum(['png', 'jpg', 'webp']) }).strict().optional(),
  titleMs: z.string().trim().min(1, "Tajuk Melayu diperlukan.").max(160),
  titleEn: z.string().trim().min(1, "English title is required.").max(160),
  messageMs: z.string().trim().min(1, "Mesej Melayu diperlukan.").max(4000),
  messageEn: z.string().trim().min(1, "English message is required.").max(4000),
  accounts: z.array(supportAccountSchema).max(20),
}).strict().superRefine((settings, context) => {
  if (new Set(settings.accounts.map(account => account.id)).size !== settings.accounts.length) context.addIssue({ code: "custom", path: ["accounts"], message: "ID bank mesti unik." });
});

export type SupportField = z.infer<typeof supportFieldSchema>;
export type SupportAccount = z.infer<typeof supportAccountSchema>;
export type SupportSettings = z.infer<typeof supportSettingsSchema>;

export const DEFAULT_SUPPORT_SETTINGS: SupportSettings = {
  titleMs: "Belanjalah saya kopi... ^_^",
  titleEn: "Buy me a coffee... ^_^",
  messageMs: "Assalamualaikum & Hi, terima kasih kerana sudi membuka halaman ini. Kalau ada kesudian, bolehlah belanja saya kopi. Kopi O ais pun saya okay. ^_^ Tapi kalau boleh ZUS, cantik jugak bos. Nak kena bayo server.\n\nTerima kasih. Semoga dimurahkan rezeki. Ameen.",
  messageEn: "Hi, thank you for taking the time to open this page. If you feel like it, you can buy me a coffee—even an iced kopi O would make me happy. ^_^\n\nThank you. May you always be blessed with abundance. Ameen.",
  accounts: [
    { id: "maybank", name: "Maybank", visible: true, fields: [
      { id: "maybank-name", labelMs: "Nama", labelEn: "Name", value: "Shamir Adnan", copy: false },
      { id: "maybank-account", labelMs: "Nombor akaun", labelEn: "Account number", value: "1570 9101 0221", copy: true },
    ] },
    { id: "paypal", name: "PayPal", visible: true, fields: [
      { id: "paypal-email", labelMs: "E-mel", labelEn: "Email", value: "shamiradnan@gmail.com", copy: true },
    ] },
  ],
};

export type StyleStore = {
  version: 1;
  revision: number;
  auth: {
    username: string;
    password: PasswordDigest;
  };
  adminContactPhone?: string;
  supportSettings: SupportSettings;
  shops: PrintShop[];
  templateCategories: TemplateCategory[];
  templates: ManagedTemplate[];
  googleFonts: string[];
  infoBanners: InfoBanner[];
};

export type PublicPrintShop = Omit<PrintShop, "displayFrom" | "displayTo" | "logo" | "createdAt" | "updatedAt"> & {
  logoUrl?: string;
  whatsappUrl?: string;
};

export type AdminPrintShop = Omit<PrintShop, "logo"> & {
  hasLogo: boolean;
  logoUrl?: string;
};

export const passwordDigestSchema = z.object({
  algorithm: z.literal("PBKDF2-SHA-256"),
  iterations: z.number().int().min(1),
  salt: z.string().min(1),
  hash: z.string().min(1),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Password semasa diperlukan.").max(512),
  newPassword: z.string().min(12, "Password baharu mesti sekurang-kurangnya 12 aksara.").max(512),
}).superRefine((value, context) => {
  if (value.currentPassword === value.newPassword) context.addIssue({ code: "custom", path: ["newPassword"], message: "Password baharu mesti berbeza daripada password semasa." });
});

export const printShopSchema = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().min(0),
  name: z.string().min(1).max(120),
  address: z.string().max(500).optional(),
  state: z.enum(MALAYSIA_STATES).optional(),
  phone: z.string().max(40).optional(),
  link: z.string().max(2048).optional(),
  displayFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  displayTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(40).optional(),
  logo: z.object({
    key: z.string().min(1),
    contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    updatedAt: z.string().min(1),
  }).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const styleStoreSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().min(0),
  auth: z.object({ username: z.string().min(1), password: passwordDigestSchema }),
  adminContactPhone: z.string().max(40).optional(),
  supportSettings: supportSettingsSchema.optional().default(DEFAULT_SUPPORT_SETTINGS),
  shops: z.array(printShopSchema),
  templateCategories: z.array(templateCategorySchema).optional().default([]),
  templates: z.array(managedTemplateSchema).optional().default([]),
  googleFonts: z.array(fontFamilySchema).max(MAX_GOOGLE_FONTS).optional().default([]),
  infoBanners: infoBannersSchema.optional().default([]),
});

export function publicSupportSettings(settings: SupportSettings): SupportSettings {
  return { ...settings, accounts: settings.accounts.filter(account => account.visible) };
}

export function malaysiaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function shopStatus(shop: Pick<PrintShop, "displayFrom" | "displayTo">, today = malaysiaDate()): "upcoming" | "active" | "expired" {
  if (shop.displayFrom && today < shop.displayFrom) return "upcoming";
  if (shop.displayTo && today > shop.displayTo) return "expired";
  return "active";
}

export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith("0")) return `60${digits.slice(1)}`;
  return digits;
}

export function whatsappUrl(phone: string, message = "CustomAlboom Iklan Kedai"): string | undefined {
  const normalized = normalizePhone(phone);
  if (!normalized) return undefined;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function toPublicShop(shop: PrintShop): PublicPrintShop {
  const { displayFrom: _displayFrom, displayTo: _displayTo, logo, createdAt: _createdAt, updatedAt: _updatedAt, ...publicShop } = shop;
  return {
    ...publicShop,
    ...(logo ? { logoUrl: `/api/print-shops/${encodeURIComponent(shop.id)}/logo?v=${encodeURIComponent(logo.updatedAt)}` } : {}),
    ...(shop.contactPhone ? { whatsappUrl: whatsappUrl(shop.contactPhone) } : {}),
  };
}

export function toAdminShop(shop: PrintShop): AdminPrintShop {
  const { logo, ...adminShop } = shop;
  return {
    ...adminShop,
    hasLogo: Boolean(logo),
    ...(logo ? { logoUrl: `/api/kingkong/shops/${encodeURIComponent(shop.id)}/logo?v=${encodeURIComponent(logo.updatedAt)}` } : {}),
  };
}

export function orderedShops(shops: PrintShop[]): PrintShop[] {
  return [...shops].sort((a, b) => a.displayOrder - b.displayOrder || a.createdAt.localeCompare(b.createdAt));
}
