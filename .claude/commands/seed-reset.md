---
description: Tear down the docker volume and rebuild from scratch to re-seed data
---

Fresh seed. The seeder is idempotent — it skips if cases already exist — so after
editing any of the JSON files in `data/` you need to wipe the volume and rebuild.

Run these in sequence (confirm with me before running the first one — `down -v` is
destructive):

1. `docker compose down -v` — stops containers and wipes the pgdata volume
2. `docker compose up --build -d` — rebuilds and starts detached
3. Poll `docker compose logs backend --tail=20` until you see "Seeded N cases, P policies, S workflow states" — then the stack is ready.
4. Confirm with `curl -s localhost:8000/cases | python -c "import sys,json; d=json.load(sys.stdin); print(f'{d[\"total\"]} cases loaded')"`.

If the seed logs show a lower count than expected, the JSON is likely malformed — tell
me what the error was and stop. Don't try to edit JSON files to "fix" them without
asking first.
