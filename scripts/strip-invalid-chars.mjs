/**
 * Removes characters that have no business being in source: Unicode
 * private-use-area code points, and C0/C1 controls other than tab, newline and
 * carriage return.
 *
 * Written after one slipped into a component while it was being generated — a
 * build error at best, an invisible parse problem at worst.
 *
 * Usage: node scripts/strip-invalid-chars.mjs <file...>
 */
import { readFileSync, writeFileSync } from 'node:fs'

const INVALID = new RegExp(
  [
    '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]', // controls
    '[\\uE000-\\uF8FF]', // BMP private use area
    '[\\u{F0000}-\\u{FFFFD}]', // supplementary private use A
    '[\\u{100000}-\\u{10FFFD}]', // supplementary private use B
  ].join('|'),
  'gu',
)

let touched = 0

for (const file of process.argv.slice(2)) {
  const original = readFileSync(file, 'utf8')
  const cleaned = original.replace(INVALID, '')

  if (cleaned === original) {
    console.log(`${file}: clean`)
    continue
  }

  writeFileSync(file, cleaned)
  console.log(`${file}: removed ${original.length - cleaned.length} invalid character(s)`)
  touched += 1
}

if (touched === 0) console.log('nothing to fix')
