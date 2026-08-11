# Homelab Notes

## Purpose

This file explains how this project should look up homelab server context and credentials during development or deployment tasks.

Do not store real secrets in this repository. Record only paths, variable names, service names, and safe commands.

## Local Workspace Paths

This project may be opened from either Windows checkout:

- Desktop PC: `C:\Users\Spyros\OneDrive\Υπολογιστής\projects\geo-tool`
- Laptop: `C:\Users\thugs\Desktop\projects\geo-tool`

Both paths are valid checkouts on different computers. Use the path that exists on the active computer; do not rewrite, copy, or synchronize one checkout into the other unless explicitly requested.

## SSH Access

Preferred SSH target:

```bash
ssh homelab
```

Direct server identity:

```txt
spandreou@192.168.1.50:22
```

Local SSH config uses the private key at `C:\Users\Spyros\.ssh\id_ed25519`. Never copy the key contents into docs, logs, tickets, or chat.

## Credential Lookup Rules

Use these locations only as lookup references:

```txt
/home/spandreou/Desktop/Credentials
/home/spandreou/projects/homelab/.env
/home/spandreou/projects/homelab/.env.example
```

Local template for this project:

```txt
frontend/.env.example
```

Useful local env key names:

```txt
VITE_BACKEND_URL
```

## Project Server Mapping

No verified homelab deployment was found for this project.

Local stack hints:

```txt
geo-tool.sln
GeoDataProcessingTool/GeoDataProcessingTool.csproj
frontend/package.json
frontend/.env.example
```

If this project is deployed later, update this file with the server path, service manager or compose project, backend port, frontend URL, and health checks.

## Useful Server Commands

```bash
ssh homelab
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker compose ls
find /home/spandreou/projects /opt -maxdepth 3 -type d -iname '*geo*' 2>/dev/null
```

## Do Not Store Secrets

- Do not paste passwords, tokens, API keys, private keys, recovery codes, or full database URLs into this file.
- Do not commit `.env` files.
- If a secret-bearing file must be inspected, read the minimum needed and summarize only variable names or paths.
