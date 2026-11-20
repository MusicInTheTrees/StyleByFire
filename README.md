# StyleByFire

A local wardrobe and outfit studio built around your clothing photos. Plan a complete look, tune the styling rules, and keep notes about how each piece looks in real life.

## Run locally

Install **Node.js 22 or newer**, then run:

```sh
git clone https://github.com/MusicInTheTrees/StyleByFire.git
cd StyleByFire
npm start
```

Open **http://127.0.0.1:4173**. There are no npm packages to install and no build step. The server listens only on this computer; no cloud account or API key is needed. Saved wardrobes work offline. Importing from a website and loading the demo photographs for the first time require internet access.

On Windows, double-click **Start StyleByFire.cmd** instead. It starts the app in the background and opens Brave when installed, or your default browser otherwise. **Stop StyleByFire.cmd** stops the server without deleting saved data. The launcher handles an outdated desktop PATH and records startup details in `.data/launcher.log` and `.data/server.log`.

## Accounts and the test wardrobe

Create a local account with a display name, username, and password. Usernames use 3–32 letters, numbers, periods, underscores, or hyphens; passwords require at least 8 characters. Each account has its own wardrobe, photographs, saved looks, stylist preferences, and guidelines.

**Jamie Demo** is a clearly fictional person with a separate wardrobe of real product photographs from retailers. Use the demo option on the sign-in screen to try outfit combinations and accessories without changing your personal wardrobe. On first use, the app downloads the demo photographs and caches them locally under `.data/demo-photos/`; later use can reuse those files offline. Source links identify the retailers behind the photographs. A fresh clone includes demo labels and source URLs, not retailer image files or anyone's personal clothing photographs.

When upgrading an existing installation, the **first real account** claims the previous wardrobe, including corrections, notes, favorites, image adjustments, and saved looks. The server leaves `.data/wardrobe.json` untouched, makes an exact backup under `.data/backups/`, and copies the wardrobe and imported photos into the new account. Later accounts start with an empty wardrobe and import their own photos. Trying the demo does not claim the existing wardrobe.

Accounts live on this computer, with no email verification, cloud sync, or password recovery service. Passwords are stored as salted hashes and sign-in sessions use HTTP-only cookies. This separates access through the app; it does not encrypt files on disk or replace your operating system's account security. Keep a wardrobe backup and use a password you can retain safely.

