# Quiz — How we ship (experienced devs)

10 questions · open-book: `WORKFLOW.pdf` is allowed · suggested pass mark: 9/10
Format for Google Forms: one multiple-choice question per item; the key is at the bottom.

---

**1. Feature PRs into `staging` squash-merge. The release PR `staging` → `main` must instead use…**
a) Rebase and merge
b) A merge commit — squashing rewrites staging's commits and the branches drift
c) Fast-forward only
d) Squash merge, for a clean history

**2. A hotfix branch comes off…**
a) `staging`, because that's where integration happens
b) `main`, because that's the version running in production
c) The release PR
d) Whatever is checked out locally

**3. After a hotfix merges to `main`, what must happen next?**
a) Delete `staging`
b) Nothing — the release will pick it up
c) Merge `main` back into `staging`, or the next release reintroduces the bug
d) Cherry-pick the commit onto every open feature branch

**4. `db/schema.ts` changes on `staging`/`main` must be…**
a) Wrapped in a migration folder
b) Additive only — a breaking change is a planned migration with its own steps
c) Applied with `db:push` at the end of each sprint
d) Avoided entirely

**5. A PR changes `db/schema.ts`. When does `db:push` run on the staging database?**
a) Never — staging rebuilds itself
b) After the release PR merges
c) Once the PR is ready for review — previews share the staging database
d) Only if the preview deploy fails

**6. When does `db:push` run against the production database?**
a) Immediately before the release PR merges — additive changes are safe ahead of the code
b) A week after deploy, once things settle
c) On every merge to `staging`
d) Only during the hotfix flow

**7. A build fails in CI. Which is acceptable?**
a) Reshape the database so the build passes
b) Push the fix straight to `main` to save time
c) Fix the code forward on the branch and let checks re-run
d) Disable the failing check for this PR

**8. A user-facing PR needs which two approvals?**
a) Two code reviews
b) A teammate's code review and the product owner's sign-off on staging
c) The owner's review of the diff plus QA's code review
d) Only the owner's — it was their idea

**9. Who may push directly to `main`?**
a) Admins, for small fixes
b) The release owner, during releases
c) Nobody — branch protection applies to everyone
d) Anyone, as long as they announce it first

**10. A PR preview deployment's database is…**
a) A fresh empty database per PR
b) A copy of production, read-only
c) The shared staging Postgres database
d) Whatever `DATABASE_URL` is on the author's laptop

---

## Answer key

1-b · 2-b · 3-c · 4-b · 5-c · 6-a · 7-c · 8-b · 9-c · 10-c
