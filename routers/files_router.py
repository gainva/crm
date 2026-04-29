import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user, require_platform
import models

router = APIRouter()
UPLOAD_DIR = "uploads"
ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".xls", ".xlsx"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


def _safe_ext(filename: str) -> str:
    _, ext = os.path.splitext(filename)
    return ext.lower()


@router.post("/report/{report_id}")
async def upload_report_file(
    report_id: int,
    file: UploadFile = File(...),
    file_type: str = Form(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    r = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")

    if current_user.role == "dealer":
        profile = current_user.dealer_profile
        if not profile or r.dealer_id != profile.id:
            raise HTTPException(status_code=403, detail="Access denied")

    ext = _safe_ext(file.filename or "")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")

    report_dir = os.path.join(UPLOAD_DIR, "reports", str(report_id))
    os.makedirs(report_dir, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(report_dir, unique_name)

    with open(file_path, "wb") as f:
        f.write(content)

    attachment = models.ReportAttachment(
        report_id=report_id,
        file_type=file_type,
        file_name=unique_name,
        original_name=file.filename,
        file_path=file_path,
        file_size=len(content),
        uploaded_by=current_user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return {
        "id": attachment.id,
        "file_type": attachment.file_type,
        "file_name": attachment.file_name,
        "original_name": attachment.original_name,
        "file_size": attachment.file_size,
    }


@router.get("/report/{report_id}/{attachment_id}")
def download_report_file(
    report_id: int,
    attachment_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = db.query(models.ReportAttachment).filter(
        models.ReportAttachment.id == attachment_id,
        models.ReportAttachment.report_id == report_id,
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="File not found")

    if current_user.role == "dealer":
        r = db.query(models.Report).filter(models.Report.id == report_id).first()
        profile = current_user.dealer_profile
        if not r or not profile or r.dealer_id != profile.id:
            raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.exists(a.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(a.file_path, filename=a.original_name)


@router.delete("/report/{report_id}/{attachment_id}")
def delete_report_file(
    report_id: int,
    attachment_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = db.query(models.ReportAttachment).filter(
        models.ReportAttachment.id == attachment_id,
        models.ReportAttachment.report_id == report_id,
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="File not found")

    if current_user.role == "dealer":
        r = db.query(models.Report).filter(models.Report.id == report_id).first()
        profile = current_user.dealer_profile
        if not r or not profile or r.dealer_id != profile.id:
            raise HTTPException(status_code=403, detail="Access denied")

    if os.path.exists(a.file_path):
        os.remove(a.file_path)
    db.delete(a)
    db.commit()
    return {"message": "File deleted"}


@router.post("/template")
async def upload_template(
    file: UploadFile = File(...),
    type: str = Form(...),
    name: str = Form(...),
    description: str = Form(""),
    current_user: models.User = Depends(require_platform),
    db: Session = Depends(get_db),
):
    if type not in ("questionnaire", "quote", "other"):
        raise HTTPException(status_code=400, detail="Invalid template type")

    ext = _safe_ext(file.filename or "")
    if ext not in (".doc", ".docx", ".pdf", ".xls", ".xlsx"):
        raise HTTPException(status_code=400, detail="Template must be doc/docx/pdf/xls/xlsx")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large")

    tmpl_dir = os.path.join(UPLOAD_DIR, "templates")
    os.makedirs(tmpl_dir, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(tmpl_dir, unique_name)

    with open(file_path, "wb") as f:
        f.write(content)

    # Deactivate previous version if same type
    db.query(models.Template).filter(
        models.Template.type == type,
        models.Template.is_active == True,
        models.Template.name == name,
    ).update({"is_active": False})

    latest_version = db.query(models.Template).filter(
        models.Template.type == type,
        models.Template.name == name,
    ).count()

    tmpl = models.Template(
        type=type,
        name=name,
        file_name=unique_name,
        original_name=file.filename,
        file_path=file_path,
        description=description,
        version=latest_version + 1,
        uploaded_by=current_user.id,
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return {"id": tmpl.id, "name": tmpl.name, "type": tmpl.type, "version": tmpl.version}


@router.get("/template/{tmpl_id}")
def download_template(
    tmpl_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = db.query(models.Template).filter(models.Template.id == tmpl_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if not os.path.exists(t.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(t.file_path, filename=t.original_name)
