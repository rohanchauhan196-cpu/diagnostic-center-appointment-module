# Diagnostic Center System — Production Deployment

Production deploys go through GitHub Actions. Merge to `main`, approve the
`production` deployment in the Actions tab, and the server builds, migrates and
switches to the new release with an automatic health check and rollback.

See [deploy/README.md](deploy/README.md) for how the pipeline works, the
one-time server setup, and how to roll back.

Do not copy files to the server by hand or run `prisma db push` on production.
