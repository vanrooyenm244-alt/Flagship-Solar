# Automatic Google Apps Script deployment

The workflow at `.github/workflows/deploy-apps-script.yml` deploys the **existing**
Apps Script backend into the **existing Web App deployment** after successful
`Flagship completion checks` on a push to `main`. It does not create a new
deployment URL. GitHub Pages frontend deployments are separate.

## One-time administrator setup

1. In the existing Apps Script project, open **Project Settings** and copy its
   **Script ID**. Add it in GitHub > Settings > Secrets and variables >
   Actions > New repository secret as `APPS_SCRIPT_ID`.
2. In Apps Script, **Deploy > Manage deployments**, select the Web App that both
   apps currently use, and copy its **Deployment ID**. Save it as GitHub secret
   `APPS_SCRIPT_DEPLOYMENT_ID`. Do not use the Script ID in this field.
3. Install Google clasp locally and authenticate the Google account that owns
   or can edit the Apps Script project. Store the content of its Google clasp
   authentication file (`~/.clasprc.json`) as repository secret
   `APPS_SCRIPT_CLASP_CREDENTIALS`. **Do not put this credential in the repo,
   screenshots, or a chat.** Treat it as a sensitive OAuth token and rotate
   it if disclosed.
4. Ensure that **Google Apps Script API** is enabled for the Google account
   using the Apps Script settings page.
5. To deploy once, open **Actions > Deploy Apps Script backend > Run workflow**
   on the main branch. Review the job log for the successful `clasp deploy`
   step, then test a *draft* in Xero from Hi Service.

The workflow checks all three secrets and fails safely when one is missing.
A deployment must succeed before the Hi Service Xero button will function.

## Safeguards and important limitations

- The workflow first pulls the existing Apps Script project to preserve its
  existing manifest and files, then overlays the `apps-script/*.gs` and
  `apps-script/*.js` files from GitHub. **Therefore the repository files are
  authoritative** for matching filenames: review remote changes before setup.
- `clasp push` changes the Apps Script project's HEAD before `clasp deploy`.
  Only the existing deployment ID is versioned/redeployed. Check your rollback
  process before enabling production automation.
- This workflow does not provision Xero OAuth credentials, connect organisations,
  or check a real Xero transaction. Xero must be configured and connected in
  the backend separately.
- Both apps use the shared Xero tenant for now. Migrating Hi Service to its own
  Xero organisation later requires adding distinct token/tenant configuration.
- Never commit secrets to source control.
