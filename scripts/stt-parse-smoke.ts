/**
 * Smoke tests for `lib/stt/parse.ts` (no Jest; run via `npm test`).
 */
import assert from 'node:assert/strict'

import {
  decodeSttTextProtobuf,
  decodeSttWordMessage,
  parseSttStreamPayload,
} from '../lib/stt/parse'

function wVarint(n: number): Buffer {
  const out: number[] = []
  let x = n >>> 0
  while (x > 127) {
    out.push((x & 127) | 128)
    x >>>= 7
  }
  out.push(x)
  return Buffer.from(out)
}

function buildMinimalTextProtobuf(opts: {
  uid: number
  wordText: string
  wordFinal: boolean
  dataType?: string
}): Uint8Array {
  const parts: Buffer[] = []
  // field 4 uid
  parts.push(Buffer.from([0x20]), wVarint(opts.uid))
  // field 10 Word
  const wordInner = Buffer.concat([
    Buffer.from([0x0a, opts.wordText.length]),
    Buffer.from(opts.wordText, 'utf8'),
    Buffer.from([0x20, opts.wordFinal ? 1 : 0]),
  ])
  parts.push(Buffer.from([0x52]), wVarint(wordInner.length), wordInner)
  if (opts.dataType) {
    const dt = Buffer.from(opts.dataType, 'utf8')
    parts.push(Buffer.from([0x6a]), wVarint(dt.length), dt)
  }
  return new Uint8Array(Buffer.concat(parts))
}

// --- decodeSttWordMessage
{
  const inner = Buffer.concat([
    Buffer.from([0x0a, 0x02]),
    Buffer.from('ab', 'utf8'),
    Buffer.from([0x20, 0x01]),
  ])
  const w = decodeSttWordMessage(new Uint8Array(inner))
  assert.equal(w.text, 'ab')
  assert.equal(w.isFinal, true)
}

// --- protobuf Text: final line
{
  const buf = buildMinimalTextProtobuf({
    uid: 222,
    wordText: 'Hello',
    wordFinal: true,
    dataType: 'transcribe',
  })
  const r = decodeSttTextProtobuf(buf)
  assert.ok(r)
  assert.equal(r!.speakerRtcUid, 222)
  assert.equal(r!.text, 'Hello')
  assert.equal(r!.isFinal, true)
}

// --- protobuf Text: partial (not final)
{
  const buf = buildMinimalTextProtobuf({
    uid: 333,
    wordText: 'Hi',
    wordFinal: false,
  })
  const r = decodeSttTextProtobuf(buf)
  assert.ok(r)
  assert.equal(r!.isFinal, false)
}

// --- JSON transcript path
{
  const j = new TextEncoder().encode(
    JSON.stringify({
      transcript: { uid: 444, text: 'From JSON', isFinal: true },
    })
  )
  const r = parseSttStreamPayload(j)
  assert.ok(r)
  assert.equal(r!.speakerRtcUid, 444)
  assert.equal(r!.text, 'From JSON')
  assert.equal(r!.isFinal, true)
}

// --- parseSttStreamPayload prefers JSON when payload is JSON
{
  const j = new TextEncoder().encode('{"transcript":{"uid":1,"text":"x","isFinal":false}}')
  const r = parseSttStreamPayload(j)
  assert.ok(r)
  assert.equal(r!.text, 'x')
}

// --- JSON root words path: partials should render without waiting for final
{
  const j = new TextEncoder().encode(
    JSON.stringify({
      uid: 555,
      data_type: 'transcribe',
      words: [
        { text: 'Hel', isFinal: false },
        { text: 'lo', isFinal: false },
      ],
    })
  )
  const r = parseSttStreamPayload(j)
  assert.ok(r)
  assert.equal(r!.speakerRtcUid, 555)
  assert.equal(r!.text, 'Hello')
  assert.equal(r!.isFinal, false)
}

console.log('stt-parse-smoke: ok')