The sign-in and registration forms support browser password managers, so you can save your login and autofill it later. Your browser controls whether a Save prompt appears; it is not guaranteed in every browser or profile. In Brave, enable **Offer to Save Passwords** in its Password Manager settings and check that this app is not in the declined-sites list. See [Brave's password-manager guide](https://support.brave.app/hc/en-us/articles/360018185951-How-do-I-use-the-built-in-password-manager). A successful local session lasts up to 30 days, so reopening the app normally keeps you signed in unless you sign out or clear its cookies.

## Build a look

- **Outfit designer:** choose Casual, Sport, Business, or Red carpet. The selected outfit is the primary workspace, with large piece previews above the clothing picker. A blue-and-gray interface keeps attention on your clothing's actual colors.
- **Pin required pieces:** create or remix around the items you want to wear. Conflicting pins and missing essentials are explained. New pins leave the current outfit visible until you remix it.
- **Combine accessories:** ties, belts, glasses, earrings, necklaces, brooches, watches, wristbands, and rings can appear together. Automatic selection chooses eligible pieces across accessory types instead of stopping after one accessory. Ties include neckties, bow ties, and ascots; automatic selection avoids adding several ties at once. Pin multiple accessories when you want a specific combination.
- **See the reasoning:** the color story shows the outfit's color families. Stylist notes explain the choices and flag tradeoffs such as extra patterns, colors, or pieces outside a mode's guidelines.
- **Dresses and layers:** a Top with the Dress role fills both Top and Bottom. Outerwear stays under Top; leggings stay under Bottom and can form a base or an underlayer.
- **Save combinations:** keep complete or unfinished outfits in the lookbook and reopen them with their pieces pinned.

The Personal stylist uses editable controls for favorite pieces, preferred and excluded tags, color direction, experimentation, warmth, and dresses versus separates. The Style playbook lets you change each mode's formality range, color and pattern preferences, socks requirement, outer layer, and accessory suggestions. Recommendations are transparent rules, not a generative AI service. Freeform notes are a notebook; they do not automatically change the recommendation rules.

Business starts as business casual. A completed outfit means its essential slots are filled, not that it meets every workplace or event's dress code. Confirm formal requirements against the invitation or venue.

## Background patterns

Four generated blue textile backgrounds—diamonds, linked geometry, lattice, and dots—keep the knit texture of the sock patterns that inspired them. The background stays fixed while the page scrolls. By default, it changes every 18 seconds with a 6-second fade.

Open **Background** in the lower-right corner to choose **Slowly fade between patterns**, **Keep one pattern**, or **Solid blue background**. **Next pattern** selects another design. Automatic cycling pauses while the tab is hidden, and a reduced-motion browser preference keeps the background still. The chosen mode and manually selected pattern are saved in this browser's local storage, separately from account wardrobes. The complete image-generation prompts are in [background-prompts.md](docs/background-prompts.md).

## Manage clothing and photos

Import JPEG, PNG, or WebP images, up to 20 MB each. Convert HEIC files before importing. Each piece belongs to one of six fixed categories: **Cap, Top, Bottom, Socks, Shoes, Accessories**. Add slash-separated subcategories, tags, favorites, descriptions, color labels, warmth, formality, and occasion suitability.

**Import from a website** accepts a public HTTPS product-page URL or a direct JPEG, PNG, or WebP image URL. Preview the available product photos, choose one, and review the item's name, category, color, and other labels before importing it into your account. Each imported piece retains a source credit link. This imports one wardrobe item; it does not purchase products or automatically recognize a garment's type or true color.

Website previews use product information and sharing metadata published in the page, downloading up to six image choices into the signed-in account. Product pages are limited to 2 MB and each image to 20 MB. Some stores load their content with JavaScript or block automated access. If a page cannot be imported, try its direct image URL, or save an appropriate product photo yourself and use the normal photo importer. The app does not bypass sign-in requirements or site restrictions.

Open an item to rotate its image or add **Personal notes** and **Styling & color corrections**. These notes are saved with the article and included in backups, so an assistant can read them when you ask it to. Change the Color family field to correct matching; writing a note alone does not override the matcher.

Photo studio provides exposure, contrast, saturation, temperature, tint, rotation, cropping, original-image comparison, and color-family sampling. Adjustments are stored separately; original images are not rewritten. Starting a crop resets rotation and the previous crop so the crop coordinates remain predictable.

For an existing personal installation, **Refresh inventory** scans nested folders under `ClothingImages/`, adds new files, and preserves notes, corrected labels, favorites, rotations, and saved looks. This source-folder access belongs to the account that claims the original wardrobe. Other accounts, including Jamie Demo, import their own images instead.

## Data, backups, and privacy

Account credentials and hashed session identifiers are stored in `.data/accounts.json`. Each account's wardrobe and imported photos live under `.data/accounts/<account-id>/`. Export a complete JSON backup from the app before moving to another computer or making major changes. It includes the signed-in account's photographs, labels, adjustments, preferences, and saved looks. Restore replaces that account's wardrobe after an explicit confirmation; it does not replace other accounts. A wardrobe backup is not an account-password backup.

Existing installations may also have original photos in `ClothingImages/`, a private catalog in `seed.json`, and small previews in `app/thumbs/`. These files, `.data/`, local QA files, and exported wardrobe backups are excluded from Git. The published repository contains application code, generated background artwork, and demo metadata. Changing a seed catalog does not overwrite an already-saved wardrobe.

The app sends no clothing photos to an external service, uses no analytics or remote fonts, and needs no model API. Website imports and initial demo setup contact the selected retailers to download public pages or photos; retailers receive ordinary web requests. Clicking a source link also opens its external website. Downloaded product photos stay local, and their copyright remains with their respective owners. Attribution is not a license to redistribute them; retailer photos are not committed to this repository.

Use one editing tab per account: concurrent edits are not merged. Browser storage is not the source of truth.

## Photography and styling limits

Color adjustments and the nearest-color sampler are visual aids, not calibrated color measurements. A colored photo background is useful for comparison but is not a neutral gray card. Flash glare and clipped detail cannot always be recovered. Compare the garment in daylight; for repeatable accuracy, photograph a neutral gray card under the same light.

New imports start with unverified labels. Review color, pattern, formality, and modes before relying on recommendations. This version does not include automatic garment recognition, background removal, or virtual try-on.

Styling defaults draw on [Emily Post's attire guide](https://emilypost.com/advice/attire-guide-dress-codes-from-casual-to-white-tie), [Emily Post's business-casual guide](https://emilypost.com/advice/business-casual-attire-guide), [REI's running-clothing guide](https://www.rei.com/learn/expert-advice/running-clothing.html), and the [Festival de Cannes event FAQ](https://www.festival-cannes.com/en/faq/). The latter illustrates event-specific requirements, not a universal red-carpet rule. Pattern and color-count limits are adjustable styling preferences.

## Development

```sh
npm test
node --check app/app.js
```

The 40 automated tests cover outfit rules, inventory refresh, local HTTP/account behavior, website-import URL and DNS validation, redirect and response-size limits, product metadata, and real-photo demo upgrades and offline use. Integration tests use isolated temporary data directories rather than your saved wardrobe.

- `PORT` changes the listening port.
- `STYLEBYFIRE_DATA_DIR` selects a separate data directory for isolated QA.

Source is plain JavaScript, CSS, and HTML served by a small Node server. `app/domain.js` owns outfit rules and validation; `app/photos.js` owns non-destructive image rendering; `app/app.js` owns the interface. The Windows launchers and `scripts/launch.mjs` handle local startup and shutdown.
