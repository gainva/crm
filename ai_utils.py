"""
AI Lead Scoring & Duplicate Detection Engine
─────────────────────────────────────────────
Scoring breakdown (total 100 pts):
  - Form completeness   : 0–40
  - Attachment quality  : 0–35
  - Dealer reliability  : 0–25

Duplicate detection uses weighted fuzzy string matching (difflib).
No external ML libraries required — pure Python.
"""
import difflib
import re
from typing import List, Dict, Tuple
from sqlalchemy.orm import Session
import models


# ─── Scoring ──────────────────────────────────────────────────────────────────

def _score_completeness(report: models.Report) -> Tuple[int, Dict]:
    """Form completeness score, 0–40 points."""
    earned, details = 0, {}

    fields = [
        ("customer_name_cn",    4, "客户中文名称"),
        ("customer_name_en",    2, "客户英文名称"),
        ("customer_address_cn", 3, "客户中文地址"),
        ("customer_address_en", 2, "客户英文地址"),
        ("part_name",           4, "零件名称"),
        ("final_product_use",   3, "最终用途"),
        ("project_budget",      4, "项目预算"),
        ("delivery_deadline",   3, "交货期"),
        ("project_model",       3, "项目机型"),
        ("sales_opinion",       2, "销售意见"),
    ]
    for attr, pts, label in fields:
        val = getattr(report, attr, None)
        has = bool(val and str(val).strip())
        details[label] = pts if has else 0
        if has:
            earned += pts

    # List fields
    list_checks = [
        ("industry_categories", 5, "行业分类"),
        ("investment_purpose",  3, "投资目的"),
        ("project_key_points",  3, "项目关键点"),
    ]
    for attr, pts, label in list_checks:
        val = getattr(report, attr, None) or []
        has = len(val) > 0
        details[label] = pts if has else 0
        if has:
            earned += pts

    return min(earned, 40), details


def _score_attachments(report: models.Report) -> Tuple[int, Dict]:
    """Attachment completeness score, 0–35 points."""
    earned, details = 0, {}
    present = {a.file_type for a in (report.attachments or [])}

    checks = [
        ("business_card_front", 10, "名片（正面）PDF"),
        ("business_card_back",  10, "名片（背面）PDF"),
        ("project_drawing",     15, "项目图纸"),
    ]
    for ft, pts, label in checks:
        has = ft in present
        details[label] = pts if has else 0
        if has:
            earned += pts

    # Bonus for additional docs (word/pdf templates)
    bonus_types = {"word_template", "pdf_template", "other"}
    if bonus_types & present:
        details["其他文件（模板等）"] = 0   # informational — not scored separately

    return min(earned, 35), details


def _score_reliability(dealer: models.DealerProfile, db: Session, exclude_report_id: int = None) -> Tuple[int, Dict]:
    """Dealer historical reliability score, 0–25 points."""
    if not dealer:
        return 10, {"说明": "无代理商信息，给予中性分"}

    q = db.query(models.Report).filter(
        models.Report.dealer_id == dealer.id,
        models.Report.status != "draft",
    )
    if exclude_report_id:
        q = q.filter(models.Report.id != exclude_report_id)

    all_submitted = q.all()
    total = len(all_submitted)
    won = sum(1 for r in all_submitted if r.status in ("approved", "contracted"))

    # Approval-rate sub-score (0–20)
    if total == 0:
        rate_pts = 12  # new dealer → slightly above neutral
        rate_desc = "新代理商（首次申请，给予基准分12）"
    else:
        rate = won / total
        rate_pts = round(rate * 20)
        rate_desc = f"历史批准率 {rate:.0%}（{won}/{total}）"

    # Experience sub-score (0–5)
    if won == 0:
        exp_pts = 0
    elif won <= 2:
        exp_pts = 2
    elif won <= 5:
        exp_pts = 4
    else:
        exp_pts = 5

    return min(rate_pts + exp_pts, 25), {
        "批准率评分": rate_pts,
        "经验评分":   exp_pts,
        "说明":       rate_desc,
    }


