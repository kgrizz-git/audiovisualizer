# Private Fork Bootstrap Prompt

Use this when cloning an existing repo to create a private fork, derivative project, or
internal copy that should not accidentally push back to the source remote.

## Safety First

Before changing remotes:

1. Run `git remote -v`.
2. Identify which remote points to the original source.
3. Tell the user that pushes should go to a new private remote, not the source repo.
4. Confirm whether to preserve the original remote as `upstream`.

## Recommended Remote Setup

If preserving upstream history is useful:

```sh
git remote rename origin upstream
git remote add origin <new-private-repo-url>
git remote -v
```

If the source should be fully detached:

```sh
git remote remove origin
git remote add origin <new-private-repo-url>
git remote -v
```

Do not push until the user confirms the new `origin` is correct.

## Repo Hygiene

After remotes are safe:

- Search for source project names, URLs, badges, package names, deployment targets, and
  secrets references.
- Update README, package metadata, CI names, deployment configs, and docs to reflect the
  new project.
- Remove or rewrite source-specific issue templates, CODEOWNERS, release workflows, and
  package publishing config if they do not apply.
- Check license obligations before making the fork private or proprietary.
- Run available tests/checks before the first private push.

## Handoff

Report:

- Final remote mapping.
- Files changed for rebranding/detachment.
- Any upstream sync strategy, if kept.
- Checks run.
- First push command, only after confirmation.
