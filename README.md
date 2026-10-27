# PSI NIT Editor

A small, single-file, offline web editor for DVB **NIT** (Network Information Table) dumps in the `*.psi` text format exported by the **Luminato** DVB-C equipment ("Network information editor" → export).

Open `index.html` in a browser, import a `.psi` file, edit, export. No server, no build step, no dependencies, nothing is uploaded anywhere.

> Unofficial tool, not affiliated with the equipment vendor. Always test an edited table on a spare multiplex/receiver before putting it on air.

## Quick start

1. Open `index.html` (double-click).
2. **Import** a file (button or drag & drop). Try `example/example.psi`.
3. Edit network ID / version, transponders, services, LCN.
4. **Export** – the file is downloaded as `<original name>_YYYYMMDD_HHMMSS.psi` (local date and time, so you never overwrite a previous export; an existing timestamp suffix is replaced, not stacked).
5. Upload the exported file back to the equipment.

## What can be edited

| Item | Editor |
|---|---|
| Network ID, version (0–31), table ID | numeric fields |
| Network descriptors | `0x40` network name (text), others as raw hex |
| Transponder (TS) | TSID, ONID – add, duplicate, delete, search by TSID/ONID/frequency |
| `0x44` cable_delivery_system | frequency (MHz), modulation, symbol rate (Msym/s), FEC outer, FEC inner |
| `0x41` service_list | table of SID + service type |
| `0x83` EACEM logical_channel | table of SID + visible flag + LCN (1–1023) |
| `0x5F` private_data_specifier and any other descriptor | raw hex (`EACEM` / `NorDig` labels for `00000028` / `00000029`) |

Helpers for LCN: **+ LCN (EACEM 0x83)** creates the descriptor from the transponder's service list (and adds `0x5F = 00000028` if there is no EACEM/NorDig specifier); **↓ SIDs from service list** adds missing SIDs with the first free LCNs (free across the whole network); duplicate LCNs are highlighted in red across all transponders (highlighting only – export is not blocked).

## File format (as observed)

```
PSI/SI TABLE:0x40 <hex of section 0><hex of section 1>...
```

* A text header `PSI/SI TABLE:0x`, then the hex bytes of **all NIT sections concatenated**. The Luminato export starts with one extra byte (`40`, the table id) in front of the first section. The editor detects this (it checks the CRC of the first section with and without the extra byte) and writes it back the same way.
* Each section is a standard DVB NIT section (ETSI EN 300 468): `table_id`, `section_length`, `network_id`, `version`, `section_number`, `last_section_number`, network descriptors, transport stream loop, CRC-32 (MPEG-2).
* In the example, `4040F053...` = header byte `40`, then a section starting `40 F053` (table `0x40`, length `0x053`).

### Export behaviour

* **Round-trip is lossless**: importing and exporting without edits gives a byte-identical file (checked on a real Luminato export, see `test/roundtrip.js`).
* CRC-32 is recalculated for every section on export; a CRC mismatch on import is shown in the header bar.
* Network descriptors are repeated in every section (as the equipment does). The editor keeps the original assignment of transponders to sections; transponders added in the editor go into the same section as the last transponder. If a section would exceed **1021 bytes** (EN 300 468 limit for `section_length`), it is split automatically into more sections and `section_number` / `last_section_number` are renumbered.
* Descriptor order inside a transponder is preserved. Unknown or malformed descriptors are kept as raw hex and written back unchanged.
* Reserved bits are preserved as they were read (e.g. the 12 reserved bits in `0x44`, the 5 reserved bits in each LCN entry). New LCN entries use `0x1F` (all ones).

## Details and gotchas

### Version
`version_number` is **not** incremented automatically. Raise it yourself (0–31, wraps) when you change a table that receivers may already have cached.

