import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentDir = path.join(root, "content");
const publicDir = path.join(root, "public");

const site = JSON.parse(await fs.readFile(path.join(contentDir, "site.json"), "utf8"));

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseFrontmatter(raw) {
  if (!raw.startsWith("---\n")) return [{}, raw];
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return [{}, raw];
  const metaRaw = raw.slice(4, end).trim();
  const body = raw.slice(end + 5).trim();
  const meta = {};

  for (const line of metaRaw.split("\n")) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (value === "true" || value === "false") {
      value = value === "true";
    } else if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }

    meta[key] = value;
  }

  return [meta, body];
}

function inlineMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let list = [];
  let quote = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!list.length) return;
    html.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
    list = [];
  }

  function flushQuote() {
    if (!quote.length) return;
    html.push(`<blockquote>${quote.map((item) => `<p>${inlineMarkdown(item)}</p>`).join("")}</blockquote>`);
    quote = [];
  }

  function flushAll() {
    flushParagraph();
    flushList();
    flushQuote();
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushAll();
      continue;
    }

    if (trimmed.startsWith("> ")) {
      flushParagraph();
      flushList();
      quote.push(trimmed.slice(2));
      continue;
    }

    if (/^- /.test(trimmed)) {
      flushParagraph();
      flushQuote();
      list.push(trimmed.slice(2));
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length + 1;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(trimmed);
  }

  flushAll();
  return html.join("\n");
}

function pageShell({ title, description, body, pathPrefix = "" }) {
  const pageTitle = title === site.title ? site.title : `${title} - ${site.title}`;
  const canonical = `${site.siteUrl}${pathPrefix}`;
  return `<!doctype html>
<html lang="${escapeHtml(site.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description || site.description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(site.title)}" href="/rss.xml">
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <header class="site-header">
    <a class="site-title" href="/">${escapeHtml(site.title)}</a>
    <nav>
      <a href="/archive/">Archive</a>
      <a href="/about/">About</a>
      <a href="/rss.xml">RSS</a>
    </nav>
  </header>
  <main>
${body}
  </main>
  <footer>
    <p>${escapeHtml(site.subtitle)}</p>
  </footer>
</body>
</html>`;
}

async function readMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(dir, entry.name));

  return Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(file, "utf8");
      const [meta, body] = parseFrontmatter(raw);
      return { file, meta, body };
    })
  );
}

async function copyAssets() {
  await fs.rm(publicDir, { recursive: true, force: true });
  await fs.mkdir(path.join(publicDir, "assets"), { recursive: true });
  await fs.cp(path.join(root, "assets"), path.join(publicDir, "assets"), { recursive: true });
}

