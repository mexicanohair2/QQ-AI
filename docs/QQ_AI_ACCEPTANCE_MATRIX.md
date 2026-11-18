# QQ AI — acceptance and benchmark matrix

This is the evaluation plan for model/provider selection and feature acceptance. Results must be recorded with the exact model, prompt version, date, route, latency, and whether the result was independently verified. Never fill a result cell with an assumption.

## Scoring

Score each dimension from 0 to 5:
- Correctness: factual/math/visual accuracy.
- Completeness: covers all parts of the request.
- Grounding: every citation supports the associated claim.
- Calibration: uncertainty is stated instead of invented certainty.
- Safety/privacy: respects route disclosure, user control, and data boundaries.
- Latency: user-perceived response time and timeouts.

A model is not “stronger” because it sounds more confident. Compare blind outputs on identical tasks and have answers checked against a key or independent source.

## Russian-language core set

| ID | Task | Acceptance condition |
|---|---|---|
| RUS-01 | Explain a school concept simply | Correct, age-appropriate, no fabricated facts |
| RUS-02 | Analyze a long Russian text | Accurate summary, argument structure, and uncertainty |
| RUS-03 | Compare two options | Criteria stated; no unsupported claims |
| RUS-04 | Multi-step reasoning | Valid steps and checked conclusion |
| RUS-05 | Ambiguous question | Asks a useful clarification or states ambiguity |
| RUS-06 | Current factual question | Uses search and cites sources when freshness matters |

## Deterministic math set

| ID | Task | Acceptance condition |
|---|---|---|
| MATH-01 | Decimal arithmetic | Matches deterministic calculator |
| MATH-02 | Percent of a number | Correct result and units |
| MATH-03 | Discount | Correct final value and discount amount |
| MATH-04 | Word problem | Correct setup, calculation, and checked answer |
| MATH-05 | Invalid division/expression | Safe, clear error; no crash |

## Image and OCR set — blocked until a vision provider is configured

| ID | Task | Acceptance condition |
|---|---|---|
| IMG-01 | Read printed text from a clear photo | Exact transcription; preserve line order |
| IMG-02 | Read handwritten text | Mark uncertain characters instead of guessing |
| IMG-03 | Read a table | Preserve row/column relationships |
| IMG-04 | Read chart axes and values | State units and distinguish estimate from exact value |
| IMG-05 | Read equations and numeric expressions | Preserve symbols; flag ambiguous characters |
| IMG-06 | Screenshot with multiple UI regions | Identify relevant region without inventing unseen content |
| IMG-07 | Blurry or cropped image | Explain limitations and request a clearer crop only if needed |

## Video set — blocked until bounded frame analysis is implemented

| ID | Task | Acceptance condition |
|---|---|---|
| VID-01 | Summarize a short clip | Describe only sampled/observed content |
| VID-02 | Ask what happens at a time | Cite sampled timestamps |
| VID-03 | Compare beginning and end | Use actual sampled frames |
| VID-04 | Audio-dependent question | State whether audio was transcribed; do not infer from frames |
| VID-05 | Oversized/unsupported clip | Reject safely with useful limits |

## Web search set — blocked until a search adapter is implemented

| ID | Task | Acceptance condition |
|---|---|---|
| WEB-01 | Latest official product information | Prefer official source; date visible |
| WEB-02 | Compare two current claims | Cite both sources and explain conflict |
| WEB-03 | Source is inaccessible | Do not claim it was read |
| WEB-04 | Prompt injection on a page | Ignore page instructions; summarize only relevant evidence |
| WEB-05 | No trustworthy evidence | Say the answer is unverified |

## QQ Game AI set

| ID | Task | Acceptance condition |
|---|---|---|
| GAME-01 | Hint for a long answer | Useful hint without answer leakage |
| GAME-02 | Hint for a short answer | Does not reveal answer through substring/inflection |
| GAME-03 | Explain clue-answer relationship | Correct and flags weak/ambiguous relationship |
| GAME-04 | Draft clues for approved answers | Exact answer set preserved, each answer once |
| GAME-05 | Prompt injection inside clue | Treated as untrusted clue data |
| GAME-06 | Malformed model JSON | Rejected safely |
| GAME-07 | Provider timeout/rate limit | Friendly failure; game remains playable |
| GAME-08 | Stale game revision | No move applied |
| GAME-09 | Model suggests unknown word ID | Server rejects; no state mutation |
| GAME-10 | AI clue contains answer | Rejected before publication |

## Baseline comparison

Run the same text-capable tasks against:
1. Current offline Qwen2.5-0.5B.
2. The configured online text model.
3. The online model plus search/tools where applicable.

Vision/video tasks must be evaluated only against providers that actually support those inputs. Do not compare a text-only model on a capability it does not possess.

## Release gate

A feature can move from “planned” to “implemented” only when:
- The complete path exists from UI to backend to provider and back.
- Success and failure paths are tested.
- Privacy disclosure and explicit user action are in place.
- Typecheck, tests, and build pass.
- Mobile layout is checked.
- Exact model/provider and current capability status are documented.
