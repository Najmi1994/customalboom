import { z } from 'zod';
import { fontFamilySchema } from '../fonts/domain';

const finite = z.number().finite();
const measure = finite.min(0.01).max(14400);
const coord = finite.min(-100000).max(100000);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().min(1).max(100);
export const FRAME_BORDER_THICKNESS_SMALL = 72 * .1 / 2.54;
export const FRAME_BORDER_THICKNESS = 72 * .2 / 2.54;
export const FRAME_BORDER_MARGIN_MAX = 72;
export const pointSchema = z.object({ x: coord, y: coord }).strict();
export type Point = z.infer<typeof pointSchema>;
export const geometrySchema = z.object({
  base: z.object({ kind: z.enum(['rect', 'ellipse']), x: coord, y: coord, width: measure, height: measure }).strict(),
  clip: z.array(pointSchema).min(3).max(256),
  paths: z.array(z.array(pointSchema).min(3).max(256)).min(1).max(64).optional(),
}).strict();
export type Geometry = z.infer<typeof geometrySchema>;
export const cutShapeSchema = z.object({ x: coord, y: coord, width: measure, height: measure, rotation: finite.min(-36000).max(36000), geometry: geometrySchema }).strict();
export type CutShape = z.infer<typeof cutShapeSchema>;
export const cutLinkSchema = z.object({
  operationId: id,
  side: z.union([z.literal(0), z.literal(1)]),
  source: cutShapeSchema,
  expected: cutShapeSchema,
  start: pointSchema,
  end: pointSchema,
  gap: finite.min(0).max(1440),
}).strict();
export type CutLink = z.infer<typeof cutLinkSchema>;
export const photoAdjustmentsSchema = z.object({
  exposure: finite.min(-2).max(2), contrast: finite.min(-100).max(100),
  saturation: finite.min(-100).max(100).default(0),
  highlights: finite.min(-100).max(100), shadows: finite.min(-100).max(100),
  whites: finite.min(-100).max(100), blacks: finite.min(-100).max(100),
}).strict();
export type PhotoAdjustments = z.infer<typeof photoAdjustmentsSchema>;
const photoSchema = z.object({ assetId: id, x: coord, y: coord, width: measure, height: measure, adjustments: photoAdjustmentsSchema.optional() }).strict();
export type PhotoPlacement = z.infer<typeof photoSchema>;
const common = {
  id, x: coord, y: coord, width: measure, height: measure,
  rotation: finite.min(-36000).max(36000),
  flipX: z.boolean().optional(), flipY: z.boolean().optional(),
};
export const frameSchema = z.object({
  ...common, type: z.literal('frame'), geometry: geometrySchema, fill: color,
  locked: z.boolean().default(false),
  borderEnabled: z.boolean().default(false), borderThickness: z.union([z.literal(FRAME_BORDER_THICKNESS_SMALL), z.literal(FRAME_BORDER_THICKNESS)]).default(FRAME_BORDER_THICKNESS), borderMargin: finite.min(0).max(FRAME_BORDER_MARGIN_MAX).default(0), borderColor: color.default('#000000'),
  photo: photoSchema.optional(), groupId: id.optional(), cutLink: cutLinkSchema.optional(), cutPath: z.array(cutLinkSchema).min(1).max(32).optional(),
}).strict();
export const textSchema = z.object({
  ...common, type: z.literal('text'), text: z.string().max(20000),
  font: fontFamilySchema, fontSize: finite.min(4).max(1000),
  bold: z.boolean(), italic: z.boolean(), color,
  align: z.enum(['left', 'center', 'right', 'justify']), lineHeight: finite.min(0.7).max(4),
  clip: z.array(pointSchema).min(3).max(256).optional(),
}).strict();
export const elementSchema = z.discriminatedUnion('type', [frameSchema, textSchema]);
export type FrameElement = z.infer<typeof frameSchema>;
export type TextElement = z.infer<typeof textSchema>;
export type AlbumElement = z.infer<typeof elementSchema>;
export const pageSchema = z.object({
  id, name: z.string().max(120), baseWidth: measure, height: measure,
  mode: z.enum(['single', 'spread']), dpi: z.union([z.literal(150), z.literal(300)]),
  padding: finite.min(0).max(7200), centerPaddingMode: z.enum(['none', 'equal', 'per-side']).default('none'),
  clipContentToPadding: z.boolean().default(false), background: color, backgroundPhoto: photoSchema.optional(),
  backgroundClip: z.object({ x: coord, y: coord, width: measure, height: measure }).strict().optional(),
  elements: z.array(elementSchema).max(500),
}).strict();
export type Page = z.infer<typeof pageSchema>;
export const assetSchema = z.object({ id: z.string().regex(/^[0-9a-f]{64}$/), name: z.string().max(512), relativePath: z.string().max(2048), width: measure, height: measure, size: finite.min(0).max(500_000_000), lastModified: finite.min(0) }).strict();
export type PhotoAssetRef = z.infer<typeof assetSchema>;
export const projectSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('album-project'), id,
  name: z.string().min(1).max(120), unit: z.enum(['in', 'cm']), allowDuplicates: z.boolean(), framesLocked: z.boolean().default(false),
  pages: z.array(pageSchema).min(1).max(200), assets: z.array(assetSchema).max(10000),
}).strict();
export type AlbumProject = z.infer<typeof projectSchema>;
export const pageTemplateSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal('album-template'), id, name: z.string().min(1).max(120), page: pageSchema }).strict();
export const albumTemplateSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal('album-template-set'), id, name: z.string().min(1).max(120), pages: z.array(pageSchema).min(1).max(200) }).strict();
export const templateSchema = z.discriminatedUnion('kind', [pageTemplateSchema, albumTemplateSchema]);
export type LayoutTemplate = z.infer<typeof templateSchema>;
export type PageLayoutTemplate = z.infer<typeof pageTemplateSchema>;
export type AlbumLayoutTemplate = z.infer<typeof albumTemplateSchema>;
export type Unit = AlbumProject['unit'];
export const uid = () => crypto.randomUUID();
export const pageWidth = (p: Page) => p.baseWidth * (p.mode === 'spread' ? 2 : 1);
export const toPoints = (n: number, unit: Unit) => n * (unit === 'in' ? 72 : 72 / 2.54);
export const fromPoints = (n: number, unit: Unit) => n / (unit === 'in' ? 72 : 72 / 2.54);
export const formatMeasure = (n: number, unit: Unit) => Number(fromPoints(n, unit).toFixed(3));
export const PRESETS = [[8, 10], [8, 12], [10, 12], [10, 15], [12, 15], [12, 18]] as const;
export function makePage(source?: Page): Page {
  return { id: uid(), name: '', baseWidth: source?.baseWidth ?? 1296, height: source?.height ?? 864, mode: source?.mode ?? 'single', dpi: source?.dpi ?? 150, padding: source?.padding ?? 0, centerPaddingMode: source?.centerPaddingMode ?? 'none', clipContentToPadding: source?.clipContentToPadding ?? false, background: '#ffffff', elements: [] };
}
export function makeProject(): AlbumProject {
  return { schemaVersion: 1, kind: 'album-project', id: uid(), name: 'Untitled album', unit: 'in', allowDuplicates: false, framesLocked: false, pages: [makePage()], assets: [] };
}
export function makeFrame(kind: 'rect' | 'ellipse', x: number, y: number, width: number, height: number): FrameElement {
  return { id: uid(), type: 'frame', x, y, width, height, rotation: 0, fill: '#eeeae3', locked: false, borderEnabled: false, borderThickness: FRAME_BORDER_THICKNESS, borderMargin: 0, borderColor: '#000000', geometry: { base: { kind, x: 0, y: 0, width, height }, clip: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }] } };
}
export function setPageFramesLocked(page: Page, locked: boolean): Page {
  return { ...page, elements: page.elements.map(element => element.type === 'frame' ? { ...element, locked } : element) };
}
export function setProjectFramesLocked(project: AlbumProject, locked: boolean): AlbumProject {
  return { ...project, framesLocked: locked, pages: project.pages.map(page => setPageFramesLocked(page, locked)) };
}
export function makeText(x: number, y: number, width: number): TextElement {
  return { id: uid(), type: 'text', x, y, width, height: 90, rotation: 0, text: 'A moment to remember', font: 'Lora', fontSize: 28, color: '#2b302e', bold: false, italic: false, align: 'left', lineHeight: 1.3 };
}
export function photoUsage(project: AlbumProject) {
  const uses = new Map<string, number>();
  for (const page of project.pages) {
    const ids = [page.backgroundPhoto?.assetId, ...page.elements.map(e => e.type === 'frame' ? e.photo?.assetId : undefined)];
    for (const key of ids) if (key) uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  return uses;
}
export function photoUsageForAssets(project: AlbumProject, assetIds: ReadonlySet<string>) {
  let frames = 0, backgrounds = 0;
  const pages = new Set<string>();
  for (const page of project.pages) {
    let usedOnPage = false;
    if (page.backgroundPhoto && assetIds.has(page.backgroundPhoto.assetId)) { backgrounds++; usedOnPage = true; }
    for (const element of page.elements) if (element.type === 'frame' && element.photo && assetIds.has(element.photo.assetId)) { frames++; usedOnPage = true; }
    if (usedOnPage) pages.add(page.id);
  }
  return { frames, backgrounds, pages: pages.size };
}
export function purgePhotoAssets(project: AlbumProject, assetIds: ReadonlySet<string>): AlbumProject {
  if (!assetIds.size) return project;
  return {
    ...project,
    assets: project.assets.filter(asset => !assetIds.has(asset.id)),
    pages: project.pages.map(page => ({
      ...page,
      backgroundPhoto: page.backgroundPhoto && assetIds.has(page.backgroundPhoto.assetId) ? undefined : page.backgroundPhoto,
      backgroundClip: page.backgroundPhoto && assetIds.has(page.backgroundPhoto.assetId) ? undefined : page.backgroundClip,
      elements: page.elements.map(element => element.type === 'frame' && element.photo && assetIds.has(element.photo.assetId) ? { ...element, photo: undefined } : element),
    })),
  };
}
function withoutPhotos(page: Page): Page {
  const clean = structuredClone(page); delete clean.backgroundPhoto; delete clean.backgroundClip;
  clean.elements.forEach(e => { if (e.type === 'frame') { delete e.photo; e.locked = false; } });
  return clean;
}
export function asTemplate(page: Page, name: string): PageLayoutTemplate {
  return { schemaVersion: 1, kind: 'album-template', id: uid(), name, page: withoutPhotos(page) };
}
export function asAlbumTemplate(pages: Page[], name: string): AlbumLayoutTemplate {
  return { schemaVersion: 1, kind: 'album-template-set', id: uid(), name, pages: pages.map(withoutPhotos) };
}
