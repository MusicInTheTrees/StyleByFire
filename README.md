# StyleByFire

A local wardrobe and outfit studio built around your clothing photos. Plan a complete look, tune the styling rules, and keep notes about how each piece looks in real life.

## Run locally

Install **Node.js 22 or newer**, then run:

```sh
git clone https://github.com/MusicInTheTrees/StyleByFire.git
cd StyleByFire
npm start
```

Open **http://127.0.0.1:4173**. There are no npm packages to install and no build step. The server listens only on this computer; no cloud account, API key, or internet connection is needed to use the app.

On Windows, double-click **Start StyleByFire.cmd** instead. It starts the app in the background and opens Brave when installed, or your default browser otherwise. **Stop StyleByFire.cmd** stops the server without deleting saved data. The launcher handles an outdated desktop PATH and records startup details in `.data/launcher.log` and `.data/server.log`.

## Accounts and the test wardrobe

Create a local account with a display name, username, and password. Usernames use 3–32 letters, numbers, periods, underscores, or hyphens; passwords require at least 8 characters. Each account has its own wardrobe, photographs, saved looks, stylist preferences, and guidelines.

**Jamie Demo** is a clearly fictional person with a separate wardrobe of synthetic clothing illustrations. Use the demo option on the sign-in screen to try outfit combinations and accessories without changing your personal wardrobe. A fresh clone contains this demo, not anyone's personal clothing photographs.

When upgrading an existing installation, the **first real account** claims the previous wardrobe, including corrections, notes, favorites, image adjustments, and saved looks. The server leaves `.data/wardrobe.json` untouched, makes an exact backup under `.data/backups/`, and copies the wardrobe and imported photos into the new account. Later accounts start with an empty wardrobe and import their own photos. Trying the demo does not claim the existing wardrobe.

Accounts live on this computer, with no email verification, cloud sync, or password recovery service. Passwords are stored as salted hashes and sign-in sessions use HTTP-only cookies. This separates access through the app; it does not encrypt files on disk or replace your operating system's account security. Keep a wardrobe backup and use a password you can retain safely.

## Build a look

- **Outfit designer:** choose Casual, Sport, Business, or Red carpet. The selected outfit is the primary workspace, with large piece previews above the clothing picker. A blue-and-gray interface keeps attention on your clothing's actual colors.
- **Pin required pieces:** create or remix around the items you want to wear. Conflicting pins and missing essentials are explained. New pins leave the current outfit visible until you remix it.
- **Combine accessories:** ties, belts, glasses, earrings, necklaces, brooches, watches, wristbands, and rings can appear together. Automatic selection chooses eligible pieces across accessory types instead of stopping after one accessory. Ties include neckties, bow ties, and ascots; automatic selection avoids adding several ties at once. Pin multiple accessories when you want a specific combination.
- **See the reasoning:** the color story shows the outfit's color families. Stylist notes explain the choices and flag tradeoffs such as extra patterns, colors, or pieces outside a mode's guidelines.
- **Dresses and layers:** a Top with the Dress role fills both Top and Bottom. Outerwear stays under Top; leggings stay under Bottom and can form a base or an underlayer.
- **Save combinations:** keep complete or unfinished outfits in the lookbook and reopen them with their pieces pinned.

The Personal stylist uses editable controls for favorite pieces, preferred and excluded tags, color direction, experimentation, warmth, and dresses versus separates. The Style playbook lets you change each mode's formality range, color and pattern preferences, socks requirement, outer layer, and accessory suggestions. Recommendations are transparent rules, not a generative AI service. Freeform notes are a notebook; they do not automatically change the recommendation rules.

Business starts as business casual. A completed outfit means its essential slots are filled, not that it meets every workplace or event's dress code. Confirm formal requirements against the invitation or venue.

## Manage clothing and photos

Import JPEG, PNG, or WebP images, up to 20 MB each. Convert HEIC files before importing. Each piece belongs to one of six fixed categories: **Cap, Top, Bottom, Socks, Shoes, Accessories**. Add slash-separated subcategories, tags, favorites, descriptions, color labels, warmth, formality, and occasion suitability.

Open an item to rotate its image or add **Personal notes** and **Styling & color corrections**. These notes are saved with the article and included in backups, so an assistant can read them when you ask it to. Change the Color family field to correct matching; writing a note alone does not override the matcher.

Photo studio provides exposure, contrast, saturation, temperature, tint, rotation, cropping, original-image comparison, and color-family sampling. Adjustments are stored separately; original images are not rewritten. Starting a crop resets rotation and the previous crop so the crop coordinates remain predictable.

For an existing personal installation, **Refresh inventory** scans nested folders under `ClothingImages/`, adds new files, and preserves notes, corrected labels, favorites, rotations, and saved looks. This source-folder access belongs to the account that claims the original wardrobe. Other accounts, including Jamie Demo, import their own images instead.

## Data, backups, and privacy

Account credentials and hashed session identifiers are stored in `.data/accounts.json`. Each account's wardrobe and imported photos live under `.data/accounts/<account-id>/`. Export a complete JSON backup from the app before moving to another computer or making major changes. It includes the signed-in account's photographs, labels, adjustments, preferences, and saved looks. Restore replaces that account's wardrobe after an explicit confirmation; it does not replace other accounts. A wardrobe backup is not an account-password backup.

Existing installations may also have original photos in `ClothingImages/`, a private catalog in `seed.json`, and small previews in `app/thumbs/`. These files, `.data/`, local QA files, and exported wardrobe backups are excluded from Git. The published repository contains application code and synthetic demo data only. Changing a seed catalog does not overwrite an already-saved wardrobe.

The app sends no clothing photos to an external service, uses no analytics or remote fonts, and needs no model API. Source-reading links open external websites only when clicked. Use one editing tab per account: concurrent edits are not merged. Browser storage is not the source of truth.

## Photography and styling limits

Color adjustments and the nearest-color sampler are visual aids, not calibrated color measurements. A colored photo background is useful for comparison but is not a neutral gray card. Flash glare and clipped detail cannot always be recovered. Compare the garment in daylight; for repeatable accuracy, photograph a neutral gray card under the same light.

New imports start with unverified labels. Review color, pattern, formality, and modes before relying on recommendations. This version does not include automatic garment recognition, background removal, or virtual try-on.

Styling defaults draw on [Emily Post's attire guide](https://emilypost.com/advice/attire-guide-dress-codes-from-casual-to-white-tie), [Emily Post's business-casual guide](https://emilypost.com/advice/business-casual-attire-guide), [REI's running-clothing guide](https://www.rei.com/learn/expert-advice/running-clothing.html), and the [Festival de Cannes event FAQ](https://www.festival-cannes.com/en/faq/). The latter illustrates event-specific requirements, not a universal red-carpet rule. Pattern and color-count limits are adjustable styling preferences.

## Development

```sh
npm test
node --check app/app.js
```

Tests cover outfit rules, inventory refresh, and local HTTP/account behavior. Integration tests use isolated temporary data directories rather than your saved wardrobe.

- `PORT` changes the listening port.
- `STYLEBYFIRE_DATA_DIR` selects a separate data directory for isolated QA.

Source is plain JavaScript, CSS, and HTML served by a small Node server. `app/domain.js` owns outfit rules and validation; `app/photos.js` owns non-destructive image rendering; `app/app.js` owns the interface. The Windows launchers and `scripts/launch.mjs` handle local startup and shutdown.
