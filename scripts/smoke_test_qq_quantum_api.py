#!/usr/bin/env python3
"""Run a small authenticated acceptance suite against a live QQ Quantum API."""
from __future__ import annotations

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE_URL = os.environ.get("QQ_QUANTUM_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
TOKEN = os.environ.get("QQ_QUANTUM_TOKEN", "")


def http_request(path: str, payload: dict | None = None, *, token: str | None = None):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {}
    if token is not None:
        headers["Authorization"] = "Bearer " + token
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = Request(BASE_URL + path, data=data, headers=headers)
    try:
        with urlopen(request, timeout=45) as response:
            return response.status, response.read().decode("utf-8")
    except HTTPError as error:
        return error.code, error.read().decode("utf-8")
    except URLError as error:
        raise RuntimeError(f"Could not reach QQ Quantum API: {error}") from error


def parse_sse(raw: str) -> tuple[str, bool]:
    pieces = []
    done = False
    for line in raw.splitlines():
        if line == "data: [DONE]":
            done = True
        elif line.startswith("data: "):
            item = json.loads(line[6:])
            pieces.append(item["choices"][0]["delta"].get("content", ""))
    return "".join(pieces), done


def main() -> int:
    if not TOKEN:
        print("Set QQ_QUANTUM_TOKEN in the environment; no token is stored by this script.", file=sys.stderr)
        return 2

    health_status, health_raw = http_request("/health")
    if health_status != 200:
        raise RuntimeError(f"Health check returned HTTP {health_status}: {health_raw[:200]}")
    health = json.loads(health_raw)
    if health.get("status") != "ready" or health.get("architecture") != "own decoder-only Transformer":
        raise RuntimeError(f"Unexpected health response: {health}")

    cases = [
        ("greeting", [{"role": "user", "content": "Привет!"}], "QQ Quantum"),
        ("identity", [{"role": "user", "content": "Как тебя зовут?"}], "Меня зовут QQ Quantum"),
        ("galaxy_followup", [
            {"role": "user", "content": "Расскажи про космос."},
            {"role": "assistant", "content": "Космос — огромное пространство за пределами земной атмосферы."},
            {"role": "user", "content": "А что такое галактика?"},
        ], "Галактика"),
        ("mercury", [{"role": "user", "content": "Какая планета ближе всего к Солнцу?"}], "Меркурий"),
        ("energy_paraphrase", [{"role": "user", "content": "Расскажи об энергии простыми словами."}], "Энергия"),
        ("math_exact", [{"role": "user", "content": "Сколько будет 17 умножить на 23?"}], "391"),
        ("math_paraphrase", [{"role": "user", "content": "Сколько получится, если 17 умножить на 23? Покажи расчёт."}], "391"),
        ("unknown_fail_closed", [{"role": "user", "content": "Назови три спутника Юпитера и сравни их орбиты."}], "не могу надёжно"),
    ]

    failures = []
    for name, messages, expected in cases:
        status, raw = http_request(
            "/v1/chat/completions",
            {"messages": messages, "stream": True},
            token=TOKEN,
        )
        answer, done = parse_sse(raw) if status == 200 else ("", False)
        passed = status == 200 and done and expected.casefold() in answer.casefold()
        print(json.dumps({
            "case": name,
            "passed": passed,
            "http_status": status,
            "sse_done": done,
            "answer": answer,
        }, ensure_ascii=False))
        if not passed:
            failures.append(name)

    unauthenticated_status, _ = http_request(
        "/v1/chat/completions",
        {"messages": [{"role": "user", "content": "Привет!"}], "stream": True},
    )
    invalid_status, _ = http_request(
        "/v1/chat/completions",
        {"messages": [], "stream": True},
        token=TOKEN,
    )
    auth_ok = unauthenticated_status == 401
    schema_ok = invalid_status == 400
    print(json.dumps({
        "health_training_step": health.get("training_step"),
        "standalone_qa_count": health.get("corpus_questions"),
        "unauthenticated_rejected": auth_ok,
        "invalid_request_rejected": schema_ok,
    }, ensure_ascii=False))
    if not auth_ok:
        failures.append("unauthenticated_request")
    if not schema_ok:
        failures.append("invalid_request")

    print(json.dumps({"passed": len(cases) + 2 - len(failures), "total": len(cases) + 2, "failures": failures}))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
