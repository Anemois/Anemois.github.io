# The 午後激盪 (Afternoon Brainstorming) server for web players (see readme.md).
# Render builds it from the top of the site repo (render.yaml). It runs the game's own dedicated server out of the
# same index.pck the site serves, so the server and the web build are always the same version.
#
# Try it locally: docker build -f server/brainstorm/Dockerfile -t brainstorm-server .
#                 docker run -p 24242:10000 brainstorm-server

FROM debian:12-slim

# Must be the Godot version the game is exported with. SHA512-SUMS.txt of the godot-builds release; change both together.
ARG GODOT_VERSION=4.7.2-stable
ARG GODOT_SHA512=9aa00f7a605200940bce3027a567b782f49bd8e940dd06ae9e987bd65aee1b1467edd56ed84fcdcbdd44354bf613bdbb4e5d2913e925850368e150c59ed54c65

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && curl -fsSL -o /tmp/godot.zip \
        "https://github.com/godotengine/godot-builds/releases/download/${GODOT_VERSION}/Godot_v${GODOT_VERSION}_linux.x86_64.zip" \
    && echo "${GODOT_SHA512}  /tmp/godot.zip" | sha512sum -c - \
    && unzip -q /tmp/godot.zip -d /tmp/godot \
    && install -m 755 "/tmp/godot/Godot_v${GODOT_VERSION}_linux.x86_64" /usr/local/bin/godot \
    && rm -rf /tmp/godot /tmp/godot.zip \
    && apt-get purge -y curl unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --uid 10001 --user-group --create-home godot

COPY games/brainstorm/web/index.pck /app/game.pck

USER godot

# Render sends the service's traffic (wss:// outside, plain WebSocket inside) to $PORT.
ENV PORT=10000

EXPOSE 10000

# save_replays=false: the disk of a free service is wiped on every restart anyway.
CMD godot --headless --main-pack /app/game.pck -s res://script/net/server_main.gd -- \
    transport=websocket port=$PORT save_replays=false
