"""
Invitation Code Management
──────────────────────────
Only platform admins (admin / super_admin / maintenance) can generate codes.
Regular dealers register using a valid, non-expired, non-revoked code.
"""
import secrets
import string
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user, require_platform
import models

router = APIRouter()

CODE_ALPHABET = string.ascii_uppercase + string.digits   # e.g. XK9PL2MN
CODE_LENGTH   = 10


def _gen_code(db: Session) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if not db.query(models.InvitationCode).filter(models.InvitationCode.code == code).first():
            return code
    raise RuntimeError("Failed to generate unique code")


class CreateInviteRequest(BaseModel):
    note: str = ""
    expire_days: int = 30   # 0 = no expiry


class ValidateRequest(BaseModel):
    code: str


# ─── Platform: manage codes ────────────────────────────────────────────────────

@router.get("")
def list_codes(
    show_used: bool = Query(False),
    current_user: models.User = Depends(require_platform),
    db: Session = Depends(get_db),
):
    q = db.query(models.InvitationCode).order_by(models.InvitationCode.created_at.desc())
    if not show_used:
        q = q.filter(models.InvitationCode.is_used == False, models.InvitationCode.is_revoked == False)
    codes = q.all()
    now = datetime.utcnow()
    return [
        {
            "id":         c.id,
            "code":       c.code,
            "note":       c.note,
            "is_used":    c.is_used,
            "is_revoked": c.is_revoked,
            "is_expired": bool(c.expires_at and c.expires_at < now),
            "expires_at": c.expires_at.isoformat() if c.expires_at else None,
            "used_at":    c.used_at.isoformat() if c.used_at else None,
            "used_by":    c.user.username if c.user else None,
            "created_by": c.creator.username if c.creator else None,
            "created_at": c.created_at.isoformat(),
        }
        for c in codes
    ]


@router.post("")
def create_code(
    req: CreateInviteRequest,
    current_user: models.User = Depends(require_platform),
    db: Session = Depends(get_db),
):
    expires_at = None
    if req.expire_days > 0:
        expires_at = datetime.utcnow() + timedelta(days=req.expire_days)

    code = models.InvitationCode(
        code=_gen_code(db),
        created_by=current_user.id,
        note=req.note,
        expires_at=expires_at,
    )
    db.add(code)
    db.commit()
    db.refresh(code)
    return {
        "id":         code.id,
        "code":       code.code,
        "note":       code.note,
        "expires_at": code.expires_at.isoformat() if code.expires_at else None,
    }


@router.delete("/{code_id}")
def revoke_code(
    code_id: int,
    current_user: models.User = Depends(require_platform),
    db: Session = Depends(get_db),
):
    code = db.query(models.InvitationCode).filter(models.InvitationCode.id == code_id).first()
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    if code.is_used:
        raise HTTPException(status_code=400, detail="Cannot revoke a code that has been used")
    code.is_revoked = True
    db.commit()
    return {"message": "Code revoked"}


# ─── Public: validate a code (called before/during registration) ───────────────

@router.post("/validate")
def validate_code(req: ValidateRequest, db: Session = Depends(get_db)):
    """
    Returns {"valid": true/false, "note": "..."}.
    Does NOT consume the code — consumption happens at registration.
    """
    code = db.query(models.InvitationCode).filter(
        models.InvitationCode.code == req.code.strip().upper()
    ).first()

    now = datetime.utcnow()
    valid = (
        code is not None
        and not code.is_used
        and not code.is_revoked
        and (code.expires_at is None or code.expires_at > now)
    )
    return {
        "valid": valid,
        "note":  code.note if (code and valid) else "",
    }
