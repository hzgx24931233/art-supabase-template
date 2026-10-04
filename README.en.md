# art-supabase-pro · Platform Template

An enterprise admin-platform template built with **Vue 3 + TypeScript + Element Plus + Supabase**, used to
derive new business projects. It is more than a UI kit: the platform ships multi-tenancy, RBAC with
field-level permissions, dynamic menus, a workflow engine, data dictionaries, document numbering,
AI assistants and a SQL workbench, and it hosts business modules as independent sub-applications.

The product-specific business modules and branding have been removed; one real business sub-application
(the FMS finance module) is kept as a working example of the hosting mechanism.

## What the template keeps

- **Identity and authorization**: Supabase Auth sign-in, tenant isolation, role/menu/button permissions,
  field-level permissions, platform-super tenant switching.
- **Platform governance**: dynamic menu and route assembly, dictionaries, system parameters, website
  configuration, document numbering, notification reminders, attachment centre.
- **Workflow engine**: definitions and versions, workbench, monitoring, analytics, business contracts.
- **AI foundation**: AI configuration and prompt versions, SQL assistant, run diagnosis, project
  assistant, AI operations console.
- **Data centre**: Supabase AI assistant, SQL console, dictionary and attachment management.
- **Frontend baseline**: Art component library, themes and dark mode, i18n, example pages.
- **Module hosting**: hosted applications (application registry, view globs, submodule aliases).
- **Engineering**: ESLint/Prettier/Stylelint, unit tests (node:test), Playwright e2e, quality audit
  scripts, and the Supabase backup/restore/distribution PowerShell toolchain.

## What was removed

Transportation, fleet, HR, master-data, safety, warehouse, manufacturing and supply-chain modules and
their Edge Functions are gone. Brand names, the project ref, Supabase keys, map keys and demo
credentials were replaced with placeholders. The database baseline is not kept in the repository;
databases are delivered through the backup/restore flow (see `supabase/README.md`).

## Getting started

```bash
pnpm install
```

Edit the committed `.env` (placeholder values) and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`,
`VITE_LOCK_ENCRYPT_KEY`, and optionally the AMap keys. Then:

```bash
pnpm dev            # development server
pnpm typecheck      # type check
pnpm lint           # lint
pnpm test:unit      # unit tests
pnpm build          # production build into dist/
pnpm check:fast     # audits + typecheck + lint + unit tests
```

## Business sub-applications

FMS is kept as a working example of the module mechanism:

```bash
pnpm modules:install fms    # initialise the submodule and install dependencies
pnpm modules:build fms      # build the submodule
pnpm modules:status         # submodule status
```

Adding a new module requires updating `scripts/hosted-module-dependencies.ts`,
`src/bootstrapHostedApplications.ts`, `src/config/application.ts`, `tsconfig.json` and `.gitmodules`.
The full derivation guide is in [docs-template/START-HERE.md](docs-template/START-HERE.md) (Chinese).
The Chinese [README.md](README.md) is the primary document.

## License

ISC (`LICENSE`).
