# Build for Anthropic's OSS Scanner (https://github.com/anthropics/oss-scanner), mirroring CI
# (.github/workflows/main.yml): bun install --frozen-lockfile, hardhat compile, vitest.
FROM node:24.6.0-bookworm
ENV DEBIAN_FRONTEND=noninteractive \
    CI=true \
    FOUNDRY_DISABLE_NIGHTLY_WARNING=true
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git unzip \
    && rm -rf /var/lib/apt/lists/*

# Bun at the version CI pins, and Foundry (anvil, forge, cast), which CI installs for the test job.
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.2.3"
RUN curl -fsSL https://foundry.paradigm.xyz | bash && /root/.foundry/bin/foundryup
ENV PATH="/root/.bun/bin:/root/.foundry/bin:${PATH}"

# scanner contract: the checkout lives inside the image, at /src
COPY . /src
WORKDIR /src
RUN git config --global --add safe.directory '*'

RUN bun install --frozen-lockfile

# Hardhat downloads solc 0.8.26 and 0.8.17 into its cache on first compile; this has to happen now, while online.
RUN bun run compile

# The default vitest suite (local EDR network only; *.remote.ts fork tests need an RPC and are excluded).
RUN bun run test || echo "WARNING: bun run test reported failures"
