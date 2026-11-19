from __future__ import annotations

import os
from pathlib import Path
from dotenv import dotenv_values, load_dotenv

# 1. Load local sms-service .env
sms_env_path = Path(__file__).resolve().parent.with_name(".env")
load_dotenv(sms_env_path)

# 2. Optionally load backend/.env for shared secrets (e.g. JWT_SECRET, SUPABASE keys)
backend_env_path = (
    Path(os.getenv("BACKEND_ENV_PATH", ""))
    if os.getenv("BACKEND_ENV_PATH")
    else Path(__file__).resolve().parents[3] / "backend" / ".env"
)
if backend_env_path.exists():
    backend_env = dotenv_values(backend_env_path)
    for env_name, env_value in backend_env.items():
        if not env_value:
            continue
        if env_name == "JWT_SECRET" or not os.getenv(env_name):
            os.environ[env_name] = env_value


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_groq_api_key() -> str:
    return required_env("GROQ_API_KEY")


def get_groq_model() -> str:
    return os.getenv("GROQ_MODEL", "openai/gpt-oss-20b").strip() or "openai/gpt-oss-20b"


def get_jwt_secret() -> str:
    return required_env("JWT_SECRET")


def get_supabase_url() -> str:
    return required_env("SUPABASE_URL")


def get_supabase_service_key() -> str:
    key = (
        os.getenv("SUPABASE_SECRET_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_SERVICE_KEY")
        or ""
    ).strip()
    if not key:
        raise RuntimeError("Set SUPABASE_SECRET_KEY in .env for server-side database access.")
    return key
