# Business files (Apps Script)

The files students send for 1-2-3-100 (restaurant flyers and proofs, grant applications) are kept in one Google Drive folder, not on the
website. The website's server is the only thing that talks to this script: it checks who the student is, then asks the script to put a
file in the folder or hand one back. Files are only ever opened by Operations and the student who sent them.

## Set it up (once)

1. Make a folder in Drive on the account that should own the files (the plan says the team's Apollo Workspace account, with a shortcut in
   the main team drive under Operations). Copy the long part of its address: that is the folder ID.
2. Upload the script with `clasp`, signed in as that same account, from the repo's root folder:
   ```
   pnpm clasp create-script --type standalone --title "6220 Business Files" --rootDir backend/apps-script/biz-files
   pnpm clasp -P backend/apps-script/biz-files push
   ```
   (The same notes as in [ops-timer](../ops-timer/README.md) apply on Windows.)
3. In the script's Project Settings > Script Properties add `FILES_SECRET` (20 or more random characters) and `ROOT_FOLDER_ID`.
4. Deploy > New deployment > Web app: Execute as **Me**, Who has access **Anyone**. Copy the web app address.
5. In Wix (the site's Secrets Manager) add `BIZ_FILES_URL` (that address) and `BIZ_FILES_SECRET` (the same value as `FILES_SECRET`).

Until step 5 is done, the upload boxes say uploads aren't set up yet, and everything else works.
