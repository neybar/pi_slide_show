# Chromium 76 + Puppeteer 1.17 test runner. Build context: test/chrome76/.
# Always built for linux/amd64 (the snapshot is x86_64); on an arm64 host it runs under emulation.
# Not the production image: nothing here is shipped. See ../../AGENTS.md ("Display browser").
FROM --platform=linux/amd64 node:22-bookworm-slim

# Shared libraries Chromium 76 links against, plus fonts for text rendering.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl unzip fonts-liberation \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 \
      libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 \
      libxrandr2 libxss1 libxtst6 \
    && rm -rf /var/lib/apt/lists/*

# Chromium r662092 = 76.0.3797.0, the build Puppeteer 1.17 bundles. Display is 76.0.3809.
ARG CHROMIUM_REV=662092
ARG CHROMIUM_SHA256=d00627485d535cef6ce720dc1c81a8f36118cc3f99011543505192c9123ff004
RUN curl -fsSL -o /tmp/chrome.zip \
      "https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/${CHROMIUM_REV}/chrome-linux.zip" \
    && echo "${CHROMIUM_SHA256}  /tmp/chrome.zip" | sha256sum -c - \
    && unzip -q /tmp/chrome.zip -d /opt \
    && rm /tmp/chrome.zip

WORKDIR /opt/chrome76
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY run.mjs ./

ENV CHROME_BIN=/opt/chrome-linux/chrome
CMD ["node", "run.mjs"]
