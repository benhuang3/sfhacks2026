"""
=============================================================================
  Auth Service — SmartGrid Home (SF Hacks 2026)
=============================================================================

JWT-based authentication:
  - Signup (bcrypt password hashing)
  - Login (JWT access token)
  - Forgot password (6-digit OTP, stored in MongoDB with TTL)
  - Reset password (verify OTP, set new password)
  - Token verification middleware

Collections:
  - users: { email, password_hash, name, createdAt }
  - otps:  { email, code, expiresAt } with TTL index
=============================================================================
"""

from __future__ import annotations

import os
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
from pydantic import BaseModel, Field, field_validator
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from agents import get_db, get_motor_client

logger = logging.getLogger("auth")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "smartgrid-hackathon-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "72"))  # 3 days for hackathon
OTP_EXPIRE_MINUTES = 15

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class SignupRequest(BaseModel):
    email: str = Field(..., min_length=3, examples=["user@example.com"])
    password: str = Field(..., min_length=6)
    name: str = Field(default="", examples=["Alice"])

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class ResetPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3)
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=6)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class AuthResponse(BaseModel):
    token: str
    user: dict


# ---------------------------------------------------------------------------
# In-memory fallback (when MongoDB is unavailable — hackathon mode)
# ---------------------------------------------------------------------------
_MEM_USERS: dict[str, dict] = {}   # email → user doc
_MEM_OTPS:  dict[str, dict] = {}   # email → otp doc
_db_available: bool | None = None  # tri-state: None=unknown


async def _check_db() -> bool:
    """Quick ping to see if MongoDB is reachable."""
    global _db_available
    try:
        client = get_motor_client()
        await client.admin.command("ping")
        _db_available = True
        logger.info("MongoDB reachable — using real DB for auth")
    except Exception as exc:
        logger.warning("MongoDB unreachable (%s) — falling back to in-memory", exc)
        _db_available = False
    return _db_available


class _MemCollection:
    """Minimal dict-backed shim that quacks like a Motor collection."""

    def __init__(self, store: dict, name: str):
        self._store = store
        self._name = name
        self._counter = len(store)  # resume counter from existing entries

    async def find_one(self, filt: dict):
        for doc in self._store.values():
            match = True
            for k, v in filt.items():
                if isinstance(v, dict):
                    continue  # skip $gt / $lt operators
                if doc.get(k) != v:
                    match = False
                    break
            if match:
                return doc
        return None

    async def insert_one(self, doc: dict):
        from types import SimpleNamespace
        # Enforce email uniqueness
        email = doc.get("email")
        if email:
            for existing in self._store.values():
                if existing.get("email") == email:
                    raise HTTPException(status_code=409, detail="Email already registered")
        self._counter += 1
        oid = f"mem_{self._name}_{self._counter}"
        doc["_id"] = oid
        key = doc.get("email", oid)
        self._store[key] = doc
        return SimpleNamespace(inserted_id=oid)

    async def update_one(self, filt: dict, update: dict):
        from types import SimpleNamespace
        for doc in self._store.values():
            match = True
            for k, v in filt.items():
                if isinstance(v, dict):
                    continue
                if doc.get(k) != v:
                    match = False
                    break
            if match:
                for k, v in update.get("$set", {}).items():
                    doc[k] = v
                return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)

    async def delete_many(self, filt: dict):
        email = filt.get("email")
        if email and email in self._store:
            del self._store[email]

    async def create_index(self, *a, **kw):
        pass


# ---------------------------------------------------------------------------
# Collections — auto-select Mongo or in-memory
# ---------------------------------------------------------------------------

def _users_col():
    if _db_available is False:
        return _MemCollection(_MEM_USERS, "users")
    return get_db()["users"]

def _otps_col():
    if _db_available is False:
        return _MemCollection(_MEM_OTPS, "otps")
    return get_db()["otps"]


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


# ---------------------------------------------------------------------------
# JWT tokens
# ---------------------------------------------------------------------------