def calculate_ai_score(report: models.Report, db: Session) -> Tuple[int, Dict]:
    """
    Master scoring function. Returns (score 0-100, details_dict).
    Call after attachments have been saved for best results.
    """
    c_score, c_detail = _score_completeness(report)
    a_score, a_detail = _score_attachments(report)
    r_score, r_detail = _score_reliability(report.dealer, db, exclude_report_id=report.id)

    total = c_score + a_score + r_score
    grade = "A" if total >= 80 else "B" if total >= 60 else "C" if total >= 40 else "D"

    details = {
        "total":       total,
        "grade":       grade,
        "completeness":       {"score": c_score, "max": 40, "items": c_detail},
        "attachments":        {"score": a_score, "max": 35, "items": a_detail},
        "dealer_reliability": {"score": r_score, "max": 25, "items": r_detail},
    }
    return total, details


# ─── Duplicate Detection ───────────────────────────────────────────────────────

def _normalize(s: str) -> str:
    """Lowercase, collapse spaces, strip punctuation for fuzzy comparison."""
    if not s:
        return ""
    s = s.strip().lower()
    s = re.sub(r"[\s\-_.,，。、·]+", " ", s)
    return s.strip()


def _similarity(a: str, b: str) -> float:
    a, b = _normalize(a), _normalize(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _weighted_sim(report_cn, report_en, report_addr, target_cn, target_en, target_addr) -> float:
    """Compute weighted similarity score (0–1)."""
    sims = [
        (_similarity(report_cn,   target_cn),   0.50),  # Chinese name carries most weight
        (_similarity(report_en,   target_en),   0.30),
        (_similarity(report_addr, target_addr), 0.20),
    ]
    return sum(s * w for s, w in sims)


def detect_duplicates(report: models.Report, db: Session) -> List[Dict]:
    """
    Detect potential duplicate customer/report records.
    Returns list of matches sorted by similarity (highest first), max 5.

    Levels:
      - high   (≥85%): Strong duplicate warning — platform should review carefully
      - medium (≥70%): Possible overlap — worth checking
    """
    results = []

    cn   = report.customer_name_cn or ""
    en   = report.customer_name_en or ""
    addr = report.customer_address_cn or ""

    if not cn and not en:
        return []   # Not enough data to compare

    # ─── Compare against Customer master records ────────────────────────
    customers = db.query(models.Customer).filter(
        models.Customer.id != (report.customer_id or -1)
    ).all()

    for c in customers:
        sim = _weighted_sim(cn, en, addr, c.name_cn or "", c.name_en or "", c.address_cn or "")
        if sim >= 0.70:
            results.append({
                "source":        "customer_record",
                "id":            c.id,
                "name_cn":       c.name_cn,
                "name_en":       c.name_en,
                "dealer":        c.dealer.company_name_cn if c.dealer else "平台添加",
                "is_contracted": c.is_contracted,
                "similarity":    round(sim * 100),
                "level":         "high" if sim >= 0.85 else "medium",
            })

    # ─── Compare against existing active Reports ────────────────────────
    reports = db.query(models.Report).filter(
        models.Report.id != report.id,
        models.Report.status.notin_(["draft", "rejected"]),
    ).all()

    for r in reports:
        sim = _weighted_sim(
            cn, en, addr,
            r.customer_name_cn or "", r.customer_name_en or "", r.customer_address_cn or ""
        )
        if sim >= 0.70:
            results.append({
                "source":          "existing_report",
                "id":              r.id,
                "registration_no": r.registration_no,
                "name_cn":         r.customer_name_cn,
                "status":          r.status,
                "dealer":          r.dealer.company_name_cn if r.dealer else "",
                "approved_at":     r.approved_at.isoformat() if r.approved_at else None,
                "similarity":      round(sim * 100),
                "level":           "high" if sim >= 0.85 else "medium",
            })

    # Sort by similarity descending, keep top 5
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results[:5]


def score_label(score: int) -> str:
    """Return human-readable grade label."""
    if score >= 80: return "A — 优质"
    if score >= 60: return "B — 良好"
    if score >= 40: return "C — 一般"
    return "D — 待完善"


def score_color(score: int) -> str:
    """Return CSS colour class for score."""
    if score >= 80: return "success"
    if score >= 60: return "info"
    if score >= 40: return "warning"
    return "danger"
