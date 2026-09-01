/**
 * opencode-think-separator-plugin — token-stream reasoning parser.
 *
 * A small finite-state machine (FSM) that buffers incoming string chunks and
 * emits `{type: "reasoning" | "content", text}` events whenever a reasoning
 * block opens or closes. Designed to solve the "split-token problem" when
 * providers stream tokens over SSE, WebSocket, or the Vercel AI SDK and a
 * tag like `<think>` arrives split across two payloads.
 *
 * Architecture
 * ------------
 * - Pure factory: `createReasoningStreamParser(options)` returns an
 *   independent instance with its own buffer and state. No module-level
 *   mutable state — every call yields a fresh FSM.
 * - Two-state FSM: `CONTENT` and `REASONING`. Transitions happen the moment
 *   an opening or closing tag fully resolves inside the buffer.
 * - Whitelist-driven: the set of recognised reasoning tag names is imported
 *   from `./detect-reasoning.js` (`REASONING_TAG_NAMES`). Adding a new
 *   provider means adding the tag there, not editing this file.
 * - Buffer cap (`BUFFER_CAP = 100`): a defensive upper bound on how many
 *   characters we hold while waiting for a tag to resolve. The longest
 *   whitelisted tag is ~16 chars, so 100 is a generous safety net against
 *   pathological streams where the chunk boundary lands inside an unknown
 *   pseudo-tag and the next chunk never arrives.
 *
 * Leniency trade-off
 * ------------------
 * Unlike `extractReasoningFromText` (which enforces matched backref
 * `<open>...</open>` pairs), this FSM treats ANY whitelisted closing tag as
 * a terminator for the current reasoning block. Rationale: when reasoning
 * arrives mid-stream we usually cannot be 100% sure which opener started
 * the block (the buffer may have started after it), so we lean toward
 * closing the block on the first safe opportunity. Callers that need
 * strict pairing should use `detect-reasoning.js` on the assembled text.
 *
 * No runtime dependencies; this module loads as plain ESM JavaScript.
 */

import {REASONING_TAG_NAMES} from "./detect-reasoning.js"

/**
 * FSM state names. Exported for tests and observability; consumers should
 * not rely on internal state values, but `getState()` returns one of these.
 */
export const STATE_CONTENT = "CONTENT"
export const STATE_REASONING = "REASONING"

/** Defensive cap on buffered characters while waiting for a tag to resolve. */
const BUFFER_CAP = 100

/**
 * Checks whether `s` could still become the opening of a whitelisted
 * reasoning tag with more incoming characters. We look at the LAST `<` in
 * the buffer (not necessarily the first), so content can precede a partial
 * tag without forcing the FSM to flush it as plain text.
 *
 * Returns false as soon as the trailing tag fragment already contains `>`
 * (the tag is closed or malformed) or the buffer exceeds `BUFFER_CAP`.
 *
 * @param {string} s - Current buffer contents.
 * @returns {boolean} True if more characters might complete a whitelisted open tag.
 */
function couldBecomeOpenTag(s) {
    if (s.length > BUFFER_CAP) return false
    const lastLT = s.lastIndexOf("<")
    if (lastLT === -1) return false
    const tail = s.slice(lastLT)
    if (tail.includes(">")) return false
    const lower = tail.toLowerCase()
    for (const tagName of REASONING_TAG_NAMES) {
        if (`<${tagName.toLowerCase()}`.startsWith(lower)) return true
    }
    return false
}

/**
 * Symmetric helper for closing tags: returns true if the trailing tag
 * fragment in `s` (after the last `<`) could still become `</tagName>` with
 * more incoming characters.
 *
 * @param {string} s - Current buffer contents.
 * @returns {boolean} True if more characters might complete a whitelisted close tag.
 */
function couldBecomeCloseTag(s) {
    if (s.length > BUFFER_CAP) return false
    const lastLT = s.lastIndexOf("<")
    if (lastLT === -1) return false
    const tail = s.slice(lastLT)
    if (tail.includes(">")) return false
    const lower = tail.toLowerCase()
    if (!lower.startsWith("</")) return false
    for (const tagName of REASONING_TAG_NAMES) {
        if (`</${tagName.toLowerCase()}`.startsWith(lower)) return true
    }
    return false
}

/**
 * Builds the regex used to recognise a complete opening reasoning tag.
 * Matches `<tagname>` with optional whitespace and attributes.
 *
 * @param {readonly string[]} tagNames - Whitelist of tag names.
 * @returns {RegExp} Case-insensitive open-tag regex.
 */
function makeOpenTagRegex(tagNames) {
    return new RegExp(`<\\s*(?:${tagNames.join("|")})\\b[^>]*>`, "i")
}

