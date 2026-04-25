FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates git time \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash agent

WORKDIR /app

COPY setup_visible_repo.sh /usr/local/bin/setup_visible_repo.sh
COPY workspace/ /opt/dots-and-boxes-visible/

RUN chmod +x /usr/local/bin/setup_visible_repo.sh \
    && /usr/local/bin/setup_visible_repo.sh /opt/dots-and-boxes-visible /app agent \
    && git config --system --add safe.directory /app

ENV HOME=/home/agent
USER agent
WORKDIR /app
