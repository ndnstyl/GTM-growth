#!/usr/bin/env python3
"""Small MCP command-line client (stdio servers): servers | tools <server> | call <server> <tool> <json>.

Config: $MCP_CONFIG_PATH, else .mcp-client.json in the current directory. Credential values are never
read from the file: an `env` entry maps a child variable name to the NAME of a variable in your own
environment. Exit codes: 0 ok, 2 usage or validation, 3 missing dependency or config, 4 connection, 5 tool error.
"""
import asyncio
import json
import os
import sys


class ClientError(Exception):
    def __init__(self, kind, message, code):
        super().__init__(message)
        self.kind = kind
        self.code = code


def load_config():
    path = os.environ.get("MCP_CONFIG_PATH") or os.path.join(os.getcwd(), ".mcp-client.json")
    if not os.path.isfile(path):
        raise ClientError("configuration", f"no config at {path}; set MCP_CONFIG_PATH or create "
                          ".mcp-client.json (see references/mcp-config.example.json)", 3)
    try:
        with open(path, encoding="utf8") as f:
            cfg = json.load(f)
    except (OSError, ValueError) as e:
        raise ClientError("configuration", f"cannot read {path}: {e}", 3) from e
    servers = cfg.get("mcpServers")
    if not isinstance(servers, dict) or not servers:
        raise ClientError("configuration", f"{path} has no mcpServers", 3)
    return servers


def server_params(servers, name):
    from mcp import StdioServerParameters
    spec = servers.get(name)
    if spec is None:
        raise ClientError("validation", f"unknown server {name!r}; configured: {sorted(servers)}", 2)
    if "command" not in spec:
        raise ClientError("validation", f"server {name!r} has no command; only stdio servers are supported", 2)
    env = dict(os.environ)
    for child_name, source_name in (spec.get("env") or {}).items():
        value = os.environ.get(source_name)
        if value is None:
            raise ClientError("configuration",
                              f"server {name!r} needs environment variable {source_name} (not set)", 3)
        env[child_name] = value
    return StdioServerParameters(command=spec["command"], args=spec.get("args", []), env=env)


def parse_args(raw):
    try:
        return json.loads(raw) if raw else {}
    except ValueError as e:
        raise ClientError("validation", f"arguments are not valid JSON: {e}", 2) from e


async def run(servers, argv):
    from mcp import ClientSession
    from mcp.client.stdio import stdio_client
    cmd = argv[0]
    params = server_params(servers, argv[1])
    args = parse_args(argv[3] if len(argv) > 3 else "") if cmd == "call" else {}
    try:
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                if cmd == "tools":
                    result = await session.list_tools()
                    print(json.dumps([{"name": t.name, "description": t.description,
                                       "inputSchema": t.inputSchema} for t in result.tools], indent=2))
                    return
                result = await session.call_tool(argv[2], args)
                out = [getattr(c, "text", None) or str(c) for c in result.content]
                print(json.dumps({"isError": bool(result.isError), "content": out}, indent=2))
                if result.isError:
                    raise ClientError("tool", f"tool {argv[2]!r} returned an error", 5)
    except OSError as e:
        raise ClientError("connection", f"could not run server {argv[1]!r}: {e}", 4) from e


def main():
    argv = sys.argv[1:]
    if not argv or argv[0] not in ("servers", "tools", "call"):
        raise ClientError("validation", "usage: mcp_client.py servers | tools <server> | "
                          "call <server> <tool> '<json>'", 2)
    servers = load_config()
    if argv[0] == "servers":
        print(json.dumps(sorted(servers)))
        return
    if (argv[0] == "tools" and len(argv) < 2) or (argv[0] == "call" and len(argv) < 3):
        raise ClientError("validation", "missing arguments", 2)
    try:
        import mcp  # noqa: F401
    except ImportError as e:
        raise ClientError("configuration", "the mcp package is not installed; run: pip install mcp", 3) from e
    asyncio.run(run(servers, argv))


if __name__ == "__main__":
    try:
        main()
    except ClientError as e:
        print(json.dumps({"error": str(e), "type": e.kind}))
        sys.exit(e.code)
