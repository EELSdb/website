import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/password";

describe("password hashes", () => {
  it("hashes with PBKDF2 and verifies only the right password", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash).toMatch(/^\$pbkdf2-sha256\$100000\$/);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("correct horsf", hash)).toBe(false);
  });

  it("rejects old WordPress hashes and unknown formats", async () => {
    // "correct horse" as phpass and as WordPress bcrypt, made with passlib and the Python bcrypt package.
    expect(await verifyPassword("correct horse", "$P$BabcdefghKfdE7H4Uy7ajxpijsjAJW0")).toBe(false);
    expect(await verifyPassword("correct horse", "$wp$2y$04$.sLjjEzax1CSx3EL4GWoAeD9cOsZJo.TavMPA2ua55JfINmzSQUiy")).toBe(false);
    expect(await verifyPassword("x", "plaintext")).toBe(false);
  });
});
