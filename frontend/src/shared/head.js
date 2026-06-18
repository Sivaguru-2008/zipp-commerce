// Shared <head> injector.
//
// Each migrated page calls injectSharedHead({...}) before any other script
// runs. Eliminates duplicated meta tags / font preconnects / favicon spread
// across every HTML page.
//
// Pages can opt out of any tag by passing `{ skip: ['twitter', 'og'] }`.

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap';

export function injectSharedHead({
  title,
  description = 'Zipp delivers fresh groceries, dairy, snacks, and household essentials in 10 minutes.',
  image = '/images/og-cover.png',
  canonical = location.pathname,
  type = 'website',
  skip = []
} = {}) {
  const head = document.head;

  function meta(name, content, prop) {
    if (skip.includes(name)) return;
    const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`;
    let el = head.querySelector(sel);
    if (!el) {
      el = document.createElement('meta');
      if (prop) el.setAttribute('property', name); else el.setAttribute('name', name);
      head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  if (title) document.title = title;

  meta('viewport', 'width=device-width, initial-scale=1.0');
  meta('theme-color', '#6C3BFF');
  meta('description', description);

  // OpenGraph + Twitter
  meta('og:type',        type,        true);
  meta('og:title',       title || 'Zipp', true);
  meta('og:description', description, true);
  meta('og:image',       image,       true);
  meta('twitter:card',   'summary_large_image');
  meta('twitter:title',  title || 'Zipp');
  meta('twitter:description', description);

  // Canonical
  let canon = head.querySelector('link[rel="canonical"]');
  if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; head.appendChild(canon); }
  canon.href = canonical;

  // Fonts (preconnect + stylesheet) — only inject if not already present.
  if (!head.querySelector('link[href*="fonts.googleapis.com/css2"]')) {
    const pre1 = document.createElement('link'); pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
    const pre2 = document.createElement('link'); pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = 'anonymous';
    const css  = document.createElement('link'); css.rel  = 'stylesheet';  css.href  = FONT_CSS;
    head.appendChild(pre1); head.appendChild(pre2); head.appendChild(css);
  }
}
