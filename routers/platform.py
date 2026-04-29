from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from auth import require_platform, require_admin, get_current_user
import models
from datetime import datetime

router = APIRouter()


class DealerStatusUpdate(BaseModel):
    status: str  # active | inactive


class ProductCategoryCreate(BaseModel):
    name_cn: str
    name_en: str = ""
    name_ja: str = ""
    sort_order: int = 0


class ProductCreate(BaseModel):
    category_id: int
    name_cn: str
    name_en: str = ""
    name_ja: str = ""


# ─── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def dashboard(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role in ("admin", "platform_staff", "super_admin", "maintenance"):
        total_dealers = db.query(models.DealerProfile).count()
        total_reports = db.query(models.Report).count()
        pending_statuses = ["pending_l1", "pending_l2"]
        pending_q = db.query(models.Report).filter(models.Report.status.in_(pending_statuses))
        pending_reviews = pending_q.count()
        total_customers = db.query(models.Customer).count()
        contracted = db.query(models.Customer).filter(models.Customer.is_contracted == True).count()
        approved = db.query(models.Report).filter(models.Report.status == "approved").count()
        dup_warnings = db.query(models.Report).filter(
            models.Report.has_duplicate_warning == True,
            models.Report.status.in_(pending_statuses),
        ).count()

        # Top pending reports sorted by AI score descending for quick review
        top_pending = (
            pending_q
            .order_by(models.Report.has_duplicate_warning.desc(), models.Report.ai_score.desc())
            .limit(10)
            .all()
        )

        return {
            "total_dealers":      total_dealers,
            "total_reports":      total_reports,
            "pending_reviews":    pending_reviews,
            "total_customers":    total_customers,
            "contracted_customers": contracted,
            "approved_reports":   approved,
            "duplicate_warnings": dup_warnings,
            "top_pending": [
                {
                    "id":                   r.id,
                    "registration_no":      r.registration_no,
                    "customer_name_cn":     r.customer_name_cn,
                    "applicant_company":    r.applicant_company,
                    "status":               r.status,
                    "ai_score":             r.ai_score,
                    "has_duplicate_warning":r.has_duplicate_warning,
                    "application_date":     r.application_date.isoformat() if r.application_date else None,
                }
                for r in top_pending
            ],
        }
    else:
        profile = current_user.dealer_profile
        if not profile:
            return {}
        total_reports = db.query(models.Report).filter(models.Report.dealer_id == profile.id).count()
        pending = db.query(models.Report).filter(
            models.Report.dealer_id == profile.id,
            models.Report.status.in_(["pending_l1", "pending_l2"])
        ).count()
        approved = db.query(models.Report).filter(
            models.Report.dealer_id == profile.id,
            models.Report.status == "approved"
        ).count()
        contracted = db.query(models.Report).filter(
            models.Report.dealer_id == profile.id,
            models.Report.status == "contracted"
        ).count()
        total_customers = db.query(models.Customer).filter(models.Customer.dealer_id == profile.id).count()
        return {
            "total_reports":      total_reports,
            "pending_reports":    pending,
            "approved_reports":   approved,
            "contracted_reports": contracted,
            "total_customers":    total_customers,
        }


# ─── Dealers ───────────────────────────────────────────────────────────────────

@router.get("/dealers")
def list_dealers(
    search: str = "",
    _: models.User = Depends(require_platform),
    db: Session = Depends(get_db),
):
    q = db.query(models.DealerProfile).join(models.User, models.DealerProfile.user_id == models.User.id)
    if search:
        q = q.filter(
            models.DealerProfile.company_name_cn.contains(search) |
            models.DealerProfile.contact_name.contains(search)
        )
    dealers = q.all()
    return [
        {
            "id": d.id,
            "user_id": d.user_id,
            "company_name_cn": d.company_name_cn,
            "company_name_en": d.company_name_en,
            "company_name_ja": d.company_name_ja,
            "contact_name": d.contact_name,
            "phone": d.phone,
            "email": d.email,
            "status": d.status,
            "username": d.user.username if d.user else "",
            "is_active": d.user.is_active if d.user else True,
            "report_count": len(d.reports),
            "customer_count": len(d.customers),
            "created_at": d.created_at.isoformat(),
        }
        for d in dealers
    ]


