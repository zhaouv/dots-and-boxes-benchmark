#!/usr/bin/env bash
set -euo pipefail

OLD='172.25.128.1:1080'
NEW='172.31.160.1:1080'

FILES=(
  "/home/zhaouv/.docker/config.json"
  "/etc/docker/daemon.json"
  "/etc/systemd/system/docker.service.d/http-proxy.conf"
)

for file in "${FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "missing: $file" >&2
    exit 1
  fi
  sudo cp -a "$file" "$file.bak"
  sudo sed -i "s#${OLD//./\\.}#$NEW#g" "$file"
done

sudo systemctl daemon-reload
sudo systemctl restart docker

echo "updated proxy from $OLD to $NEW and restarted docker"
