from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    # Supabase
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # App
    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "dev-secret"
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    # No blanket *.vercel.app allowlist: any unrelated Vercel user could
    # otherwise obtain a credentialed CORS preflight success. Explicitly
    # enumerate preview/staging/production HTTPS origins in ALLOWED_ORIGINS.
    ALLOWED_ORIGIN_REGEX: Optional[str] = None

    # IA — provider ativo
    AI_PROVIDER: str = "deepseek"

    # Chaves por provider (todas opcionais)
    ANTHROPIC_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    DEEPSEEK_API_KEY: Optional[str] = None

    # Modelos padrão por provider
    ANTHROPIC_MODEL: str = "claude-sonnet-4-5"
    OPENAI_MODEL: str = "gpt-4o"
    GOOGLE_MODEL: str = "gemini-2.0-flash"
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    DEEPSEEK_MODEL: str = "deepseek-chat"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
