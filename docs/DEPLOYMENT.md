# Deployment — GCP VM (demo grade)

End-to-end steps to clone this repo onto a fresh GCP VM and have the demo
running on `http://<vm-external-ip>:3000`.

> **Scope**: hackathon demo. Plain HTTP, dev images, secrets in a `.env`
> on the VM. Production hardening (HTTPS via Caddy, gunicorn, multi-stage
> frontend build, Secret Manager) is the next iteration.

---

## 1. Prerequisites

- A GCP project with billing enabled
- `gcloud` CLI authenticated (`gcloud auth login`)
- An Anthropic API key (optional — without it, the app runs in
  deterministic mock mode and the demo still works)

---

## 2. Provision the VM

```bash
gcloud compute instances create caseworker-demo \
  --zone=europe-west2-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --tags=caseworker

gcloud compute firewall-rules create allow-caseworker \
  --target-tags=caseworker \
  --allow=tcp:3000,tcp:8000 \
  --source-ranges=0.0.0.0/0
```

`e2-medium` (2 vCPU / 4 GB) is comfortable. `e2-small` works but builds
will be slow.

---

## 3. SSH in and install Docker

```bash
gcloud compute ssh caseworker-demo --zone=europe-west2-a

sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER
newgrp docker

docker --version && docker compose version
```

---

## 4. Clone and configure

```bash
git clone https://github.com/askreddii1234/pip-caseworker-assistant.git
cd pip-caseworker-assistant

EXT_IP=$(curl -s ifconfig.me)
echo "VM external IP: $EXT_IP"

cp .env.example .env

# Edit .env to set:
#   ANTHROPIC_API_KEY=sk-ant-...        (optional — leave blank for mock mode)
#   PUBLIC_HOST=<EXT_IP>
#   ALLOWED_ORIGINS=http://<EXT_IP>:3000
nano .env
```

---

## 5. Bring it up

```bash
docker compose up -d --build
docker compose logs -f backend   # Ctrl+C to detach
```

You should see `[rag] indexed 28 knowledge-base chunks` in the backend
log on startup.

Browse to:

- Frontend: `http://<EXT_IP>:3000`
- API docs: `http://<EXT_IP>:8000/docs`
- Root (shows `ai_mode: live | mocked`): `http://<EXT_IP>:8000/`

---

## 6. Demo walkthrough

1. **Schools air quality** tab → click any school → review pollutant
   table, parent reports cross-linked from the sensor dashboard.
2. **Cases queue** → open `CASE-2026-00401` (Critical chemical-spill).
3. Click **AI brief** → confirm Sources panel shows `[KB-N]` citations.
4. Ask: *"What's the immediate response for chemical exposure affecting
   8 pupils?"* → answer streams with inline KB pills.
5. **Risk dashboard** as user `m.khan` → review air-quality slice
   (severity counts, high-risk schools, workload).

---

## 7. Operations

### Update from main

```bash
cd ~/pip-caseworker-assistant
git pull
docker compose up -d --build
```

The backend mounts `./backend` and `./data` into the container with
`uvicorn --reload`, so most changes hot-reload without a rebuild. Rebuild
is required only when `requirements.txt` or `Dockerfile` changes.

### Reset the database (re-seed)

```bash
docker compose down -v
docker compose up -d --build
```

`-v` drops the `pgdata` volume; `seed_data.py` re-populates from
`data/cases.json` etc. on first request.

### Logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose ps
```

### Stop everything

```bash
docker compose down       # keeps the database volume
docker compose down -v    # also drops the database
```

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Frontend loads, but every API call fails with CORS error | `ALLOWED_ORIGINS` doesn't include the URL the browser uses | Add `http://<EXT_IP>:3000` to `ALLOWED_ORIGINS` in `.env`, then `docker compose up -d` |
| Frontend loads, API calls go to `http://localhost:8000` and time out | `VITE_API_URL` baked into the frontend bundle is wrong | Set `PUBLIC_HOST=<EXT_IP>` in `.env`, then `docker compose up -d --build frontend` |
| `[rag] indexed 0 knowledge-base chunks` | `data/knowledge_base/` not mounted, or `KB_DIR` env unset | Check `docker compose config` — backend should mount `./data:/app/data` |
| AI brief shows `mocked` even with key set | `ANTHROPIC_API_KEY` not propagated | `docker compose exec backend env \| grep ANTHROPIC` to confirm |
| Browser SSE stream cuts off | Some corporate proxies break long-lived HTTP | Test from a phone on cellular to confirm; ultimate fix is HTTPS via reverse proxy |
| Port 3000/8000 unreachable from outside | Firewall rule | `gcloud compute firewall-rules list` and check `allow-caseworker` exists |

---

## 9. Cleanup (after demo)

```bash
gcloud compute instances delete caseworker-demo --zone=europe-west2-a
gcloud compute firewall-rules delete allow-caseworker
```

---

## 10. Production hardening (next iteration)

The dev compose file is fine for a demo. For anything user-facing, the
upgrade list is:

1. **Frontend production build** — multi-stage Dockerfile: `vite build`
   then serve `dist/` from `nginx:alpine`. Drop the dev server and
   `node_modules` volume.
2. **Backend with gunicorn** — replace `uvicorn --reload` with
   `gunicorn -k uvicorn.workers.UvicornWorker -w 2 main:app`.
3. **HTTPS via Caddy** — single Caddy reverse proxy fronting both
   services on a real domain; auto-renews Let's Encrypt certs.
4. **Secrets via Secret Manager** — replace the `.env` on disk with a
   sidecar that fetches `ANTHROPIC_API_KEY` at start.
5. **Persistent KB on Cloud Storage** — instead of files in the repo,
   sync `data/knowledge_base/` from a GCS bucket on container start.
6. **Audit log** — add the `ai_interaction` table from
   `docs/RAG_ARCHITECTURE.md` § 4.5 for traceable Q&A history.
