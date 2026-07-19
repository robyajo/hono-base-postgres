import fs from "node:fs";
import path from "node:path";

export async function downloadAndSaveAvatar(userId: string, url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const storageDir = path.resolve("src/storage/app/public/avatars");
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const filename = `${userId}-${Date.now()}.jpg`;
    const filePath = path.join(storageDir, filename);
    fs.writeFileSync(filePath, buffer);

    return `/storage/avatars/${filename}`;
  } catch (error) {
    console.error("Failed to download avatar:", error);
    return null;
  }
}
