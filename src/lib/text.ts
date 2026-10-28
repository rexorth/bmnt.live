// Lower-case, strip accents and punctuation, collapse whitespace.
// Used for search columns and for matching player names inside video titles.
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugify(input: string): string {
  return normalizeText(input).replace(/\s+/g, "-").slice(0, 80) || "item";
}

export function tokens(input: string): string[] {
  const norm = normalizeText(input);
  return norm ? norm.split(" ") : [];
}
