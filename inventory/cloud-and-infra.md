# Cloud & Infrastructure

Last reviewed: 2026-07-16

Cloud platforms, serverless compute, managed AI services, and VPS options relevant to
AI/ML projects. Organized by provider; choose based on cost, latency, and ecosystem fit.

---

## Cloudflare

https://developers.cloudflare.com

Strong free tier; global edge network; excellent for lightweight AI-adjacent services.

| Service | What it does | Notes |
|---|---|---|
| **Workers** | Serverless JS/WASM at the edge | 128 MB RAM, 10ms CPU free tier |
| **Workers AI** | Serverless LLM/vision/audio inference | 50+ models; free tier; no cold starts |
| **AI Gateway** | Observability, caching, rate limiting for LLM calls | Works with any LLM API |
| **Vectorize** | Serverless vector database | Paired with Workers AI for RAG |
| **R2** | S3-compatible object storage | No egress fees — key differentiator |
| **D1** | Serverless SQLite at the edge | Good for agent state, small structured data |
| **Pages** | Static site + edge Functions hosting | Free tier generous |
| **Tunnels** | Expose local services via Cloudflare | Useful for testing webhooks/agents locally |

Use Cloudflare when: building lightweight inference endpoints, agent APIs, or edge-cached
AI apps without managing servers.

---

## Google Cloud & AI

### Google Colab
https://colab.research.google.com

Free GPU notebooks (T4/L4 on free tier, A100 on Colab Pro). Best for: quick ML
experiments, scientific computing, sharing reproducible analyses. Preinstalled: PyTorch,
TensorFlow, sklearn, pandas, matplotlib.

### Google AI Studio
https://aistudio.google.com

Free Gemini API access via a prompt playground. Includes API key generation, model
comparison, and multimodal (text/image/audio/video) prototyping. Free tier is generous.

### Vertex AI
https://cloud.google.com/vertex-ai

GCP's managed ML platform: model training, deployment, feature store, pipelines.
Use for production ML workloads that need GCP infrastructure. More overhead than Modal
for experimentation.

### Cloud Run
https://cloud.google.com/run

Serverless containers on GCP. Good for deploying Python/FastAPI model-serving endpoints
without managing Kubernetes. Scales to zero.

### BigQuery
https://cloud.google.com/bigquery

Serverless SQL analytics on petabyte-scale data. Free tier: 10 GB storage + 1 TB
queries/month. Use for large-scale log analysis or financial data aggregation.

### Kaggle
https://www.kaggle.com

Free GPU notebooks (similar to Colab), public datasets, and ML competitions. Better
dataset ecosystem than Colab; useful for benchmarking and data sourcing.

---

## Serverless GPU compute

### Modal
https://modal.com

Python-first serverless GPU platform (H100, A100, T4). Deploys functions as
containerized GPU workers with automatic scaling. Pay per second of GPU use. Excellent
for: inference serving, batch ML jobs, fine-tuning experiments. Free tier for
experimentation. See `notes_and_ideas` skills for the `modal` SKILL.md.

### Hugging Face Spaces
https://huggingface.co/spaces

Host ML demos on free CPU/GPU instances. Good for sharing model demos; Gradio and
Streamlit supported. Not for production serving.

### Fly.io
https://fly.io

Global app deployment with persistent volumes. Good for always-on inference endpoints
when Modal's per-second billing doesn't fit (high-traffic steady-state).

### Render
https://render.com

Simple cloud hosting (web services, workers, cron jobs). Free tier; easy PostgreSQL.
Good for small agent backend services.

---

## VPS (self-hosted AI tools)

For running open models (Ollama, llama.cpp, vLLM), private vector DBs, or agent
backends on your own hardware.

| Provider | Notes |
|---|---|
| **Hetzner** https://hetzner.com | Lowest cost/performance in Europe; excellent value for GPU-less workloads |
| **Vultr** https://vultr.com | Global PoPs; competitive pricing; good for US + EU |
| **DigitalOcean** https://digitalocean.com | Easiest onboarding; managed Postgres/Redis; good docs |

For local model inference on VPS: see `inventory/ai-agent-platforms.md` (Ollama,
llama.cpp, LM Studio, MLX).

---

## Observability & error monitoring

Error/performance monitoring for apps and services. **Self-hosting keeps event data —
which often carries sensitive data, tokens, request bodies, and stack locals — on
infrastructure you control**, which is the right default for regulated data (managed free
tiers offer no BAA). Whatever you pick, scrub before send and never ship raw request
bodies/sensitive data; see [`policies/security-baseline.md`](../policies/security-baseline.md)
and [`prompts/sensitive-data-leak-prevention.md`](../prompts/sensitive-data-leak-prevention.md).

| Option | Notes |
|---|---|
| **Sentry — self-hosted** https://develop.sentry.dev/self-hosted/ (`getsentry/self-hosted`) | Full error + performance monitoring on your own host; no event caps or per-seat limits. Docker-Compose stack is resource-heavy (multi-GB RAM, Kafka/ClickHouse/Postgres) — size a VPS accordingly. Best when data must not leave your infrastructure. |
| **Sentry — managed free ("Developer")** https://sentry.io/pricing/ | 1 user, ~5K errors/mo plus small performance/replay/cron quotas. Fine for solo/hobby/OSS; the single seat is the pinch. **No BAA on free/low tiers — not for regulated or personal data.** Sentry has also historically offered sponsored plans for qualifying OSS projects (apply-based). |
| **GlitchTip** https://glitchtip.com | Lightweight, Sentry-SDK-compatible open-source error tracking; far smaller footprint than self-hosted Sentry. Good self-host option when full Sentry is overkill. Managed tier also exists. |
| **OpenTelemetry** https://opentelemetry.io | Vendor-neutral instrumentation standard (traces/metrics/logs). Instrument once, export to a self-hosted collector or any backend; avoids lock-in. Apply the same scrubbing before export. |

Managed **Datadog** is a broad infra/APM/logs platform, not an error-tracker peer: its free
tier is narrow (~5 hosts, 1-day retention, no meaningful APM/error tracking), and a BAA is
enterprise-only. Reach for it when you have real org-wide observability needs and budget.
