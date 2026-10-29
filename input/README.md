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

## Current implementation status

This folder establishes the repository drop location. The admin importer still needs to be connected to discover and process files from this folder; adding a file here alone does not upload it to Supabase. Review the feature branch and its pull request before merging or deploying.
