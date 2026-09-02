import sys
import os
import argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
from app.models.organization import Organization
from app.models.user import User, RoleEnum
from app.core.security import get_password_hash

def create_dev_user(email: str, password: str, org_name: str, org_slug: str, role: str):
    db = SessionLocal()
    try:
        # Check org
        org = db.query(Organization).filter(Organization.slug == org_slug).first()
        if not org:
            org = Organization(name=org_name, slug=org_slug)
            db.add(org)
            db.commit()
            db.refresh(org)
            print(f"Created organization: {org_name} ({org_slug})")

        # Check user
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                full_name=email.split('@')[0],
                password_hash=get_password_hash(password),
                organization_id=org.id,
                role=RoleEnum(role)
            )
            db.add(user)
            db.commit()
            print(f"Created user: {email} with role {role}")
        else:
            print(f"User {email} already exists.")
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a dev user")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--org-name", default="Acme Corp")
    parser.add_argument("--org-slug", default="acme")
    parser.add_argument("--role", default="PRODUCT_TEAM", choices=["PRODUCT_TEAM", "VP", "CTO", "CEO"])
    args = parser.parse_args()
    
    create_dev_user(args.email, args.password, args.org_name, args.org_slug, args.role)
