#!/bin/sh
# Staging: ruft docker compose IMMER mit dem Staging-Override auf (Zugangsschutz, noindex, Banner). Beispiel: sh scripts/staging-compose.sh up -d --build
# Ein einfaches "docker compose up" startet OHNE diese Teile; auf Staging deshalb nur dieses Skript (oder -f docker-compose.yml -f docker-compose.staging.yml) benutzen.
exec docker compose -f docker-compose.yml -f docker-compose.staging.yml "$@"
