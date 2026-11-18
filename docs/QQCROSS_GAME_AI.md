# QQCross Game AI — integration contract

**Status:** backend contract and validation layer; not yet connected to the QQCross client.

## Purpose

QQ AI and QQCross will use one shared intelligence service. This endpoint is the first bounded game-specific capability. It does not build or edit boards and does not replace the deterministic scanword generator.

## Endpoint

`POST /api/game-assistant`

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer <Supabase access token>`

The endpoint validates the Supabase session using the public Supabase Auth user endpoint. The Cerebras key remains server-side. No key is sent to QQCross.

## Supported tasks

### Hint

Input:
```json
{
  "request": {
    "task": "hint",
    "clue": "Столица Франции",
    "answer": "Париж",
    "knownLetters": "П_Р_Ж",
    "hintLevel": 1
  }
}
```

Output:
```json
{
  "result": {
    "task": "hint",
    "hint": "Это крупнейший город страны на берегу Сены.",
    "level": 1,
    "revealsAnswer": false
  }
}
```

The answer is supplied only as hidden reasoning context. The response validator rejects a hint that contains the answer.

### Explain a clue

Input fields: `task: "explain"`, `clue`, `answer`.

Output fields: `explanation` and a short array of `steps`. The model must flag ambiguity instead of inventing context.

### Write scanword clues

Input fields: `task: "write_clues"`, an explicit list of 1–12 already-approved answers, and optional style.

The model may only write clue text for the supplied answers. The validator checks that every input answer appears exactly once, unchanged, and rejects clue text containing the answer. Empty clue text is allowed when the model cannot safely produce a good clue.

## Non-negotiable game rules

- The model must never create, move, resize, or reconnect cells.
- The model must never change answer strings, answer directions, intersections, or match state.
- The scanword topology and answer validation remain deterministic application logic.
- Generated clues are drafts. The QQCross generator/editor must still apply dictionary, duplicate, ambiguity, profanity, answer-leak, and board-fit checks before publication.
- Treat model output as untrusted even after JSON parsing. The client must validate it again.
- Never expose the hidden answer in a hint response or display server-side reasoning context to players.

## Current limitations

- The endpoint requires a valid Supabase access token and a configured server-side `CEREBRAS_API_KEY`.
- The current Cerebras integration is text-only. This endpoint does not provide image/video understanding or web search.
- No claim of availability is made until the required server environment variables are configured and a real authenticated request is tested.
- This contract is independent of APK work. QQCross will be integrated later, after its client API and authorization flow are explicitly reviewed.
