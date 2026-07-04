# Build stage
FROM rust:slim AS builder
WORKDIR /app
COPY . .
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
ENV CARGO_NET_RETRY=10
ENV CARGO_HTTP_MULTIPLEXING=false
RUN cargo build --release

# Runner stage
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/backend /app/backend
RUN mkdir -p storage/uploads
EXPOSE 8000
CMD ["/app/backend"]
