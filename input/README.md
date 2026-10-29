# UFLMB image input folder

Place card image files for the filename-based importer in this folder.

## Filename format

`fp.playername.ovr.position.png` or `ot.playername.ovr.position.png`

Examples:

- `fp.berardi.86.rw.png`
- `fp.van_de_ven.87.cb.png`
- `fp.r_zalazar.83.cm.png`
- `fp.raphinha.91.lw.png`

Supported extensions: PNG, JPG/JPEG, and WebP. Use lowercase ASCII, replace spaces with underscores, and keep the event prefix (`fp` or `ot`), OVR, and position in the filename.

## Safety

- Keep your original image archive untouched.
- Do not commit private files or credentials here.
- A filename must match exactly one existing card by event, player alias, OVR, and position. Ambiguous or unmatched files must not be assigned automatically.
- Existing card images must never be overwritten without explicit review.
- Files committed here are copied into the site's public static assets during the build. Do not place private or restricted images in this folder.
- Adding a file here does not upload it to Supabase or update a card record by itself.

## Current implementation status

The feature branch includes a build step that generates a manifest and copies supported files to `public/input/`, plus an admin-only loader that prepares those images for the existing preview-and-confirm import flow. The actual Supabase Storage upload and card-record update only start after the administrator confirms the import dialog.

The feature is still under review in [PR #9](https://github.com/UFLMB/UFLMB/pull/9). The Supabase migration is committed but has not been applied to the live database. Review and merge/deploy the code, and separately review and apply the migration to the intended Supabase project, before using the importer in production.