def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------------------------------------------------------------------
# Auth dependency for protected routes
# ---------------------------------------------------------------------------
_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> dict:
    """FastAPI dependency: extract and validate JWT from Authorization header."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return {"userId": user_id, "email": payload.get("email", "")}


# ---------------------------------------------------------------------------
# Core Auth Logic
# ---------------------------------------------------------------------------

async def signup(req: SignupRequest) -> dict:
    """Create a new user account and auto-creates a default Home."""
    col = _users_col()
    try:
        # Check if email already exists
        existing = await col.find_one({"email": req.email})
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")

        pw_hash = hash_password(req.password)
        doc = {
            "email": req.email,
            "password_hash": pw_hash,
            "name": req.name or req.email.split("@")[0],
            "createdAt": datetime.now(timezone.utc),
        }
        result = await col.insert_one(doc)
        user_id = str(result.inserted_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("DB error during signup: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    # ── Auto-create default Home with rooms + empty scene ─────────────
    home_id: str | None = None
    try:
        from models import CreateHomeRequest, DEFAULT_ROOMS
        from homes_devices import create_home as _create_home
        home_req = CreateHomeRequest(
            userId=user_id,
            name=f"{doc['name']}'s Home",
            rooms=[r.model_copy() for r in DEFAULT_ROOMS],
        )
        home = await _create_home(home_req)
        home_id = home.get("id")
        # Persist homeId on user doc for quick lookup
        await col.update_one({"_id": result.inserted_id}, {"$set": {"homeId": home_id}})
        logger.info("Auto-created home %s for user %s", home_id, user_id)
    except Exception as e:
        logger.warning("Auto-create home failed (non-fatal): %s", e)

    token = create_token(user_id, req.email)
    logger.info("New user signup: %s (id=%s)", req.email, user_id)

    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": req.email,
            "name": doc["name"],
            "homeId": home_id,
        },
    }


async def login(req: LoginRequest) -> dict:
    """Authenticate user and return JWT."""
    col = _users_col()
    try:
        user = await col.find_one({"email": req.email})
    except Exception as e:
        logger.error("DB error during login lookup: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id = str(user.get("_id"))
    token = create_token(user_id, req.email)
    logger.info("User login: %s", req.email)

    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": req.email,
            "name": user.get("name", ""),
            "homeId": user.get("homeId"),
        },
    }


async def forgot_password(req: ForgotPasswordRequest) -> dict:
    """Generate a 6-digit OTP for password reset."""
    col = _users_col()
    try:
        user = await col.find_one({"email": req.email})
    except Exception as e:
        logger.error("DB error during forgot_password lookup: %s", e)
        # Fail closed — report generic message to client
        return {"message": "If the email exists, a reset code has been sent."}

    # Always return success to prevent email enumeration
    if not user:
        logger.warning("Forgot password for non-existent email: %s", req.email)
        return {"message": "If the email exists, a reset code has been sent."}

    # Generate 6-digit OTP
    code = f"{secrets.randbelow(1000000):06d}"

    # Store OTP with expiration
    otps = _otps_col()
    await otps.delete_many({"email": req.email})  # Clear old OTPs
    await otps.insert_one({
        "email": req.email,
        "code": code,
        "expiresAt": datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES),
    })

    # In production: send email via SendGrid/SES/etc.
    # For hackathon: log it and return it in response
    logger.info("OTP for %s: %s (expires in %d min)", req.email, code, OTP_EXPIRE_MINUTES)

    return {
        "message": "If the email exists, a reset code has been sent.",
        # HACKATHON ONLY — remove in production:
        "_debug_otp": code,
    }


async def reset_password(req: ResetPasswordRequest) -> dict:
    """Verify OTP and set new password."""
    otps = _otps_col()
    try:
        # Find valid OTP
        otp_doc = await otps.find_one({
            "email": req.email,
            "code": req.code,
            "expiresAt": {"$gt": datetime.now(timezone.utc)},
        })

        if not otp_doc:
            raise HTTPException(status_code=400, detail="Invalid or expired reset code")

        # Update password
        users = _users_col()
        result = await users.update_one(
            {"email": req.email},
            {"$set": {"password_hash": hash_password(req.new_password)}},
        )

        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="User not found")

        # Delete used OTP
        await otps.delete_many({"email": req.email})
    except HTTPException:
        raise
    except Exception as e:
        logger.error("DB error during reset_password: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    logger.info("Password reset successful for %s", req.email)
    return {"message": "Password reset successful. Please log in."}


async def get_user_profile(user_id: str) -> dict:
    """Get user profile (for /me endpoint)."""
    col = _users_col()
    try:
        # Try ObjectId first (real MongoDB), fall back to string match (in-memory)
        user = None
        if _db_available:
            from bson import ObjectId
            try:
                user = await col.find_one({"_id": ObjectId(user_id)})
            except Exception:
                pass
        if user is None:
            user = await col.find_one({"_id": user_id})
    except Exception as e:
        logger.error("DB error during get_user_profile: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name", ""),
        "homeId": user.get("homeId"),
        "createdAt": user.get("createdAt", "").isoformat() if hasattr(user.get("createdAt", ""), "isoformat") else "",
    }


# ---------------------------------------------------------------------------
# Ensure indexes (call at startup)
# ---------------------------------------------------------------------------

async def ensure_auth_indexes():
    """Create unique email index and OTP TTL index."""
    users = _users_col()
    await users.create_index("email", unique=True)

    otps = _otps_col()
    # TTL index: MongoDB auto-deletes docs after expiresAt
    await otps.create_index("expiresAt", expireAfterSeconds=0)
    logger.info("Auth indexes ensured")
