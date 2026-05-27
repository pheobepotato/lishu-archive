import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "content", "articles");

const articles = [
  {
    date: "2026-05-26",
    slug: "uniuni-1b-ipo",
    url: "https://mp.weixin.qq.com/s/u1B8o1hq11bbix2wQIQslw"
  },
  {
    date: "2026-05-21",
    slug: "spacex-starship",
    url: "https://mp.weixin.qq.com/s/URJAtwQtsSAqE7WnCGR_vw"
  },
  {
    date: "2026-05-07",
    slug: "xtransfer-prospectus",
    url: "https://mp.weixin.qq.com/s/sUO0torpzzl2b6VA0Qd63g"
  },
  {
    date: "2026-03-06",
    slug: "tec-do-applovin-short",
    url: "https://mp.weixin.qq.com/s/ZIKQkrsnPPpjCElz6TQ6BA"
  },
  {
    date: "2026-02-27",
    slug: "ben-thompson-shopify-ai-advantage",
    url: "https://mp.weixin.qq.com/s/eoQuGtnQqa-mvYWaI2qWxQ"
  }
];

const headers = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  referer: "https://mp.weixin.qq.com/"
};

function decodeHtml(value = "") {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };

  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (_, name) => named[name] || `&${name};`);
}

function stripTags(html = "") {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|section|blockquote|h1|h2|h3|h4|li|div)>/gi, "\n")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

function extractBetween(html, startNeedle, endNeedles) {
  const start = html.indexOf(startNeedle);
  if (start === -1) return "";
  const afterStart = html.indexOf(">", start);
  const ends = endNeedles.map((needle) => html.indexOf(needle, afterStart)).filter((index) => index > afterStart);
  const end = ends.length ? Math.min(...ends) : html.length;
  return html.slice(afterStart + 1, end);
}

function extractTitle(html) {
  const h1 = html.match(/<h1[^>]+id="activity-name"[^>]*>([\s\S]*?)<\/h1>/);
  if (h1) return stripTags(h1[1]).replace(/\n+/g, " ").trim();
  const title = html.match(/<title>([\s\S]*?)<\/title>/);
  return title ? decodeHtml(title[1]).trim() : "Untitled";
}

function extractImages(contentHtml) {
  const urls = [];
  for (const match of contentHtml.matchAll(/<img[^>]+(?:data-src|src)="([^"]+)"/g)) {
    if (match[1] && !urls.includes(match[1])) urls.push(match[1]);
  }
  return urls;
}

function yamlEscape(value) {
  return String(value || "").replaceAll('"', '\\"');
}

async function importArticle(article) {
  const res = await fetch(article.url, { headers });
  const html = await res.text();
  const title = extractTitle(html);
  const contentHtml = extractBetween(html, 'id="js_content"', [
    'id="js_tags_preview_toast"',
    'id="js_pc_qr_code"',
    'id="js_article_bottom_bar"',
    'class="rich_media_tool_area"'
  ]);
  const body = stripTags(contentHtml);
  if (body.length < 200) {
    throw new Error(`Imported body is unexpectedly short for ${article.url}`);
  }
  const images = extractImages(contentHtml);
  const imageBlock = images.length
    ? `\n\n---\n\nSource image links:\n\n${images.map((url, index) => `- [Image ${index + 1}](${url})`).join("\n")}\n`
    : "";
  const summary = body.replace(/\s+/g, " ").slice(0, 110);
  const markdown = `---\ntitle: "${yamlEscape(title)}"\ndate: "${article.date}"\nslug: "${article.slug}"\nsummary: "${yamlEscape(summary)}"\ntags: ["company"]\nsource: "${article.url}"\ndraft: false\n---\n\n${body}${imageBlock}\n`;

  await fs.writeFile(path.join(outDir, `${article.date}-${article.slug}.md`), markdown, "utf8");
  return { title, date: article.date, slug: article.slug, chars: body.length, images: images.length };
}

const results = [];
for (const article of articles) {
  results.push(await importArticle(article));
}

console.log(JSON.stringify(results, null, 2));
