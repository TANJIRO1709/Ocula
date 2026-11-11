/**
 * Bootstrap data: admin user, demo store and an editable sample lens / frame catalog.
 * ZEISS family names are recommendation targets — stores should verify names, availability and prices.
 */
import type { Config } from "./config.js";
import { type Db, j } from "./db.js";
import { hashPassword } from "./security.js";

type Item = { sku: string; category: string; family: string; name: string; description?: string; lens_index?: number; tags?: string[]; attrs?: Record<string, unknown> };

export const LENS_CATALOG: Item[] = [
  { sku: "ZSL-SV", category: "design", family: "ZEISS SmartLife", name: "ZEISS SmartLife Single Vision", description: "Single vision lens designed for today's connected, on-the-move lifestyles.", tags: ["single_vision"] },
  { sku: "ZSL-DIG", category: "design", family: "ZEISS SmartLife", name: "ZEISS SmartLife Digital", description: "Single vision lens with a small boost for near work on phones and screens.", tags: ["digital"] },
  { sku: "ZSL-PAL", category: "design", family: "ZEISS SmartLife", name: "ZEISS SmartLife Progressive", description: "Progressive lens for clear vision at far, intermediate and near.", tags: ["progressive"] },
  { sku: "ZOFF", category: "design", family: "ZEISS Officelens", name: "ZEISS Officelens", description: "Near-to-intermediate lens for desk and computer work.", tags: ["office"] },
  { sku: "ZDS-SV", category: "design", family: "ZEISS DriveSafe", name: "ZEISS DriveSafe Single Vision", description: "Everyday lens optimised for driving, with reduced glare in low light.", tags: ["single_vision", "drive"] },
  { sku: "ZDS-PAL", category: "design", family: "ZEISS DriveSafe", name: "ZEISS DriveSafe Progressive", description: "Progressive lens optimised for driving.", tags: ["progressive", "drive"] },
  { sku: "ZMYO", category: "design", family: "ZEISS MyoCare", name: "ZEISS MyoCare", description: "Spectacle lens designed for myopia management in children.", tags: ["myopia_control", "child"] },
  { sku: "IDX-150", category: "material", family: "Index", name: "1.50 standard", lens_index: 1.5, tags: ["index"] },
  { sku: "IDX-160", category: "material", family: "Index", name: "1.60 thin", lens_index: 1.6, tags: ["index"] },
  { sku: "IDX-167", category: "material", family: "Index", name: "1.67 extra thin", lens_index: 1.67, tags: ["index"] },
  { sku: "IDX-174", category: "material", family: "Index", name: "1.74 ultra thin", lens_index: 1.74, tags: ["index"] },
  { sku: "IDX-PC", category: "material", family: "Polycarbonate", name: "1.59 polycarbonate (impact resistant)", lens_index: 1.59, tags: ["index", "impact"] },
  { sku: "DV-PLAT", category: "coating", family: "ZEISS DuraVision", name: "ZEISS DuraVision Platinum UV", description: "Premium anti-reflective, easy-clean, scratch-resistant coating.", tags: ["anti_reflective"] },
  { sku: "DV-BP", category: "coating", family: "ZEISS DuraVision", name: "ZEISS DuraVision BlueProtect UV", description: "Anti-reflective coating that reflects part of the blue-violet light from screens.", tags: ["blue_light"] },
  { sku: "BG", category: "feature", family: "ZEISS BlueGuard", name: "ZEISS BlueGuard", description: "Lens material that blocks part of blue-violet light with fewer blue reflections.", tags: ["blue_light"] },
  { sku: "PFX", category: "feature", family: "ZEISS PhotoFusion X", name: "ZEISS PhotoFusion X", description: "Light-adaptive lens that darkens outdoors and clears indoors.", tags: ["photochromic"] },
];

const FRAMES: { sku: string; name: string; attrs: Record<string, unknown> }[] = [
  { sku: "FR-RECT-52", name: "Classic Rectangle 52-18", attrs: { shape: "rectangle", a: 52, dbl: 18, b: 34, material: "acetate" } },
  { sku: "FR-RECT-48", name: "Slim Rectangle 48-19", attrs: { shape: "rectangle", a: 48, dbl: 19, b: 30, material: "metal" } },
  { sku: "FR-ROUND-47", name: "Round Panto 47-20", attrs: { shape: "round", a: 47, dbl: 20, b: 42, material: "acetate" } },
  { sku: "FR-ROUND-44", name: "Small Round 44-21", attrs: { shape: "round", a: 44, dbl: 21, b: 40, material: "metal" } },
  { sku: "FR-SQ-53", name: "Bold Square 53-17", attrs: { shape: "square", a: 53, dbl: 17, b: 44, material: "acetate" } },
  { sku: "FR-AVI-55", name: "Aviator 55-16", attrs: { shape: "aviator", a: 55, dbl: 16, b: 46, material: "metal" } },
  { sku: "FR-CAT-51", name: "Cat-eye 51-18", attrs: { shape: "cat_eye", a: 51, dbl: 18, b: 38, material: "acetate" } },
  { sku: "FR-OVAL-50", name: "Soft Oval 50-19", attrs: { shape: "oval", a: 50, dbl: 19, b: 36, material: "TR90" } },
  { sku: "FR-KID-44", name: "Kids Flex 44-16", attrs: { shape: "round", a: 44, dbl: 16, b: 34, material: "silicone", kids: true } },
  { sku: "FR-SPORT-56", name: "Sport Wrap 56-17", attrs: { shape: "rectangle", a: 56, dbl: 17, b: 38, material: "TR90", sport: true } },
];

export async function seed(db: Db, cfg: Config) {
  let store = await db.one<{ id: number }>("SELECT id FROM stores ORDER BY id LIMIT 1");
  if (!store) {
    store = await db.one<{ id: number }>("INSERT INTO stores (name, district, state) VALUES ($1,$2,$3) RETURNING id", [
      "Ocula Demo Optical", "Sundargarh", "Odisha",
    ]);
  }
  const admin = await db.one("SELECT id FROM users WHERE email=$1", [cfg.ADMIN_EMAIL]);
  if (!admin && !cfg.ADMIN_PASSWORD) console.warn("ADMIN_PASSWORD is not set: no admin user created");
  if (!admin && cfg.ADMIN_PASSWORD) {
    await db.query("INSERT INTO users (email, name, hashed_password, role, store_id) VALUES ($1,$2,$3,'admin',$4)", [
      cfg.ADMIN_EMAIL, "Ocula Admin", await hashPassword(cfg.ADMIN_PASSWORD), store!.id,
    ]);
  }
  for (const it of LENS_CATALOG) {
    await db.query(
      `INSERT INTO catalog_items (sku, category, family, name, description, lens_index, tags, attrs)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'{}'::jsonb) ON CONFLICT (sku) DO NOTHING`,
      [it.sku, it.category, it.family, it.name, it.description ?? "", it.lens_index ?? null, j(it.tags ?? [])],
    );
  }
  for (const f of FRAMES) {
    await db.query(
      `INSERT INTO catalog_items (sku, category, family, name, tags, attrs)
       VALUES ($1,'frame','Frames',$2,$3::jsonb,$4::jsonb) ON CONFLICT (sku) DO NOTHING`,
      [f.sku, f.name, j([f.attrs.shape]), j(f.attrs)],
    );
  }
}
