from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from database import get_db
from auth import verify_password, hash_password, create_token, get_current_user
import models

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    role: str = "dealer"
    company_name_cn: str = ""
    company_name_en: str = ""
    contact_name: str = ""
    phone: str = ""
    invitation_code: str = ""          # Required for dealer self-registration


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class UpdateLanguageRequest(BaseModel):
    language: str


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        (models.User.username == req.username) | (models.User.email == req.username)
    ).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    token = create_token(user.id, user.role)
    return {
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "language": user.language,
        }
    }


@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    from datetime import datetime
    # ── Invitation code validation (mandatory for dealer self-registration) ──
    code_str = req.invitation_code.strip().upper() if req.invitation_code else ""
    if not code_str:
        raise HTTPException(status_code=400, detail="邀请码必填。请联系中村留获取邀请码。")

    invite = db.query(models.InvitationCode).filter(
        models.InvitationCode.code == code_str
    ).first()
    now = datetime.utcnow()
    if not invite or invite.is_used or invite.is_revoked:
        raise HTTPException(status_code=400, detail="邀请码无效或已被使用")
    if invite.expires_at and invite.expires_at < now:
        raise HTTPException(status_code=400, detail="邀请码已过期")

    # ── Duplicate checks ──
    if db.query(models.User).filter(models.User.username == req.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    if db.query(models.User).filter(models.User.email == req.email).first():
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    user = models.User(
        username=req.username,
        email=req.email,
        password_hash=hash_password(req.password),
        role="dealer",
    )
    db.add(user)
    db.flush()

    profile = models.DealerProfile(
        user_id=user.id,
        company_name_cn=req.company_name_cn,
        company_name_en=req.company_name_en,
        contact_name=req.contact_name,
        phone=req.phone,
        email=req.email,
        invitation_code=code_str,
        invited_by=invite.created_by,
    )
    db.add(profile)

    # ── Consume invitation code ──
    invite.is_used = True
    invite.used_by = user.id
    invite.used_at = now

    db.commit()
    db.refresh(user)

    token = create_token(user.id, user.role)
    return {"token": token, "user": {"id": user.id, "username": user.username, "role": user.role, "language": user.language}}


@router.get("/me")
def me(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    unread = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).count()
    data = {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "language": current_user.language,
        "unread_notifications": unread,
    }
    if current_user.role == "dealer" and current_user.dealer_profile:
        p = current_user.dealer_profile
        data["dealer"] = {
            "id": p.id,
            "company_name_cn": p.company_name_cn,
            "company_name_en": p.company_name_en,
            "company_name_ja": p.company_name_ja,
            "contact_name": p.contact_name,
            "phone": p.phone,
        }
    if current_user.role in ("admin", "platform_staff") and current_user.employee:
        e = current_user.employee
        data["employee"] = {
            "id": e.id,
            "name": e.name,
            "department": e.department,
            "review_level": e.review_level,
            "can_review": e.can_review,
        }
    return data


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(req.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Old password incorrect")
    current_user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": "Password updated"}


@router.put("/language")
def update_language(
    req: UpdateLanguageRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.language not in ("zh", "en", "ja"):
        raise HTTPException(status_code=400, detail="Invalid language")
    current_user.language = req.language
    db.commit()
    return {"language": req.language}


@router.get("/notifications")
def get_notifications(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notifs = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id
    ).order_by(models.Notification.created_at.desc()).limit(50).all()
    return [
        {
            "id": n.id,
            "type": n.type,
            "title": n.title,
            "message": n.message,
            "related_id": n.related_id,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat(),
        }
        for n in notifs
    ]


@router.post("/notifications/read-all")
def mark_all_read(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}
