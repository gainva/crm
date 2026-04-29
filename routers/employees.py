from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from auth import require_admin, require_platform, get_current_user, hash_password
import models

router = APIRouter()


class EmployeeCreate(BaseModel):
    username: str
    email: str
    password: str
    name: str
    department: str = ""
    review_level: int = 1
    can_review: bool = True
    can_view_all: bool = True
    role: str = "platform_staff"


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    review_level: Optional[int] = None
    can_review: Optional[bool] = None
    can_view_all: Optional[bool] = None
    is_active: Optional[bool] = None


class ResetPassword(BaseModel):
    new_password: str


def _serialize(emp: models.Employee) -> dict:
    return {
        "id": emp.id,
        "user_id": emp.user_id,
        "name": emp.name,
        "department": emp.department,
        "review_level": emp.review_level,
        "can_review": emp.can_review,
        "can_view_all": emp.can_view_all,
        "username": emp.user.username if emp.user else "",
        "email": emp.user.email if emp.user else "",
        "role": emp.user.role if emp.user else "",
        "is_active": emp.user.is_active if emp.user else True,
        "created_at": emp.created_at.isoformat(),
    }


@router.get("")
def list_employees(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_platform),
):
    q = db.query(models.Employee).join(models.User)
    # Regular admin cannot see super_admin / maintenance accounts
    if current_user.role not in ("super_admin", "maintenance"):
        q = q.filter(models.User.is_hidden == False)
    employees = q.all()
    return [_serialize(e) for e in employees]


@router.post("")
def create_employee(
    req: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    if db.query(models.User).filter(models.User.username == req.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    if db.query(models.User).filter(models.User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")

    allowed_roles = ("admin", "platform_staff")
    # Only super_admin can create super_admin/maintenance accounts
    if current_user.role in ("super_admin", "maintenance"):
        allowed_roles = ("admin", "platform_staff", "super_admin", "maintenance")
    role = req.role if req.role in allowed_roles else "platform_staff"
    user = models.User(
        username=req.username,
        email=req.email,
        password_hash=hash_password(req.password),
        role=role,
        is_hidden=(role in ("super_admin", "maintenance")),
    )
    db.add(user)
    db.flush()

    emp = models.Employee(
        user_id=user.id,
        name=req.name,
        department=req.department,
        review_level=req.review_level,
        can_review=req.can_review,
        can_view_all=req.can_view_all,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return _serialize(emp)


@router.put("/{emp_id}")
def update_employee(
    emp_id: int,
    req: EmployeeUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    emp = db.query(models.Employee).filter(models.Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    if req.name is not None:
        emp.name = req.name
    if req.department is not None:
        emp.department = req.department
    if req.review_level is not None:
        emp.review_level = req.review_level
    if req.can_review is not None:
        emp.can_review = req.can_review
    if req.can_view_all is not None:
        emp.can_view_all = req.can_view_all
    if req.is_active is not None and emp.user:
        emp.user.is_active = req.is_active

    db.commit()
    db.refresh(emp)
    return _serialize(emp)


@router.post("/{emp_id}/reset-password")
def reset_password(
    emp_id: int,
    req: ResetPassword,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    emp = db.query(models.Employee).filter(models.Employee.id == emp_id).first()
    if not emp or not emp.user:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp.user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": "Password reset"}


@router.delete("/{emp_id}")
def delete_employee(
    emp_id: int,
    db: Session = Depends(get_db),
    current: models.User = Depends(require_admin),
):
    emp = db.query(models.Employee).filter(models.Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    if emp.user_id == current.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    if emp.user:
        emp.user.is_active = False
    db.commit()
    return {"message": "Employee deactivated"}
