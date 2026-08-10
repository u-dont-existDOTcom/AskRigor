const encodeBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

const decodeBase64Url = (value: string): string => {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new Error("Invalid cursor encoding");
  }

  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
};

export const encodeCursor = (value: unknown): string => {
  const json = JSON.stringify(value);

  if (json === undefined) {
    throw new TypeError("Cursor value must be JSON-serializable");
  }

  return encodeBase64Url(json);
};

export const decodeCursor = <T>(cursor: string): T =>
  JSON.parse(decodeBase64Url(cursor)) as T;
