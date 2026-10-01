import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const dataDir = () => process.env.DATA_DIR ?? path.join(process.cwd(), "data");

export const MAX_LOGO_BYTES = 512 * 1024;

/** Detect an allowed image type from magic bytes (not the client-supplied type). SVG is refused on purpose. */
export function sniffImage(buf: Buffer): { ext: "png" | "jpg" | "webp"; mime: string } | null {
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

export async function saveLogo(buf: Buffer, ext: string): Promise<string> {
  const dir = path.join(dataDir(), "logos");
  await mkdir(dir, { recursive: true });
  const name = `logo.${ext}`;
  await writeFile(path.join(dir, name), buf);
  return name;
}

export async function readLogo(name: string): Promise<Buffer | null> {
  if (!/^logo\.(png|jpg|webp)$/.test(name)) return null;
  try {
    return await readFile(path.join(dataDir(), "logos", name));
  } catch {
    return null;
  }
}

export const MAX_SHOP_PHOTO_BYTES = 3 * 1024 * 1024;

/** Shop photos live next to the logo, under DATA_DIR/shop, named by a random id so a name can't be guessed or reused. */
export async function saveShopPhoto(buf: Buffer, ext: string): Promise<string> {
  const dir = path.join(dataDir(), "shop");
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, name), buf);
  return name;
}

export async function readShopPhoto(name: string): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)) return null;
  try {
    return await readFile(path.join(dataDir(), "shop", name));
  } catch {
    return null;
  }
}

export async function deleteShopPhoto(name: string): Promise<void> {
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)) return;
  await unlink(path.join(dataDir(), "shop", name)).catch(() => undefined);
}
