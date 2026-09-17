# Import all the models, so that Base has them before being
# imported by Alembic
from app.db.base_class import Base
from app.models.organization import Organization
from app.models.user import User
from app.models.rfp_project import RFPProject
from app.models.rfp_document import RFPDocument, DocumentVersion, DocumentContent, DocumentContentBlock
from app.models.requirement import Requirement, RequirementEvidence
from app.models.company_knowledge import CompanyKnowledgeDocument, KnowledgeDocumentVersion, KnowledgeChunk
from app.models.previous_proposal import PreviousProposal, PreviousProposalVersion, PreviousProposalSection
from app.models.compliance import ComplianceAssessment, ComplianceEvidence, GapAnalysis, RiskAnalysis
from app.models.proposal import Proposal, ProposalVersion, ProposalSection, ProposalSectionRequirement, GeneratedContentEvidence, UnsupportedClaim

