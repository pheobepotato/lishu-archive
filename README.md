# 梨薯 / Petato

A minimal static archive for essays from 梨薯 / Petato.

The site has no subscription system, no database, and no server runtime. It is built as static HTML and is intended for GitHub Pages.

## Preview

```bash
npm run build
npm run serve
```

If `npm` is not available, run:

```bash
node scripts/build.mjs
node scripts/serve.mjs
```

The preview URL is `http://localhost:4173`.

## Add Essays

Put Markdown files in `content/articles`:

```md
---
title: "Essay title"
date: "2026-05-27"
slug: "essay-slug"
summary: "One-sentence summary"
tags: ["company", "ai"]
source: "Original WeChat URL"
draft: false
---

Essay body starts here.
```

Then rebuild:

```bash
npm run build
```

The generated site is in `public`.

## WeChat Import

The current trial migration is defined in `scripts/import-wechat-sample.mjs`.

```bash
node scripts/import-wechat-sample.mjs
node scripts/build.mjs
```

The importer reads public WeChat article URLs, extracts title/body/image links, and writes Markdown files into `content/articles`.

## GitHub Pages

This repo includes `.github/workflows/pages.yml`. Once pushed to a public GitHub repository with Pages set to GitHub Actions, every push to `main` will rebuild and publish the site.
