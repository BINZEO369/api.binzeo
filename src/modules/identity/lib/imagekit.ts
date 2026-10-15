import ImageKit, { toFile } from "@imagekit/nodejs";
import { randomUUID } from "node:crypto";

let client: ImageKit | null = null;

function getImageKit() {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error("ImageKit is not configured. Set IMAGEKIT_PRIVATE_KEY in the server environment.");
  }

  if (!client) {
    client = new ImageKit({ privateKey });
  }

  return client;
}

function safePathPart(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || fallback;
}

function extensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    default:
      return "jpg";
  }
}

type ProfileImageOwner = {
  userId: string;
  binzeoId: string;
  username: string | null;
};

export async function uploadProfileImage(
  buffer: Buffer,
  mimeType: string,
  owner: ProfileImageOwner,
) {
  const imagekit = getImageKit();
  const binzeoId = safePathPart(owner.binzeoId, `user-${owner.userId.slice(0, 8)}`);
  const username = safePathPart(owner.username ?? "user", `user-${owner.userId.slice(0, 8)}`);
  const folder = `/binzeo/profiles/${binzeoId}-${username}`;
  // Never overwrite the same CDN URL: browsers and edge caches may continue to
  // serve the previous image even after the upload and database update succeed.
  // A unique asset also lets the caller safely retire the old file after commit.
  const fileName = `profile-${username}-${binzeoId}-${randomUUID()}.${extensionForMimeType(mimeType)}`;
  const file = await toFile(buffer, fileName);

  const uploaded = await imagekit.files.upload({
    file,
    fileName,
    folder,
    useUniqueFileName: false,
    isPrivateFile: false,
    tags: ["binzeo-profile", `binzeo-id-${binzeoId}`, `username-${username}`],
  });

  if (!uploaded.url || !uploaded.fileId) {
    throw new Error("ImageKit did not return a profile image URL.");
  }

  return {
    url: uploaded.url,
    fileId: uploaded.fileId,
    folder,
    fileName,
  };
}

export async function deleteProfileImage(fileId: string) {
  if (!fileId.trim()) return;
  await getImageKit().files.delete(fileId);
}

export async function uploadMarketingImage(buffer: Buffer, mimeType: string) {
  const imagekit = getImageKit();
  const extension = extensionForMimeType(mimeType);
  const fileName = `marketing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const file = await toFile(buffer, fileName);
  const uploaded = await imagekit.files.upload({ file, fileName, folder: "/binzeo/marketing", useUniqueFileName: true, isPrivateFile: false, tags: ["binzeo-marketing"] });
  if (!uploaded.url || !uploaded.fileId) throw new Error("ImageKit did not return a marketing image URL.");
  return { url: uploaded.url, fileId: uploaded.fileId, fileName };
}
