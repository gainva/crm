from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    # roles: super_admin | admin | platform_staff | dealer | maintenance
    role = Column(String(20), nullable=False)
    language = Column(String(5), default="zh")
    is_active = Column(Boolean, default=True)
    # Hidden from regular admin view (super_admin and maintenance accounts)
    is_hidden = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="user", uselist=False)
    dealer_profile = relationship("DealerProfile", back_populates="user", uselist=False,
                                   primaryjoin="User.id == DealerProfile.user_id",
                                   foreign_keys="[DealerProfile.user_id]")
    notifications = relationship("Notification", back_populates="user")


class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    name = Column(String(100), nullable=False)
    department = Column(String(100))
    review_level = Column(Integer, default=1)  # 1, 2, 3 — which level they review
    can_review = Column(Boolean, default=True)
    can_view_all = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="employee")


class DealerProfile(Base):
    __tablename__ = "dealer_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    company_name_cn = Column(String(200))
    company_name_en = Column(String(200))
    company_name_ja = Column(String(200))
    contact_name = Column(String(100))
    phone = Column(String(50))
    email = Column(String(100))
    address = Column(Text)
    website = Column(String(200))
    status = Column(String(20), default="active")  # active, inactive
    invitation_code = Column(String(20), nullable=True)
    invited_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="dealer_profile", foreign_keys=[user_id])
    inviter = relationship("User", foreign_keys=[invited_by])
    customers = relationship("Customer", back_populates="dealer")
    reports = relationship("Report", back_populates="dealer")


class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True, index=True)
    dealer_id = Column(Integer, ForeignKey("dealer_profiles.id"), nullable=True)
    name_cn = Column(String(200))
    name_en = Column(String(200))
    address_cn = Column(Text)
    address_en = Column(Text)
    website = Column(String(200))
    industry_categories = Column(JSON, default=list)
    is_contracted = Column(Boolean, default=False)
    contracted_at = Column(DateTime, nullable=True)
    label_color = Column(String(20), default="none")  # none, blue, red
    expires_at = Column(DateTime, nullable=True)
    notes = Column(Text)
    added_by_platform = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    dealer = relationship("DealerProfile", back_populates="customers")
    reports = relationship("Report", back_populates="customer")


class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    dealer_id = Column(Integer, ForeignKey("dealer_profiles.id"))
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    registration_no = Column(String(50), unique=True)

    # Application info
    application_date = Column(DateTime, default=datetime.utcnow)
    applicant_name = Column(String(100))
    applicant_company = Column(String(200))
    contact_info = Column(String(200))

    # Customer snapshot
    customer_name_cn = Column(String(200))
    customer_name_en = Column(String(200))
    customer_address_cn = Column(Text)
    customer_address_en = Column(Text)
    customer_website = Column(String(200))
    industry_categories = Column(JSON, default=list)

    # Project info
    part_name = Column(String(200))
    final_product_use = Column(String(200))
    production_capacity = Column(String(100))
    similar_product_count = Column(String(100))
    project_budget = Column(String(100))
    delivery_deadline = Column(String(100))
    project_model = Column(String(200))
    estimated_quantity = Column(String(100))           # 预估台数
    main_competitors = Column(String(200))
    investment_purpose = Column(JSON, default=list)
    project_key_points = Column(JSON, default=list)
    sales_opinion = Column(Text)

    # Communication info (交流方式)
    comm_type = Column(String(20), nullable=True)      # 面谈 | 网络交流
    comm_count = Column(String(50), nullable=True)     # 交流次数
    comm_person1_name = Column(String(100), nullable=True)
    comm_person1_title = Column(String(100), nullable=True)
    comm_person2_name = Column(String(100), nullable=True)
    comm_person2_title = Column(String(100), nullable=True)

    # Workflow status
    # draft → pending_l1 → pending_l2 → pending_l3 → approved → contracted / expired / rejected
    status = Column(String(30), default="draft")
    current_review_level = Column(Integer, default=0)
    rejection_reason = Column(Text)
    extension_count = Column(Integer, default=0)
    valid_until = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)

    # AI scoring & duplicate detection
    ai_score = Column(Integer, nullable=True)               # 0-100
    ai_score_details = Column(JSON, nullable=True)          # breakdown dict
    has_duplicate_warning = Column(Boolean, default=False)  # quick flag
    duplicate_warnings = Column(JSON, nullable=True)        # list of similar records

    # Progress steps (date completed)
    step1_date = Column(DateTime, nullable=True)  # 新项目产生/老项目重启
    step2_date = Column(DateTime, nullable=True)  # 技术交流/提交方案/设备选型/参考报价
    step3_date = Column(DateTime, nullable=True)  # 选型结束/商务谈判
    step4_date = Column(DateTime, nullable=True)  # 签署合同/支付定金
    step5_date = Column(DateTime, nullable=True)  # 合同生效

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    dealer = relationship("DealerProfile", back_populates="reports")
    customer = relationship("Customer", back_populates="reports")
    reviews = relationship("ReportReview", back_populates="report", order_by="ReportReview.created_at")
    attachments = relationship("ReportAttachment", back_populates="report")


class ReportReview(Base):
    __tablename__ = "report_reviews"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"))
    reviewer_id = Column(Integer, ForeignKey("users.id"))
    level = Column(Integer)  # 1, 2, 3
    action = Column(String(20))  # approve, reject
    reason = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    report = relationship("Report", back_populates="reviews")
    reviewer = relationship("User")


class ReportAttachment(Base):
    __tablename__ = "report_attachments"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"))
    # business_card_front | business_card_back | project_drawing | word_template | pdf_template | other
    file_type = Column(String(50))
    file_name = Column(String(255))
    original_name = Column(String(255))
    file_path = Column(String(500))
    file_size = Column(Integer)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    report = relationship("Report", back_populates="attachments")
    uploader = relationship("User")


class ProductCategory(Base):
    __tablename__ = "product_categories"
    id = Column(Integer, primary_key=True, index=True)
    name_cn = Column(String(100))
    name_en = Column(String(100))
    name_ja = Column(String(100))
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    products = relationship("Product", back_populates="category")


class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"))
    name_cn = Column(String(200))
    name_en = Column(String(200))
    name_ja = Column(String(200))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    category = relationship("ProductCategory", back_populates="products")


class Template(Base):
    __tablename__ = "templates"
    id = Column(Integer, primary_key=True, index=True)
    # questionnaire | quote | other
    type = Column(String(50))
    name = Column(String(200))
    file_name = Column(String(255))
    original_name = Column(String(255))
    file_path = Column(String(500))
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    version = Column(Integer, default=1)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    uploader = relationship("User")


class InvitationCode(Base):
    __tablename__ = "invitation_codes"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, index=True, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"))
    used_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    expires_at = Column(DateTime, nullable=True)
    is_used = Column(Boolean, default=False)
    is_revoked = Column(Boolean, default=False)
    note = Column(String(200))           # Purpose / target dealer description
    created_at = Column(DateTime, default=datetime.utcnow)
    used_at = Column(DateTime, nullable=True)

    creator = relationship("User", foreign_keys=[created_by])
    user = relationship("User", foreign_keys=[used_by])


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    type = Column(String(50))  # report_submitted, report_approved, report_rejected, report_expired
    title = Column(String(200))
    message = Column(Text)
    related_id = Column(Integer, nullable=True)  # report_id or customer_id
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")
