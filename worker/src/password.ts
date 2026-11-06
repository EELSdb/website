const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 100_000; // the most Workers allows
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `$pbkdf2-sha256$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITERATIONS))}`;
}

function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash.startsWith("$pbkdf2-sha256$")) return false;
  const [, , iterations, salt, expected] = hash.split("$");
  const salted = Uint8Array.from(atob(salt), (ch) => ch.charCodeAt(0));
  return sameString(b64(await pbkdf2(password, salted, Number(iterations))), expected);
}
