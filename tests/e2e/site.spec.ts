import { expect, test } from "@playwright/test";

// Runs against the sample data from `pnpm db:seed`.

test("search a player, open their final, see the score and video", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Search" });
  await search.fill("Nilo Yarrow");
  await search.press("Enter");
  await page
    .getByRole("link", { name: /Nilo Yarrow/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Nilo Yarrow" })).toBeVisible();

  await page
    .getByRole("link", { name: /Demo Masters 2026[\s\S]*Nilo Yarrow/ })
    .first()
    .click();
  await expect(page.getByText("Men's singles · Final")).toBeVisible();
  await expect(page.locator("iframe[src*='youtube-nocookie.com/embed/demoVideo']")).toBeVisible();
  await expect(page.locator(".font-mono.text-2xl").first()).toContainText("21");
});

test("search by month returns tournaments in that month", async ({ page }) => {
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  await page.goto(`/search?q=${encodeURIComponent(`${month} ${now.getFullYear()}`)}`);
  await expect(page.getByText(/Dates read as/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Demo Open 2026/ })).toBeVisible();
});

test("draws show a bracket for every discipline", async ({ page }) => {
  await page.goto("/tournaments/demo-masters-2026-sample-data?tab=draws");
  for (const d of ["MS", "WS", "MD"]) {
    await page.getByRole("link", { name: d, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`event=${d}`));
    await expect(page.getByText("Final", { exact: true }).first()).toBeVisible();
    // A full 16 (or 8) draw has 15 (or 7) match cards.
    await expect(page.locator("a[href^='/matches/']")).toHaveCount(d === "MD" ? 7 : 15);
  }
});

test("times switch between the viewer's zone and venue time", async ({ page }) => {
  await page.goto("/tournaments/demo-open-2026-sample-data?tab=schedule");
  const first = page.locator("time").first();
  // The server renders venue time; the page switches to the viewer's zone once hydrated.
  await expect(first).toHaveAttribute("title", "Your time");
  const local = await first.textContent();
  await page.getByRole("button", { name: "Venue time" }).click();
  await expect(first).not.toHaveText(local ?? "");
  await expect(first).toHaveAttribute("title", "Venue time");
  await page.getByRole("button", { name: "Your time" }).click();
  await expect(first).toHaveText(local ?? "");
});

test("pages fit a phone screen without sideways scrolling", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  for (const path of ["/", "/tournaments", "/tournaments/demo-open-2026-sample-data?tab=draws"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("the video suggestion form rejects links that aren't YouTube", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.goto("/tournaments/demo-masters-2026-sample-data?tab=results");
  await page.locator("a[href^='/matches/']").first().click();
  await page.getByRole("textbox", { name: "YouTube link" }).fill("https://vimeo.com/123456");
  await page.getByRole("button", { name: "Suggest video" }).click();
  await expect(page.getByRole("status")).toHaveText("That doesn't look like a YouTube link.");
});

test("the review queue needs the admin token", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel("Admin token").fill("not-the-token");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong token.")).toBeVisible();
});
