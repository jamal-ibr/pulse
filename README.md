# Jamal Ibrahim — Personal Site

Personal portfolio for Jamal Ibrahim, Senior Solutions Architect at EY. Four
pages, one shared layout, and a three-way theme switcher: **Editorial**
(default), **Code**, and **Print**. Each theme is a fully committed aesthetic,
not a colour swap.

## Stack

- [Astro 4](https://astro.build) — static output, file-based routing
- Vanilla CSS with CSS custom properties (no Tailwind, no CSS-in-JS)
- Vanilla JS theme switcher with `localStorage` persistence
- Google Fonts: Fraunces, Inter, JetBrains Mono, Newsreader, Lora

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output to ./dist
npm run preview  # preview the production build
```

## Project structure

```
src/
  pages/        index · portfolio · about · contact
  components/   Header (nav + masthead + file-tree), Footer
  layouts/      BaseLayout (head, SEO, theme bootstrap)
  styles/       global.css + theme-{editorial,code,print}.css
  data/         profile.json  <- edit content here
  scripts/      theme.js      <- switcher + keyboard shortcut (press "t")
public/         favicon.svg, og-image.svg, robots.txt, sitemap.xml
```

## Editing content

All copy, stats, builds, contact links, and stack tags live in
`src/data/profile.json`. No template edits needed for routine updates.

## Themes

| Theme | Class on `<html>` | Aesthetic |
|-------|-------------------|-----------|
| Editorial (default) | `theme-editorial` | Dark, warm, italic gold serif |
| Code | `theme-code` | Terminal, file-tree nav, scanlines |
| Print | `theme-print` | Newsprint, masthead, drop caps, columns |

Selection persists under the `jamal-theme` localStorage key. Press `t` to
cycle themes. The Code theme hides an ASCII signature; Print surfaces a
newspaper pull quote.

## Deployment

Static site — deploy `dist/` to Vercel, Netlify, or Cloudflare Pages.

- Build command: `npm run build`
- Output directory: `dist`
- Point `jamalibrahim.com` at the deployment, enforce HTTPS.

## Pre-launch checklist

- [ ] Confirm or replace email `jamal.ibrx@gmail.com`
- [ ] Confirm LinkedIn / GitHub slugs in `profile.json`
- [ ] Confirm stats are defensible (1,000+ / 800+ / 20+)
- [ ] Rasterise `public/og-image.svg` to `og-image.png` (1200x630) and
      update the `og:image` / `twitter:image` paths in `BaseLayout.astro`
- [ ] Run Lighthouse, target 95+ across all categories
- [ ] Test on a physical iPhone 13 in all three themes