/**
 * Builds the regex used to recognise a complete closing reasoning tag.
 * Matches `</tagname>` with optional whitespace.
 *
 * @param {readonly string[]} tagNames - Whitelist of tag names.
 * @returns {RegExp} Case-insensitive close-tag regex.
 */
function makeCloseTagRegex(tagNames) {
    return new RegExp(`<\\s*/\\s*(?:${tagNames.join("|")})\\s*>`, "i")
}

/**
 * Factory for the streaming reasoning parser.
 *
 * Each call returns a fresh, isolated FSM instance. The parser buffers
 * incoming chunks until it can decide whether the current position opens,
 * closes, or simply emits content/reasoning text.
 *
 * Recognised tags come from `REASONING_TAG_NAMES` by default. Pass
 * `options.tagNames` to override the whitelist (useful for tests and for
 * consumers that want to add their own provider-specific tags).
 *
 * @param {object} [options]
 * @param {string[]} [options.tagNames] - Custom whitelist of reasoning tag
 *   names. Defaults to `REASONING_TAG_NAMES` from `./detect-reasoning.js`.
 * @returns {{
 *   feed: (chunk: string) => Array<{type: "reasoning" | "content", text: string}>,
 *   flush: () => Array<{type: "reasoning" | "content", text: string}>,
 *   getState: () => string
 * }} A fresh parser instance.
 */
export function createReasoningStreamParser(options = {}) {
    const tagNames =
        options.tagNames && options.tagNames.length > 0 ? options.tagNames : REASONING_TAG_NAMES

    const openRe = makeOpenTagRegex(tagNames)
    const closeRe = makeCloseTagRegex(tagNames)

    let state = STATE_CONTENT
    let buffer = ""

    /**
     * Feeds a chunk of token-stream text to the parser and returns any
     * events produced as a result. Returns an empty array when the chunk
     * is buffered pending more characters (e.g. partial tag at the end).
     *
     * Safe to call repeatedly with arbitrarily small chunks. Non-string or
     * empty inputs are ignored.
     *
     * @param {string} chunk - A chunk of text from the upstream stream.
     * @returns {Array<{type: "reasoning" | "content", text: string}>} Events emitted by this chunk.
     */
    function feed(chunk) {
        if (typeof chunk !== "string" || chunk.length === 0) return []
        buffer += chunk
        /** @type {Array<{type: "reasoning" | "content", text: string}>} */
        const events = []

        // Loop while there is buffered text. A transition can leave the
        // buffer empty; in that case we exit cleanly instead of emitting
        // a zero-length event.
        while (buffer.length > 0) {
            if (state === STATE_CONTENT) {
                const openMatch = openRe.exec(buffer)
                if (openMatch) {
                    if (openMatch.index > 0) {
                        events.push({type: "content", text: buffer.slice(0, openMatch.index)})
                    }
                    buffer = buffer.slice(openMatch.index + openMatch[0].length)
                    state = STATE_REASONING
                    continue
                }
                if (couldBecomeOpenTag(buffer)) break
                // Buffer cannot become a tag — emit everything as content
                // and reset. There is no need to keep a trailing `<`
                // because couldBecomeOpenTag already returned false.
                events.push({type: "content", text: buffer})
                buffer = ""
                break
            }
            // STATE_REASONING
            const closeMatch = closeRe.exec(buffer)
            if (closeMatch) {
                if (closeMatch.index > 0) {
                    events.push({type: "reasoning", text: buffer.slice(0, closeMatch.index)})
                }
                buffer = buffer.slice(closeMatch.index + closeMatch[0].length)
                state = STATE_CONTENT
                continue
            }
            if (couldBecomeCloseTag(buffer)) break
            // Buffer cannot become a closing tag — flush everything
            // accumulated so far as reasoning. This keeps the stream
            // moving when the closing tag is malformed or missing.
            events.push({type: "reasoning", text: buffer})
            buffer = ""
            break
        }

        return events
    }

    /**
     * Flushes any buffered text at end-of-stream and returns trailing events.
     * The buffered text inherits the current state — if the stream ended
     * mid-reasoning the buffer is emitted as a reasoning event, otherwise
     * as content.
     *
     * @returns {Array<{type: "reasoning" | "content", text: string}>} Trailing events.
     */
    function flush() {
        if (buffer.length === 0) return []
        /** @type {{type: "reasoning" | "content", text: string}} */
        const trailing = {
            type: state === STATE_REASONING ? "reasoning" : "content",
            text: buffer
        }
        buffer = ""
        return [trailing]
    }

    /**
     * Returns the current FSM state name (one of `STATE_CONTENT`,
     * `STATE_REASONING`). Intended for tests and observability.
     *
     * @returns {string} Current state name.
     */
    function getState() {
        return state
    }

    return {feed, flush, getState}
}
