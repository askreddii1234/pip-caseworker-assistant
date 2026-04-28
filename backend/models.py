from sqlalchemy import create_engine, Column, String, Integer, Text, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from datetime import datetime
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://pipassist:pipassist_dev@localhost:5432/pipassist")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


class Case(Base):
    __tablename__ = "cases"

    case_id = Column(String, primary_key=True)
    case_type = Column(String, nullable=False)  # benefit_review, licence_application, compliance_check, air_quality_concern
    status = Column(String, nullable=False)     # workflow state id
    applicant_name = Column(String, nullable=False)
    applicant_reference = Column(String)
    applicant_dob = Column(String)
    assigned_to = Column(String)
    created_date = Column(String, nullable=False)
    last_updated = Column(String, nullable=False)
    case_notes = Column(Text)
    ai_summary = Column(Text)
    severity_level = Column(String)                  # Low | Medium | High | Critical (case-type-specific)
    is_urgent = Column(Boolean, default=False)
    submission_payload = Column(JSON)                # case-type-specific specialist fields

    timeline = relationship(
        "CaseTimelineEvent", back_populates="case",
        order_by="CaseTimelineEvent.date", cascade="all, delete-orphan",
    )
    caseworker_notes = relationship(
        "CaseworkerNote", back_populates="case",
        order_by="CaseworkerNote.created_at", cascade="all, delete-orphan",
    )


class CaseTimelineEvent(Base):
    __tablename__ = "case_timeline"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, ForeignKey("cases.case_id"), nullable=False)
    date = Column(String, nullable=False)
    event = Column(String, nullable=False)
    note = Column(Text)

    case = relationship("Case", back_populates="timeline")


class CaseworkerNote(Base):
    """Free-text notes added by caseworkers post-seed (separate from the seeded timeline)."""
    __tablename__ = "caseworker_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, ForeignKey("cases.case_id"), nullable=False)
    author = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("Case", back_populates="caseworker_notes")


class Policy(Base):
    __tablename__ = "policies"

    policy_id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    applicable_case_types = Column(JSON, nullable=False)  # list[str]
    body = Column(Text, nullable=False)


class WorkflowState(Base):
    __tablename__ = "workflow_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_type = Column(String, nullable=False, index=True)
    state = Column(String, nullable=False)
    label = Column(String, nullable=False)
    description = Column(Text)
    allowed_transitions = Column(JSON, default=list)  # list[str]
    required_actions = Column(JSON, default=list)     # list[str]
    reminder_days = Column(Integer)                   # nullable
    escalation_days = Column(Integer)                 # nullable


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
