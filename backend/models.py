from sqlalchemy import create_engine, Column, String, Integer, Text, DateTime, Boolean, ForeignKey, JSON, Float
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from datetime import datetime
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://pipassist:pipassist_dev@localhost:5432/pipassist")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


class PIPClaim(Base):
    __tablename__ = "pip_claims"

    id = Column(String, primary_key=True)
    claimant_name = Column(String, nullable=False)
    claimant_email = Column(String)
    date_of_birth = Column(String)
    claim_type = Column(String, nullable=False)  # new_claim, reassessment, mandatory_reconsideration
    status = Column(String, default="submitted")  # submitted, evidence_gathering, assessment, decision_made, approved, rejected
    risk_level = Column(String, default="medium")
    assigned_to = Column(String)
    primary_condition = Column(String)
    additional_conditions = Column(Text)
    medication = Column(Text)
    daily_living_score = Column(Integer)
    mobility_score = Column(Integer)
    ai_summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    target_date = Column(DateTime)  # 75-day SLA target

    notes = relationship("AssessmentNote", back_populates="claim", order_by="AssessmentNote.created_at")
    evidence = relationship("Evidence", back_populates="claim")
    activity_scores = relationship("ActivityScore", back_populates="claim")


class AssessmentNote(Base):
    __tablename__ = "assessment_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    claim_id = Column(String, ForeignKey("pip_claims.id"), nullable=False)
    author = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    claim = relationship("PIPClaim", back_populates="notes")


class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(Integer, primary_key=True, autoincrement=True)
    claim_id = Column(String, ForeignKey("pip_claims.id"), nullable=False)
    document_type = Column(String, nullable=False)
    filename = Column(String)
    description = Column(String)
    received = Column(Boolean, default=False)
    received_at = Column(DateTime)
    ai_extracted_text = Column(Text)

    claim = relationship("PIPClaim", back_populates="evidence")


class ActivityScore(Base):
    __tablename__ = "activity_scores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    claim_id = Column(String, ForeignKey("pip_claims.id"), nullable=False)
    activity_name = Column(String, nullable=False)
    activity_category = Column(String, nullable=False)  # daily_living or mobility
    descriptor_chosen = Column(String)
    points = Column(Integer, default=0)
    ai_suggested_points = Column(Integer)
    ai_reasoning = Column(Text)
    evidence_refs = Column(Text)
    confirmed_by_caseworker = Column(Boolean, default=False)

    claim = relationship("PIPClaim", back_populates="activity_scores")


class PIPDescriptor(Base):
    __tablename__ = "pip_descriptors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    activity_number = Column(Integer, nullable=False)
    activity_name = Column(String, nullable=False)
    category = Column(String, nullable=False)  # daily_living or mobility
    descriptor_letter = Column(String, nullable=False)
    descriptor_text = Column(Text, nullable=False)
    points = Column(Integer, nullable=False)
    source_url = Column(String)


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
