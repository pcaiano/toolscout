# ToolScout Agent Instructions

## Project Isolation Guardrails

These rules are permanent safety constraints for every agent, automation, migration, deployment, and infrastructure change performed from this repository.

### Project identity

- Project: ToolScout
- Repository: `pcaiano/toolscout`
- Cloudflare Worker: `toolscout`
- Cloudflare D1 database: `toolscout`
- Cloudflare D1 database ID: `cac6bc3c-d838-4edd-ba29-597030afb397`
- Public domain: `trytoolscout.org`

### Mandatory isolation rules

1. A ToolScout agent may alter only resources that are verified to belong to ToolScout. It must never alter a resource belonging to BEARING / Luxury Buyer Intelligence.
2. Never reuse, migrate, delete, rename, rebind, overwrite, purge, or repoint another project's Worker, D1 database, KV namespace, R2 bucket, Queue, Durable Object, route, custom domain, webhook, Make scenario, secret, environment variable, or other operational resource.
3. Before any database migration, binding change, destructive action, infrastructure reconfiguration, or deployment that can affect infrastructure, explicitly identify and validate the target resource name and, where available, its resource ID against the current project identity.
4. If the resource name or ID cannot be verified, stop the potentially destructive action and report it as a blocker. Never infer ownership from a similar name, binding name, account, team, or previous configuration.
5. Shared administrative scopes such as the same GitHub account, Cloudflare account, or Make organization/team are allowed. They do not imply that operational resources are shared or interchangeable.
6. Never copy or reuse secrets, tokens, credentials, environment values, databases, datasets, or production bindings between ToolScout and BEARING unless the owner gives an explicit cross-project instruction for that specific action.
7. Any requested cross-project change requires explicit owner authorization and must be handled as a separate, clearly scoped task with both projects' resource identities verified before execution.
8. A generic binding name such as `DB` is not evidence of resource identity. Validate the underlying database/resource ID.
9. Prefer non-destructive inspection when ownership is uncertain. Verification comes before mutation.

### Known BEARING boundary

The BEARING repository is `pcaiano/luxury-buyer-intelligence-portugal`. Its exact Cloudflare Worker, D1 database IDs, routes, and secret assignments are not established by this ToolScout file and must never be guessed from ToolScout context. Treat all BEARING infrastructure as out of scope unless the owner explicitly authorizes a separate cross-project task.

### Execution rule

Before a risky infrastructure operation, the agent should be able to state: **current project → target resource → verified name/ID → intended operation**. If that chain cannot be established, do not execute the operation.
