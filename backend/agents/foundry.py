"""Calls agents that were created by hand in the Microsoft Foundry portal.

Agents are looked up by name, so this code never defines their instructions or
model; it only sends one user turn and reads the reply.
"""

from __future__ import annotations

import threading

from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential


def final_text(response) -> str:
    """Text of the last message only. With tools such as File Search an agent can send
    more than one message, and `output_text` joins them all together."""
    messages = [item for item in (response.output or []) if getattr(item, "type", None) == "message"]
    if messages:
        parts = [c.text for c in messages[-1].content or [] if getattr(c, "type", None) == "output_text"]
        if parts:
            return "".join(parts)
    return response.output_text


def web_search_results(response) -> dict:
    """{"searches": n, "urls": [...]} from the web_search_call items of a response."""
    searches, urls = 0, []
    for item in response.output or []:
        if getattr(item, "type", None) != "web_search_call":
            continue
        searches += 1
        for source in getattr(getattr(item, "action", None), "sources", None) or []:
            url = source.get("url") if isinstance(source, dict) else getattr(source, "url", None)
            if url:
                urls.append(url)
    return {"searches": searches, "urls": urls}


class FoundryAgents:
    def __init__(self, endpoint: str):
        self._credential = DefaultAzureCredential()
        self._project = AIProjectClient(endpoint=endpoint, credential=self._credential, allow_preview=True)
        self._clients = {}
        self._lock = threading.Lock()

    @property
    def project(self) -> AIProjectClient:
        return self._project

    def _client_for(self, agent_name: str):
        with self._lock:
            if agent_name not in self._clients:
                self._clients[agent_name] = self._project.get_openai_client(agent_name=agent_name)
            return self._clients[agent_name]

    def run_agent(self, agent_name: str, text: str) -> str:
        return final_text(self._respond(agent_name, text))

    def run_agent_with_search(self, agent_name: str, text: str) -> tuple[str, dict]:
        """The reply, plus what the Web Search tool really did: how many searches, and the result URLs.

        The model's own list of sources is only a claim; these results let code check it.
        """
        response = self._respond(agent_name, text, include=["web_search_call.action.sources"])
        return final_text(response), web_search_results(response)

    def _respond(self, agent_name: str, text: str, **extra):
        client = self._client_for(agent_name)
        # Each call is a fresh, single-turn conversation.
        conversation = client.conversations.create()
        return client.responses.create(
            conversation=conversation.id,
            input=[{"role": "user", "content": text}],
            extra_body=extra or None,
        )

    def close(self) -> None:
        self._project.close()
        self._credential.close()
