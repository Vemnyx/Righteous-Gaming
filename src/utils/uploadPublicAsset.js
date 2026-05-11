/**
 * Upload a file to `righteous-assets` via POST /api/upload.
 * @param {() => Promise<string>} getIdToken
 * @param {string} objectPath
 * @param {File} file
 * @returns {Promise<string>} public_url
 */
export async function uploadPublicAsset(getIdToken, objectPath, file) {
  const token = await getIdToken();
  const fd = new FormData();
  fd.append("path", objectPath);
  fd.append("file", file);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t?.trim() || res.statusText || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (typeof data.public_url !== "string") {
    throw new Error("Invalid upload response");
  }
  return data.public_url;
}

/** @param {string} filename */
export function extFromFilename(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename || "");
  return m ? m[1].toLowerCase() : "bin";
}
