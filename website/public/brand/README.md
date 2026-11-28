# Saba Art — brand & placeholder artwork

> **These are generated placeholder artworks, not photographs.** Replace them with
> real studio photography before launch. The real product photos that DO exist are
> listed below.

Every `.svg` in this folder was written by hand as raw SVG markup. The marbled
resin texture comes from `<feTurbulence type="fractalNoise">` driving a
`<feDisplacementMap>` over layered gradient blobs and poured bands — there is no
raster image data in any of them, so they scale cleanly and stay small.

The three `.png` files are the real Saba Art logo, copied unchanged from
`dashboard/public/`.

## File map

| File | Size | Intended use |
| --- | --- | --- |
| `saba-logo.png` | — | Real raster logo (copied from the dashboard). Use where a bitmap is required. |
| `saba-icon-512.png` | 512×512 | PWA / manifest icon, large. |
| `saba-icon-192.png` | 192×192 | PWA / manifest icon, small. |
| `../apple-touch-icon.png` | 180×180 | Apple touch icon, served from `public/` root. |
| `saba-logo.svg` | fluid | Vector version of the mark (S·A / B·A tiles). Header, favicon, anywhere the mark appears alone. |
| `saba-wordmark.svg` | fluid | Mark + "Saba Art" + "HANDCRAFTED RESIN ART". Site header, footer, email signature. Text uses `currentColor`, so it works on light and dark. |
| `hero-ocean.svg` | 1920×1080 | **Hero slide 1** — teal/sand marbled wave. |
| `hero-geode.svg` | 1920×1080 | **Hero slide 2** — amethyst geode bands with a gilded edge. |
| `hero-floral.svg` | 1920×1080 | **Hero slide 3** — pressed florals in clear resin. The brightest slide; use dark headline text. |
| `hero-custom.svg` | 1920×1080 | **Hero slide 4** — amber pour in progress, for the custom-order slide. |
| `collection-home.svg` | 1080×1350 | Collection card — Home. |
| `collection-everyday.svg` | 1080×1350 | Collection card — Everyday. |
| `collection-keepsakes.svg` | 1080×1350 | Collection card — Keepsakes. |
| `collection-gifting.svg` | 1080×1350 | Collection card — Gifting. |
| `product-ocean-coaster-set-4.svg` | 1080×1350 | Product fallback — Ocean coaster set of 4. |
| `product-resin-clock-12in.svg` | 1080×1350 | Product fallback — Resin clock, 12 in. |
| `product-resin-tray-large.svg` | 1080×1350 | Product fallback — Large resin tray. |
| `product-keychain-set-3.svg` | 1080×1350 | Product fallback — Keychain set of 3. |
| `product-photo-frame-5x7.svg` | 1080×1350 | Product fallback — Photo frame, 5×7. |
| `product-bookmarks-set-4.svg` | 1080×1350 | Product fallback — Bookmark set of 4. |
| `og-image.svg` | 1200×630 | Open Graph / Twitter card image. The only artwork with text baked in. |

Notes for whoever wires these up:

- Each file namespaces its filter and gradient `id`s with a per-file prefix
  (`ocean-`, `geode-`, `floral-`, `custom-`, `home-`, `pclock-`, `og-`, …), so
  several can be inlined on one page without colliding.
- The heroes and cards carry their own vignette, so headline text stays legible
  without an extra scrim.
- The collection cards keep their centre deliberately uncluttered — the banded
  flow is pushed to the top and bottom edges so a label can sit in the middle.
- The product placeholders show only a flat geometric silhouette of the piece.
  They are stand-ins for a photograph, not illustrations to keep.

## The real photographs that already exist

These seven are genuine product shots already in the business's system. They are
**resin tables**, which are *not* part of the six-product seed catalogue — so they
belong in the hero and the gallery, not in the product grid.

```
Resin art tea tables (5):
https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621769/products/w7hqwjmubg4q4uri5xtv.jpg
https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621652/products/s7hcj5qvba7appttujwt.jpg
https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621663/products/yhka1ufwimrfvxah23gs.jpg
https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621700/products/h4nmmlko1anja6bjclb6.jpg
https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621765/products/bpret0derk5isetygjzx.jpg

Resin Art Table (2):
https://res.cloudinary.com/dkozsbkjy/image/upload/v1794933534/products/syf9jblrfoluux51mn0n.jpg
https://res.cloudinary.com/dkozsbkjy/image/upload/v1794933510/products/kdy5grdhidyuxeptdvrr.png
```

## Replacing a placeholder

Drop the real photograph in beside the placeholder, point the component at it, and
delete the `.svg`. Nothing else references these files by name.
