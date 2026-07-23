# Included MIDI demos

The app ships full scores where a reliable public-domain MIDI source is available,
plus deliberately labeled short studies. Modern pop/rock/hip-hop *songs* are not
bundled: commercial recordings and arrangements are copyrighted. Instead, the
studio includes original educational style-studies that evoke contemporary genres
without copying protected works.

| File | Contents | Source and status |
|---|---|---|
| `bach_prelude_c_full.mid` | J. S. Bach, Prelude in C major, BWV 846; full prelude (~2:20) | [Mutopia Project](https://www.mutopiaproject.org/ftp/BachJS/BWV846/wtk1-prelude1/wtk1-prelude1.mid), public-domain score/source. |
| `mozart_nachtmusik_mvt1_full.mid` | W. A. Mozart, *Eine kleine Nachtmusik*, KV 525, movement I; full movement (~5:20) | [Mutopia Project score page](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=900), marked Public Domain. |
| `joplin_maple_leaf_rag_full.mid` | Scott Joplin, *Maple Leaf Rag*; full rag (~2:24) | [Mutopia Project](https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.mid), Public Domain (1899 edition). |
| `bowman_12th_street_rag_full.mid` | Euday L. Bowman, *12th Street Rag*; full rag (~2:36) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%2212th_Street_Rag%22_(1915),_by_Euday_Bowman.mid), Public Domain (US pre-1931). |
| `beethoven_fur_elise.mid` | Theme study only; not the full bagatelle | Locally generated educational fixture. |
| `blues_12bar_style.mid` | Original 12-bar blues style study | Locally generated; not a song transcription. |
| `jazz_swing_style.mid` | Original jazz swing ii-V-I style study | Locally generated; not a song transcription. |
| `funk_groove_style.mid` | Original funk groove style study | Locally generated; not a song transcription. |
| `electronic_arp_style.mid` | Original electronic arpeggio style study | Locally generated; not a song transcription. |
| `hiphop_keys_style.mid` | Original hip-hop keys/sub-bass loop | Locally generated; not a song transcription. |
| `rock_riff_style.mid` | Original rock power-chord riff | Locally generated; not a song transcription. |
| `house_four_on_floor_style.mid` | Original house four-on-the-floor groove | Locally generated; not a song transcription. |

Short classical excerpts (`bach_prelude_c.mid`, `mozart_nachtmusik.mid`) may still
exist from the generator script; the UI points at the full Mutopia scores where
available.

Do not represent a short fixture as a full work. New bundled assets need a source,
license/status check, and an accurate duration label in the UI. Regenerate the
local style studies with:

```bash
node scripts/generate_demo_midis.js
```

That script never overwrites `*_full.mid` public-domain assets.

For more scores (including modern pop/rock catalogs), use the app’s **Find more MIDI
online** links (FreeMIDI.org, BitMidi, Mutopia, Wikimedia Commons, etc.): download a
`.mid` locally and drop it into the studio. Those sites are not redistributed here;
rights vary by file.
