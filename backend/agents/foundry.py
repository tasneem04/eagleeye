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
        client = self._client_for(agent_name)
        # Each analysis is a fresh, single-turn conversation.
        conversation = client.conversations.create()
        response = client.responses.create(
            conversation=conversation.id,
            input=[{"role": "user", "content": text}],
        )
        return final_text(response)

    def close(self) -> None:
        self._project.close()
        self._credential.close()