@router.put("/dealers/{dealer_id}/status")
def update_dealer_status(
    dealer_id: int,
    req: DealerStatusUpdate,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    dealer = db.query(models.DealerProfile).filter(models.DealerProfile.id == dealer_id).first()
    if not dealer:
        raise HTTPException(status_code=404, detail="Dealer not found")
    dealer.status = req.status
    if dealer.user:
        dealer.user.is_active = req.status == "active"
    db.commit()
    return {"status": req.status}


# ─── Products ──────────────────────────────────────────────────────────────────

@router.get("/product-categories")
def list_categories(db: Session = Depends(get_db), _=Depends(get_current_user)):
    cats = db.query(models.ProductCategory).order_by(models.ProductCategory.sort_order).all()
    return [
        {
            "id": c.id,
            "name_cn": c.name_cn,
            "name_en": c.name_en,
            "name_ja": c.name_ja,
            "sort_order": c.sort_order,
            "product_count": len(c.products),
        }
        for c in cats
    ]


@router.post("/product-categories")
def create_category(
    req: ProductCategoryCreate,
    _: models.User = Depends(require_platform),
    db: Session = Depends(get_db),
):
    cat = models.ProductCategory(**req.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "name_cn": cat.name_cn, "name_en": cat.name_en, "name_ja": cat.name_ja}


@router.put("/product-categories/{cat_id}")
def update_category(
    cat_id: int,
    req: ProductCategoryCreate,
    _: models.User = Depends(require_platform),
    db: Session = Depends(get_db),
):
    cat = db.query(models.ProductCategory).filter(models.ProductCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for k, v in req.model_dump().items():
        setattr(cat, k, v)
    db.commit()
    return {"id": cat.id, "name_cn": cat.name_cn}


@router.delete("/product-categories/{cat_id}")
def delete_category(
    cat_id: int,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    cat = db.query(models.ProductCategory).filter(models.ProductCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
    return {"message": "Deleted"}


@router.get("/products")
def list_products(db: Session = Depends(get_db), _=Depends(get_current_user)):
    products = db.query(models.Product).all()
    return [
        {
            "id": p.id,
            "category_id": p.category_id,
            "category_name": p.category.name_cn if p.category else "",
            "name_cn": p.name_cn,
            "name_en": p.name_en,
            "name_ja": p.name_ja,
            "is_active": p.is_active,
        }
        for p in products
    ]


@router.post("/products")
def create_product(
    req: ProductCreate,
    _: models.User = Depends(require_platform),
    db: Session = Depends(get_db),
):
    p = models.Product(**req.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "name_cn": p.name_cn}


@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    p = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(p)
    db.commit()
    return {"message": "Deleted"}


# ─── Templates ─────────────────────────────────────────────────────────────────

@router.get("/templates")
def list_templates(db: Session = Depends(get_db), _=Depends(get_current_user)):
    templates = db.query(models.Template).filter(models.Template.is_active == True).all()
    return [
        {
            "id": t.id,
            "type": t.type,
            "name": t.name,
            "original_name": t.original_name,
            "description": t.description,
            "version": t.version,
            "created_at": t.created_at.isoformat(),
        }
        for t in templates
    ]


@router.delete("/templates/{tmpl_id}")
def delete_template(
    tmpl_id: int,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    import os
    t = db.query(models.Template).filter(models.Template.id == tmpl_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if os.path.exists(t.file_path):
        os.remove(t.file_path)
    db.delete(t)
    db.commit()
    return {"message": "Template deleted"}
