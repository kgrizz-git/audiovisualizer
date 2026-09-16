#!/usr/bin/env python3
"""
license_taxonomy.py — license classification tables shared by inventory tooling.

Extracted from `check_license_inventory.py` so the generator stays under the
repository's per-file line cap (`policies/file-size-and-counts.md`). No runtime
behavior lives here: just the canonical SPDX-ish token sets, the severity
ordering, and the human-readable glossary rendered into the inventory.

Usage:
  from license_taxonomy import (
      PERMISSIVE_LICENSES, WEAK_COPYLEFT, STRONG_COPYLEFT, SYNONYMS,
      Category, LICENSE_REFERENCES,
  )
"""

from __future__ import annotations

from enum import Enum

# License category sets (canonical SPDX-ish tokens after normalization).
PERMISSIVE_LICENSES = {
    "MIT",
    "ISC",
    "BSD-2-CLAUSE",
    "BSD-3-CLAUSE",
    "APACHE-2.0",
    "UNLICENSE",
    "0BSD",
    "CC0-1.0",
    "BLUEOAK-1.0.0",
    "PYTHON-2.0",
}
WEAK_COPYLEFT = {
    "MPL-2.0",
    "LGPL-2.1",
    "LGPL-2.1-ONLY",
    "LGPL-2.1-OR-LATER",
    "LGPL-3.0",
    "LGPL-3.0-ONLY",
    "LGPL-3.0-OR-LATER",
}
STRONG_COPYLEFT = {
    "GPL-2.0",
    "GPL-2.0-ONLY",
    "GPL-2.0-OR-LATER",
    "GPL-3.0",
    "GPL-3.0-ONLY",
    "GPL-3.0-OR-LATER",
    "AGPL-3.0",
    "AGPL-3.0-ONLY",
    "AGPL-3.0-OR-LATER",
}

SYNONYMS = {
    "APACHE 2.0": "APACHE-2.0",
    "APACHE-2": "APACHE-2.0",
    "APACHE2": "APACHE-2.0",
    "BSD": "BSD-3-CLAUSE",
    "BSD-2": "BSD-2-CLAUSE",
    "BSD-3": "BSD-3-CLAUSE",
    "MPL2": "MPL-2.0",
    "MPL-2": "MPL-2.0",
    "GPLV2": "GPL-2.0",
    "GPLV3": "GPL-3.0",
    "LGPLV2.1": "LGPL-2.1",
    "LGPLV3": "LGPL-3.0",
}


class Category(Enum):
    """Restrictiveness order used for dual-license gating (higher = worse)."""

    PERMISSIVE = 1
    WEAK_COPYLEFT = 2
    STRONG_COPYLEFT = 3
    UNKNOWN = 4


# Human-readable glossary rendered as the inventory's License References
# section. Keep in sync with the category sets above: every permissive token
# that can appear in the catalog needs a line here.
LICENSE_REFERENCES = [
    "- **MIT** — Permissive, attribution required",
    "- **ISC** — Permissive, similar to MIT",
    "- **Apache-2.0** — Permissive with patent grant, attribution required",
    "- **0BSD** — Permissive, no attribution required",
    "- **BlueOak-1.0.0** — Permissive, OSI-approved",
    "- **MPL-2.0** — Weak copyleft, file-level disclosure for modifications",
    "- **GPL-2.0/GPL-3.0** — Strong copyleft, derivative works must be open source",
    "- **LGPL-2.1/LGPL-3.0** — Weak copyleft, dynamic linking allowed",
    "- **BSD-2-Clause/BSD-3-Clause** — Permissive with minimal restrictions",
]