function articleUrl(article) {
  return `/articles/${article.slug}/`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00Z`));
}

await copyAssets();

const articleSources = await readMarkdownFiles(path.join(contentDir, "articles"));
const articles = articleSources
  .map(({ file, meta, body }) => {
    const slug = meta.slug || slugify(meta.title || path.basename(file, ".md"));
    return {
      file,
      title: meta.title || slug,
      date: meta.date || "1970-01-01",
      slug,
      summary: meta.summary || "",
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      source: meta.source || "",
      draft: meta.draft === true,
      body,
      html: renderMarkdown(body)
    };
  })
  .filter((article) => !article.draft)
  .sort((a, b) => b.date.localeCompare(a.date));

for (const article of articles) {
  const outDir = path.join(publicDir, "articles", article.slug);
  await fs.mkdir(outDir, { recursive: true });
  const sourceLink = article.source
    ? `<p class="source-link"><a href="${escapeHtml(article.source)}">Original on WeChat</a></p>`
    : "";
  const tags = article.tags.length
    ? `<p class="tags">${article.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join(" ")}</p>`
    : "";
  const body = `    <article class="article">
      <p class="date">${escapeHtml(formatDate(article.date))}</p>
      <h1>${escapeHtml(article.title)}</h1>
      ${tags}
      ${article.html}
      ${sourceLink}
    </article>`;
  await fs.writeFile(
    path.join(outDir, "index.html"),
    pageShell({
      title: article.title,
      description: article.summary || site.description,
      body,
      pathPrefix: articleUrl(article)
    })
  );
}

const latest = articles.slice(0, 12);
const indexBody = `    <section class="intro">
      <h1>${escapeHtml(site.title)}</h1>
      <p>${escapeHtml(site.subtitle)}</p>
      <p>${escapeHtml(site.description)}</p>
    </section>
    <section class="article-list">
      <h2>Recent Essays</h2>
      ${latest
        .map(
          (article) => `<article>
        <p class="date">${escapeHtml(formatDate(article.date))}</p>
        <h3><a href="${articleUrl(article)}">${escapeHtml(article.title)}</a></h3>
        ${article.summary ? `<p>${escapeHtml(article.summary)}</p>` : ""}
      </article>`
        )
        .join("\n")}
    </section>`;

await fs.writeFile(
  path.join(publicDir, "index.html"),
  pageShell({ title: site.title, description: site.description, body: indexBody, pathPrefix: "/" })
);

const archiveBody = `    <section class="archive">
      <h1>Archive</h1>
      <ol>
        ${articles
          .map(
            (article) => `<li><time>${escapeHtml(article.date)}</time><a href="${articleUrl(article)}">${escapeHtml(
              article.title
            )}</a></li>`
          )
          .join("\n")}
      </ol>
    </section>`;

await fs.mkdir(path.join(publicDir, "archive"), { recursive: true });
await fs.writeFile(
  path.join(publicDir, "archive", "index.html"),
  pageShell({ title: "Archive", description: site.description, body: archiveBody, pathPrefix: "/archive/" })
);

const aboutRaw = await fs.readFile(path.join(contentDir, "pages", "about.md"), "utf8");
const [aboutMeta, aboutMd] = parseFrontmatter(aboutRaw);
await fs.mkdir(path.join(publicDir, "about"), { recursive: true });
await fs.writeFile(
  path.join(publicDir, "about", "index.html"),
  pageShell({
    title: aboutMeta.title || "About",
    description: site.description,
    body: `    <article class="article">\n      <h1>${escapeHtml(aboutMeta.title || "About")}</h1>\n      ${renderMarkdown(aboutMd)}\n    </article>`,
    pathPrefix: "/about/"
  })
);

const rssItems = articles
  .map((article) => {
    const url = `${site.siteUrl}${articleUrl(article)}`;
    return `  <item>
    <title>${escapeHtml(article.title)}</title>
    <link>${escapeHtml(url)}</link>
    <guid>${escapeHtml(url)}</guid>
    <pubDate>${new Date(`${article.date}T00:00:00Z`).toUTCString()}</pubDate>
    <description>${escapeHtml(article.summary || article.title)}</description>
  </item>`;
  })
  .join("\n");

await fs.writeFile(
  path.join(publicDir, "rss.xml"),
  `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>${escapeHtml(site.title)}</title>
  <link>${escapeHtml(site.siteUrl)}</link>
  <description>${escapeHtml(site.description)}</description>
${rssItems}
</channel>
</rss>`
);

const urls = ["/", "/archive/", "/about/", ...articles.map(articleUrl)];
await fs.writeFile(
  path.join(publicDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeHtml(`${site.siteUrl}${url}`)}</loc></url>`).join("\n")}
</urlset>`
);

await fs.writeFile(
  path.join(publicDir, "404.html"),
  pageShell({
    title: "Not Found",
    description: site.description,
    body: `    <article class="article">\n      <h1>Not Found</h1>\n      <p>This essay is not here. Go back to the <a href="/">home page</a>.</p>\n    </article>`,
    pathPrefix: "/404.html"
  })
);

console.log(`Built ${articles.length} article(s) into ${path.relative(root, publicDir)}`);
