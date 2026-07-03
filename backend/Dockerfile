# Stage 1: Build the Rust application
FROM rust:1.80-slim as builder
WORKDIR /app
COPY . .
RUN cargo build --release

# Stage 2: Run the Rust application
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/backend /app/backend
EXPOSE 8000
CMD ["./backend"]
