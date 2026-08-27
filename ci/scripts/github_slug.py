#!/usr/bin/env python3
"""
github_slug.py — allow-list validation for GitHub owner/repo and login strings.

Used by CI helpers before passing user- or env-supplied values into ``gh`` argv
(list form, no shell). Rejects leading hyphens and other characters that could
be mistaken for CLI flags, while allowing GitHub-valid names such as ``.github``.

Inputs:
  - repo: ``owner/name`` slug
  - login: GitHub user or org login

Outputs:
  - Normalized slug/login string
  - ``ValueError`` when the input is not an allow-listed slug

Requirements: Python 3.10+.
"""

from __future__ import annotations

import re

# GitHub login/owner: alnum + single hyphens, no leading/trailing hyphen, ≤39 chars.
_OWNER_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$")
# Repo names: alnum / . _ - ; not "." / ".."; ≤100 chars. Leading "." allowed (.github).
_REPO_NAME_RE = re.compile(r"^(?!\.\.?$)[A-Za-z0-9_.][A-Za-z0-9._-]{0,99}$")


def validate_repo_slug(repo: str) -> str:
    """Return ``owner/name`` if safe; otherwise raise ``ValueError``."""
    owner, sep, name = repo.partition("/")
    if (
        not sep
        or "/" in name
        or not _OWNER_RE.fullmatch(owner)
        or not _REPO_NAME_RE.fullmatch(name)
    ):
        raise ValueError(f"Invalid --repo {repo!r}; expected owner/name with safe characters")
    return f"{owner}/{name}"


def validate_login(login: str) -> str:
    """Return login if safe; otherwise raise ``ValueError``."""
    if not _OWNER_RE.fullmatch(login):
        raise ValueError(f"Invalid --account {login!r}; expected a GitHub login")
    return login