### Cable delivery descriptor (`0x44`)
* Frequency and symbol rate are BCD in the stream; the editor shows MHz (frequency, 4 decimals) and Msym/s (symbol rate, 4 decimals): `04 34 00 00` → `434` MHz, `00 68 75 0` → `6.875` Msym/s.
* Modulation: `1` 16-QAM, `2` 32-QAM, `3` 64-QAM, `4` 128-QAM, `5` 256-QAM.
* **FEC outer**: `0` not defined, `1` none, `2` Reed-Solomon RS(204,188). **FEC inner**: `0` not defined, `1` 1/2, `2` 2/3, `3` 3/4, `4` 5/6, `5` 7/8, `6` 8/9, `7` 3/5, `8` 4/5, `9` 9/10, `15` no convolutional coding. Normal DVB-C is **outer = 2, inner = 15**; most receivers tune from frequency, modulation and symbol rate and do not use FEC from the NIT.

### LCN (logical channel numbers) – EACEM `0x83`
Each LCN entry is 4 bytes: `SID` (16 bit), `visible_service_flag` (1 bit), 5 reserved bits, `LCN` (10 bit).

* The descriptor only counts if it follows a **`0x5F private_data_specifier`** with the right value in the same transponder loop. **`0x00000028` = EACEM**, `0x00000029` = NorDig. A specifier of `00000000` means "no private data" and receivers ignore `0x83` after it. If you convert a table that had `00000000`, change the existing `0x5F` value (and keep it **before** `0x83`) instead of leaving a stale `0x5F` in front of the new one – a later `0x5F` that is not `0x28` between the specifier and `0x83` would override it.
* LCN is matched to services by ONID + TSID + SID. These must equal the real values in the transport streams, otherwise the LCN is silently ignored.
* The editor edits EACEM `0x83` only. NorDig's `0x87` descriptor (visible flag + service type) is shown as raw hex. Other descriptors are not interpreted.

### Network name (`0x40`)
Edited as Latin-1 (one byte per character). Non-Latin text is not supported.

### Service type list
`0x01` SD MPEG-2, `0x02` radio, `0x03` teletext, `0x0A` advanced codec radio, `0x11` MPEG-2 HD, `0x16` SD AVC, `0x17` NVOD SD AVC, `0x19` HD AVC, `0x1F` UHD/HEVC. Other values are preserved and shown as hex.

## Receiver behaviour: put the same NIT on every multiplex

Field observation with a DVB-C receiver family (not a universal rule):

* With the edited NIT attached **only to one multiplex** (e.g. 530 MHz), the scan placed that multiplex's services on their LCNs, then scanned the other frequencies, sorted the services **by SID within each frequency** and numbered them sequentially after the last used number – i.e. the LCNs of the other transponders were ignored.
* Everything worked as intended once the **same edited NIT (same network ID, same version, same LCNs) was attached to every frequency**. Those receivers take LCN from the NIT of the multiplex a service is found on.

So: distribute the table to all outputs/multiplexes, and keep them identical (same `version_number`). Smart TVs that read the NIT only from the start frequency may behave differently.

## Limitations

* Only NIT (actual / other table id is kept as read; a single network per file is assumed – network ID and descriptors are taken from the first section).
* No undo; no live cross-check against the actual streams (ONID/TSID/SID consistency is your responsibility).
* Descriptor lengths are limited to 255 bytes; the editor refuses to export otherwise.
* Duplicate LCNs are highlighted but allowed.

## Tests

```
node test/roundtrip.js              # uses example/example.psi
node test/roundtrip.js my_nit.psi   # any real export
```
Checks: lossless round-trip, CRC validity after edits, automatic section splitting.

## Example

`example/example.psi`: network `NULL` (ID 1, version 18), one transponder (TSID 1001, 274 MHz, 256-QAM, 6.875 Msym/s), five services (SID 1–5, HD AVC) with EACEM LCN 1–5 (`0x5F = 00000028` + `0x83`).

## References

* ETSI EN 300 468 – Specification for Service Information (SI) in DVB systems (NIT, descriptors, cable delivery system).
* ISO/IEC 13818-1 – MPEG-2 Systems (section syntax, CRC-32).
* EACEM / NorDig specifications for logical channel descriptors.
