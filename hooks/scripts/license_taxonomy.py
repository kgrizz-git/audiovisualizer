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

# Canonical tokens reused as synonym targets. Named once so the category sets
# and the synonym map cannot drift apart (and string literals are not
# duplicated across the tables).
_APACHE_20 = "APACHE-2.0"
_BSD_2 = "BSD-2-CLAUSE"
_BSD_3 = "BSD-3-CLAUSE"
_MPL_20 = "MPL-2.0"
_GPL_20 = "GPL-2.0"
_GPL_30 = "GPL-3.0"
_LGPL_21 = "LGPL-2.1"
_LGPL_30 = "LGPL-3.0"

# License category sets (canonical SPDX-ish tokens after normalization).
PERMISSIVE_LICENSES = {
    "MIT",
    "ISC",
    _BSD_2,
    _BSD_3,
    _APACHE_20,
    "UNLICENSE",
    "0BSD",
    "CC0-1.0",
    "BLUEOAK-1.0.0",
    "PYTHON-2.0",
}
WEAK_COPYLEFT = {
    _MPL_20,
    _LGPL_21,
    "LGPL-2.1-ONLY",
    "LGPL-2.1-OR-LATER",
    _LGPL_30,
    "LGPL-3.0-ONLY",
    "LGPL-3.0-OR-LATER",
}
STRONG_COPYLEFT = {
    _GPL_20,
    "GPL-2.0-ONLY",
    "GPL-2.0-OR-LATER",
    _GPL_30,
    "GPL-3.0-ONLY",
    "GPL-3.0-OR-LATER",
    "AGPL-3.0",
    "AGPL-3.0-ONLY",
    "AGPL-3.0-OR-LATER",
}

SYNONYMS = {
    "APACHE 2.0": _APACHE_20,
    "APACHE-2": _APACHE_20,
    "APACHE2": _APACHE_20,
    "BSD": _BSD_3,
    "BSD-2": _BSD_2,
    "BSD-3": _BSD_3,
    "MPL2": _MPL_20,
    "MPL-2": _MPL_20,
    "GPLV2": _GPL_20,
    "GPLV3": _GPL_30,
    "LGPLV2.1": _LGPL_21,
    "LGPLV3": _LGPL_30,
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
