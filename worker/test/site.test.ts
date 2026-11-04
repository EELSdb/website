import { describe, expect, it } from "vitest";
import { apiPath, rehost } from "../src/site";

describe("rehost", () => {
  const text = "See https://eelsdb.eu/docs/ and https://api.eelsdb.eu/v2/spectra; write to info@eelsdb.eu.";

  it("points site and API links at another deployment", () => {
    expect(rehost(text, "https://dev.example.org")).toBe(
      "See https://dev.example.org/docs/ and https://api.dev.example.org/v2/spectra; write to info@eelsdb.eu.",
    );
  });

  it("leaves production text alone", () => {
    expect(rehost(text, "https://eelsdb.eu")).toBe(text);
  });

  it("points API links at an API under a path", () => {
    expect(rehost(text, "https://dev.example.org", "https://dev.example.org/_api")).toBe(
      "See https://dev.example.org/docs/ and https://dev.example.org/_api/v2/spectra; write to info@eelsdb.eu.",
    );
  });
});

describe("apiPath", () => {
  const api = "https://dev.example.org/_api";
  const path = (p: string, a = api) => apiPath(new URL(p, "https://dev.example.org"), a);

  it("strips the API prefix", () => {
    expect(path("/_api/v2/spectra?page=2")).toBe("/v2/spectra");
    expect(path("/_api")).toBe("/");
    expect(path("/_api/")).toBe("/");
  });

  it("leaves other paths to the pages", () => {
    expect(path("/spectra/")).toBeNull();
    expect(path("/_apiary/")).toBeNull();
  });

  it("does nothing when the API has its own host", () => {
    expect(path("/_api/v2/spectra", "https://api.eelsdb.eu")).toBeNull();
  });
});
